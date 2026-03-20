import { BlockType, BlockColors, BlockTopColors, isTransparent } from './blocks.js';
import * as THREE from 'three';

const CELL_SIZE = 32;

export class VoxelWorld {
  constructor(width, height, depth) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.cellSize = CELL_SIZE;
    this.cellSliceSize = CELL_SIZE * CELL_SIZE;
    this.cells = new Map();

    this.ncx = Math.ceil(width / CELL_SIZE);
    this.ncy = Math.ceil(height / CELL_SIZE);
    this.ncz = Math.ceil(depth / CELL_SIZE);
  }

  _cellKey(cx, cy, cz) {
    return `${cx},${cy},${cz}`;
  }

  _getCell(x, y, z) {
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    return this.cells.get(this._cellKey(cx, cy, cz));
  }

  _getOrCreateCell(x, y, z) {
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    const cz = Math.floor(z / CELL_SIZE);
    const key = this._cellKey(cx, cy, cz);
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Uint8Array(CELL_SIZE * CELL_SIZE * CELL_SIZE);
      this.cells.set(key, cell);
    }
    return cell;
  }

  _voxelOffset(x, y, z) {
    const lx = ((x % CELL_SIZE) + CELL_SIZE) % CELL_SIZE;
    const ly = ((y % CELL_SIZE) + CELL_SIZE) % CELL_SIZE;
    const lz = ((z % CELL_SIZE) + CELL_SIZE) % CELL_SIZE;
    return ly * this.cellSliceSize + lz * CELL_SIZE + lx;
  }

  setVoxel(x, y, z, type) {
    if (x < 0 || y < 0 || z < 0 || x >= this.width || y >= this.height || z >= this.depth) return;
    const cell = this._getOrCreateCell(x, y, z);
    cell[this._voxelOffset(x, y, z)] = type;
  }

  getVoxel(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.width || y >= this.height || z >= this.depth) {
      return BlockType.AIR;
    }
    const cell = this._getCell(x, y, z);
    if (!cell) return BlockType.AIR;
    return cell[this._voxelOffset(x, y, z)];
  }

  generateMeshes(scene) {
    const meshes = [];

    for (let cx = 0; cx < this.ncx; cx++) {
      for (let cy = 0; cy < this.ncy; cy++) {
        for (let cz = 0; cz < this.ncz; cz++) {
          const key = this._cellKey(cx, cy, cz);
          if (!this.cells.has(key)) continue;

          const geo = this._generateCellGeometry(cx, cy, cz);
          if (!geo) continue;

          const { positions, normals, colors, indices } = geo;

          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
          geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
          geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
          geometry.setIndex(indices);
          geometry.computeBoundingSphere();

          const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            side: THREE.FrontSide,
          });

          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(0, 0, 0);
          scene.add(mesh);
          meshes.push(mesh);
        }
      }
    }

    // Generate water as a separate transparent layer
    const waterGeo = this._generateWaterGeometry();
    if (waterGeo) {
      const { positions, normals, indices } = waterGeo;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
      geometry.setIndex(indices);

      const material = new THREE.MeshLambertMaterial({
        color: new THREE.Color(0.15, 0.35, 0.75),
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      meshes.push(mesh);
    }

    return meshes;
  }

  _generateCellGeometry(cx, cy, cz) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];

    const startX = cx * CELL_SIZE;
    const startY = cy * CELL_SIZE;
    const startZ = cz * CELL_SIZE;

    const endX = Math.min(startX + CELL_SIZE, this.width);
    const endY = Math.min(startY + CELL_SIZE, this.height);
    const endZ = Math.min(startZ + CELL_SIZE, this.depth);

    for (let y = startY; y < endY; y++) {
      for (let z = startZ; z < endZ; z++) {
        for (let x = startX; x < endX; x++) {
          const voxel = this.getVoxel(x, y, z);
          if (voxel === BlockType.AIR || voxel === BlockType.WATER) continue;

          const color = BlockColors[voxel] || [1, 0, 1];

          for (const face of FACES) {
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];
            const neighbor = this.getVoxel(nx, ny, nz);

            if (isTransparent(neighbor)) {
              const ndx = positions.length / 3;
              const faceColor = (face.isTop && BlockTopColors[voxel]) ? BlockTopColors[voxel] : color;

              for (const corner of face.corners) {
                positions.push(corner[0] + x, corner[1] + y, corner[2] + z);
                normals.push(...face.dir);
                colors.push(...faceColor);
              }
              indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
            }
          }
        }
      }
    }

    if (positions.length === 0) return null;
    return { positions, normals, colors, indices };
  }

  _generateWaterGeometry() {
    const positions = [];
    const normals = [];
    const indices = [];

    for (let z = 0; z < this.depth; z++) {
      for (let x = 0; x < this.width; x++) {
        for (let y = 0; y < this.height; y++) {
          if (this.getVoxel(x, y, z) !== BlockType.WATER) continue;

          // Only generate top face of water (for surface rendering)
          const above = this.getVoxel(x, y + 1, z);
          if (above === BlockType.AIR) {
            const ndx = positions.length / 3;
            const wy = y + 0.85; // water surface slightly below block top
            positions.push(x, wy, z + 1);
            positions.push(x + 1, wy, z + 1);
            positions.push(x, wy, z);
            positions.push(x + 1, wy, z);
            normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
            indices.push(ndx, ndx + 1, ndx + 2, ndx + 2, ndx + 1, ndx + 3);
          }
        }
      }
    }

    if (positions.length === 0) return null;
    return { positions, normals, indices };
  }
}

const FACES = [
  {
    dir: [-1, 0, 0],
    corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]],
  },
  {
    dir: [1, 0, 0],
    corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]],
  },
  {
    dir: [0, -1, 0],
    corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]],
  },
  {
    dir: [0, 1, 0],
    isTop: true,
    corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]],
  },
  {
    dir: [0, 0, -1],
    corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]],
  },
  {
    dir: [0, 0, 1],
    corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]],
  },
];
