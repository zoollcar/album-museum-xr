# Technical Reference

This document covers the configuration, hosting, runtime behavior, and debugging details that are intentionally kept out of the project overview. Start with the [README](../README.md) for installation and everyday use.

## Museum configuration

Built-in configurations live in `public/museums/`. Register each one in `public/museums/index.json` to display it on the welcome screen. The schema is validated at runtime and can also be checked locally:

```bash
npm run validate:config
npm run validate:config -- path/to/another.json
```

### Minimal JSON

```json
{
  "version": 1,
  "museum": {
    "title": "My Museum",
    "lobby": { "id": "lobby", "template": "lobby-atrium" }
  },
  "rooms": [
    {
      "id": "room-a",
      "template": "gallery-small",
      "title": "First Set of Photos",
      "blocks": [{ "photos": [{ "sources": { "original": "https://example.com/photo.jpg" } }] }]
    }
  ],
  "connections": [{ "from": "lobby.door-1", "to": "room-a.door-1" }]
}
```

Do not add room coordinates. The layout engine chooses a direct connection, straight corridor, corner corridor, or elevator according to distance and spatial conflicts.

### Templates

| Template | Size | Door slots | Sections | Photo limit |
| --- | --- | ---: | ---: | ---: |
| `lobby-atrium` | 18×14×5 m | 6 | Lobby content | 1 hero image |
| `gallery-small` | 14×10×4.5 m | 2 | 2 | 16 |
| `gallery-medium` | 18×12×5 m | 3 | 3 | 24 |
| `gallery-large` | 22×16×5.5 m | 4 | 4 | 36 |

Only doors referenced by `connections` are shown. Each door slot may occur in only one connection, and every gallery must be reachable from the lobby.

### Images and captions

Every photo requires `sources.original`. Add `medium` and `low` versions for larger collections:

```json
{
  "sources": {
    "original": "https://images.example.com/trip/photo.jpg",
    "medium": "https://images.example.com/trip/photo-2048.webp",
    "low": "https://images.example.com/trip/photo-512.webp"
  },
  "title": "Shinjuku After Rain",
  "location": "Tokyo",
  "date": "2025-04-12",
  "description": "Taken during an evening walk along the street.",
  "alt": "A Tokyo street after rain"
}
```

The app uses low-resolution textures beyond 8 m, medium-resolution textures from 2–8 m, and an original texture within 2 m while a visitor continues looking at a photo. At most two original textures are retained. If a lower-resolution source is absent, the original image is downloaded and downscaled, so providing all three sizes reduces initial bandwidth.

### Themes, doors, and music

Set `theme` to `classic`, `botanical`, `art-deco`, or `terrazzo`. Standard `doorStyle` values are `classic-oak`, `sage-panel`, `deco-walnut`, and `modern-ash`; `elevatorDoorStyle` values are `elevator-brushed`, `elevator-bronze`, and `elevator-dark`.

Use `museum.backgroundMusic` for a museum-wide track, or set `backgroundMusic` on the lobby or a gallery to override it for that room:

```json
{
  "backgroundMusic": {
    "url": "https://media.example.com/museum-ambient.mp3",
    "volume": 0.35
  }
}
```

`url` is required. `volume` ranges from `0` to `1` and defaults to `0.35`. Audio loops and begins after a visitor interaction if autoplay is blocked. Use only audio you are licensed to publish.

## Image hosting and deployment

Remote images must allow browser CORS reads. For public, read-only Cloudflare R2 image buckets, a permissive policy can support every localhost port during development:

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

This allows any website to read public resources cross-origin. Use an explicit Origin list for private resources. When changing CORS on an R2 bucket behind a custom domain, purge its CDN cache so cached responses receive the new headers. WebXR deployments require HTTPS.

## Runtime behavior

Reusable visual models are organized under `src/museum/models/`. Closed doors, room walls, corridor walls, elevator walls, benches, and planters participate in collision. Opening a door releases its blocker; unloading a room closes its surviving doors before its connectors and textures are removed.

Desktop-only guidance hides during immersive WebXR and returns after exit. The scene preserves desktop mouse/WASD controls alongside controller, hand-ray, and left-controller teleport input.

## Local debugging

On `localhost`, `127.0.0.1`, and `*.localhost`, use query parameters to spawn at a known location:

```text
?spawn=cities
?spawn=cities.door-3
?spawn=cities.door-3&spawnSide=cabin
?spawn=cities.bench
?spawn=cities.photo-1
?spawn=cities.plant-1
```

- `spawn=<room ID>` starts at the room's default position.
- `spawn=<room ID>.<anchor>` starts beside a door, bench, photo, or plant and faces it.
- `spawnSide=cabin` opens the current-side door and starts inside the cabin.
- `spawnDistance=2.5` accepts values from 0.6–8 m; `spawnYaw=90` overrides facing in degrees.
- The legacy `previewRoom` and `previewDoor` parameters remain supported.

Development mode logs structured `[MuseumPerf]` diagnostics. Add `?museumDebug=1` to a production URL to enable the same diagnostics temporarily. Run `window.museumPerformance.snapshot()` in the browser console to inspect recent events, long tasks, scheduling, retirement, and queued cleanup state.
