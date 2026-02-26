const Room = require('../models/Room');

// In-memory store: roomId -> { users: Map<socketId, userObj>, canvas: [] }
const activeRooms = {};

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // ─── JOIN ROOM ───────────────────────────────────────────
    socket.on('join-room', async ({ roomId, user }) => {
      try {
        socket.join(roomId);

        if (!activeRooms[roomId]) {
          activeRooms[roomId] = { users: new Map() };
        }

        const userEntry = {
          socketId: socket.id,
          userId: user.id,
          name: user.name,
          role: user.role || 'Participant',
          color: `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`
        };
        activeRooms[roomId].users.set(socket.id, userEntry);

        // Send current canvas snapshot from DB to the new user
        const room = await Room.findOne({ roomId });
        if (room?.canvasSnapshot) {
          socket.emit('canvas-restore', { canvasSnapshot: room.canvasSnapshot });
        }

        // Broadcast updated user list to all in room
        const userList = Array.from(activeRooms[roomId].users.values());
        io.to(roomId).emit('users-update', userList);

        // Notify others
        socket.to(roomId).emit('user-joined', {
          user: userEntry,
          message: `${user.name} joined the room`
        });

        socket.data.roomId = roomId;
        socket.data.user = userEntry;

        console.log(`👤 ${user.name} joined room ${roomId}`);
      } catch (err) {
        console.error('join-room error:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ─── DRAW ────────────────────────────────────────────────
    // Broadcast drawing stroke to all OTHER users in the room
    socket.on('draw', ({ roomId, drawData }) => {
      socket.to(roomId).emit('draw', drawData);
    });

    // ─── CURSOR MOVE ─────────────────────────────────────────
    socket.on('cursor-move', ({ roomId, x, y }) => {
      const user = socket.data.user;
      if (user) {
        socket.to(roomId).emit('cursor-move', { socketId: socket.id, name: user.name, color: user.color, x, y });
      }
    });

    // ─── UNDO / REDO (broadcast canvas state) ────────────────
    socket.on('history-change', ({ roomId, canvasSnapshot }) => {
      socket.to(roomId).emit('history-change', { canvasSnapshot });
    });

    // ─── CLEAR BOARD ─────────────────────────────────────────
    socket.on('clear-board', async ({ roomId }) => {
      // Save cleared state to DB
      await Room.findOneAndUpdate({ roomId }, { canvasSnapshot: '' });
      io.to(roomId).emit('clear-board');
    });

    // ─── CHAT MESSAGE ─────────────────────────────────────────
    socket.on('chat-message', async ({ roomId, text }) => {
      try {
        const user = socket.data.user;
        if (!user || !text?.trim()) return;

        const message = {
          id: Date.now().toString(),
          senderId: user.userId,
          senderName: user.name,
          senderColor: user.color,
          text: text.trim(),
          timestamp: new Date().toISOString()
        };

        // Persist to DB
        await Room.findOneAndUpdate(
          { roomId },
          { $push: { messages: { sender: user.userId, senderName: user.name, text: text.trim() } } }
        );

        // Broadcast to all in room (including sender)
        io.to(roomId).emit('chat-message', message);
      } catch (err) {
        console.error('chat-message error:', err);
      }
    });

    // ─── FILE SHARE ──────────────────────────────────────────
    socket.on('file-share', ({ roomId, fileData }) => {
      // Broadcast file to all others
      socket.to(roomId).emit('file-share', fileData);
    });

    // ─── CANVAS SAVE ─────────────────────────────────────────
    socket.on('save-canvas', async ({ roomId, canvasSnapshot }) => {
      try {
        await Room.findOneAndUpdate({ roomId }, { canvasSnapshot, updatedAt: Date.now() });
        socket.emit('canvas-saved', { message: 'Canvas saved to cloud!' });
      } catch (err) {
        socket.emit('error', { message: 'Failed to save canvas' });
      }
    });

    // ─── SCREEN SHARE SIGNALING (WebRTC) ─────────────────────
    socket.on('screen-share-start', ({ roomId }) => {
      const user = socket.data.user;
      socket.to(roomId).emit('screen-share-start', { from: socket.id, name: user?.name });
    });

    socket.on('screen-share-offer', ({ roomId, to, offer }) => {
      io.to(to).emit('screen-share-offer', { from: socket.id, offer });
    });

    socket.on('screen-share-answer', ({ to, answer }) => {
      io.to(to).emit('screen-share-answer', { from: socket.id, answer });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    socket.on('screen-share-stop', ({ roomId }) => {
      socket.to(roomId).emit('screen-share-stop', { from: socket.id });
    });

    // ─── DISCONNECT ──────────────────────────────────────────
    socket.on('disconnect', () => {
      const roomId = socket.data.roomId;
      const user = socket.data.user;

      if (roomId && activeRooms[roomId]) {
        activeRooms[roomId].users.delete(socket.id);

        const userList = Array.from(activeRooms[roomId].users.values());
        io.to(roomId).emit('users-update', userList);

        if (user) {
          socket.to(roomId).emit('user-left', {
            user,
            message: `${user.name} left the room`
          });
        }

        // Cleanup empty rooms from memory
        if (activeRooms[roomId].users.size === 0) {
          delete activeRooms[roomId];
        }
      }

      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });
};