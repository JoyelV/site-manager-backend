const DailyAttendance = require('../models/Attendance');

const getSalaryReport = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ msg: 'Month required' });

    const [year, mon] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));

    const agg = await DailyAttendance.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $addFields: {
          dayOfWeek: { $dayOfWeek: "$date" } // 1=Sunday ... 7=Saturday
        }
      },
      {
        $group: {
          _id: "$worker",  // ← FIXED: Group only by worker
          totalDays: { $sum: "$status" },           // 0.5 or 1
          totalHours: { $sum: "$workingHours" },
          normalOtHours: {
            $sum: { $cond: [{ $ne: ["$dayOfWeek", 1] }, "$otHours", 0] }
          },
          sundayOtHours: {
            $sum: { $cond: [{ $eq: ["$dayOfWeek", 1] }, "$otHours", 0] }
          }
        }
      },
      {
        $lookup: {
          from: "workers",
          localField: "_id",
          foreignField: "_id",
          as: "w"
        }
      },
      { $unwind: "$w" },
      {
        $project: {
          worker: "$w",
          totalDays: 1,
          totalHours: 1,
          normalOtHours: 1,
          sundayOtHours: 1
        }
      }
    ]);

    const normalHoursPerMonth = 208;
    const records = agg.map(a => {
      const w = a.worker;
      const totalSalary = w.basicSalary + w.allowance;
      const totalOtHours = a.normalOtHours + a.sundayOtHours;
      const totalHoursWorked = a.totalHours + totalOtHours;

      const hourly = totalSalary / normalHoursPerMonth;
      const normalOtAed = a.normalOtHours * hourly;
      const sundayOtAed = a.sundayOtHours * (hourly * 1.5);
      const totalOtAed = normalOtAed + sundayOtAed;

      const perDay = totalSalary / 30;
      const absentDays = 30 - a.totalDays;
      const absentDeduction = Math.max(0, absentDays) * perDay;

      const payable = totalSalary + totalOtAed - absentDeduction - (w.advance || 0);

      return {
        _id: w._id,
        givenName: w.firstName,
        surname: w.lastName,
        employNo: w.employeeNo,
        basicSalary: w.basicSalary,
        allowance: w.allowance,
        totalSalary,
        totalHrInclOT: Math.round(totalHoursWorked),
        normalHrExcOT: normalHoursPerMonth,
        normalOtHr: Math.round(a.normalOtHours),
        sundayOtHr: Math.round(a.sundayOtHours),
        absent: Math.max(0, absentDays),
        otAedPerHrNormal: +hourly.toFixed(2),
        otAedPerHrSunday: +(hourly * 1.5).toFixed(2),
        totalOtAed: +totalOtAed.toFixed(2),
        perDayAed: +perDay.toFixed(2),
        absentDeduction: +absentDeduction.toFixed(2),
        advance: w.advance || 0,
        totalSalaryPayable: +payable.toFixed(2)
      };
    });

    const totals = {
      totalBasicSalary: records.reduce((s, r) => s + r.basicSalary, 0),
      totalAllowance: records.reduce((s, r) => s + r.allowance, 0),
      totalSalary: records.reduce((s, r) => s + r.totalSalary, 0),
      totalOtAed: records.reduce((s, r) => s + r.totalOtAed, 0),
      totalAbsentDeduction: records.reduce((s, r) => s + r.absentDeduction, 0),
      totalPayroll: records.reduce((s, r) => s + r.totalSalaryPayable, 0)
    };

    res.json({ month, records, totals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error" });
  }
};

module.exports = { getSalaryReport };
