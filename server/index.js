import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const rooms = new RoomManager();

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('create-room', (data) => {
    const code = rooms.create(socket.id, data);
    socket.join(code);
    socket.roomCode = code;
    socket.emit('room-created', { code });
    console.log(`Room ${code} created by ${socket.id}`);
  });

  socket.on('join-room', ({ code, playerName }) => {
    const normalized = code?.toUpperCase();
    const room = rooms.get(normalized);
    if (!room) return socket.emit('mp-error', { message: 'Room not found' });
    if (rooms.playerCount(normalized) >= room.maxPlayers) {
      return socket.emit('mp-error', { message: 'Room is full' });
    }

    const color = rooms.addPlayer(normalized, socket.id, playerName || 'Player');
    socket.join(normalized);
    socket.roomCode = normalized;

    socket.emit('room-joined', {
      settings: room.settings,
      players: rooms.getPlayers(normalized, socket.id),
    });

    socket.to(normalized).emit('player-joined', {
      id: socket.id,
      name: playerName || 'Player',
      color,
    });

    console.log(`${playerName} joined room ${normalized}`);
  });

  socket.on('position', (data) => {
    if (!socket.roomCode) return;
    rooms.updatePosition(socket.roomCode, socket.id, data);
  });

  socket.on('list-public', () => {
    socket.emit('public-rooms', rooms.listPublic());
  });

  socket.on('leave-room', () => {
    leaveCurrentRoom(socket);
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);
    console.log(`Disconnected: ${socket.id}`);
  });
});

function leaveCurrentRoom(socket) {
  if (!socket.roomCode) return;
  const code = socket.roomCode;
  rooms.removePlayer(code, socket.id);
  socket.to(code).emit('player-left', { id: socket.id });
  socket.leave(code);
  socket.roomCode = null;

  if (rooms.playerCount(code) === 0) {
    rooms.scheduleCleanup(code);
  }
}

setInterval(() => {
  rooms.allRooms().forEach((_room, code) => {
    const positions = rooms.getPositions(code);
    if (Object.keys(positions).length > 0) {
      io.to(code).emit('positions', positions);
    }
  });
}, 66);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`Multiplayer server listening on port ${PORT}`));
