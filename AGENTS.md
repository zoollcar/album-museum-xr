# Project instructions

## Museum JSON contract

- Treat `src/config/schema.js`, `src/config/validate.js`, and `src/museum/templates.js` as the runtime source of truth for museum configuration. Keep `.agents/skills/generate-museum-json/SKILL.md` and its zero-dependency checker aligned with them.
- Update the skill documentation and `scripts/check-museum-json.mjs` in the same change whenever a JSON field, required/optional rule, enum, ID pattern, template, capacity, door inventory, connection rule, or reachability rule changes. Also review them when image fallback behavior or `public/museums/index.json` registration changes.
- When only explanatory wording or examples change, update `SKILL.md`; update the checker only if accepted/rejected JSON behavior changes. Never weaken the checker merely to accept a new example—change the runtime contract and tests deliberately first.
- Validate every added or edited museum file with `node .agents/skills/generate-museum-json/scripts/check-museum-json.mjs <path>`. If the runtime validator changes, add or update `tests/config.test.js`, run `npm test`, and compare the standalone checker against representative valid and invalid configurations.
- Museum JSON declares content and graph topology, not geometry. Do not add room coordinates, rotations, corridor/elevator choices, or unused placeholder doors; `src/museum/layout.js` owns placement and connector selection.
- Preserve the progressive image contract: `sources.original` is required; `medium` and `low` are optional fallbacks but should be supplied for substantial albums to control bandwidth. Do not fabricate photo dates, locations, or descriptions.

## Architecture and interaction

- Keep configuration validation, layout, navigation/movement, texture streaming, scene orchestration, and visible model geometry separated. Reusable visible geometry belongs under `src/museum/models/`, not in scene orchestration.
- Preserve door and collision invariants: closed doors and solid room/corridor/elevator surfaces block movement; opening a door releases its blocker; unloading a room closes surviving doors before removing connectors or textures. Floor furniture with a physical footprint must participate in collision.
- Preserve desktop and WebXR input paths. Desktop supports mouse look, WASD, and click interaction; WebXR supports controller/hand-ray interaction and left-controller teleportation. UI that is desktop-only must hide during immersive XR and restore after exit.
- Treat standalone Quest-class headset performance as a design constraint. Reuse geometry/materials, keep procedural decoration restrained, and retain progressive texture loading and original-texture eviction unless a measured change justifies a different policy.
- Do not hard-code production hosts into museum logic. Remote image origins must support browser CORS, and deployed WebXR requires HTTPS.

## Verification and repository hygiene

- Run the narrowest relevant Vitest tests while iterating, then `npm test` for cross-cutting changes and `npm run build` for production-facing changes.
- For visual, navigation, spawn, collision, door/elevator, or XR-state changes, verify the affected path in a browser at a stable viewport; update `design-qa.md` only with evidence actually rechecked in the current change.
- Preserve user-authored changes in the working tree. Do not rewrite unrelated files, generated QA artifacts, or assets as cleanup.
- Keep paths used by public museum configs rooted under `/museums/` or `/museum-assets/`; source modules belong under `src/`, public runtime assets under `public/`, and test fixtures under `tests/`.
