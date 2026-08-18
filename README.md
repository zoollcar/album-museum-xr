# 个人旅行博物馆 XR

一个由 JSON 配置生成的个人 WebXR 照片博物馆。照片可放在 Cloudflare R2 或其他支持 CORS 的对象存储中；场馆会根据模板自动生成房间、门、走廊与电梯。

## 运行

```bash
npm install
npm run dev
```

WebXR 在正式环境中需要 HTTPS。桌面端使用鼠标观察、WASD 行走并点击门；VR 中可使用控制器或手势射线开门，左控制器支持瞬移。

## 配置博物馆

所有内置博物馆放在 `public/museums/`；在 `public/museums/index.json` 中添加一项，欢迎页便会自动显示。当前示例配置为 `public/museums/travel-museum.json`。也可通过查询参数加载另一份配置：

```text
https://museum.example.com/?config=https://static.example.com/my-museum.json
```

运行校验：

```bash
npm run validate:config
npm run validate:config -- path/to/another.json
```

### 模板容量

| 模板 | 尺寸 | 门位 | 展陈板块 | 照片上限 |
| --- | --- | ---: | ---: | ---: |
| `lobby-atrium` | 18×14×5 m | 6 | 大厅内容 | 1 张主视觉 |
| `gallery-small` | 14×10×4.5 m | 2 | 2 | 16 |
| `gallery-medium` | 18×12×5 m | 3 | 3 | 24 |
| `gallery-large` | 22×16×5.5 m | 4 | 4 | 36 |

门号都包含进入房间使用的门。只有 `connections` 中出现的门才会显示；未连接门位自动成为完整墙面。

### 图片 URL

每张照片必须配置 `original`，`medium` 和 `low` 可省略：

```json
{
  "sources": {
    "original": "https://images.example.com/trip/photo.jpg",
    "medium": "https://images.example.com/trip/photo-2048.webp",
    "low": "https://images.example.com/trip/photo-512.webp"
  },
  "title": "雨后的新宿",
  "location": "东京",
  "date": "2025-04-12",
  "description": "傍晚沿街散步时拍摄。",
  "alt": "雨后的东京街道"
}
```

- 8 米以外使用低清图。
- 2–8 米使用中清图。
- 2 米内并持续注视照片时使用原图，同时最多保留两张原图纹理。
- 缺少低清或中清 URL 时，浏览器会下载原图并缩小 GPU 纹理；这不能减少首次下载流量，所以大量照片时推荐在 R2 中保存三个尺寸。
- 说明字段全部省略时不会生成说明牌。

## Cloudflare R2 CORS

生产环境建议把 R2 绑定到自定义域名，并允许博物馆域名执行 `GET` 和 `HEAD`。示例策略：

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

R2 不支持 `http://localhost:*` 这种仅对 localhost 放开任意端口的 Origin 模式。对于仅存放公开图片、且只允许 `GET`、`HEAD` 的桶，可以像上面一样使用 `*`，从而支持任意 localhost 端口；这也会允许任意网站跨域读取这些公开资源。私有资源应改为逐项列出精确 Origin。修改已通过自定义域名提供服务的 R2 CORS 后，还需要清理该主机名的 CDN 缓存，旧缓存才会带上新的响应头。

## JSON 最小结构

```json
{
  "version": 1,
  "museum": {
    "title": "我的博物馆",
    "lobby": { "id": "lobby", "template": "lobby-atrium" }
  },
  "rooms": [
    {
      "id": "room-a",
      "template": "gallery-small",
      "title": "第一组照片",
      "blocks": [{ "photos": [{ "sources": { "original": "https://example.com/photo.jpg" } }] }]
    }
  ],
  "connections": [
    { "from": "lobby.door-1", "to": "room-a.door-1" }
  ]
}
```

房间不需要坐标。布局器优先直接拼接，其次生成直廊或转角廊；距离超过 24 米或发生空间冲突时自动改用电梯。

### 背景音乐

在 `museum.backgroundMusic` 配置全馆默认音乐，或在 `museum.lobby`、任一展厅上用同名字段覆盖。`url` 必填，`volume` 可选且范围为 `0` 到 `1`；省略音量时使用 `0.35`。音乐会循环播放，浏览器限制自动播放时会在参观者下一次交互后开始。

