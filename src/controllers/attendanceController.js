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
const getByDate = async (req, res) => {
    try {
      const { date } = req.params;
      let page = parseInt(req.query.page) || 1;
      let limit = parseInt(req.query.limit) || 50;

      if (page < 1) page = 1;
      if (limit < 1) limit = 50;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ msg: 'Invalid date format. Use YYYY-MM-DD' });
      }

      const isoDate = new Date(date + 'T00:00:00.000Z');
      if (isNaN(isoDate.getTime())) {
        return res.status(400).json({ msg: 'Invalid date' });
      }

      const skip = (page - 1) * limit;

      const [records, total] = await Promise.all([
        DailyAttendance.find({ date: isoDate })
          .populate('worker', 'firstName lastName employeeNo')
          .populate('site', 'siteRefName')
          .select('worker site status workingHours otHours')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),

        DailyAttendance.countDocuments({ date: isoDate })
      ]);

      res.json({
        records,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalRecords: total,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
          limit
        }
      });
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

const getMonthlyAttendance = async (req, res) => {
  try {
    const { year, month } = req.query;
    if (!year || !month) return res.status(400).json({ msg: "year & month required" });

    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const records = await DailyAttendance.find({
      date: { $gte: start, $lte: end }
    })
      .populate('worker', 'firstName lastName employeeNo')
      .populate('site', 'siteRefName')
      .select('date status workingHours otHours')
      .sort({ date: 1, "worker.employeeNo": 1 })
      .lean();

    res.json({ records, total: records.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

module.exports = { upsertDaily, getByDate, getRange, getMonthlyAttendance };
