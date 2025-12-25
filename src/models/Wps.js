const mongoose = require('mongoose');

const WpsSchema = new mongoose.Schema({
  worker: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', required: true },
  month: { type: String, required: true }, // format YYYY-MM
  amount: { type: Number, default: 0 },
}, { timestamps: true });

WpsSchema.index({ worker: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('Wps', WpsSchema);
