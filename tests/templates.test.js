import { describe, expect, it } from 'vitest';
import { TEMPLATE_DEFINITIONS } from '../src/museum/templates.js';

describe('gallery door contracts', () => {
  it.each([
    ['gallery-small', 2],
    ['gallery-medium', 3],
    ['gallery-large', 4]
  ])('%s exposes exactly %i numbered doors', (template, count) => {
    const doors = TEMPLATE_DEFINITIONS[template].doors;
    expect(doors).toHaveLength(count);
    expect(doors.map((door) => door.id)).toEqual(Array.from({ length: count }, (_, index) => `door-${index + 1}`));
  });
});
