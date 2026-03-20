const COLORS = [
  '#e94560', '#45e9a5', '#4590e9', '#e9a545', '#a545e9',
  '#45e9e9', '#e945a5', '#a5e945', '#e96045', '#45e960',
];

function generateCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this._cleanupTimers = new Map();
  }

  create(hostId, { settings, visibility, name, maxPlayers }) {
    let code;
    do { code = generateCode(); } while (this.rooms.has(code));

    this.rooms.set(code, {
      hostId,
      settings,
      visibility: visibility || 'private',
      name: name || 'Unnamed World',
      maxPlayers: Math.min(Math.max(maxPlayers || 8, 2), 10),
      players: new Map(),
      createdAt: Date.now(),
    });

    this.addPlayer(code, hostId, 'Host');
    return code;
  }

  get(code) {
    return this.rooms.get(code?.toUpperCase());
  }

  addPlayer(code, socketId, name) {
    const room = this.rooms.get(code);
    if (!room) return null;
    const colorIndex = room.players.size % COLORS.length;
    const color = COLORS[colorIndex];
    room.players.set(socketId, {
      name, color, x: 0, y: 0, z: 0, rotY: 0, lastUpdate: Date.now(),
    });

    if (this._cleanupTimers.has(code)) {
      clearTimeout(this._cleanupTimers.get(code));
      this._cleanupTimers.delete(code);
    }

    return color;
  }

  removePlayer(code, socketId) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.players.delete(socketId);

    if (room.hostId === socketId && room.players.size > 0) {
      room.hostId = room.players.keys().next().value;
    }
  }

  updatePosition(code, socketId, { x, y, z, rotY }) {
    const room = this.rooms.get(code);
    if (!room) return;
    const player = room.players.get(socketId);
    if (!player) return;
    player.x = x;
    player.y = y;
    player.z = z;
    player.rotY = rotY;
    player.lastUpdate = Date.now();
  }

  getPlayers(code, excludeId) {
    const room = this.rooms.get(code);
    if (!room) return {};
    const result = {};
    room.players.forEach((p, id) => {
      if (id !== excludeId) result[id] = { name: p.name, color: p.color };
    });
    return result;
  }

  getPositions(code) {
    const room = this.rooms.get(code);
    if (!room) return {};
    const result = {};
    room.players.forEach((p, id) => {
      result[id] = { x: p.x, y: p.y, z: p.z, rotY: p.rotY, name: p.name, color: p.color };
    });
    return result;
  }

  playerCount(code) {
    const room = this.rooms.get(code);
    return room ? room.players.size : 0;
  }

  listPublic() {
    const list = [];
    this.rooms.forEach((room, code) => {
      if (room.visibility === 'public') {
        list.push({
          code,
          name: room.name,
          playerCount: room.players.size,
          maxPlayers: room.maxPlayers,
        });
      }
    });
    return list;
  }

  allRooms() {
    return this.rooms;
  }

  scheduleCleanup(code) {
    if (this._cleanupTimers.has(code)) return;
    this._cleanupTimers.set(code, setTimeout(() => {
      if (this.playerCount(code) === 0) this.rooms.delete(code);
      this._cleanupTimers.delete(code);
    }, 5 * 60 * 1000));
  }
}
