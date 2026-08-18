import { getDoorPort, getTemplate } from './templates.js';
import { ProgressiveTextureManager } from './progressive-textures.js';
import { roomRect, rotateXZ, worldPort } from './layout.js';
import { box, createIncrementalTreeDisposer, entity, COLORS } from './models/primitives.js';
import { getRoomTheme, surfaceMaterial } from './themes.js';
import { textPlane, waitForRoomSignage } from './models/signage.js';
import { skylightBuildSteps, trackLightBuildSteps, wallBuildSteps } from './models/room-shell.js';
import { buildBench, buildPlant, decorCollectionSteps } from './models/furniture.js';
import { additionalDecorSteps } from './models/decorations.js';
import { doorModelBuildSteps } from './models/door.js';
import { resolveDoorStyle } from './models/door-styles.js';
import { buildElevatorCabin } from './models/elevator.js';
import { buildPhotoMount } from './models/exhibit.js';
import { BackgroundMusicManager, backgroundMusicForRoom } from './background-music.js';
import { FrameBudgetScheduler } from './frame-budget-scheduler.js';
import {
  constrainWalkableMovement,
  elevatorWalkRegion,
  hasExitedElevator,
  isDoorwayBlocked,
  isInsideElevatorTrigger,
  isPointWalkable,
  transferElevatorPosition,
  transferElevatorYaw
} from './navigation.js';

const ROOM_UNLOAD_GRACE_MS = 1500;
const ROOM_RETENTION_MS = 8000;
const MOVEMENT_IDLE_MS = 1200;

function performanceDiagnosticsEnabled() {
  if (import.meta.env.DEV) return true;
  return typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('museumDebug') === '1';
}

function frameSlots(template, connectedDoorIds) {
  const slots = [];
  const walls = ['north', 'east', 'south', 'west'];
  const doorClearances = new Map(walls.map((wall) => [wall, template.doors.filter((door) => door.wall === wall && connectedDoorIds.has(door.id)).map((door) => door.offset)]));
  const rows = template.maxPhotos >= 30 ? [1.55, 3.3] : template.maxPhotos >= 20 ? [1.65, 3.3] : [1.65, 3.05];
  for (const wall of walls) {
    const horizontal = wall === 'north' || wall === 'south';
    const length = horizontal ? template.width : template.depth;
    const count = Math.max(2, Math.floor((length - 2) / 2.25));
    for (const y of rows) {
      for (let index = 0; index < count; index += 1) {
        const offset = -length / 2 + 1.35 + index * ((length - 2.7) / Math.max(1, count - 1));
        if (doorClearances.get(wall).some((doorOffset) => Math.abs(offset - doorOffset) < 1.65)) continue;
        const slot = { wall, offset, y, maxWidth: index % 4 === 1 ? 2.35 : 1.72, maxHeight: index % 4 === 1 ? 1.5 : 1.32 };
        if (horizontal) Object.assign(slot, { x: offset, z: wall === 'north' ? -template.depth / 2 + .145 : template.depth / 2 - .145, rotation: wall === 'north' ? '0 0 0' : '0 180 0' });
        else Object.assign(slot, { x: wall === 'west' ? -template.width / 2 + .145 : template.width / 2 - .145, z: offset, rotation: wall === 'west' ? '0 90 0' : '0 -90 0' });
        slots.push(slot);
      }
    }
  }
  return slots.slice(0, template.maxPhotos);
}

function hasCaption(photo) {
  return Boolean(photo.title || photo.location || photo.date || photo.description);
}

function createElementWalker(root, visit) {
  const stack = [root];
  return () => {
    const element = stack.pop();
    if (!element) return true;
    const children = [...element.children];
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
    visit(element);
    return stack.length === 0;
  };
}