```json
{
  "backgroundMusic": {
    "url": "https://media.example.com/museum-ambient.mp3",
    "volume": 0.35
  }
}
```

### 房间主题与材质

房间可选配置 `theme`：`classic`、`botanical`、`art-deco` 或 `terrazzo`。主题会同时切换墙纸、地板、踢脚线和程序化 3D 装饰；省略时使用 `classic`。

门也和装饰品一样由样式目录生成。普通门可用房间的 `doorStyle` 选择 `classic-oak`、`sage-panel`、`deco-walnut`、`modern-ash`；电梯门可用 `elevatorDoorStyle` 选择 `elevator-brushed`、`elevator-bronze`、`elevator-dark`。电梯样式也可写在单条 `connections` 配置上，并优先于房间配置；同一连接的两端入口门和轿厢门始终共用一个样式，不会因目标房间主题不同而变色。省略时按电梯起点房间的 `theme` 自动搭配。电梯始终使用金属双开滑门，普通房间连接使用有门框、面板和把手的平开门。

```json
{
  "id": "botanical-archive",
  "template": "gallery-medium",
  "theme": "botanical",
  "doorStyle": "sage-panel",
  "elevatorDoorStyle": "elevator-bronze",
  "title": "植物与远方",
  "blocks": []
}
```

新增的植物壁纸、Art Deco 壁纸、水磨石和深色人字木地板位于 `public/museum-assets/`，均按可重复平铺方式加载。

展厅装饰还包括程序化构建的大理石半身像、青瓷器组、青铜天球仪、织物地毯和隔离柱。这些模型使用 `material-marble-warm.webp`、`material-celadon-crackle.webp`、`material-bronze-patina.webp` 与 `material-rug-burgundy.webp`，并按照房间主题自动组合。

## 模型与碰撞

可复用模型按类型拆分在 `src/museum/models/`：房间外壳、门、电梯、展框、家具和博物馆标识各自独立，便于单独调整几何、材质和性能。

- 实体墙、走廊墙和电梯侧壁使用静态碰撞体；轿厢对面从一开始就是关闭的电梯门，不再用墙体临时替换。
- 关闭的门会动态阻挡通行，开门后才解除；房间回收时先同步关门，再释放连接空间。
- 长椅和绿植花盆等落地家具参与碰撞；墙挂照片和文字牌不额外占用行走空间。
- 左上角参观提示仅用于桌面端，进入 WebXR 后自动隐藏。

## 本地出生点调试

在 `localhost`、`127.0.0.1` 和 `*.localhost` 本地预览地址中，可以用 URL 参数直接出生到指定位置：

```text
?spawn=cities
?spawn=cities.door-3
?spawn=cities.door-3&spawnSide=cabin
?spawn=cities.bench
?spawn=cities.photo-1
?spawn=cities.plant-1
```

- `spawn=<房间 ID>`：出生在房间默认位置。
- `spawn=<房间 ID>.<锚点>`：出生在门、长椅、照片或植物旁并自动面向目标。
- 门锚点默认为房间内侧；`spawnSide=cabin` 会建立连接、打开当前侧门并出生在轿厢内。
- `spawnDistance=2.5` 可覆盖与目标的距离，范围为 0.6–8 米。
- `spawnYaw=90` 可覆盖自动朝向，单位为度。
- 旧的 `previewRoom`、`previewDoor` 参数仍可继续使用。

## 性能诊断

开发模式会在控制台输出以 `[MuseumPerf]` 开头的结构化日志，包括点击门后的加载、房间进入、碰撞建立、延期回收、资源清理、慢调度切片和浏览器长任务。生产构建可在地址后添加 `?museumDebug=1` 临时启用同一套诊断。需要一次性查看当前状态时，可在控制台运行：

```js
window.museumPerformance.snapshot()
```

其中 `events` 是最近 200 条生命周期事件，`longTasks` 是浏览器记录的长任务，`tasks`、`retiringRooms` 和 `queuedTreeDisposals` 分别表示当前调度、房间回收与实体清理状态。

## 测试与构建

```bash
npm test
npm run build
```
