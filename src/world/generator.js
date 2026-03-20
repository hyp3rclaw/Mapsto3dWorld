import { VoxelWorld } from './voxel.js';
import { BlockType } from './blocks.js';
import { parseOSMData, projectToWorld, getWorldDimensions } from '../osm/parser.js';

const MAX_HEIGHT = 128;
const GROUND_LEVEL = 20;
const WATER_LEVEL = GROUND_LEVEL - 1;

export class WorldGenerator {
  constructor(osmData, bbox, settings) {
    this.osmData = osmData;
    this.bbox = bbox;
    this.settings = settings;
    this.scale = settings.scale || 1;

    const dims = getWorldDimensions(bbox, this.scale);
    this.worldWidth = Math.max(dims.width, 1);
    this.worldDepth = Math.max(dims.depth, 1);

    this.heightMap = new Int32Array(this.worldWidth * this.worldDepth);
    this.heightMap.fill(GROUND_LEVEL);

    this.world = new VoxelWorld(this.worldWidth, MAX_HEIGHT, this.worldDepth);
    this.parsed = parseOSMData(osmData, bbox, this.scale);
  }

  async generate(onProgress) {
    onProgress?.('Parsing OSM data...', 5);
    await this._yieldFrame();

    onProgress?.('Generating terrain...', 10);
    if (this.settings.terrain) {
      await this._generateElevation(onProgress);
    }

    this._generateBaseGround();
    await this._yieldFrame();

    onProgress?.('Generating water...', 25);
    if (this.settings.water) {
      this._generateWater();
      await this._yieldFrame();
    }

    onProgress?.('Generating roads...', 35);
    if (this.settings.roads) {
      this._generateRoads();
      await this._yieldFrame();
    }

    onProgress?.('Generating buildings...', 50);
    if (this.settings.buildings) {
      this._generateBuildings();
      await this._yieldFrame();
    }

    onProgress?.('Generating vegetation...', 75);
    if (this.settings.vegetation) {
      this._generateVegetation();
      await this._yieldFrame();
    }

    onProgress?.('Generating landuse...', 85);
    this._generateLanduse();
    await this._yieldFrame();

    onProgress?.('World generation complete!', 100);
    return this.world;
  }

  _project(lat, lon) {
    return projectToWorld(lat, lon, this.bbox, this.scale);
  }

  _getHeight(x, z) {
    if (x < 0 || z < 0 || x >= this.worldWidth || z >= this.worldDepth) return GROUND_LEVEL;
    return this.heightMap[z * this.worldWidth + x];
  }

  _setHeight(x, z, h) {
    if (x < 0 || z < 0 || x >= this.worldWidth || z >= this.worldDepth) return;
    this.heightMap[z * this.worldWidth + x] = h;
  }

