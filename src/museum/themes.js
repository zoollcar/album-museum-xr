export const ROOM_THEMES = {
  classic: {
    id: 'classic',
    wall: { src: '/museum-assets/warm-ivory-plaster.jpg', tint: '#e8dfd4', repeatMeters: 3, roughness: .94 },
    floor: { src: '/museum-assets/white-oak-floor.jpg', tint: '#c0afa0', repeatMeters: 3, roughness: .86 },
    trim: '#80634b',
    decor: 'classic'
  },
  botanical: {
    id: 'botanical',
    wall: { src: '/museum-assets/wallpaper-botanical-sage.webp', tint: '#ffffff', repeatMeters: 4.2, roughness: .96 },
    floor: { src: '/museum-assets/floor-terrazzo-ivory.webp', tint: '#f3eee6', repeatMeters: 4.4, roughness: .82 },
    trim: '#8b765b',
    decor: 'botanical'
  },
  'art-deco': {
    id: 'art-deco',
    wall: { src: '/museum-assets/wallpaper-art-deco-indigo.webp', tint: '#ffffff', repeatMeters: 4.6, roughness: .91 },
    floor: { src: '/museum-assets/floor-herringbone-smoked-oak.webp', tint: '#d2c5ba', repeatMeters: 4.8, roughness: .78 },
    trim: '#9b7844',
    decor: 'art-deco'
  },
  terrazzo: {
    id: 'terrazzo',
    wall: { src: '/museum-assets/warm-ivory-plaster.jpg', tint: '#ede6dc', repeatMeters: 3, roughness: .94 },
    floor: { src: '/museum-assets/floor-terrazzo-ivory.webp', tint: '#ffffff', repeatMeters: 4.4, roughness: .82 },
    trim: '#8b765b',
    decor: 'modern'
  }
};

export function getRoomTheme(room) {
  return ROOM_THEMES[room?.theme] || ROOM_THEMES.classic;
}

export function surfaceMaterial(surface, repeatX, repeatY) {
  return `src: url(${surface.src}); color: ${surface.tint}; repeat: ${repeatX} ${repeatY}; roughness: ${surface.roughness}; metalness: 0`;
}
