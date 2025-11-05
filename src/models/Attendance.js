const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Worker',
    required: true,
  },
  site: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Site',
    required: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  workingDays: {
    type: Number,
    required: true,
    min: 0,
  },
  otHours: {
    type: Number,
    default: 0,
    min: 0,
  },
  absentDays: {
    type: Number,
    default: 0,
    min: 0,
  },
  month: {
    type: String, // Format: "2025-09"
    required: true,
  },
}, { timestamps: true });

// Index for fast lookup by month + worker
attendanceSchema.index({ month: 1, worker: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);