  async _generateElevation(onProgress) {
    // Fetch elevation data from Open-Meteo API
    const { minLat, minLng, maxLat, maxLng } = this.bbox;

    // Sample elevation at a grid of points
    const gridSize = Math.min(100, Math.max(10, Math.max(this.worldWidth, this.worldDepth) / 4));
    const latStep = (maxLat - minLat) / gridSize;
    const lngStep = (maxLng - minLng) / gridSize;

    const lats = [];
    const lngs = [];
    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        lats.push((minLat + i * latStep).toFixed(6));
        lngs.push((minLng + j * lngStep).toFixed(6));
      }
    }

    try {
      onProgress?.('Fetching elevation data...', 12);

      // Use Open-Meteo elevation API (free, no key needed)
      // API supports max ~100 points per request, batch if needed
      const batchSize = 100;
      const elevations = [];

      for (let i = 0; i < lats.length; i += batchSize) {
        const batchLats = lats.slice(i, i + batchSize).join(',');
        const batchLngs = lngs.slice(i, i + batchSize).join(',');

        const url = `https://api.open-meteo.com/v1/elevation?latitude=${batchLats}&longitude=${batchLngs}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Elevation API returned ${resp.status}`);
        const data = await resp.json();
        elevations.push(...data.elevation);
      }

      // Find min elevation to use as base
      const validElevs = elevations.filter((e) => e !== null && e > -1000);
      if (validElevs.length === 0) return;

      const minElev = Math.min(...validElevs);
      const maxElev = Math.max(...validElevs);
      const elevRange = maxElev - minElev;

      // Map elevations to height grid
      const maxTerrainHeight = Math.min(40, Math.max(5, Math.round(elevRange / 2)));

      let idx = 0;
      const elevGrid = [];
      for (let i = 0; i <= gridSize; i++) {
        elevGrid[i] = [];
        for (let j = 0; j <= gridSize; j++) {
          const e = elevations[idx++] ?? minElev;
          const normalized = elevRange > 0 ? (e - minElev) / elevRange : 0;
          elevGrid[i][j] = GROUND_LEVEL + Math.round(normalized * maxTerrainHeight);
        }
      }

      // Interpolate elevation grid to full world size
      for (let wz = 0; wz < this.worldDepth; wz++) {
        const gz = (wz / this.worldDepth) * gridSize;
        const gi = Math.min(Math.floor(gz), gridSize - 1);
        const gf = gz - gi;

        for (let wx = 0; wx < this.worldWidth; wx++) {
          const gx = (wx / this.worldWidth) * gridSize;
          const gj = Math.min(Math.floor(gx), gridSize - 1);
          const gg = gx - gj;

          // Bilinear interpolation
          const h00 = elevGrid[gi][gj];
          const h10 = elevGrid[gi + 1]?.[gj] ?? h00;
          const h01 = elevGrid[gi]?.[gj + 1] ?? h00;
          const h11 = elevGrid[gi + 1]?.[gj + 1] ?? h00;

          const h = Math.round(
            h00 * (1 - gf) * (1 - gg) +
            h10 * gf * (1 - gg) +
            h01 * (1 - gf) * gg +
            h11 * gf * gg
          );

          this._setHeight(wx, wz, h);
        }
      }

      onProgress?.('Elevation data applied', 18);
    } catch (err) {
      console.warn('Failed to fetch elevation:', err.message);
      onProgress?.('Elevation unavailable, using flat terrain', 18);
    }
  }

  _generateBaseGround() {
    for (let z = 0; z < this.worldDepth; z++) {
      for (let x = 0; x < this.worldWidth; x++) {
        const h = this._getHeight(x, z);

        // Bedrock at y=0
        this.world.setVoxel(x, 0, z, BlockType.BEDROCK);

        // Stone layers
        for (let y = 1; y < h - 3; y++) {
          this.world.setVoxel(x, y, z, BlockType.STONE);
        }

        // Dirt layers
        for (let y = Math.max(1, h - 3); y < h; y++) {
          this.world.setVoxel(x, y, z, BlockType.DIRT);
        }

        // Grass top
        this.world.setVoxel(x, h, z, BlockType.GRASS);
      }
    }
  }

  _generateWater() {
    for (const way of this.parsed.waterAreas) {
      const poly = way.coords.map((c) => this._project(c.lat, c.lon));
      this._fillPolygon(poly, (x, z) => {
        const groundH = this._getHeight(x, z);
        const waterH = Math.max(groundH, WATER_LEVEL);
        for (let y = groundH; y <= waterH; y++) {
          this.world.setVoxel(x, y, z, BlockType.WATER);
        }
      });
    }

    for (const way of this.parsed.waterways) {
      const points = way.coords.map((c) => this._project(c.lat, c.lon));
      const width = way.tags.waterway === 'river' ? 4 : 2;
      this._drawLineThick(points, width, (x, z) => {
        const groundH = this._getHeight(x, z);
        this.world.setVoxel(x, groundH, z, BlockType.WATER);
      });
    }
  }

  _generateRoads() {
    for (const way of this.parsed.highways) {
      const points = way.coords.map((c) => this._project(c.lat, c.lon));
      const hwType = way.tags.highway;

      let width, block;
      if (['motorway', 'trunk', 'primary'].includes(hwType)) {
        width = 5;
        block = BlockType.ROAD_ASPHALT;
      } else if (['secondary', 'tertiary'].includes(hwType)) {
        width = 4;
        block = BlockType.ROAD_ASPHALT;
      } else if (['residential', 'unclassified', 'service'].includes(hwType)) {
        width = 3;
        block = BlockType.ROAD_ASPHALT;
      } else if (['footway', 'path', 'cycleway', 'pedestrian'].includes(hwType)) {
        width = 2;
        block = BlockType.ROAD_PATH;
      } else if (hwType === 'steps') {
        width = 2;
        block = BlockType.STONE;
      } else {
        width = 2;
        block = BlockType.ROAD_ASPHALT;
      }

      width = Math.max(1, Math.round(width * this.scale));

      // Draw sidewalks for major roads
      if (['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential'].includes(hwType)) {
        this._drawLineThick(points, width + 2, (x, z) => {
          const h = this._getHeight(x, z);
          if (this.world.getVoxel(x, h + 1, z) === BlockType.AIR) {
            this.world.setVoxel(x, h, z, BlockType.SIDEWALK);
          }
        });
      }

      this._drawLineThick(points, width, (x, z) => {
        const h = this._getHeight(x, z);
        this.world.setVoxel(x, h, z, block);
      });
    }
  }

  _generateBuildings() {
    for (const way of this.parsed.buildings) {
      const poly = way.coords.map((c) => this._project(c.lat, c.lon));
      if (poly.length < 3) continue;

      const tags = way.tags;
      let height = this._parseBuildingHeight(tags);
      height = Math.max(3, Math.round(height * this.scale));

      const wallBlock = this._getBuildingWallBlock(tags);
      const roofBlock = BlockType.BUILDING_ROOF;

      // Find min ground level under building
      let minGround = MAX_HEIGHT;
      let maxGround = 0;
      this._fillPolygon(poly, (x, z) => {
        const h = this._getHeight(x, z);
        minGround = Math.min(minGround, h);
        maxGround = Math.max(maxGround, h);
      });
      if (minGround >= MAX_HEIGHT) continue;

      const baseY = minGround + 1;

      // Floor
      this._fillPolygon(poly, (x, z) => {
        this.world.setVoxel(x, baseY, z, BlockType.BUILDING_FLOOR);
      });

      // Walls (outline only)
      for (let y = baseY; y < baseY + height; y++) {
        this._drawPolygonOutline(poly, (x, z) => {
          const block = (y === baseY + 1 || y === baseY + height - 1)
            ? wallBlock
            : (y % 3 === 0 ? BlockType.GLASS : wallBlock);
          this.world.setVoxel(x, y, z, block);
        });
      }

      // Roof
      this._fillPolygon(poly, (x, z) => {
        this.world.setVoxel(x, baseY + height, z, roofBlock);
      });
    }
  }

  _parseBuildingHeight(tags) {
    if (tags.height) {
      const h = parseFloat(tags.height);
      if (!isNaN(h)) return h;
    }
    if (tags['building:levels']) {
      const levels = parseInt(tags['building:levels'], 10);
      if (!isNaN(levels)) return levels * 3;
    }
    const type = tags.building;
    if (['apartments', 'office', 'commercial', 'hotel'].includes(type)) return 15;
    if (['industrial', 'warehouse'].includes(type)) return 8;
    if (['church', 'cathedral', 'temple'].includes(type)) return 20;
    if (['house', 'detached', 'semidetached_house'].includes(type)) return 6;
    if (['garage', 'garages', 'shed'].includes(type)) return 3;
    return 9; // default ~3 stories
  }

  _getBuildingWallBlock(tags) {
    const material = tags['building:material'] || '';
    if (material.includes('brick')) return BlockType.BRICK;
    if (material.includes('concrete') || material.includes('plaster')) return BlockType.CONCRETE;
    if (material.includes('glass')) return BlockType.GLASS;
    if (material.includes('wood')) return BlockType.WOOD;
    if (material.includes('stone')) return BlockType.STONE;

    const type = tags.building;
    if (['industrial', 'warehouse'].includes(type)) return BlockType.CONCRETE;
    if (['office', 'commercial'].includes(type)) return BlockType.GLASS;
    return BlockType.BUILDING_WALL;
  }

  _generateVegetation() {
    // Trees from OSM nodes
    for (const tree of this.parsed.trees) {
      const { x, z } = this._project(tree.lat, tree.lon);
      const h = this._getHeight(x, z);
      if (h <= 0) continue;
      this._placeTree(x, h + 1, z);
    }

    // Forest / wood areas
    for (const way of this.parsed.natural) {
      const poly = way.coords.map((c) => this._project(c.lat, c.lon));
      const points = [];
      this._fillPolygon(poly, (x, z) => {
        points.push({ x, z });
      });

      // Place trees scattered in the area
      const density = 0.04;
      const rng = this._seededRandom(way.id || 0);
      for (const pt of points) {
        if (rng() < density) {
          const h = this._getHeight(pt.x, pt.z);
          this._placeTree(pt.x, h + 1, pt.z);
        }
      }
    }
  }

  _placeTree(x, baseY, z) {
    if (baseY <= 0 || baseY + 7 >= MAX_HEIGHT) return;

    // Check we're not inside a building
    if (this.world.getVoxel(x, baseY, z) !== BlockType.AIR &&
        this.world.getVoxel(x, baseY, z) !== BlockType.GRASS) return;

    const trunkHeight = 4 + Math.floor(Math.random() * 3);

    // Trunk
    for (let y = 0; y < trunkHeight; y++) {
      this.world.setVoxel(x, baseY + y, z, BlockType.WOOD);
    }

    // Leaves canopy
    const canopyBase = baseY + trunkHeight - 2;
    const canopyTop = baseY + trunkHeight + 2;
    for (let y = canopyBase; y <= canopyTop; y++) {
      const radius = y === canopyTop ? 1 : (y === canopyBase ? 2 : 2);
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dz * dz <= radius * radius + 1) {
            const bx = x + dx;
            const bz = z + dz;
            if (this.world.getVoxel(bx, y, bz) === BlockType.AIR) {
              this.world.setVoxel(bx, y, bz, BlockType.LEAVES);
            }
          }
        }
      }
    }
  }

  _generateLanduse() {
    for (const way of this.parsed.landuse) {
      const poly = way.coords.map((c) => this._project(c.lat, c.lon));
      const type = way.tags.landuse;

      let block;
      if (type === 'farmland' || type === 'farm') {
        block = BlockType.FARMLAND;
      } else if (type === 'residential') {
        block = null; // keep existing
      } else if (type === 'commercial' || type === 'retail') {
        block = BlockType.SIDEWALK;
      } else if (type === 'industrial') {
        block = BlockType.CONCRETE;
      } else if (type === 'grass' || type === 'meadow' || type === 'recreation_ground') {
        block = BlockType.PARK_GRASS;
      } else if (type === 'forest') {
        block = BlockType.PARK_GRASS;
      } else if (type === 'cemetery') {
        block = BlockType.PARK_GRASS;
      } else if (type === 'sand' || type === 'beach') {
        block = BlockType.SAND;
      } else {
        block = null;
      }

      if (block !== null) {
        this._fillPolygon(poly, (x, z) => {
          const h = this._getHeight(x, z);
          // Only change surface if it's still default grass
          if (this.world.getVoxel(x, h, z) === BlockType.GRASS) {
            this.world.setVoxel(x, h, z, block);
          }
        });
      }
    }
  }

  // Scan-line polygon fill
  _fillPolygon(polygon, callback) {
    if (polygon.length < 3) return;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of polygon) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }

    minX = Math.max(0, Math.floor(minX));
    maxX = Math.min(this.worldWidth - 1, Math.ceil(maxX));
    minZ = Math.max(0, Math.floor(minZ));
    maxZ = Math.min(this.worldDepth - 1, Math.ceil(maxZ));

    for (let z = minZ; z <= maxZ; z++) {
      const intersections = [];
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];
        if ((pi.z <= z && pj.z > z) || (pj.z <= z && pi.z > z)) {
          const t = (z - pi.z) / (pj.z - pi.z);
          intersections.push(pi.x + t * (pj.x - pi.x));
        }
      }
      intersections.sort((a, b) => a - b);

      for (let k = 0; k < intersections.length - 1; k += 2) {
        const xStart = Math.max(minX, Math.ceil(intersections[k]));
        const xEnd = Math.min(maxX, Math.floor(intersections[k + 1]));
        for (let x = xStart; x <= xEnd; x++) {
          callback(x, z);
        }
      }
    }
  }

  _drawPolygonOutline(polygon, callback) {
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      this._bresenham(a.x, a.z, b.x, b.z, callback);
    }
  }

  _drawLineThick(points, width, callback) {
    const half = Math.floor(width / 2);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      this._bresenham(a.x, a.z, b.x, b.z, (x, z) => {
        for (let dx = -half; dx <= half; dx++) {
          for (let dz = -half; dz <= half; dz++) {
            callback(x + dx, z + dz);
          }
        }
      });
    }
  }

  _bresenham(x0, z0, x1, z1, callback) {
    x0 = Math.round(x0);
    z0 = Math.round(z0);
    x1 = Math.round(x1);
    z1 = Math.round(z1);

    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;

    const maxSteps = dx + dz + 1;
    for (let step = 0; step < maxSteps; step++) {
      callback(x0, z0);
      if (x0 === x1 && z0 === z1) break;
      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
  }

  _seededRandom(seed) {
    let s = seed | 0;
    return () => {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  _yieldFrame() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}
