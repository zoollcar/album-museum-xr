export function photo(overrides = {}) {
  return {
    sources: { original: 'https://images.example.com/original.jpg' },
    title: 'Test photo',
    ...overrides
  };
}

export function room(id, template = 'gallery-small', photos = [photo()]) {
  return { id, template, title: id, blocks: [{ title: 'Section', photos }] };
}

export function museumConfig(overrides = {}) {
  return {
    version: 1,
    museum: { title: 'Test Museum', lobby: { id: 'lobby', template: 'lobby-atrium' } },
    rooms: [room('room-a')],
    connections: [{ from: 'lobby.door-1', to: 'room-a.door-1' }],
    ...overrides
  };
}
