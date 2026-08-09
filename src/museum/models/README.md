# Museum model modules

Each reusable museum model has one source module so geometry, materials and collision can be tuned independently:

- `room-shell.js` — walls, baseboards, recessed skylight and track lighting
- `door.js` — frame, timber door leaf, inset panels, handle and museum door plaque
- `elevator.js` — enclosed cabin, lighting and destination plaque
- `exhibit.js` — photo frame, mat and image plane
- `furniture.js` — bench and plant/pot models with floor collisions
- `signage.js` — wall slogans, section typography, wall labels and brass plaques
- `primitives.js` — shared A-Frame primitives, materials, collision tagging and disposal

Room templates remain dimension-driven, while each visible model can now be optimized without modifying the scene orchestrator.