export class MuseumScene {
  constructor({ scene, root, rig, head, config, layout, ui, spawnRequest = null }) {
    this.scene = scene;
    this.root = root;
    this.rig = rig;
    this.head = head;
    this.config = config;
    this.layout = layout;
    this.ui = ui;
    this.loadedRooms = new Map();
    this.roomJobs = new Map();
    this.roomUnloadTimers = new Map();
    this.retiringRooms = new Map();
    this.retiringConnections = new Map();
    this.connectionJobs = new Map();
    this.connectionViews = new Map();
    this.walkRegions = [];
    this.colliders = [];
    this.currentRoomId = config.museum.lobby.id;
    this.lastObservedRigPosition = rig.object3D.position.clone();
    this.roomLastVisitedAt = new Map([[this.currentRoomId, performance.now()]]);
    this.lastMovementAt = performance.now();
    this.spawnRequest = spawnRequest;
    this.spawnAnchors = new Map();
    this.ready = false;
    this.treeDisposalQueue = [];
    this.activeTreeDisposal = null;
    this.disposed = false;
    this.performanceEvents = [];
    this.lastDiagnosticLogAt = new Map();
    this.diagnosticsEnabled = performanceDiagnosticsEnabled();
    this.scheduler = new FrameBudgetScheduler({
      onError: (error) => console.error(error),
      shouldRunTask: (task) => task.priority !== 'cleanup' || performance.now() - this.lastMovementAt >= MOVEMENT_IDLE_MS,
      onDiagnostic: (event) => this.recordPerformanceEvent(`scheduler:${event.type}`, event, {
        level: 'warn', throttleMs: event.type === 'late-frame' ? 1000 : 0
      })
    });
    this.textureManager = new ProgressiveTextureManager({
      camera: head.object3D,
      scheduler: this.scheduler,
      isRoomActive: (roomId) => this.activeTextureRoomIds().has(roomId),
      onError: (message) => this.ui.toast(message, 4200)
    });
    this.musicManager = new BackgroundMusicManager({
      unlockTargets: [window, scene],
      onError: (message) => this.ui.toast(message, 4200)
    });
    this.longTasks = [];
    if (this.diagnosticsEnabled && typeof PerformanceObserver !== 'undefined') {
      try {
        this.longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
            if (this.longTasks.length > 100) this.longTasks.shift();
            this.recordPerformanceEvent('browser:long-task', { durationMs: entry.duration }, { level: 'warn' });
          }
        });
        this.longTaskObserver.observe({ type: 'longtask', buffered: true });
      } catch { /* Long Task API is optional. */ }
    }
    if (this.diagnosticsEnabled) {
      Object.defineProperty(window, 'museumPerformance', {
        configurable: true,
        value: { snapshot: () => ({
          ...this.scheduler.snapshot(),
          longTasks: [...this.longTasks],
          events: [...this.performanceEvents],
          loadedRooms: [...this.loadedRooms.keys()],
          loadingRooms: [...this.roomJobs.keys()],
          loadingConnections: [...this.connectionJobs.keys()],
          movementIdleMs: performance.now() - this.lastMovementAt,
          pendingRoomRetirements: this.roomUnloadTimers.size,
          retiringRooms: [...this.retiringRooms.keys()],
          queuedTreeDisposals: this.treeDisposalQueue.length + Number(Boolean(this.activeTreeDisposal))
        }) }
      });
    }
  }

  recordPerformanceEvent(type, detail = {}, { level = 'info', throttleMs = 0 } = {}) {
    const now = performance.now();
    const previous = this.lastDiagnosticLogAt.get(type) || Number.NEGATIVE_INFINITY;
    if (throttleMs && now - previous < throttleMs) return;
    this.lastDiagnosticLogAt.set(type, now);
    const event = {
      type,
      atMs: Math.round(now * 10) / 10,
      currentRoomId: this.currentRoomId,
      ...detail
    };
    this.performanceEvents.push(event);
    if (this.performanceEvents.length > 200) this.performanceEvents.shift();
    if (this.diagnosticsEnabled) (console[level] || console.info).call(console, '[MuseumPerf]', event);
  }

  async initialize() {
    if (this.spawnRequest && this.layout.rooms.has(this.spawnRequest.roomId)) {
      this.currentRoomId = this.spawnRequest.roomId;
      this.roomLastVisitedAt.clear();
      this.roomLastVisitedAt.set(this.currentRoomId, performance.now());
    }
    await this.loadRoom(this.currentRoomId);
    const loaded = this.loadedRooms.get(this.currentRoomId);
    if (this.spawnRequest) await this.applySpawnRequest(this.spawnRequest);
    else {
      const spawn = this.localToWorld(loaded.placement, 0, loaded.template.depth / 2 - 1.75);
      this.rig.object3D.position.set(spawn.x, 0, spawn.z);
    }
    this.ui.setRoom(this.config.museum.title, this.currentRoomId === this.config.museum.lobby.id ? '大厅' : loaded.room.title);
    this.musicManager.setTrack(backgroundMusicForRoom(this.config, this.currentRoomId));
    this.ready = true;
    this.clock = window.setInterval(() => this.tick(), 180);
    this.recordPerformanceEvent?.('museum:ready', { roomId: this.currentRoomId });
  }

  roomConfig(id) {
    if (id === this.config.museum.lobby.id) return { ...this.config.museum.lobby, title: this.config.museum.title, intro: this.config.museum.intro, blocks: [] };
    return this.config.rooms.find((room) => room.id === id);
  }

  connectedDoorIds(roomId) {
    return new Set((this.layout.adjacency.get(roomId) || []).map((edge) => edge.connection.from.roomId === roomId ? edge.connection.from.doorId : edge.connection.to.doorId));
  }

  loadRoom(roomId, { priority = 'interactive' } = {}) {
    this.cancelPendingRoomUnload?.(roomId);
    const retiring = this.retiringRooms?.get(roomId);
    if (retiring) return retiring.promise.then(() => this.loadRoom(roomId, { priority }));
    if (this.loadedRooms.has(roomId)) return Promise.resolve(this.loadedRooms.get(roomId));
    const existing = this.roomJobs.get(roomId);
    if (existing) {
      if (priority === 'interactive') {
        existing.handle?.promote();
        existing.priority = priority;
        this.textureManager.setRoomPriority?.(roomId, priority);
      }
      return existing.promise;
    }
    const room = this.roomConfig(roomId);
    this.recordPerformanceEvent?.('room:load-start', { roomId, priority });
    const template = getTemplate(room.template);
    const placement = this.layout.placements.get(roomId);
    const group = entity('a-entity', {
      id: `room-${roomId}`,
      position: `${placement.x} 0 ${placement.z}`,
      rotation: `0 ${placement.rotation || 0} 0`,
      visible: false
    }, this.root);
    group.dataset.roomId = roomId;
    const connectedDoorIds = this.connectedDoorIds(roomId);
    const theme = getRoomTheme(room);
    const defaultSpawn = this.localToWorld(placement, 0, template.depth / 2 - 1.75);
    const steps = [
      { label: '准备房间结构', weight: 2, run: () => {
        this.registerSpawnAnchor(roomId, null, { x: defaultSpawn.x, z: defaultSpawn.z, targetX: placement.x, targetZ: placement.z });
        box(group, {
          position: '0 -0.08 0', width: template.width, height: .16, depth: template.depth, color: theme.floor.tint,
          material: surfaceMaterial(theme.floor, Math.max(2, template.width / theme.floor.repeatMeters), Math.max(2, template.depth / theme.floor.repeatMeters))
        });
      } },
      { label: '准备房间结构', run: () => entity('a-plane', {
        class: 'navmesh', position: '0 .012 0', rotation: '-90 0 0', width: template.width - .3, height: template.depth - .3,
        material: 'transparent: true; opacity: 0.001; side: double; depthWrite: false'
      }, group) },
      ...['north', 'east', 'south', 'west'].flatMap((wall) => wallBuildSteps(group, room, wall, connectedDoorIds).map((run) => ({ label: '准备房间结构', run }))),
      ...skylightBuildSteps(group, template).map((run) => ({ label: '准备房间结构', run })),
      ...trackLightBuildSteps(group, template).map((run) => ({ label: '准备房间结构', run })),
      { label: '布置展品', run: () => buildBench(group, template) },
      ...decorCollectionSteps(group, template, theme.decor).map((run) => ({ label: '布置展品', weight: 2, run })),
      ...additionalDecorSteps(group, template, theme.decor).map((run) => ({ label: '布置展品', weight: 2, run })),
      { label: '布置展品', run: () => {
        const bench = this.localToWorld(placement, 0, template.kind === 'lobby' ? 2.2 : 0);
        this.registerSpawnAnchor(roomId, 'bench', { x: bench.x, z: bench.z, approach: rotateXZ(0, 1, placement.rotation) });
      } },
      ...(template.kind === 'lobby'
        ? this.lobbyContentSteps(group, room, template)
        : this.galleryContentSteps(group, room, template, connectedDoorIds)),
      ...(this.layout.adjacency.get(room.id) || []).flatMap((edge) => this.roomDoorBuildSteps(group, room, edge))
    ];
    const job = { roomId, state: 'preparing', stage: '正在搭建房间', detail: '', progress: 0, priority, group, handle: null, promise: null };
    const updateProgress = ({ label, progress }) => {
      job.stage = this.friendlyLoadingStage(label || job.stage);
      job.detail = room.title;
      job.progress = Math.min(.78, progress * .78);
      this.updateRoomDoorProgress(roomId, {
        state: 'preparing', stage: job.stage, detail: job.detail, progress: job.progress
      });
    };
    job.handle = this.scheduler.enqueue({
      id: `room:${roomId}:build`, owner: `room:${roomId}`, priority, steps,
      onProgress: updateProgress, yieldAfterStep: true
    });
    this.textureManager.setRoomPriority?.(roomId, priority);
    job.promise = (async () => {
      try {
        await job.handle.promise;
        job.stage = '正在准备行走区域';
        job.detail = room.title;
        job.progress = .8;
        this.updateRoomDoorProgress(roomId, {
          state: 'preparing', stage: job.stage, detail: job.detail, progress: job.progress
        });
        const colliderTask = this.scheduleColliderBuild(`room:${roomId}`, group, job.priority);
        job.handle = colliderTask;
        await colliderTask.promise;
        job.stage = '正在制作文字';
        job.detail = room.title;
        job.progress = .82;
        this.updateRoomDoorProgress(roomId, {
          state: 'preparing', stage: job.stage, detail: job.detail, progress: job.progress
        });
        await waitForRoomSignage(roomId);
        job.stage = '正在加载照片';
        job.progress = .84;
        this.updateRoomDoorProgress(roomId, {
          state: 'preparing', stage: job.stage, detail: room.title, progress: job.progress
        });
        await this.textureManager.waitForRoomLow?.(roomId, ({ label, completed, total, progress }) => {
          job.stage = '正在加载照片';
          job.detail = total ? `${label || room.title} · ${completed}/${total}` : '这个房间没有照片';
          job.progress = .84 + progress * .12;
          this.updateRoomDoorProgress(roomId, {
            state: 'preparing', stage: job.stage, detail: job.detail, progress: job.progress
          });
        });
        const loaded = { room, template, placement, group, portableFrames: [...group.querySelectorAll('.portable-frame')] };
        this.loadedRooms.set(roomId, loaded);
        this.addRoomRegion(roomId, placement, template);
        group.setAttribute('visible', true);
        job.state = 'ready';
        job.progress = 1;
        this.updateRoomDoorProgress(roomId, {
          state: 'preparing', stage: '正在准备通道', detail: '马上就好', progress: .97
        });
        this.roomJobs.delete(roomId);
        this.recordPerformanceEvent?.('room:load-ready', { roomId, priority });
        return loaded;
      } catch (error) {
        job.state = 'error';
        this.roomJobs.delete(roomId);
        this.removeColliders(`room:${roomId}`);
        this.textureManager.disposeRoom(roomId);
        group.setAttribute('visible', false);
        this.trackRoomDisposal(roomId, [this.scheduleTreeDisposal(`room:${roomId}`, group)]);
        this.updateRoomDoorProgress(roomId, { state: 'error', stage: '加载失败，点击重试', progress: 0 });
        this.recordPerformanceEvent?.('room:load-error', { roomId, priority, error: error.message }, { level: 'warn' });
        throw error;
      }
    })();
    this.roomJobs.set(roomId, job);
    return job.promise;
  }

  lobbyContentSteps(group, room, template) {
    return [
      { label: '生成说明', weight: 2, run: () => textPlane(group, {
        position: `-1.2 3.2 ${-template.depth / 2 + .16}`, rotation: '0 0 0', width: 7.8, height: 1.45,
        title: this.config.museum.subtitle || 'PERSONAL MUSEUM', lines: [this.config.museum.title], align: 'left', signStyle: 'slogan'
      }) },
      { label: '生成说明', weight: 2, run: () => textPlane(group, {
        position: `-5.45 1.5 ${-template.depth / 2 + .17}`, rotation: '0 0 0', width: 3.7, height: 1.45,
        title: 'WELCOME', lines: [this.config.museum.intro || '欢迎参观。'], signStyle: 'wall-label'
      }) },
      { label: '布置展品', run: () => {
        if (!this.config.museum.heroImage) return;
        const frame = box(group, { position: `4.4 2.15 ${-template.depth / 2 + .16}`, width: 5.2, height: 3.0, depth: .08, color: COLORS.frame });
        const plane = entity('a-plane', { position: `4.4 2.15 ${-template.depth / 2 + .215}`, width: 5, height: 2.8, material: 'color: #d7cdc0; roughness: .8', shadow: 'cast: false; receive: false' }, group);
        plane.dataset.maxWidth = '5'; plane.dataset.maxHeight = '2.8';
        this.textureManager.register({
          id: `${room.id}-hero`, roomId: room.id, plane, frame,
          sources: this.config.museum.heroImage, label: '大厅主照片'
        });
      } },
      { label: '布置展品', run: () => { buildPlant(group, '-6.45 0 -4.65', { src: '/museum-assets/olive-tree.png', width: 2.1, height: 3.15, scale: .78 }); this.registerItemSpawn(room.id, 'plant-1', -6.45, -4.65); } },
      { label: '布置展品', run: () => { buildPlant(group, '6.25 0 -4.75', { src: '/museum-assets/compact-fern.png', width: 1.55, height: 1.55, scale: .75 }); this.registerItemSpawn(room.id, 'plant-2', 6.25, -4.75); } }
    ];
  }

  galleryContentSteps(group, room, template, connectedDoorIds) {
    const photos = room.blocks.flatMap((block, blockIndex) => block.photos.map((photo) => ({ ...photo, blockTitle: block.title, blockIndex })));
    const slots = frameSlots(template, connectedDoorIds);
    const slotsByWall = new Map(['north', 'east', 'west', 'south'].map((wall) => [wall, slots.filter((slot) => slot.wall === wall)]));
    const wallCursors = new Map([...slotsByWall.keys()].map((wall) => [wall, 0]));
    const wallOrder = ['north', 'east', 'west', 'south'];
    const assigned = photos.map((photo) => {
      const preferredWall = wallOrder[photo.blockIndex % wallOrder.length];
      let slot = slotsByWall.get(preferredWall)?.[wallCursors.get(preferredWall) || 0];
      if (slot) wallCursors.set(preferredWall, (wallCursors.get(preferredWall) || 0) + 1);
      if (!slot) slot = slots.find((candidate) => !candidate.assigned);
      if (slot) slot.assigned = true;
      return { photo, slot };
    }).filter(({ slot }) => slot);
    const mounts = new Map();
    const steps = [{ label: '生成说明', weight: 2, run: () => textPlane(group, {
      position: `${-template.width * .28} ${template.height - .82} ${-template.depth / 2 + .135}`, rotation: '0 0 0', width: Math.min(6.4, template.width * .48), height: .82,
      title: room.title, lines: room.intro ? [room.intro] : [], align: 'left', signStyle: 'slogan'
    }) }];
    assigned.forEach(({ photo, slot }, index) => {
      steps.push({ label: '布置展品', weight: 2, run: () => {
        const mount = buildPhotoMount(group, slot, `portable-frame-${room.id}-${index + 1}`);
        mounts.set(index, mount);
        const photoPosition = this.localToWorld(this.layout.placements.get(room.id), slot.x, slot.z);
        this.registerSpawnAnchor(room.id, `photo-${index + 1}`, {
          x: photoPosition.x, z: photoPosition.z,
          approach: rotateXZ(slot.wall === 'west' ? 1 : slot.wall === 'east' ? -1 : 0, slot.wall === 'north' ? 1 : slot.wall === 'south' ? -1 : 0, this.layout.placements.get(room.id).rotation)
        });
        this.textureManager.register({
          id: `${room.id}-photo-${index}`, roomId: room.id, plane: mount.plane, frame: mount.frame,
          sources: photo.sources,
          label: photo.title || `${photo.blockTitle || room.title} 第 ${index + 1} 张照片`
        });
      } });
      if (hasCaption(photo)) steps.push({ label: '生成说明', run: () => {
        const lines = [photo.location, photo.date, photo.description].filter(Boolean);
        textPlane(mounts.get(index).holder, { position: `0 ${-slot.maxHeight / 2 - .25} .052`, width: Math.min(slot.maxWidth, 1.5), height: .32, title: photo.title || '', lines, signStyle: 'wall-label' });
      } });
      if (index === 0 || assigned[index - 1]?.photo.blockTitle !== photo.blockTitle) steps.push({ label: '生成说明', run: () => textPlane(mounts.get(index).holder, {
        position: `${-slot.maxWidth / 2} ${slot.maxHeight / 2 + .36} .052`, width: 1.4, height: .34, title: photo.blockTitle || room.title, lines: [], signStyle: 'section'
      }) });
    });
    if (template.width >= 18) steps.push({ label: '布置展品', run: () => {
      const plantX = template.width / 2 - 1.25;
      const plantZ = template.depth / 2 - 1.4;
      buildPlant(group, `${plantX} 0 ${plantZ}`, { src: '/museum-assets/compact-fern.png', width: 1.55, height: 1.55, scale: .72 });
      this.registerItemSpawn(room.id, 'plant-1', plantX, plantZ);
    } });
    return steps;
  }

  roomDoorBuildSteps(group, room, edge) {
    const connection = edge.connection;
    const endpoint = connection.from.roomId === room.id ? connection.from : connection.to;
    const destination = this.roomConfig(edge.other.roomId);
    const port = getDoorPort(room, endpoint.doorId);
    const styleId = connection.kind === 'elevator' ? this.elevatorStyleId(connection) : null;
    const plan = doorModelBuildSteps({ parent: group, port, endpoint, destination, connection, room, styleId, onClick: () => this.toggleDoor(connection.id, room.id) });
    const steps = plan.steps.map((run) => ({ label: '连接通道', run }));
    steps.push({ label: '连接通道', run: () => {
      const doorModel = plan.result();
      if (!this.connectionViews.has(connection.id)) {
        this.connectionViews.set(connection.id, {
          connection, doors: [], connector: null, open: false, loading: false,
          elevator: connection.kind === 'elevator' ? { openRoomId: null, phase: 'idle', exitRoomId: null } : null
        });
      }
      const doorWorldPort = worldPort(room, this.layout.placements.get(room.id), endpoint.doorId);
      this.connectionViews.get(connection.id).doors.push({ roomId: room.id, destinationRoomId: edge.other.roomId, ...doorModel, port, worldPort: doorWorldPort });
      this.registerSpawnAnchor(room.id, endpoint.doorId, { kind: 'door', connectionId: connection.id, port: doorWorldPort });
      const targetJob = this.roomJobs.get(edge.other.roomId);
      if (targetJob) doorModel.loadingIndicator.set({
        state: targetJob.state, stage: targetJob.stage, detail: targetJob.detail, progress: targetJob.progress
      });
    } });
    return steps;
  }

  updateRoomDoorProgress(roomId, status) {
    for (const view of this.connectionViews.values()) {
      for (const door of view.doors) if (door.destinationRoomId === roomId) door.loadingIndicator?.set(status);
    }
  }

  friendlyLoadingStage(stage) {
    return ({
      '准备房间结构': '正在搭建房间',
      '布置展品': '正在摆放展品',
      '生成说明': '正在制作说明牌',
      '连接通道': '正在安装房门',
      '建立碰撞': '正在准备行走区域',
      '加载预览图': '正在加载照片'
    })[stage] || stage;
  }

  elevatorStyleId(connection) {
    const homeRoom = this.roomConfig(connection.from.roomId);
    return resolveDoorStyle(homeRoom, 'elevator', connection.elevatorDoorStyle).id;
  }

  registerSpawnAnchor(roomId, anchorId, anchor) {
    this.spawnAnchors.set(anchorId ? `${roomId}.${anchorId}` : roomId, { roomId, ...anchor });
  }

  localToWorld(placement, localX, localZ) {
    const offset = rotateXZ(localX, localZ, placement.rotation);
    return { x: placement.x + offset.x, z: placement.z + offset.z };
  }

  registerItemSpawn(roomId, anchorId, localX, localZ) {
    const placement = this.layout.placements.get(roomId);
    const { x, z } = this.localToWorld(placement, localX, localZ);
    const towardCenterX = placement.x - x;
    const towardCenterZ = placement.z - z;
    const length = Math.hypot(towardCenterX, towardCenterZ) || 1;
    this.registerSpawnAnchor(roomId, anchorId, {
      x,
      z,
      approach: { x: towardCenterX / length, z: towardCenterZ / length }
    });
  }

  faceRigAt(targetX, targetZ, yawOverride = null) {
    const applyFacing = () => {
      const position = this.rig.object3D.position;
      const yaw = yawOverride === null
        ? Math.atan2(-(targetX - position.x), -(targetZ - position.z))
        : THREE.MathUtils.degToRad(yawOverride);
      this.rig.setAttribute('rotation', { x: 0, y: THREE.MathUtils.radToDeg(yaw), z: 0 });
      const lookControls = this.head.components?.['look-controls'];
      if (lookControls?.yawObject) {
        lookControls.yawObject.rotation.y = 0;
        lookControls.pitchObject.rotation.x = 0;
        lookControls.updateOrientation?.();
      } else this.head.object3D.rotation.set(0, 0, 0);
    };
    applyFacing();
    // look-controls can finish its own initial pose restoration after the museum
    // is ready, so reapply the debug spawn orientation on the next two frames.
    requestAnimationFrame(() => {
      applyFacing();
      requestAnimationFrame(applyFacing);
    });
  }

  async applySpawnRequest(request) {
    const key = request.anchorId ? `${request.roomId}.${request.anchorId}` : request.roomId;
    const anchor = this.spawnAnchors.get(key) || this.spawnAnchors.get(request.roomId);
    if (!anchor) return;

    if (anchor.kind === 'door') {
      const outward = anchor.port.outward;
      const distance = request.distance || (request.side === 'cabin' ? 1.65 : 2.2);
      const direction = request.side === 'cabin' ? 1 : -1;
      if (request.side === 'cabin') {
        const view = this.connectionViews.get(anchor.connectionId);
        const destination = view.connection.from.roomId === request.roomId ? view.connection.to.roomId : view.connection.from.roomId;
        await this.loadRoom(destination);
        await this.ensureConnector(view.connection, { priority: 'interactive' });
        if (view.elevator) {
          this.setElevatorDoor(view, request.roomId, { immediate: true });
          view.elevator.phase = 'awaiting-exit';
          view.elevator.exitRoomId = request.roomId;
        } else this.setConnectionOpen(view, true, { immediate: true });
      }
      this.rig.object3D.position.set(
        anchor.port.x + outward.x * distance * direction,
        0,
        anchor.port.z + outward.z * distance * direction
      );
      this.faceRigAt(anchor.port.x, anchor.port.z, request.yaw);
    } else if (anchor.approach) {
      const distance = request.distance || 1.5;
      this.rig.object3D.position.set(anchor.x + anchor.approach.x * distance, 0, anchor.z + anchor.approach.z * distance);
      this.faceRigAt(anchor.x, anchor.z, request.yaw);
    } else {
      this.rig.object3D.position.set(anchor.x, 0, anchor.z);
      this.faceRigAt(anchor.targetX ?? anchor.x, anchor.targetZ ?? anchor.z - 1, request.yaw);
    }
  }

  async toggleDoor(connectionId, fromRoomId) {
    const view = this.connectionViews.get(connectionId);
    if (!view || view.loading) return;
    const doorOpen = this.isDoorOpen(view, fromRoomId);
    if (doorOpen) {
      if (this.isNearConnection(view.connection, 1.3)) {
        this.ui.toast('门口有人，暂时不能关门。');
        return;
      }
      if (view.elevator) this.setElevatorDoor(view, null);
      else this.setConnectionOpen(view, false);
      this.recordPerformanceEvent?.('door:closed', { connectionId, fromRoomId });
      return;
    }
    view.loading = true;
    const destination = view.connection.from.roomId === fromRoomId ? view.connection.to.roomId : view.connection.from.roomId;
    const loadStartedAt = performance.now();
    this.recordPerformanceEvent?.('door:load-start', { connectionId, fromRoomId, destination });
    this.updateRoomDoorProgress(destination, {
      state: 'preparing', stage: '正在准备房间', detail: this.roomConfig(destination).title, progress: .01
    });
    this.ui.toast(`正在准备“${this.roomConfig(destination).title}”…`, 12000);
    try {
      await this.loadRoom(destination, { priority: 'interactive' });
      this.updateRoomDoorProgress(destination, {
        state: 'preparing', stage: '正在准备通道', detail: '马上就好', progress: .97
      });
      await this.ensureConnector(view.connection, { priority: 'interactive' });
      this.updateRoomDoorProgress(destination, { state: 'ready', stage: '完成', progress: 1 });
      if (view.elevator) this.setElevatorDoor(view, fromRoomId);
      else this.setConnectionOpen(view, true);
      this.ui.toast(`“${this.roomConfig(destination).title}”已开放。`, 2200);
      this.recordPerformanceEvent?.('door:load-ready', {
        connectionId, fromRoomId, destination, durationMs: performance.now() - loadStartedAt
      });
    } catch (error) {
      console.error(error);
      this.ui.toast('房间加载失败，点击门可重试。', 4200);
      this.recordPerformanceEvent?.('door:load-error', {
        connectionId, fromRoomId, destination, durationMs: performance.now() - loadStartedAt, error: error.message
      }, { level: 'warn' });
    } finally {
      view.loading = false;
    }
  }

  setConnectionOpen(view, open, { immediate = false } = {}) {
    view.open = open;
    this.animateConnectionDoors(view, open, immediate);
    this.refreshConnectorRegions();
  }

  isDoorOpen(view, roomId) {
    return view.elevator ? view.elevator.openRoomId === roomId : view.open;
  }

  setElevatorDoor(view, roomId, { immediate = false } = {}) {
    view.elevator.openRoomId = roomId;
    view.open = Boolean(roomId);
    for (const door of view.doors) this.animateDoor(door, door.roomId === roomId, immediate);
    this.refreshConnectorRegions();
  }

  animateDoor(door, open, immediate = false) {
    if (door.motion === 'sliding') {
      for (const panel of door.panels) {
        panel.element.removeAttribute('animation__door');
        const position = open ? panel.open : panel.closed;
        if (immediate) panel.element.setAttribute('position', position);
        else panel.element.setAttribute('animation__door', `property: position; to: ${position}; dur: 620; easing: easeInOutCubic`);
      }
      return;
    }
    door.hinge.removeAttribute('animation__door');
    if (immediate) door.hinge.setAttribute('rotation', `0 ${open ? 104 : 0} 0`);
    else door.hinge.setAttribute('animation__door', `property: rotation; to: 0 ${open ? 104 : 0} 0; dur: 760; easing: easeInOutCubic`);
  }

  animateConnectionDoors(view, open, immediate = false) {
    for (const door of view.doors) this.animateDoor(door, open, immediate);
  }

  ensureConnector(connection, { priority = 'background' } = {}) {
    const view = this.connectionViews.get(connection.id);
    if (view.connector) return Promise.resolve(view.connector);
    const retiring = this.retiringConnections.get(connection.id);
    if (retiring) return retiring.then(() => this.ensureConnector(connection, { priority }));
    const existing = this.connectionJobs.get(connection.id);
    if (existing) {
      if (priority === 'interactive') {
        existing.priority = priority;
        existing.handle?.promote();
      }
      return existing.promise;
    }
    const connector = entity('a-entity', { id: `connector-${connection.id}`, visible: false }, this.root);
    const steps = connection.kind === 'elevator'
      ? [connection.from, connection.to].map((endpoint) => ({ label: '连接通道', weight: 2, run: () => this.buildElevatorEndpoint(connector, connection, endpoint) }))
      : connection.path.slice(0, -1).map((point, index) => ({
        label: '连接通道', weight: 2,
        run: () => this.buildCorridorSegment(connector, point, connection.path[index + 1], connection.id, index)
      }));
    const job = { connector, handle: null, promise: null, priority };
    job.handle = this.scheduler.enqueue({
      id: `connector:${connection.id}:build`, owner: `connector:${connection.id}`, priority,
      steps, yieldAfterStep: true
    });
    job.promise = (async () => {
      try {
        await job.handle.promise;
        const colliders = this.scheduleColliderBuild(`connector:${connection.id}`, connector, job.priority);
        job.handle = colliders;
        await colliders.promise;
        connector.setAttribute('visible', true);
        view.connector = connector;
        this.connectionJobs.delete(connection.id);
        return connector;
      } catch (error) {
        this.connectionJobs.delete(connection.id);
        this.removeColliders(`connector:${connection.id}`);
        connector.setAttribute('visible', false);
        this.trackConnectionDisposal(connection.id, this.scheduleTreeDisposal(`connector:${connection.id}`, connector));
        throw error;
      }
    })();
    this.connectionJobs.set(connection.id, job);
    return job.promise;
  }

  buildCorridorSegment(parent, a, b, connectionId, index) {
    const horizontal = Math.abs(a.x - b.x) >= Math.abs(a.z - b.z);
    const length = horizontal ? Math.abs(a.x - b.x) : Math.abs(a.z - b.z);
    const x = (a.x + b.x) / 2;
    const z = (a.z + b.z) / 2;
    const width = horizontal ? length + .35 : 2.5;
    const depth = horizontal ? 2.5 : length + .35;
    box(parent, {
      position: `${x} -.07 ${z}`, width, height: .14, depth, color: COLORS.floor,
      material: `src: url(/museum-assets/white-oak-floor.jpg); color: #b8a596; repeat: ${Math.max(1, width / 3)} ${Math.max(1, depth / 3)}; roughness: .84`
    });
    entity('a-plane', { class: 'navmesh', position: `${x} .012 ${z}`, rotation: '-90 0 0', width: width - .15, height: depth - .15, material: 'transparent: true; opacity: .001; side: double; depthWrite: false' }, parent);
    if (horizontal) {
      box(parent, { position: `${x} 1.5 ${z - depth / 2}`, width, height: 3, depth: .16, color: COLORS.wall, shadow: false, collidable: true, material: `src: url(/museum-assets/warm-ivory-plaster.jpg); color: ${COLORS.wall}; repeat: ${Math.max(1, width / 3)} 1; roughness: .92` });
      box(parent, { position: `${x} 1.5 ${z + depth / 2}`, width, height: 3, depth: .16, color: COLORS.wall, shadow: false, collidable: true, material: `src: url(/museum-assets/warm-ivory-plaster.jpg); color: ${COLORS.wall}; repeat: ${Math.max(1, width / 3)} 1; roughness: .92` });
    } else {
      box(parent, { position: `${x - width / 2} 1.5 ${z}`, width: .16, height: 3, depth, color: COLORS.wall, shadow: false, collidable: true, material: `src: url(/museum-assets/warm-ivory-plaster.jpg); color: ${COLORS.wall}; repeat: ${Math.max(1, depth / 3)} 1; roughness: .92` });
      box(parent, { position: `${x + width / 2} 1.5 ${z}`, width: .16, height: 3, depth, color: COLORS.wall, shadow: false, collidable: true, material: `src: url(/museum-assets/warm-ivory-plaster.jpg); color: ${COLORS.wall}; repeat: ${Math.max(1, depth / 3)} 1; roughness: .92` });
    }
    box(parent, { position: `${x} 3 ${z}`, width, height: .12, depth, color: COLORS.ceiling, shadow: false });
    parent.dataset[`region${index}`] = JSON.stringify({ x, z, width, depth, connectionId });
  }

  buildElevator(parent, connection) {
    const styleId = this.elevatorStyleId(connection);
    for (const endpoint of [connection.from, connection.to]) this.buildElevatorEndpoint(parent, connection, endpoint, styleId);
  }

  buildElevatorEndpoint(parent, connection, endpoint, resolvedStyleId = null) {
    const styleId = resolvedStyleId || this.elevatorStyleId(connection);
    const room = this.roomConfig(endpoint.roomId);
    const placement = this.layout.placements.get(endpoint.roomId);
    const port = worldPort(room, placement, endpoint.doorId);
    const cabin = buildElevatorCabin({ parent, port, room, styleId });
    cabin.dataset.endpoint = endpoint.roomId;
  }

  addRoomRegion(roomId, placement, template) {
    const rect = roomRect({ id: roomId, template: template.id }, placement.x, placement.z, placement.rotation);
    this.walkRegions.push({ type: 'room', roomId, x: placement.x, z: placement.z, width: rect.width - .45, depth: rect.depth - .45 });
  }

  scheduleColliderBuild(owner, root, priority) {
    this.removeColliders(owner);
    let visitedElements = 0;
    let colliderCount = 0;
    this.recordPerformanceEvent?.('colliders:build-start', { owner, priority });
    const runSlice = createElementWalker(root, (element) => {
      visitedElements += 1;
      if (!element.classList?.contains('museum-collider')) return;
      colliderCount += 1;
      this.registerColliderElement(owner, element);
    });
    const task = this.scheduler.enqueueIncremental({
      id: `${owner}:colliders`, owner, priority, label: '建立碰撞', runSlice, yieldAfterStep: true
    });
    task.promise.then(() => this.recordPerformanceEvent?.('colliders:build-ready', {
      owner, priority, visitedElements, colliderCount
    }), (error) => {
      if (error.name !== 'AbortError') this.recordPerformanceEvent?.('colliders:build-error', {
        owner, priority, error: error.message
      }, { level: 'warn' });
    });
    return task;
  }

  registerColliderElement(owner, element) {
    element.object3D.updateWorldMatrix(true, false);
    const center = element.object3D.getWorldPosition(new THREE.Vector3());
    const quaternion = element.object3D.getWorldQuaternion(new THREE.Quaternion());
    const scale = element.object3D.getWorldScale(new THREE.Vector3());
    const geometry = element.getAttribute('geometry') || {};
    const radius = Number(element.getAttribute('radius') || geometry.radius || 0);
    const localWidth = radius ? radius * 2 : Number(element.getAttribute('width') || geometry.width || 0);
    const localDepth = radius ? radius * 2 : Number(element.getAttribute('depth') || geometry.depth || 0);
    if (!localWidth || !localDepth) return;
    const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const zAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion);
    const halfWidth = localWidth * Math.abs(scale.x) / 2;
    const halfDepth = localDepth * Math.abs(scale.z) / 2;
    const extentX = Math.abs(xAxis.x) * halfWidth + Math.abs(zAxis.x) * halfDepth;
    const extentZ = Math.abs(xAxis.z) * halfWidth + Math.abs(zAxis.z) * halfDepth;
    this.colliders.push({ owner, minX: center.x - extentX, maxX: center.x + extentX, minZ: center.z - extentZ, maxZ: center.z + extentZ });
  }

  removeColliders(owner) {
    this.colliders = this.colliders.filter((collider) => collider.owner !== owner);
  }

  refreshConnectorRegions() {
    this.walkRegions = this.walkRegions.filter((region) => region.type === 'room');
    for (const view of this.connectionViews.values()) {
      if (!view.connector) continue;
      if (view.connection.kind === 'elevator') {
        for (const endpoint of [view.connection.from, view.connection.to]) {
          const room = this.roomConfig(endpoint.roomId);
          const placement = this.layout.placements.get(endpoint.roomId);
          const port = worldPort(room, placement, endpoint.doorId);
          this.walkRegions.push(elevatorWalkRegion(port, view.connection.id, endpoint.roomId));
        }
      } else {
        if (!view.open) continue;
        const points = view.connection.path;
        for (let index = 0; index < points.length - 1; index += 1) {
          const a = points[index], b = points[index + 1];
          const horizontal = Math.abs(a.x - b.x) >= Math.abs(a.z - b.z);
          this.walkRegions.push({ type: 'connector', connectionId: view.connection.id, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, width: horizontal ? Math.abs(a.x - b.x) + .5 : 2.3, depth: horizontal ? 2.3 : Math.abs(a.z - b.z) + .5 });
        }
      }
    }
  }

  isWalkable(x, z) {
    if (!isPointWalkable(this.walkRegions, this.colliders, x, z)) return false;
    const position = { x, z };
    for (const view of this.connectionViews.values()) {
      if (view.doors.some((door) => !this.isDoorOpen(view, door.roomId) && isDoorwayBlocked(door.worldPort, position))) return false;
    }
    return true;
  }

  constrainMovement(start, end) {
    return constrainWalkableMovement(start, end, (x, z) => this.isWalkable(x, z));
  }

  isNearConnection(connection, distance) {
    const position = this.rig.object3D.position;
    return [connection.from, connection.to].some((endpoint) => {
      const room = this.roomConfig(endpoint.roomId);
      const port = worldPort(room, this.layout.placements.get(endpoint.roomId), endpoint.doorId);
      return Math.hypot(position.x - port.x, position.z - port.z) <= distance;
    });
  }

  detectCurrentRoom() {
    const position = this.rig.object3D.position;
    return [...this.loadedRooms.values()].find(({ room, placement }) => {
      const rect = roomRect(room, placement.x, placement.z, placement.rotation);
      return Math.abs(position.x - placement.x) <= rect.width / 2 - .25 && Math.abs(position.z - placement.z) <= rect.depth / 2 - .25;
    })?.room.id || this.currentRoomId;
  }

  handleElevators(now) {
    const position = this.rig.object3D.position;
    for (const view of this.connectionViews.values()) {
      if (!view.elevator) continue;
      if (view.elevator.phase === 'awaiting-exit') {
        const endpoint = view.connection.from.roomId === view.elevator.exitRoomId ? view.connection.from : view.connection.to;
        const room = this.roomConfig(endpoint.roomId);
        const port = worldPort(room, this.layout.placements.get(endpoint.roomId), endpoint.doorId);
        if (hasExitedElevator(port, position)) {
          this.setElevatorDoor(view, null);
          view.elevator.phase = 'idle';
          view.elevator.exitRoomId = null;
        }
        continue;
      }
      if (view.elevator.phase !== 'idle' || !view.elevator.openRoomId) continue;
      for (const endpoint of [view.connection.from, view.connection.to]) {
        if (endpoint.roomId !== view.elevator.openRoomId) continue;
        const room = this.roomConfig(endpoint.roomId);
        const placement = this.layout.placements.get(endpoint.roomId);
        const port = worldPort(room, placement, endpoint.doorId);
        if (!isInsideElevatorTrigger(port, position)) continue;
        const target = view.connection.from.roomId === endpoint.roomId ? view.connection.to : view.connection.from;
        this.runElevator(view, endpoint, target);
        return;
      }
    }
  }

  async runElevator(view, source, target) {
    view.elevator.phase = 'travelling';
    view.loading = true;
    this.setElevatorDoor(view, null);
    this.ui.toast('电梯门正在关闭…', 1200);
    await new Promise((resolve) => window.setTimeout(resolve, 780));
    const targetRoom = this.roomConfig(target.roomId);
    const targetPlacement = this.layout.placements.get(target.roomId);
    const targetPort = worldPort(targetRoom, targetPlacement, target.doorId);
    const sourceRoom = this.roomConfig(source.roomId);
    const sourcePort = worldPort(sourceRoom, this.layout.placements.get(source.roomId), source.doorId);
    const arrival = transferElevatorPosition(sourcePort, targetPort, this.rig.object3D.position);
    this.rig.object3D.position.set(arrival.x, 0, arrival.z);
    const rotation = this.rig.getAttribute('rotation');
    this.rig.setAttribute('rotation', {
      x: rotation.x,
      y: transferElevatorYaw(sourcePort, targetPort, rotation.y),
      z: rotation.z
    });
    const constraint = this.rig.components?.['museum-walk-constraint'];
    constraint?.lastValid?.copy(this.rig.object3D.position);
    this.ui.toast(`已抵达“${targetRoom.title}”`, 1800);
    this.setElevatorDoor(view, target.roomId);
    view.elevator.exitRoomId = target.roomId;
    view.elevator.phase = 'awaiting-exit';
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    view.loading = false;
  }

  unloadDistantRooms() {
    const keep = new Set([this.currentRoomId]);
    for (const edge of this.layout.adjacency.get(this.currentRoomId) || []) keep.add(edge.other.roomId);
    for (const roomId of keep) this.cancelPendingRoomUnload(roomId);
    for (const [roomId] of this.roomJobs) {
      if (keep.has(roomId)) continue;
      this.scheduler.cancelOwner(`room:${roomId}`, 'Room is no longer adjacent');
      this.textureManager.disposeRoom(roomId);
    }
    for (const [connectionId, job] of this.connectionJobs) {
      const connection = this.connectionViews.get(connectionId)?.connection;
      if (connection?.from.roomId === this.currentRoomId || connection?.to.roomId === this.currentRoomId) continue;
      this.scheduler.cancelOwner(`connector:${connectionId}`, 'Connection is no longer adjacent');
      job.connector?.setAttribute('visible', false);
    }
    for (const [roomId, loaded] of [...this.loadedRooms]) {
      if (keep.has(roomId) || this.roomUnloadTimers.has(roomId) || this.retiringRooms.has(roomId)) continue;
      this.scheduleRoomUnload(roomId, loaded);
    }
  }

  scheduleRoomUnload(roomId, loaded) {
    const now = performance.now();
    const retainedUntil = (this.roomLastVisitedAt.get(roomId) ?? now) + ROOM_RETENTION_MS;
    const idleUntil = this.lastMovementAt + MOVEMENT_IDLE_MS;
    const delay = Math.max(ROOM_UNLOAD_GRACE_MS, retainedUntil - now, idleUntil - now);
    this.recordPerformanceEvent?.('room:retire-scheduled', { roomId, delayMs: Math.max(0, delay) });
    const timer = window.setTimeout(() => {
      this.roomUnloadTimers.delete(roomId);
      if (this.activeTextureRoomIds().has(roomId)) return;
      const checkTime = performance.now();
      const remainingRetention = (this.roomLastVisitedAt.get(roomId) ?? checkTime) + ROOM_RETENTION_MS - checkTime;
      const remainingIdle = this.lastMovementAt + MOVEMENT_IDLE_MS - checkTime;
      const remaining = Math.max(remainingRetention, remainingIdle);
      if (remaining > 0) {
        this.recordPerformanceEvent?.('room:retire-deferred', { roomId, remainingMs: remaining });
        this.scheduleRoomUnload(roomId, loaded);
        return;
      }
      this.beginRoomRetirement(roomId, loaded);
    }, Math.max(0, delay));
    this.roomUnloadTimers.set(roomId, timer);
  }

  cancelPendingRoomUnload(roomId) {
    const timer = this.roomUnloadTimers.get(roomId);
    if (timer === undefined) return false;
    window.clearTimeout(timer);
    this.roomUnloadTimers.delete(roomId);
    this.recordPerformanceEvent?.('room:retire-cancelled', { roomId });
    return true;
  }

  beginRoomRetirement(roomId, loaded) {
    if (this.disposed || this.loadedRooms.get(roomId) !== loaded || this.retiringRooms.has(roomId)) return null;
    this.recordPerformanceEvent?.('room:retire-start', { roomId });
    this.scheduler.cancelOwner(`room:${roomId}`);
    for (const view of this.connectionViews.values()) {
      if (view.connection.from.roomId !== roomId && view.connection.to.roomId !== roomId) continue;
      if (view.elevator) {
        this.setElevatorDoor(view, null, { immediate: true });
        view.elevator.phase = 'idle';
        view.elevator.exitRoomId = null;
      } else this.setConnectionOpen(view, false, { immediate: true });
    }
    loaded.group.setAttribute('visible', false);
    this.loadedRooms.delete(roomId);
    this.walkRegions = this.walkRegions.filter((region) => region.roomId !== roomId);
    this.removeColliders(`room:${roomId}`);

    const cleanupPromises = [];
    for (const frame of loaded.portableFrames || []) {
      const grabber = frame.dataset.oldGrabber && document.getElementById(frame.dataset.oldGrabber);
      grabber?.components?.['grab-magnet-target']?.grabEnd();
      if (!loaded.group.contains(frame)) frame.remove();
    }
    for (const view of this.connectionViews.values()) {
      view.doors = view.doors.filter((door) => door.roomId !== roomId);
      if (view.connection.from.roomId !== roomId && view.connection.to.roomId !== roomId) continue;
      if (view.connector) {
        this.removeColliders(`connector:${view.connection.id}`);
        view.connector.setAttribute('visible', false);
        const connectorCleanup = this.scheduleTreeDisposal(`connector:${view.connection.id}`, view.connector);
        cleanupPromises.push(this.trackConnectionDisposal(view.connection.id, connectorCleanup));
        view.connector = null;
      }
    }
    this.textureManager.disposeRoom(roomId);
    cleanupPromises.push(this.scheduleTreeDisposal(`room:${roomId}`, loaded.group));
    return this.trackRoomDisposal(roomId, cleanupPromises);
  }

  trackRoomDisposal(roomId, cleanupPromises) {
    const existing = this.retiringRooms.get(roomId);
    if (existing) return existing.promise;
    const entry = { promise: null };
    entry.promise = Promise.allSettled(cleanupPromises).then(() => {
      if (this.retiringRooms.get(roomId) === entry) this.retiringRooms.delete(roomId);
      this.roomLastVisitedAt.delete(roomId);
      this.recordPerformanceEvent?.('room:retire-ready', { roomId });
    });
    this.retiringRooms.set(roomId, entry);
    return entry.promise;
  }

  trackConnectionDisposal(connectionId, cleanupPromise) {
    const existing = this.retiringConnections.get(connectionId);
    if (existing) return existing;
    const tracked = Promise.resolve(cleanupPromise).catch((error) => {
      if (error.name !== 'AbortError') console.error(error);
    }).then(() => {
      if (this.retiringConnections.get(connectionId) === tracked) this.retiringConnections.delete(connectionId);
    });
    this.retiringConnections.set(connectionId, tracked);
    return tracked;
  }

  scheduleTreeDisposal(owner, root) {
    return new Promise((resolve, reject) => {
      this.treeDisposalQueue.push({ owner, root, resolve, reject });
      this.startNextTreeDisposal();
    });
  }

  startNextTreeDisposal() {
    if (this.disposed || this.activeTreeDisposal || !this.treeDisposalQueue.length) return;
    const queued = this.treeDisposalQueue.shift();
    const startedAt = performance.now();
    this.recordPerformanceEvent?.('tree-disposal:start', { owner: queued.owner });
    const task = this.scheduler.enqueueIncremental({
      id: `${queued.owner}:dispose`,
      owner: queued.owner,
      priority: 'cleanup',
      label: '释放资源',
      runSlice: createIncrementalTreeDisposer(queued.root)
    });
    this.activeTreeDisposal = { ...queued, task };
    task.promise.then(
      () => {
        queued.resolve();
        this.recordPerformanceEvent?.('tree-disposal:ready', {
          owner: queued.owner, durationMs: performance.now() - startedAt
        });
        this.activeTreeDisposal = null;
        this.startNextTreeDisposal();
      },
      (error) => {
        queued.reject(error);
        if (error.name !== 'AbortError') this.recordPerformanceEvent?.('tree-disposal:error', {
          owner: queued.owner, durationMs: performance.now() - startedAt, error: error.message
        }, { level: 'warn' });
        this.activeTreeDisposal = null;
        this.startNextTreeDisposal();
      }
    );
  }

  activeTextureRoomIds() {
    const active = new Set([this.currentRoomId]);
    for (const edge of this.layout.adjacency.get(this.currentRoomId) || []) active.add(edge.other.roomId);
    return active;
  }

  frame(time) {
    this.scheduler.runFrame(time);
  }

  tick() {
    const now = performance.now();
    if (this.lastObservedRigPosition.distanceToSquared(this.rig.object3D.position) > .0001) {
      this.noteMovement(now);
      this.lastObservedRigPosition.copy(this.rig.object3D.position);
    }
    this.textureManager.tick(now);
    this.handleElevators(now);
    const roomId = this.detectCurrentRoom();
    if (roomId !== this.currentRoomId) {
      const previousRoomId = this.currentRoomId;
      this.roomLastVisitedAt.set(previousRoomId, now);
      this.roomLastVisitedAt.set(roomId, now);
      this.currentRoomId = roomId;
      this.recordPerformanceEvent?.('room:entered', { previousRoomId, roomId });
      const room = this.roomConfig(roomId);
      this.ui.setRoom(this.config.museum.title, roomId === this.config.museum.lobby.id ? '大厅' : room.title);
      this.musicManager.setTrack(backgroundMusicForRoom(this.config, roomId));
      this.unloadDistantRooms();
    }
  }

  noteMovement(now = performance.now()) {
    this.lastMovementAt = now;
    if (this.activeTreeDisposal) this.recordPerformanceEvent?.('tree-disposal:paused-by-movement', {
      owner: this.activeTreeDisposal.owner
    }, { throttleMs: 1000 });
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.clock);
    for (const timer of this.roomUnloadTimers.values()) window.clearTimeout(timer);
    this.roomUnloadTimers.clear();
    const abort = new Error('Museum disposed');
    abort.name = 'AbortError';
    for (const queued of this.treeDisposalQueue.splice(0)) queued.reject(abort);
    this.textureManager.dispose();
    this.musicManager.dispose();
    this.scheduler.dispose();
    this.longTaskObserver?.disconnect();
    if (this.diagnosticsEnabled) delete window.museumPerformance;
  }
}
