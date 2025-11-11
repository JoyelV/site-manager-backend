const DailyAttendance = require('../models/Attendance');

/* ---------- CREATE / UPDATE DAILY RECORD ---------- */
const upsertDaily = async (req, res) => {
  try {
    const { worker, site, date, status, workingHours, otHours } = req.body;
    const isoDate = new Date(date);
    isoDate.setUTCHours(0, 0, 0, 0);

    const record = await DailyAttendance.findOneAndUpdate(
      { worker, site, date: isoDate },
      { status, workingHours, otHours },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .populate('worker', 'firstName lastName employeeNo')
      .populate('site', 'siteRefName');

    res.status(record.isNew ? 201 : 200).json(record);
  } catch (err) {
    console.error(err);
    res.status(400).json({ msg: err.message });
  }
};

/* ---------- GET BY DATE ---------- */
// controllers/attendanceController.js
const getByDate = async (req, res) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ msg: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const iso = new Date(date + 'T00:00:00.000Z');
    if (isNaN(iso.getTime())) {
      return res.status(400).json({ msg: 'Invalid date' });
    }

    const records = await DailyAttendance.find({ date: iso })
      .populate('worker', 'firstName lastName employeeNo')
      .populate('site', 'siteRefName')
      .select('worker site status workingHours otHours');

    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

/* ---------- GET RANGE ---------- */
const getRange = async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ msg: 'start & end required' });

    const records = await DailyAttendance.find({
      date: { $gte: new Date(start), $lte: new Date(end) },
    })
      .populate('worker', 'firstName lastName employeeNo')
      .select('worker date status workingHours otHours');

    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { upsertDaily, getByDate, getRange };