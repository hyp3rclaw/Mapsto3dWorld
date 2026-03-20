import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_MP_SERVER || 'http://localhost:3001';

let socket = null;
const handlers = {};

function ensureConnected() {
  if (socket?.connected) return Promise.resolve();
  return new Promise((resolve) => {
    if (!socket) {
      socket = io(SERVER_URL, { autoConnect: false });

      const events = [
        'room-created', 'room-joined', 'player-joined', 'player-left',
        'positions', 'public-rooms', 'mp-error',
      ];
      events.forEach((evt) => {
        socket.on(evt, (data) => handlers[evt]?.forEach((fn) => fn(data)));
      });

      socket.on('connect', () => resolve());
      socket.connect();
    } else {
      socket.once('connect', () => resolve());
      socket.connect();
    }
  });
}

export async function createRoom(settings, visibility, name, maxPlayers) {
  await ensureConnected();
  socket.emit('create-room', { settings, visibility, name, maxPlayers });
}

export async function joinRoom(code, playerName) {
  await ensureConnected();
  socket.emit('join-room', { code: code.toUpperCase(), playerName });
}

export function sendPosition(x, y, z, rotY) {
  if (!socket?.connected) return;
  socket.emit('position', { x, y, z, rotY });
}

export async function listPublicRooms() {
  await ensureConnected();
  socket.emit('list-public');
}

export function leaveRoom() {
  if (!socket?.connected) return;
  socket.emit('leave-room');
}

export function getSocketId() {
  return socket?.id;
}

export function disconnect() {
  if (socket) { socket.disconnect(); socket = null; }
}

export function on(event, handler) {
  if (!handlers[event]) handlers[event] = [];
  handlers[event].push(handler);
}

export function off(event, handler) {
  if (!handlers[event]) return;
  handlers[event] = handlers[event].filter((fn) => fn !== handler);
}
