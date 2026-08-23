# Personal Travel Museum XR

Turn a photo collection into a walkable WebXR museum with one JSON file. Personal Travel Museum XR builds galleries, connections, image captions, and an explorable 3D route from your content—no scene editing required.

**Try it now:** [https://album-museum-xr.hitorisama.org/](https://album-museum-xr.hitorisama.org/)

The included demo, **The Living JSON Museum**, is a guided tour of the project itself.

## Highlights

- Create a museum from portable JSON instead of manually placing 3D objects.
- Explore on desktop, mobile, and WebXR headsets.
- Navigate connected galleries through doors, corridors, and elevators.
- Keep large collections responsive with progressive image loading.
- Customize room themes, door styles, captions, and optional background music.

## Quick start

**Requirement:** Node.js.

```bash
git clone <your-fork-or-repository-url>
cd album-museum-xr
npm install
npm run dev
```

Open the local URL printed by Vite, then choose **The Living JSON Museum** from the welcome screen.

## Create your museum

1. Copy `public/museums/project-showcase.json` to a new file in `public/museums/`.
2. Replace its titles, text, and image URLs with your own collection.
3. Add the museum to `public/museums/index.json` so it appears on the welcome screen.
4. Validate the configuration before sharing it:

   ```bash
   npm run validate:config -- public/museums/my-museum.json
   ```

To open a hosted configuration directly, use a `config` query parameter:

```text
https://museum.example.com/?config=https://static.example.com/my-museum.json
```

For the JSON format, image hosting, themes, deployment requirements, and other implementation details, see the [technical reference](docs/technical-reference.md).

## Controls

| Platform | Controls |
| --- | --- |
| Desktop | Mouse to look, `W` `A` `S` `D` to walk, click doors to enter the next gallery |
| Mobile | Hold the on-screen direction pad to move and drag elsewhere to look |
| WebXR | Use controller or hand rays to interact; choose teleportation or continuous movement in wrist settings |

Move close to a photo and keep looking at it to load the highest-quality version. In production, WebXR requires HTTPS.

## Scripts

```bash
npm run dev                 # Start the development server
npm run build               # Build for production
npm run preview             # Preview the production build
npm test                    # Run the test suite
npm run validate:config     # Validate the included museum configuration
```

## Contributing

Contributions and museum examples are welcome. Please keep changes focused, run `npm test` and `npm run build`, and validate every edited museum configuration before opening a pull request.

## License

This project is released under the [MIT License](LICENSE).
