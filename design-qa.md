# Design QA — Personal Photo Museum XR

## Evidence

- Visual target: `C:\Users\feng\project\photo-album-museum-XR\qa\reference-quiet-oak-bright.png`
- Same-state gallery capture: `C:\Users\feng\project\photo-album-museum-XR\artifacts\qa\gallery-model-refactor-1536x1024.png`
- Lobby and slogan capture: `C:\Users\feng\project\photo-album-museum-XR\artifacts\qa\lobby-model-refactor.png`
- Close wall-label capture: `C:\Users\feng\project\photo-album-museum-XR\artifacts\qa\museum-signage-close.png`
- Closed-door collision capture: `C:\Users\feng\project\photo-album-museum-XR\artifacts\qa\closed-door-collision.png`
- Comparison viewport: 1536 × 1024 CSS pixels for both target and implementation.
- Browser route: `http://app.localhost:4173/`.

## Findings

- No P0, P1, or P2 defects remain in the requested scope.
- [P3] The five-photo demo room remains intentionally sparser than the reference, which shows roughly twenty works. JSON configurations with more photos populate additional fixed slots without empty frames.
- [P3] The real-time A-Frame lighting is less photorealistic than the offline reference. The current recessed skylight, perimeter tracks and restrained point lights preserve the Quest 3 performance target.

## Verified Fidelity Surfaces

- Architecture: recessed coffered skylight with two-axis mullions, perimeter track lights, warm plaster, pale oak floor, timber baseboards and a fabric/wood bench.
- Signage: large slogans and photo metadata are direct wall typography; section labels are transparent; door and elevator identifiers use compact dark-bronze museum plaques. The previous beige card treatment is removed.
- Exhibits: blocks are allocated to different walls, frames vary in proportion, photo metadata is readable at viewing distance, and no empty frame is created.
- Doors: timber texture, inset panels, dark handle and frame are isolated in a dedicated model module.
- Furniture: bench and plant pots use registered physical footprints.

## Interaction Evidence

- Entering desktop fullscreen/WebXR added `body.is-vr`; computed `#museum-header` display became `none`. Exiting restored `display: flex`.
- An actual click opened the city-to-coast elevator. Walking into the cabin closed the door, moved the visitor, reopened the destination, updated the room title to `Coastal Journal`, and displayed `Arrived at “Coastal Journal”`.
- Repeated W input stopped at a closed timber door and at a continuous wall rather than passing through.
- The bench collision stopped the rig at world Z `-14.81`, 0.59 m before the bench center at `-15.40`.
- Room unload now closes the surviving door leaf immediately before removing its connector and textures, preventing an open doorway into empty space.

## Model Separation

- `room-shell.js`, `door.js`, `elevator.js`, `exhibit.js`, `furniture.js`, `signage.js`, and `primitives.js` own independent model concerns.
- Scene orchestration, texture streaming, layout and collision policy remain separate from visible geometry.

final result: passed
