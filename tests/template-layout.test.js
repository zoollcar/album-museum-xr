import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getTemplate } from '../src/museum/templates.js';
import { hasClearEntrancePath, planRoomLayout, rectanglesOverlap } from '../src/museum/template-layout.js';
import { planSignage } from '../src/museum/signage-layout.js';
import { room } from './fixtures.js';

function fullyConnectedRoom(id, templateId) {
  const template = getTemplate(templateId);
  return { room: room(id, templateId), doors: new Set(template.doors.map(({ id: doorId }) => doorId)) };
}

describe('template layout contracts', () => {
  it.each(['lobby-atrium', 'gallery-small', 'gallery-medium', 'gallery-large'])('keeps every template item outside every connected-door exit: %s', (templateId) => {
    const template = getTemplate(templateId);
    const current = templateId === 'lobby-atrium'
      ? { id: 'lobby', template: templateId, blocks: [] }
      : fullyConnectedRoom('room-a', templateId).room;
    const doors = new Set(template.doors.map(({ id }) => id));
    const plan = planRoomLayout(current, template, doors, 'botanical');
    for (const item of plan.items) for (const exit of plan.exits) expect(rectanglesOverlap(item, exit, .18)).toBe(false);
    for (const [index, item] of plan.items.entries()) for (const other of plan.items.slice(index + 1)) {
      expect(rectanglesOverlap(item, other, .18)).toBe(false);
    }
    for (const door of doors) expect(hasClearEntrancePath(current, door, plan.items)).toBe(true);
  });

  it('reserves AS Studio north elevator arrival space and uses every slot away from connected doors', async () => {
    const config = JSON.parse(await readFile(new URL('../public/museums/project-showcase.json', import.meta.url), 'utf8'));
    const studio = config.rooms.find(({ id }) => id === 'skill-studio');
    const template = getTemplate(studio.template);
    const plan = planRoomLayout(studio, template, new Set(['door-2']), 'botanical');
    const northExit = plan.exits.find(({ id }) => id === 'exit-door-2');
    expect(northExit).toBeTruthy();
    expect(plan.items.every((item) => !rectanglesOverlap(item, northExit, .18))).toBe(true);
    expect(hasClearEntrancePath(studio, 'door-2', plan.items)).toBe(true);
    expect(plan.slots.every((slot) => slot.wall !== 'north' || Math.abs(slot.offset) >= template.layout.wallDoorClearance)).toBe(true);
  });

  it('places the showcase lobby hero on the east wall away from the elevator door', async () => {
    const config = JSON.parse(await readFile(new URL('../public/museums/project-showcase.json', import.meta.url), 'utf8'));
    const lobby = { ...config.museum.lobby, blocks: [] };
    const template = getTemplate(lobby.template);
    const plan = planRoomLayout(lobby, template, new Set(['door-1', 'door-2', 'door-3', 'door-4']), 'classic');
    expect(plan.hero.wall).toBe('east');
    expect(Math.abs(plan.hero.offset)).toBeGreaterThan(template.layout.wallDoorClearance);
  });
});

describe('signage layout contracts', () => {
  it('shrinks long copy before it truncates and never exceeds the available canvas', () => {
    const result = planSignage({
      title: 'A very long title that must not cover the subtitle '.repeat(16),
      lines: ['A deliberately verbose description that has to fit in a small label without crossing into a neighbouring exhibit. '.repeat(12)],
      width: 1.4, height: .34, signStyle: 'section'
    });
    expect(result.titleSize).toBeLessThanOrEqual(66);
    expect(result.rows.length).toBeLessThanOrEqual(Math.floor((result.textureHeight - 36 - result.bodyTop) / (result.bodySize + result.lineGap)));
    expect(result.overflow).toBe(true);
  });

  it('keeps ordinary lobby copy at its preferred scale', () => {
    const result = planSignage({ title: 'WELCOME', lines: ['Explore the museum.'], width: 2.65, height: 1.65, signStyle: 'wall-label' });
    expect(result.overflow).toBe(false);
    expect(result.titleSize).toBe(76);
  });
});
