const DailyAttendance = require('../models/Attendance');

const getSalaryReport = async (req, res) => {
  try {
    const { month } = req.query; // e.g. "2025-09"
    if (!month) return res.status(400).json({ msg: 'Month required' });

    const [year, mon] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));

    // Aggregate attendance with weekday and Sunday overtime separation
    const agg = await DailyAttendance.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $addFields: {
          dayOfWeek: { $dayOfWeek: "$date" } // 1=Sunday, 2=Monday, ...7=Saturday
        }
      },
      {
        $group: {
          _id: { worker: "$worker", site: "$site" },
          totalDays: { $sum: "$status" },         // 0.5 or 1
          totalHours: { $sum: "$workingHours" },
          normalOtHours: {
            $sum: {
              $cond: [{ $ne: ["$dayOfWeek", 1] }, "$otHours", 0]
            }
          },
          sundayOtHours: {
            $sum: {
              $cond: [{ $eq: ["$dayOfWeek", 1] }, "$otHours", 0]
            }
          }
        }
      },
      {
        $lookup: {
          from: "workers",
          localField: "_id.worker",
          foreignField: "_id",
          as: "w"
        }
      },
      { $unwind: "$w" },
      {
        $lookup: {
          from: "sites",
          localField: "_id.site",
          foreignField: "_id",
          as: "s"
        }
      },
      { $unwind: "$s" },
      {
        $project: {
          _id: 0,
          worker: "$w",
          site: "$s",
          totalDays: 1,
          totalHours: 1,
          normalOtHours: 1,
          sundayOtHours: 1
        }
      }
    ]);

    const normalHoursPerMonth = 208; // 26 days × 8 hours

    const records = agg.map(a => {
      const w = a.worker;
      const totalSalary = w.basicSalary + w.allowance;
      const totalHours = a.totalHours + a.normalOtHours + a.sundayOtHours;

      // Hourly pay
      const hourly = totalSalary / normalHoursPerMonth;

      // OT rates
      const normalOtAed = a.normalOtHours * (hourly * 1);   // 1x rate
      const sundayOtAed = a.sundayOtHours * (hourly * 1.5); // 1.5x rate
      const totalOtAed = normalOtAed + sundayOtAed;

      const perDay = totalSalary / 30;
      const absentDays = 30 - a.totalDays;
      const absentDeduction = absentDays * perDay;

      const payable =
        totalSalary + totalOtAed - absentDeduction - (w.advance || 0);

      return {
        _id: `${a.worker._id}-${a.site._id}`,
        givenName: w.firstName,
        surname: w.lastName,
        employNo: w.employeeNo,
        basicSalary: w.basicSalary,
        allowance: w.allowance,
        totalSalary,
        totalHrInclOT: Math.round(totalHours),
        normalHrExcOT: normalHoursPerMonth,
        normalOtHr: Math.round(a.normalOtHours),
        sundayOtHr: Math.round(a.sundayOtHours),
        absent: absentDays,
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
