export const museumSchema = {
  $id: 'https://personal-museum.local/schema/v1',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'museum', 'rooms', 'connections'],
  properties: {
    version: { const: 1 },
    museum: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'lobby'],
      properties: {
        title: { type: 'string', minLength: 1 },
        subtitle: { type: 'string' },
        intro: { type: 'string' },
        heroImage: { $ref: '#/$defs/imageSources' },
        lobby: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'template'],
          properties: {
            id: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$' },
            template: { const: 'lobby-atrium' },
            theme: { enum: ['classic', 'botanical', 'art-deco', 'terrazzo'] },
            doorStyle: { enum: ['classic-oak', 'sage-panel', 'deco-walnut', 'modern-ash'] },
            elevatorDoorStyle: { enum: ['elevator-brushed', 'elevator-bronze', 'elevator-dark'] }
          }
        }
      }
    },
    rooms: {
      type: 'array',
      items: { $ref: '#/$defs/room' }
    },
    connections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to'],
        properties: {
          from: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]*\\.door-[1-9][0-9]*$' },
          to: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]*\\.door-[1-9][0-9]*$' },
          elevatorDoorStyle: { enum: ['elevator-brushed', 'elevator-bronze', 'elevator-dark'] }
        }
      }
    }
  },
  $defs: {
    imageSources: {
      type: 'object',
      additionalProperties: false,
      required: ['original'],
      properties: {
        original: { type: 'string', minLength: 1 },
        medium: { type: 'string', minLength: 1 },
        low: { type: 'string', minLength: 1 }
      }
    },
    photo: {
      type: 'object',
      additionalProperties: false,
      required: ['sources'],
      properties: {
        sources: { $ref: '#/$defs/imageSources' },
        title: { type: 'string' },
        location: { type: 'string' },
        date: { type: 'string' },
        description: { type: 'string' },
        alt: { type: 'string' }
      }
    },
    block: {
      type: 'object',
      additionalProperties: false,
      required: ['photos'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        photos: { type: 'array', items: { $ref: '#/$defs/photo' } }
      }
    },
    room: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'template', 'title', 'blocks'],
      properties: {
        id: { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]*$' },
        template: { enum: ['gallery-small', 'gallery-medium', 'gallery-large'] },
        theme: { enum: ['classic', 'botanical', 'art-deco', 'terrazzo'] },
        doorStyle: { enum: ['classic-oak', 'sage-panel', 'deco-walnut', 'modern-ash'] },
        elevatorDoorStyle: { enum: ['elevator-brushed', 'elevator-bronze', 'elevator-dark'] },
        title: { type: 'string', minLength: 1 },
        intro: { type: 'string' },
        blocks: { type: 'array', items: { $ref: '#/$defs/block' } }
      }
    }
  }
};
