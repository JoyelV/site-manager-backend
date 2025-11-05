const Attendance = require('../models/Attendance');

const getAttendance = async (req, res) => {
  try {
    const { month } = req.query;
    const filter = month ? { month } : {};
    
    const attendance = await Attendance.find(filter)
      .populate('worker', 'firstName lastName employeeNo')
      .populate('site', 'siteRefName')
      .sort({ date: -1 });

    res.json(attendance);
  } catch (err) {
    console.error('Get Attendance Error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

const createAttendance = async (req, res) => {
  try {
    const { worker, site, date, workingDays, otHours, absentDays, month } = req.body;

    // Optional: Prevent duplicate for same worker + site + month
    const existing = await Attendance.findOne({ worker, site, month });
    if (existing) {
      return res.status(400).json({ msg: 'Attendance already recorded for this worker and site in this month' });
    }

    const attendance = new Attendance({
      worker, site, date, workingDays, otHours, absentDays, month
    });
    await attendance.save();

    const populated = await Attendance.findById(attendance._id)
      .populate('worker', 'firstName lastName employeeNo')
      .populate('site', 'siteRefName');

    res.status(201).json(populated);
  } catch (err) {
    console.error('Create Attendance Error:', err);
    res.status(400).json({ msg: err.message });
  }
};

const getAttendanceByDate = async (req, res) => {
  try {
    const { date } = req.params; // YYYY-MM-DD

    const attendance = await Attendance.find({ date })
      .populate('worker', 'firstName lastName employeeNo')
      .select('worker present otHours');

    res.json(attendance);
  } catch (err) {
    console.error('Error fetching attendance by date:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

// GET /api/attendance/range?start=YYYY-MM-DD&end=YYYY-MM-DD
const getAttendanceRange = async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ msg: 'start and end dates are required' });
    }

    const attendance = await Attendance.find({
      date: { $gte: start, $lte: end },
    })
      .populate('worker', 'firstName lastName employeeNo')
      .select('worker present date');

    res.json(attendance);
  } catch (err) {
    console.error('Error fetching attendance range:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { getAttendance, createAttendance, getAttendanceByDate, getAttendanceRange };