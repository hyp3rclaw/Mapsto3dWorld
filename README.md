# Maps to 3D World

Generate and explore Minecraft-style 3D voxel worlds from real-world OpenStreetMap data, entirely in your browser. No Minecraft installation required.

![split-panel](https://img.shields.io/badge/layout-split--panel-blue) ![three.js](https://img.shields.io/badge/3D-three.js-green) ![leaflet](https://img.shields.io/badge/map-leaflet-orange) ![vite](https://img.shields.io/badge/build-vite-purple) ![multiplayer](https://img.shields.io/badge/multiplayer-socket.io-yellow)

## Features

- **Interactive map** — browse the world with Leaflet, draw a square or rectangle to select any area
- **Real-world data** — fetches buildings, roads, water, vegetation, and landuse from OpenStreetMap via the Overpass API
- **Elevation support** — terrain height from the Open-Meteo elevation API, bilinear-interpolated to the voxel grid
- **Voxel engine** — optimised face-culled geometry (only visible faces are rendered) with 23 block types and per-face vertex colouring
- **First-person controls** — WASD + mouse with gravity, jumping, and sprint
- **Fly mode** — press `F` to toggle free flight (no gravity, no collision, pitch-aware movement)
- **Resizable split layout** — map on the left, 3D world on the right; drag the divider to resize
- **Fullscreen toggle** — expand the 3D viewer to fill the screen (`Tab` key or button)
- **Multiplayer** — explore worlds together with friends via room codes or public world listing
- **No backend required for solo play** — everything runs client-side in the browser

## Quick Start

```bash
git clone https://github.com/hyp3rclaw/Mapsto3dWorld.git
cd Mapsto3dWorld
npm install
npm run dev
```

Then open **http://localhost:3000** in your browser.

### Running the Multiplayer Server

```bash
cd server
npm install
node index.js
```

The WebSocket server starts on port **3001** by default. The frontend connects to it automatically when creating or joining rooms.

## Usage

1. **Select an area** — click the **Select Area** button on the map toolbar, then drag to draw a rectangle. Toggle between square and free-form rectangle mode with the shape button.
2. **Adjust settings** — in the sidebar, pick a scale, and toggle terrain, buildings, roads, vegetation, or water generation.
3. **Generate** — click **Generate 3D World**. The app fetches OSM data, generates voxels, and builds the mesh in the right panel.
4. **Explore** — click on the 3D view to enter first-person mode.

### Multiplayer

When you generate a world, a **4-digit room code** is automatically created and displayed in the sidebar. Share this code with friends so they can join.

- **Create a room** — generate any world; a room code appears in the sidebar with a copy button.
- **Join a room** — click **Join World** in the sidebar, enter the 4-digit code, and you'll be dropped directly into the 3D world.
- **Public worlds** — when creating a room via the HUD button, you can set it to public so others can browse and join from the lobby.
- **Player avatars** — other players appear as Minecraft-style figures with colored bodies and floating name tags.
- **Positions sync at ~15 Hz** with client-side interpolation for smooth movement.

### Controls

| Key | Walk Mode | Fly Mode |
|-----|-----------|----------|
| WASD / Arrows | Move on ground | Move in look direction |
| Mouse | Look around | Look around |
| Space | Jump | Ascend |
| Ctrl | — | Descend |
| Shift | Sprint (2.5x) | Sprint (2.5x) |
| F | Toggle fly mode | Toggle fly mode |
| Tab | Toggle fullscreen | Toggle fullscreen |
| ESC | Release pointer | Release pointer |

### Tips

- Start with a **small area** (~200m x 200m) for fast generation. Large areas work but take longer.
- If the Overpass API returns an error, the servers may be overloaded — try again in a moment or reduce the area.
- Drag the **divider** between the panels to give more space to the map or to the 3D world.

## Project Structure

```
src/
  main.js              Map page logic, multiplayer flow (create/join rooms)
  viewer.js            3D viewer (Three.js, PointerLockControls, fly/walk, MP sync)
  osm/
    overpass.js        Overpass API data fetcher (multi-endpoint failover)
    parser.js          OSM data parser and lat/lng-to-block coordinate projection
  world/
    blocks.js          Block type definitions and colours (23 types)
    voxel.js           VoxelWorld engine (cell-based storage, face-culled meshing)
    generator.js       World generator (terrain, buildings, roads, water, trees, landuse)
  multiplayer/
    socket.js          Socket.IO client wrapper and event system
    players.js         Remote player avatar rendering and interpolation
server/
  index.js             Express + Socket.IO multiplayer server
  rooms.js             Room management (create, join, leave, public listing)
styles/
  main.css             All styling (split layout, sidebar, HUD, overlays, multiplayer UI)
index.html             Single-page app shell
render.yaml            Render Blueprint for server deployment
```

## Deploying the Multiplayer Server

The `render.yaml` Blueprint deploys the WebSocket server to [Render](https://render.com):

```bash
# Or deploy manually:
cd server
npm install
PORT=10000 node index.js
```

Set the `VITE_MP_SERVER` environment variable when building the frontend to point to your deployed server:

```bash
VITE_MP_SERVER=https://your-server.onrender.com npm run build
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Build | Vite |
| Map | Leaflet |
| 3D | Three.js (WebGL) |
| Data | Overpass API (OpenStreetMap) |
| Elevation | Open-Meteo Elevation API |
| Multiplayer | Socket.IO |
| Server | Node.js + Express |

All dependencies are standard npm packages. No API keys are required.

## Building for Production

```bash
npm run build
npm run preview   # serve the built files locally
```

Output goes to `dist/`.

## License

MIT
