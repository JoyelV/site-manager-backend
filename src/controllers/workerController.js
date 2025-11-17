const Worker = require('../models/Worker');

const getWorkers = async (req, res) => {
  try {
    const workers = await Worker.find().sort({ createdAt: -1 });
    res.json(workers);
  } catch (err) {
    console.error('Get Workers Error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// POST /api/workers
const createWorker = async (req, res) => {
  try {
    const worker = new Worker(req.body);
    await worker.save();
    res.status(201).json(worker);
  } catch (err) {
    console.error('Create Worker Error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ msg: 'Employee number already exists' });
    }
    res.status(400).json({ msg: err.message });
  }
};

// PUT /api/workers/:id
const updateWorker = async (req, res) => {
  try {
    const worker = await Worker.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!worker) return res.status(404).json({ msg: 'Worker not found' });
    res.json(worker);
  } catch (err) {
    console.error('Update Worker Error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ msg: 'Employee number already exists' });
    }
    res.status(400).json({ msg: err.message });
  }
};

// DELETE /api/workers/:id
const deleteWorker = async (req, res) => {
  try {
    const worker = await Worker.findByIdAndDelete(req.params.id);
    if (!worker) return res.status(404).json({ msg: 'Worker not found' });
    res.json({ msg: 'Worker deleted' });
  } catch (err) {
    console.error('Delete Worker Error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { getWorkers, createWorker, updateWorker, deleteWorker };