// Block type IDs
export const BlockType = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WATER: 4,
  SAND: 5,
  ROAD_ASPHALT: 6,
  ROAD_PATH: 7,
  BUILDING_WALL: 8,
  BUILDING_ROOF: 9,
  BUILDING_FLOOR: 10,
  WOOD: 11,
  LEAVES: 12,
  CONCRETE: 13,
  BRICK: 14,
  GLASS: 15,
  FARMLAND: 16,
  PARK_GRASS: 17,
  SIDEWALK: 18,
  BEDROCK: 19,
  RESIDENTIAL: 20,
  COMMERCIAL: 21,
  INDUSTRIAL: 22,
};

// Block colors (RGB 0-1)
export const BlockColors = {
  [BlockType.AIR]:          null,
  [BlockType.GRASS]:        [0.34, 0.63, 0.17],
  [BlockType.DIRT]:         [0.55, 0.37, 0.24],
  [BlockType.STONE]:        [0.50, 0.50, 0.50],
  [BlockType.WATER]:        [0.15, 0.35, 0.75],
  [BlockType.SAND]:         [0.85, 0.80, 0.55],
  [BlockType.ROAD_ASPHALT]: [0.25, 0.25, 0.27],
  [BlockType.ROAD_PATH]:    [0.60, 0.55, 0.45],
  [BlockType.BUILDING_WALL]:[0.82, 0.78, 0.72],
  [BlockType.BUILDING_ROOF]:[0.45, 0.20, 0.18],
  [BlockType.BUILDING_FLOOR]:[0.65, 0.60, 0.55],
  [BlockType.WOOD]:         [0.45, 0.30, 0.15],
  [BlockType.LEAVES]:       [0.20, 0.55, 0.10],
  [BlockType.CONCRETE]:     [0.72, 0.72, 0.72],
  [BlockType.BRICK]:        [0.65, 0.30, 0.22],
  [BlockType.GLASS]:        [0.60, 0.78, 0.88],
  [BlockType.FARMLAND]:     [0.50, 0.42, 0.15],
  [BlockType.PARK_GRASS]:   [0.28, 0.68, 0.22],
  [BlockType.SIDEWALK]:     [0.75, 0.73, 0.70],
  [BlockType.BEDROCK]:      [0.20, 0.20, 0.20],
  [BlockType.RESIDENTIAL]:  [0.45, 0.55, 0.35],
  [BlockType.COMMERCIAL]:   [0.55, 0.55, 0.55],
  [BlockType.INDUSTRIAL]:   [0.50, 0.45, 0.40],
};

// Top face colors (slightly different for visual variety)
export const BlockTopColors = {
  [BlockType.GRASS]:        [0.40, 0.72, 0.20],
  [BlockType.DIRT]:         [0.55, 0.37, 0.24],
  [BlockType.PARK_GRASS]:   [0.32, 0.75, 0.25],
  [BlockType.FARMLAND]:     [0.48, 0.40, 0.12],
};

export function isTransparent(blockType) {
  return blockType === BlockType.AIR ||
         blockType === BlockType.WATER ||
         blockType === BlockType.GLASS;
}

export function isLiquid(blockType) {
  return blockType === BlockType.WATER;
}
