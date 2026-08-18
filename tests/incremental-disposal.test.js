import { describe, expect, it, vi } from 'vitest';
import { createIncrementalTreeDisposer } from '../src/museum/models/primitives.js';

function node(name, children = [], mesh = null) {
  const value = {
    name,
    children,
    parentNode: null,
    components: {},
    object3DMap: mesh ? { mesh } : {},
    get lastElementChild() { return this.children.at(-1) || null; },
    remove: vi.fn(function remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    })
  };
  for (const child of children) child.parentNode = value;
  return value;
}

describe('incremental tree disposal', () => {
  it('removes one leaf per slice and releases shared manual resources only once', () => {
    const geometry = { dispose: vi.fn() };
    const texture = { isTexture: true, userData: { imageBitmap: { close: vi.fn() } }, dispose: vi.fn() };
    const material = { map: texture, dispose: vi.fn() };
    const mesh = { traverse: (visit) => { visit({ geometry, material }); visit({ geometry, material }); } };
    const first = node('first', [], mesh);
    const second = node('second');
    const root = node('root', [first, second]);
    root.parentNode = { children: [root] };
    const disposeSlice = createIncrementalTreeDisposer(root);

    expect(disposeSlice()).toBe(false);
    expect(second.remove).toHaveBeenCalledOnce();
    expect(first.remove).not.toHaveBeenCalled();
    expect(disposeSlice()).toBe(false);
    expect(first.remove).toHaveBeenCalledOnce();
    expect(geometry.dispose).toHaveBeenCalledOnce();
    expect(material.dispose).toHaveBeenCalledOnce();
    expect(texture.dispose).toHaveBeenCalledOnce();
    expect(texture.userData.imageBitmap.close).toHaveBeenCalledOnce();
    expect(disposeSlice()).toBe(true);
    expect(root.remove).toHaveBeenCalledOnce();
  });
});
