const Site = require('../models/Site');

// GET /api/sites
const getSites = async (req, res) => {
  try {
    const sites = await Site.find().sort({ createdAt: -1 });
    res.json(sites);
  } catch (err) {
    console.error('Get Sites Error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// POST /api/sites
const createSite = async (req, res) => {
  try {
    const site = new Site(req.body);
    await site.save();
    res.status(201).json(site);
  } catch (err) {
    console.error('Create Site Error:', err);
    res.status(400).json({ msg: err.message });
  }
};

// PUT /api/sites/:id
const updateSite = async (req, res) => {
  try {
    const site = await Site.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!site) return res.status(404).json({ msg: 'Site not found' });
    res.json(site);
  } catch (err) {
    console.error('Update Site Error:', err);
    res.status(400).json({ msg: err.message });
  }
};

// DELETE /api/sites/:id
const deleteSite = async (req, res) => {
  try {
    const site = await Site.findByIdAndDelete(req.params.id);
    if (!site) return res.status(404).json({ msg: 'Site not found' });
    res.json({ msg: 'Site deleted' });
  } catch (err) {
    console.error('Delete Site Error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { getSites, createSite, updateSite, deleteSite };