
// controllers/salaryController.js
const mongoose = require('mongoose');
const DailyAttendance = require('../models/Attendance');
const Advance = require('../models/Advance');
const Worker = require('../models/Worker');
const Wps = require('../models/Wps'); // Keeping for legacy/migration if needed, or we can drop usage. Keeping logical ref.
const SalaryReport = require('../models/SalaryReport');

const getPreviousMonth = (currentMonth) => {
  const [year, mon] = currentMonth.split('-').map(Number);
  const date = new Date(year, mon - 2, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y} -${m} `;
};

// Helper for single worker live calc (used in save)
const getWorkerSalaryStats = async (workerId, month) => {
  const [year, mon] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
  const daysInMonth = end.getUTCDate();

  // Attendance
  const attendanceAgg = await DailyAttendance.aggregate([
    { $match: { worker: new mongoose.Types.ObjectId(workerId), date: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: "$worker",
        presentDays: { $sum: { $cond: [{ $in: ["$status", ["present", 1]] }, 1, 0] } },
        totalHours: { $sum: "$workingHours" },
        normalOtHours: { $sum: { $cond: [{ $ne: [{ $dayOfWeek: "$date" }, 1] }, "$otHours", 0] } },
        sundayOtHours: { $sum: { $cond: [{ $eq: [{ $dayOfWeek: "$date" }, 1] }, "$otHours", 0] } }
      }
    }
  ]);

  const att = attendanceAgg[0] || { presentDays: 0, totalHours: 0, normalOtHours: 0, sundayOtHours: 0 };

  // Advances
  const advances = await Advance.find({
    worker: workerId,
    dateGiven: { $gte: start, $lte: end },
    $or: [{ status: 'pending' }, { status: 'deducted', deductedInMonth: month }]
  }).lean();
  const totalAdvance = advances.reduce((sum, a) => sum + a.amount, 0);

  // Worker Details
  const worker = await Worker.findById(workerId).lean();
  if (!worker) throw new Error('Worker not found');

  const normalHoursPerMonth = 208;
  const totalSalary = worker.basicSalary + worker.allowance;
  const hourlyRate = totalSalary / normalHoursPerMonth;
  const perDayRate = totalSalary / daysInMonth;

  const otNormal = att.normalOtHours * hourlyRate;
  const otSunday = att.sundayOtHours * (hourlyRate * 1.5);
  const totalOtAed = otNormal + otSunday;

  const absentDays = Math.max(0, daysInMonth - att.presentDays);
  const absentDeduction = absentDays * perDayRate;

  const currentMonthEarnings = Math.max(0, totalSalary + totalOtAed - absentDeduction - totalAdvance);

  return {
    worker,
    daysInMonth,
    stats: {
      basicSalary: worker.basicSalary,
      allowance: worker.allowance,
      totalSalary,
      totalHours: att.totalHours,
      normalOtHours: att.normalOtHours,
      sundayOtHours: att.sundayOtHours,
      otAedPerHrNormal: hourlyRate,
      otAedPerHrSunday: hourlyRate * 1.5,
      totalOtAed,
      absentDays,
      absentDeduction,
      advanceDeduction: totalAdvance,
      totalPayable: currentMonthEarnings
    }
  };
};

const getSalaryReport = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ msg: 'Valid month required (YYYY-MM)' });
    }

    const [year, mon] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
    const daysInMonth = end.getUTCDate();

    // 1. Always Calculate Live Attendance Stats
    const attendanceAgg = await DailyAttendance.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$worker",
          presentDays: { $sum: { $cond: [{ $in: ["$status", ["present", 1]] }, 1, 0] } },
          totalHours: { $sum: "$workingHours" },
          normalOtHours: { $sum: { $cond: [{ $ne: [{ $dayOfWeek: "$date" }, 1] }, "$otHours", 0] } },
          sundayOtHours: { $sum: { $cond: [{ $eq: [{ $dayOfWeek: "$date" }, 1] }, "$otHours", 0] } }
        }
      }
    ]);

    // 2. Fetch Payments (Saved Report for CURRENT month)
    const currentReports = await SalaryReport.find({ month }).lean();
    const savedPayments = {}; // Map workerId -> { wps, cash }
    currentReports.forEach(r => {
      savedPayments[r.worker.toString()] = { wps: r.wpsAmount || 0, cash: r.cashAmount || 0 };
    });

    // 3. Fetch Previous Pending (Saved Report for PREVIOUS month)
    const prevMonthStr = getPreviousMonth(month);
    const prevReports = await SalaryReport.find({ month: prevMonthStr }).lean();
    const prevPendingMap = {};
    prevReports.forEach(r => {
      prevPendingMap[r.worker.toString()] = r.pendingAmount || 0;
    });

    // 4. Advances & Workers
    const workers = await Worker.find({}).lean();
    const monthAdvances = await Advance.find({
      dateGiven: { $gte: start, $lte: end },
      $or: [{ status: 'pending' }, { status: 'deducted', deductedInMonth: month }]
    }).lean();

    const advancesByWorker = {};
    monthAdvances.forEach(adv => {
      const wid = adv.worker.toString();
      if (!advancesByWorker[wid]) advancesByWorker[wid] = [];
      advancesByWorker[wid].push(adv);
    });

    // 5. Build Records
    const normalHoursPerMonth = 208;

    const records = workers.map(worker => {
      const wid = worker._id.toString();

      // Live Attendance
      const att = attendanceAgg.find(a => a._id.toString() === wid) || {
        presentDays: 0, totalHours: 0, normalOtHours: 0, sundayOtHours: 0
      };

      const totalSalary = worker.basicSalary + worker.allowance;
      const hourlyRate = totalSalary / normalHoursPerMonth;
      const perDayRate = totalSalary / daysInMonth;

      const otNormal = att.normalOtHours * hourlyRate;
      const otSunday = att.sundayOtHours * (hourlyRate * 1.5);
      const totalOtAed = otNormal + otSunday;

      const absentDays = Math.max(0, daysInMonth - att.presentDays);
      const absentDeduction = absentDays * perDayRate;

      const workerAdvances = advancesByWorker[wid] || [];
      const totalAdvance = workerAdvances.reduce((sum, a) => sum + a.amount, 0);

      // Live Net Earnings
      const netEarnings = Math.max(0, totalSalary + totalOtAed - absentDeduction - totalAdvance);

      // Merge with Persisted Data
      const prevPending = prevPendingMap[wid] || 0;
      const savedPay = savedPayments[wid] || { wps: 0, cash: 0 };

      const totalDue = netEarnings + prevPending;
      const totalPaid = savedPay.wps + savedPay.cash;
      const pending = Math.max(0, totalDue - totalPaid);

      return {
        _id: worker._id,
        givenName: worker.firstName,
        surname: worker.lastName,
        employNo: worker.employeeNo,

        basicSalary: +worker.basicSalary.toFixed(2),
        allowance: +worker.allowance.toFixed(2),
        totalSalary: +totalSalary.toFixed(2),

        totalHrInclOT: Math.round(att.totalHours + att.normalOtHours + att.sundayOtHours),
        normalHrExcOT: +att.totalHours.toFixed(2),
        normalOtHr: Math.round(att.normalOtHours),
        sundayOtHr: Math.round(att.sundayOtHours),

        absent: Math.max(0, absentDays),
        otAedPerHrNormal: +hourlyRate.toFixed(2),
        otAedPerHrSunday: +(hourlyRate * 1.5).toFixed(2),
        totalOtAed: +totalOtAed.toFixed(2),
        perDayAed: +perDayRate.toFixed(2),

        absentDeduction: +absentDeduction.toFixed(2),
        advance: +totalAdvance.toFixed(2),

        // Hybrid Fields
        prevPending: +prevPending.toFixed(2),
        currentEarnings: +netEarnings.toFixed(2),

        // Payments from Saved Report
        wps: savedPay.wps,
        cash: savedPay.cash,

        totalSalaryPayable: +totalDue.toFixed(2),
        pending: +pending.toFixed(2),

        isSaved: !!savedPayments[wid] // Just a flag if needed
      };
    });

    const totals = {
      totalBasicSalary: +records.reduce((a, b) => a + b.basicSalary, 0).toFixed(2),
      totalAllowance: +records.reduce((a, b) => a + b.allowance, 0).toFixed(2),
      totalSalary: +records.reduce((a, b) => a + b.totalSalary, 0).toFixed(2),
      totalOtAed: +records.reduce((a, b) => a + b.totalOtAed, 0).toFixed(2),
      totalAbsentDeduction: +records.reduce((a, b) => a + b.absentDeduction, 0).toFixed(2),
      totalAdvanceDeduction: +records.reduce((a, b) => a + b.advance, 0).toFixed(2),
      totalPrevPending: +records.reduce((a, b) => a + b.prevPending, 0).toFixed(2),
      totalWps: +records.reduce((a, b) => a + b.wps, 0).toFixed(2),
      totalCash: +records.reduce((a, b) => a + b.cash, 0).toFixed(2),
      totalPending: +records.reduce((a, b) => a + b.pending, 0).toFixed(2),
      totalPayroll: +records.reduce((a, b) => a + b.totalSalaryPayable, 0).toFixed(2)
    };

    res.json({ month, records, totals });
  } catch (err) {
    console.error("Salary Report Error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

const saveSalary = async (req, res) => {
  try {
    const { month, workerId, wpsAmount, cashAmount } = req.body;

    if (!month || !workerId) return res.status(400).json({ msg: 'Missing required fields' });

    // 1. Calculate Live Stats for this worker (Source of Truth)
    const { stats } = await getWorkerSalaryStats(workerId, month);

    // 2. Prepare Data
    const wps = Number(wpsAmount) || 0;
    const cash = Number(cashAmount) || 0;

    // Fetch Prev Pending for this worker
    const prevMonthStr = getPreviousMonth(month);
    const prevReport = await SalaryReport.findOne({ worker: workerId, month: prevMonthStr }).lean();
    const prevPending = prevReport ? prevReport.pendingAmount : 0;

    const net = stats.totalPayable;
    const totalDue = net + prevPending;
    const pending = Math.max(0, totalDue - (wps + cash));

    const reportData = {
      worker: workerId,
      month,

      basicSalary: stats.basicSalary,
      allowance: stats.allowance,
      totalSalary: stats.totalSalary,

      totalHours: stats.totalHours,
      normalOtHours: stats.normalOtHours,
      sundayOtHours: stats.sundayOtHours,

      otAedPerHrNormal: stats.otAedPerHrNormal,
      otAedPerHrSunday: stats.otAedPerHrSunday,
      totalOtAed: stats.totalOtAed,

      absentDays: stats.absentDays,
      absentDeduction: stats.absentDeduction,
      advanceDeduction: stats.advanceDeduction,

      totalPayable: net,
      wpsAmount: wps,
      cashAmount: cash,
      pendingAmount: pending,

      status: 'saved'
    };

    // 3. Upsert
    const doc = await SalaryReport.findOneAndUpdate(
      { worker: workerId, month },
      reportData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ msg: 'Salary Saved', report: doc });
  } catch (err) {
    console.error('saveSalary error', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { getSalaryReport, saveSalary };

