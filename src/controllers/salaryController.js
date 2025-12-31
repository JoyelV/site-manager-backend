
// controllers/salaryController.js
const mongoose = require('mongoose');
const DailyAttendance = require('../models/Attendance');
const Advance = require('../models/Advance');
const Worker = require('../models/Worker');
const Wps = require('../models/Wps'); // Keeping for legacy/migration if needed, or we can drop usage. Keeping logical ref.
const SalaryReport = require('../models/SalaryReport');
const { calculateWorkerSalary } = require('../utils/salaryCalculator');

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

  // Advances - Look for ALL Pending, or those deducted in THIS key month (for re-runs)
  // We want to "simulate" the state before this month was finalized, so we include:
  // 1. Status = Pending (Date <= MonthEnd)
  // 2. Status = Deducted BUT DeductedInMonth = CurrentMonth (in case we are re-saving)
  const advances = await Advance.find({
    worker: workerId,
    dateGiven: { $lte: end },
    $or: [
      { status: 'pending' },
      { status: 'deducted', deductedInMonth: month }
    ]
  }).lean();

  // Worker Details
  const worker = await Worker.findById(workerId).lean();
  if (!worker) throw new Error('Worker not found');

  return {
    worker,
    daysInMonth,
    stats: calculateWorkerSalary(worker, att, advances, daysInMonth)
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
    // Fetch ALL pending advances up to end of month, OR deducted in this month
    const workers = await Worker.find({}).lean();
    const allAdvances = await Advance.find({
      dateGiven: { $lte: end },
      $or: [
        { status: 'pending' },
        { status: 'deducted', deductedInMonth: month }
      ]
    }).lean();

    const advancesByWorker = {};
    allAdvances.forEach(adv => {
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

      // Calculate using shared utility
      const stats = calculateWorkerSalary(worker, att, workerAdvances, daysInMonth);

      // Live Net Earnings
      const netEarnings = stats.totalPayable;
      const totalAdvance = stats.advanceDeduction;
      const deductedAdvances = stats.deductedAdvances;

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
        advancePending: +(stats.advancePending || 0).toFixed(2),
        deductedAdvances: deductedAdvances, // Pass detailed list

        // Hybrid Fields
        prevPending: +prevPending.toFixed(2),
        currentEarnings: +(stats.currentEarnings || 0).toFixed(2),
        netPayable: +netEarnings.toFixed(2), // Just alias for clarity, front end uses totalSalaryPayable mainly

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
      totalCurrentEarnings: +records.reduce((a, b) => a + (b.currentEarnings || 0), 0).toFixed(2),
      totalAbsentDeduction: +records.reduce((a, b) => a + b.absentDeduction, 0).toFixed(2),
      totalAdvanceDeduction: +records.reduce((a, b) => a + b.advance, 0).toFixed(2),
      totalAdvancePending: +records.reduce((a, b) => a + (b.advancePending || 0), 0).toFixed(2),
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

      // ADDED FIELD
      currentEarnings: stats.currentEarnings,

      absentDays: stats.absentDays,
      absentDeduction: stats.absentDeduction,
      advanceDeduction: stats.advanceDeduction,
      advancePending: stats.advancePending,
      deductedAdvances: stats.deductedAdvances,

      totalPayable: net,
      wpsAmount: wps,
      cashAmount: cash,
      pendingAmount: pending,

      status: 'saved'
    };

    // 3. Upsert Salary Report
    const doc = await SalaryReport.findOneAndUpdate(
      { worker: workerId, month },
      reportData,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 4. Update Advance Statuses
    // First, revert any previous deductions for this month (if re-saving)
    // We set ANY advance deducted in this month back to pending, then re-apply based on current calculation
    // This handles the case where salary DECREASED and fewer advances can be deducted.
    await Advance.updateMany(
      { worker: workerId, deductedInMonth: month },
      { $set: { status: 'pending', deductedInMonth: null, deductedAt: null } }
    );

    // Now mark the newly deducted ones as deducted
    if (stats.deductedAdvances && stats.deductedAdvances.length > 0) {
      const deductedIds = stats.deductedAdvances.map(a => a.advanceId);
      await Advance.updateMany(
        { _id: { $in: deductedIds } },
        {
          $set: {
            status: 'deducted',
            deductedInMonth: month,
            deductedAt: new Date()
          }
        }
      );
    }

    res.json({ msg: 'Salary Saved', report: doc });
  } catch (err) {
    console.error('saveSalary error', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { getSalaryReport, saveSalary };

