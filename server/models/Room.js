const mongoose = require('mongoose');

const DrawingCommandSchema = new mongoose.Schema({
  type: { type: String, enum: ['draw', 'erase', 'clear', 'image'], required: true },
  points: [{ x: Number, y: Number }],
  color: String,
  brushSize: Number,
  tool: String,
  timestamp: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

const RoomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  name: {
    type: String,
    default: 'Untitled Board',
    trim: true,
    maxlength: [100, 'Room name too long']
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  canvasSnapshot: {
    type: String,  // base64 PNG
    default: ''
  },
  drawingHistory: [DrawingCommandSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderName: String,
    text: String,
    timestamp: { type: Date, default: Date.now }
  }],
  files: [{
    name: String,
    type: String,
    url: String,
    uploadedBy: String,
    uploadedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Room', RoomSchema);