---
name: generate-museum-json
description: Generate, edit, review, or validate museum configuration JSON for this photo-album-museum-XR project. Use when creating a museum or gallery from photo metadata, changing files under public/museums/, adding rooms or connections, choosing templates/themes/door styles, or diagnosing a museum JSON rejected by the app.
---

# Generate Museum JSON

Create museum configurations that the application can load directly. Do not put comments, trailing commas, room coordinates, or fields not documented here in JSON.

## Workflow

1. Read the supplied photos, groups, titles, and narrative requirements. When information is missing, add only conservative display copy; never invent a capture location or date.
2. Choose templates and plan all rooms, sections, and door connections. Every gallery must be reachable from the lobby.
3. Generate UTF-8 JSON that follows the contract below. Prefer two-space indentation and retain a final newline.
4. To display a new museum on the welcome screen, add it to `public/museums/index.json` with `config` in the form `/museums/<file>.json`.
5. Run the zero-dependency checker from the project root:

   ```bash
   node .agents/skills/generate-museum-json/scripts/check-museum-json.mjs public/museums/<file>.json
   ```

6. Run `npm test` when changing configuration implementation. Always run the checker before delivering a new configuration.

## Top-level shape

Exactly four top-level fields are allowed, and all are required:

```json
{
  "version": 1,
  "museum": {
    "title": "My Museum",
    "lobby": { "id": "lobby", "template": "lobby-atrium" }
  },
  "rooms": [],
  "connections": []
}
```

- `version` must be the number `1`.
- `museum` contains museum and lobby information.
- `rooms` is the gallery array; do not repeat the lobby here.
- `connections` is an array of undirected connections between doors.

All objects reject undeclared fields.

## `museum` and `lobby`

`museum` fields:

| Field | Requirement |
| --- | --- |
| `title` | Required, non-empty string |
| `subtitle` | Optional string |
| `intro` | Optional string |
| `heroImage` | Optional image-source object |
| `backgroundMusic` | Optional museum-wide default music |
| `lobby` | Required lobby object |

`lobby` fields:

| Field | Requirement |
| --- | --- |
| `id` | Required; starts with a letter and then contains only letters, numbers, `_`, or `-`; unique among all gallery IDs |
| `template` | Must be `lobby-atrium` |
| `theme` | Optional theme |
| `doorStyle` | Optional standard-door style |
| `elevatorDoorStyle` | Optional elevator-door style |
| `backgroundMusic` | Optional; overrides the museum default only in the lobby |

The lobby has six door slots, `door-1` through `door-6`. Its `heroImage` does not count as a gallery photo.

Runtime templates determine doorway clearance, wall-photo positions, furniture positions, and text wrapping for both lobbies and galleries. JSON does not accept coordinates, orientations, or other visual-layout fields. The runtime shrinks overly long text first and uses an ellipsis if it still cannot fit, avoiding overlap with neighboring content.

## `rooms`, `blocks`, and `photos`

Each gallery accepts only:

| Field | Requirement |
| --- | --- |
| `id` | Required, same format as the lobby ID, globally unique |
| `template` | Required; see the template table |
| `title` | Required, non-empty string |
| `intro` | Optional string |
| `theme` | Optional theme |
| `doorStyle` | Optional standard-door style |
| `elevatorDoorStyle` | Optional elevator-door style |
| `backgroundMusic` | Optional; overrides the museum default only in this gallery |
| `blocks` | Required section array |

Each section accepts only optional string `title`, optional string `description`, and required array `photos`. Sections are curatorial groups and do not define positions.

Each photo accepts only:

```json
{
  "sources": {
    "original": "https://images.example.com/photo.jpg",
    "medium": "https://images.example.com/photo-2048.webp",
    "low": "https://images.example.com/photo-512.webp"
  },
  "title": "Shinjuku After Rain",
  "location": "Tokyo",
  "date": "2025-04-12",
  "description": "Taken during an evening walk along the street.",
  "alt": "A Tokyo street after rain"
}
```

- `sources` is required and `original` must be a non-empty string. `medium` and `low` are optional non-empty strings.
- `title`, `location`, `date`, `description`, and `alt` are all optional strings.
- Prefer all three image URL sizes. When `medium` or `low` is absent, the app falls back to the original image, increasing download traffic.
- Verify the source before writing factual `location`, `date`, or `description`; omit them when they cannot be confirmed.
- Provide accurate `alt` text for accessibility whenever possible, but do not pass off a filename as a description.

## Background music

`museum.backgroundMusic` is the museum-wide default. `museum.lobby.backgroundMusic` or a gallery's `backgroundMusic` overrides it while the visitor is in that room. Leaving a room with its own music restores the museum default.

```json
{
  "url": "https://media.example.com/museum-ambient.mp3",
  "volume": 0.35
}
```

- `url` is required and must be a non-empty string. Remote audio must be directly loadable by browsers; deployments should use HTTPS.
- `volume` is optional, must be a number from `0` to `1`, and defaults to `0.35`.
- Music loops. If autoplay is restricted, playback begins with the visitor's next click, key press, or XR interaction.
- Rooms without `backgroundMusic` inherit the museum-wide default; omitting all music fields leaves the museum silent.
- Use audio with clear permission, and retain author, source, and license records. Do not add links with unknown licensing.

## Templates and capacity

| Template | Max sections | Photo limit | Connectable door slots |
| --- | ---: | ---: | --- |
| `gallery-small` | 2 | 16 | `door-1`, `door-2` |
| `gallery-medium` | 3 | 24 | `door-1`, `door-2`, `door-3` |
| `gallery-large` | 4 | 36 | `door-1`, `door-2`, `door-3`, `door-4` |

The photo limit is the total across all sections in one room. Only doors used by a connection are displayed; do not add placeholder connections for unused doors.

Connected doors automatically reserve clearance for elevator and walking exits. Images and floor exhibits avoid that area; content authors neither need nor can specify detour coordinates.

## Themes and door styles

- `theme`: `classic`, `botanical`, `art-deco`, `terrazzo`.
- `doorStyle`: `classic-oak`, `sage-panel`, `deco-walnut`, `modern-ash`.
- `elevatorDoorStyle`: `elevator-brushed`, `elevator-bronze`, `elevator-dark`.

Themes and door styles are optional. Do not put a standard-door style in `elevatorDoorStyle`, or an elevator-door style in `doorStyle`.

## `connections`

Every connection must contain exactly `from` and `to`, with optional `elevatorDoorStyle`:

```json
{
  "from": "lobby.door-1",
  "to": "cities.door-1",
  "elevatorDoorStyle": "elevator-bronze"
}
```

The following all apply:

- Endpoints use `<room-id>.door-<positive integer>`.
- Both endpoints refer to different existing rooms, and each door number belongs to its room template.
- A door slot appears in at most one connection.
- Every gallery must be reachable from the lobby through the connection graph.
- Do not specify connection type, corridors, elevators, positions, or rotations. The layout engine selects a direct connection, corridor, or elevator from distance and conflicts.

## Completion checklist

- Confirm the JSON parses, has no additional fields, and uses correctly spelled IDs and enum values.
- Confirm section count, photo count, and door numbers do not exceed template capacity.
- Confirm there are no duplicate IDs, duplicate door slots, self-connections, or isolated galleries.
- Confirm every photo has `sources.original` and the remote image service permits browser cross-origin reads.
- Confirm background-music URLs are publicly accessible over HTTPS and their licensing suits the project.
- Run `scripts/check-museum-json.mjs` and fix every error; do not declare completion from visual inspection alone.
