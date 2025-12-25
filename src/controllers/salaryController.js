// controllers/salaryController.js
const DailyAttendance = require('../models/Attendance');
const Advance = require('../models/Advance');
const Worker = require('../models/Worker');
const Wps = require('../models/Wps');

const getSalaryReport = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ msg: 'Valid month required (YYYY-MM)' });
    }

    const [year, mon] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
    const daysInMonth = end.getUTCDate(); // e.g., 31 for December

    // 1. Attendance aggregation — CORRECTLY count present days
    const attendanceAgg = await DailyAttendance.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: "$worker",
          presentDays: {
            $sum: {
              $cond: [{ $in: ["$status", ["present", 1]] }, 1, 0] // handles both string and number
            }
          },
          totalHours: { $sum: "$workingHours" },
          normalOtHours: {
            $sum: {
              $cond: [
                { $ne: [{ $dayOfWeek: "$date" }, 1] },
                "$otHours",
                0
              ]
            }
          },
          sundayOtHours: {
            $sum: {
              $cond: [{ $eq: [{ $dayOfWeek: "$date" }, 1] }, "$otHours", 0]
            }
          }
        }
      }
    ]);

    // 2. All workers
    const workers = await Worker.find({}).lean();

    // 3. Fetch ALL advances for this month (pending OR already deducted here)
    const monthAdvances = await Advance.find({
      dateGiven: { $gte: start, $lte: end },
      $or: [
        { status: 'pending' },
        { status: 'deducted', deductedInMonth: month }
      ]
    }).lean();

    // Group by worker
    const advancesByWorker = {};
    const pendingToMark = [];

    monthAdvances.forEach(adv => {
      const wid = adv.worker.toString();
      if (!advancesByWorker[wid]) advancesByWorker[wid] = [];
      advancesByWorker[wid].push(adv);

      if (adv.status === 'pending') {
        pendingToMark.push(adv._id);
      }
    });

    // Mark pending advances as deducted (only once)
    if (pendingToMark.length > 0) {
      await Advance.updateMany(
        { _id: { $in: pendingToMark } },
        {
          $set: {
            status: 'deducted',
            deductedAt: new Date(),
            deductedInMonth: month
          }
        }
      );
    }

    const normalHoursPerMonth = 208; // 26 days × 8 hours

    // Fetch WPS records for this month
    const wpsRecords = await Wps.find({ month }).lean();
    const wpsByWorker = {};
    wpsRecords.forEach(w => { wpsByWorker[w.worker.toString()] = w.amount; });

    const records = workers.map(worker => {
      const att = attendanceAgg.find(a => a._id.toString() === worker._id.toString()) || {
        presentDays: 0,
        totalHours: 0,
        normalOtHours: 0,
        sundayOtHours: 0
      };

      const totalSalary = worker.basicSalary + worker.allowance;
      const hourlyRate = totalSalary / normalHoursPerMonth;

      const otNormal = att.normalOtHours * hourlyRate;
      const otSunday = att.sundayOtHours * (hourlyRate * 1.5);
      const totalOtAed = otNormal + otSunday;

      const perDayRate = totalSalary / daysInMonth;
      const absentDays = daysInMonth - att.presentDays;
      const absentDeduction = Math.max(0, absentDays) * perDayRate;

      const workerAdvances = advancesByWorker[worker._id.toString()] || [];
      const totalAdvance = workerAdvances.reduce((sum, a) => sum + a.amount, 0);

      const wpsAmount = Number(wpsByWorker[worker._id.toString()] ?? 0);
      const netPayable = Math.max(0, totalSalary + totalOtAed - absentDeduction - totalAdvance + wpsAmount);

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
        advance: +totalAdvance,
        wps: +wpsAmount,
        totalSalaryPayable: +netPayable.toFixed(2)
      };
    });

    const totals = {
      totalBasicSalary: +records.reduce((a, b) => a + b.basicSalary, 0).toFixed(2),
      totalAllowance: +records.reduce((a, b) => a + b.allowance, 0).toFixed(2),
      totalSalary: +records.reduce((a, b) => a + b.totalSalary, 0).toFixed(2),
      totalOtAed: +records.reduce((a, b) => a + b.totalOtAed, 0).toFixed(2),
      totalAbsentDeduction: +records.reduce((a, b) => a + b.absentDeduction, 0).toFixed(2),
      totalAdvanceDeduction: +records.reduce((a, b) => a + b.advance, 0).toFixed(2),
      totalWps: +records.reduce((a, b) => a + (b.wps || 0), 0).toFixed(2),
      totalPayroll: +records.reduce((a, b) => a + b.totalSalaryPayable, 0).toFixed(2)
    };

    res.json({ month, records, totals });
  } catch (err) {
    console.error("Salary Report Error:", err);
    res.status(500).json({ msg: "Server error" });
  }
};

const setWps = async (req, res) => {
  try {
    const { month, workerId, amount } = req.body;
    if (!month || !/^[0-9]{4}-[0-9]{2}$/.test(month)) {
      return res.status(400).json({ msg: 'Valid month required (YYYY-MM)' });
    }

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (month !== currentMonth) {
      return res.status(400).json({ msg: 'WPS can only be set for the current month' });
    }

    if (!workerId) return res.status(400).json({ msg: 'workerId required' });

    const worker = await Worker.findById(workerId);
    if (!worker) return res.status(404).json({ msg: 'Worker not found' });

    const amt = Number(amount) || 0;

    const doc = await Wps.findOneAndUpdate(
      { worker: workerId, month },
      { amount: amt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ msg: 'WPS saved', wps: doc });
  } catch (err) {
    console.error('setWps error', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { getSalaryReport, setWps };
