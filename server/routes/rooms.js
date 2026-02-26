const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const User = require('../models/User');
const auth = require('../middleware/auth');

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 9; i++) {
    if (i === 3 || i === 6) id += '-';
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// POST /api/rooms/create
router.post('/create', auth, async (req, res) => {
  try {
    let roomId;
    let exists = true;
    while (exists) {
      roomId = generateRoomId();
      exists = await Room.findOne({ roomId });
    }

    const room = new Room({
      roomId,
      name: req.body.name || 'Untitled Board',
      host: req.user._id,
      participants: [req.user._id]
    });
    await room.save();

    // Add to user's rooms list
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { rooms: room._id } });

    res.status(201).json({ roomId: room.roomId, name: room.name, _id: room._id });
  } catch (err) {
    console.error('Create room error:', err);
    res.status(500).json({ message: 'Failed to create room' });
  }
});

// GET /api/rooms/my-rooms
router.get('/my-rooms', auth, async (req, res) => {
  try {
    const rooms = await Room.find({
      $or: [{ host: req.user._id }, { participants: req.user._id }]
    })
      .select('roomId name updatedAt canvasSnapshot host')
      .populate('host', 'name')
      .sort({ updatedAt: -1 })
      .limit(10);
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch rooms' });
  }
});

// GET /api/rooms/:roomId — get room details & canvas
router.get('/:roomId', auth, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId.toUpperCase() })
      .populate('host', 'name email');
    if (!room) return res.status(404).json({ message: 'Room not found' });

    // Add user to participants if not already
    if (!room.participants.includes(req.user._id)) {
      room.participants.push(req.user._id);
      await room.save();
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { rooms: room._id } });
    }

    res.json({
      roomId: room.roomId,
      name: room.name,
      hostId: room.host._id,
      hostName: room.host.name,
      canvasSnapshot: room.canvasSnapshot,
      messages: room.messages.slice(-50),
      files: room.files
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch room' });
  }
});

// POST /api/rooms/:roomId/save
router.post('/:roomId/save', auth, async (req, res) => {
  try {
    const { canvasSnapshot } = req.body;
    const room = await Room.findOneAndUpdate(
      { roomId: req.params.roomId.toUpperCase() },
      { canvasSnapshot, updatedAt: Date.now() },
      { new: true }
    );
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.json({ message: 'Canvas saved successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to save canvas' });
  }
});

// POST /api/rooms/:roomId/message
router.post('/:roomId/message', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'Message cannot be empty' });

    const msg = {
      sender: req.user._id,
      senderName: req.user.name,
      text: text.trim(),
      timestamp: new Date()
    };

    await Room.findOneAndUpdate(
      { roomId: req.params.roomId.toUpperCase() },
      { $push: { messages: msg } }
    );
    res.json(msg);
  } catch (err) {
    res.status(500).json({ message: 'Failed to save message' });
  }
});

module.exports = router;