const Attendance = require('../models/Attendance');

const getSalaryReport = async (req, res) => {
  try {
    const { month } = req.query;
    if (!month) return res.status(400).json({ msg: 'Month required' });

    const attendanceRecords = await Attendance.find({ month })
      .populate('worker', 'firstName lastName employeeNo basicSalary allowance advance')
      .populate('site', 'siteRefName');

    const records = attendanceRecords.map((att) => {
      const w = att.worker;
      const totalSalary = w.basicSalary + w.allowance;
      const normalHours = 208;
      const totalHours = att.workingDays * 8 + att.otHours;
      const otHours = Math.max(0, totalHours - normalHours);
      const hourlyRate = totalSalary / normalHours;
      const otRate = hourlyRate * 1.5;
      const totalOtAed = otHours * otRate;
      const perDayAed = totalSalary / 30;
      const absentDeduction = att.absentDays * perDayAed;
      const totalPayable = totalSalary + totalOtAed - absentDeduction - (w.advance || 0);

      return {
        _id: att._id,
        givenName: w.firstName,
        surname: w.lastName,
        employNo: w.employeeNo,
        basicSalary: w.basicSalary,
        allowance: w.allowance,
        totalSalary,
        totalHrInclOT: totalHours,
        normalHrExcOT: normalHours,
        otHr: otHours,
        absent: att.absentDays,
        otAedPerHr: Number(otRate.toFixed(2)),
        totalOtAed: Number(totalOtAed.toFixed(2)),
        perDayAed: Number(perDayAed.toFixed(2)),
        absentDeduction: Number(absentDeduction.toFixed(2)),
        advance: w.advance || 0,
        totalSalaryPayable: Number(totalPayable.toFixed(2)),
      };
    });

    const totals = {
      totalBasicSalary: records.reduce((s, r) => s + r.basicSalary, 0),
      totalAllowance: records.reduce((s, r) => s + r.allowance, 0),
      totalSalary: records.reduce((s, r) => s + r.totalSalary, 0),
      totalOtAed: records.reduce((s, r) => s + r.totalOtAed, 0),
      totalAbsentDeduction: records.reduce((s, r) => s + r.absentDeduction, 0),
      totalPayroll: records.reduce((s, r) => s + r.totalSalaryPayable, 0),
    };

    res.json({ month, records, totals });
  } catch (err) {
    console.error('Salary Report Error:', err);
    res.status(500).json({ msg: 'Server error' });
  }
};

module.exports = { getSalaryReport };