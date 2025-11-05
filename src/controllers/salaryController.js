const Attendance = require('../models/Attendance');
const Worker = require('../models/Worker');
const puppeteer = require('puppeteer-core'); 
const chromium = require('@sparticuz/chromium');
const ejs = require('ejs');
const path = require('path');

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
    res.status(500).json({ msg: 'Server error' });
  }
};

const generatePayslip = async (req, res) => {
  let browser;
  try {
    const { id } = req.params;
    const { month } = req.body;

    const attendance = await Attendance.findById(id)
      .populate('worker', 'firstName lastName employeeNo basicSalary allowance advance')
      .populate('site', 'siteRefName clientName');

    if (!attendance) {
      return res.status(404).json({ msg: 'Record not found' });
    }

    const w = attendance.worker;
    const totalSalary = w.basicSalary + w.allowance;
    const normalHours = 208;
    const totalHours = attendance.workingDays * 8 + attendance.otHours;
    const otHours = Math.max(0, totalHours - normalHours);
    const hourlyRate = totalSalary / normalHours;
    const otRate = hourlyRate * 1.5;
    const totalOtAed = otHours * otRate;
    const perDayAed = totalSalary / 30;
    const absentDeduction = attendance.absentDays * perDayAed;
    const totalPayable = totalSalary + totalOtAed - absentDeduction - (w.advance || 0);

    const payslipData = {
      worker: w,
      site: attendance.site,
      month,
      workingDays: attendance.workingDays,
      totalSalary,
      totalHrInclOT: totalHours,
      normalHrExcOT: normalHours,
      otHr: otHours,
      otAedPerHr: Number(otRate.toFixed(2)),
      totalOtAed: Number(totalOtAed.toFixed(2)),
      perDayAed: Number(perDayAed.toFixed(2)),
      absent: attendance.absentDays,
      absentDeduction: Number(absentDeduction.toFixed(2)),
      advance: w.advance || 0,
      totalSalaryPayable: Number(totalPayable.toFixed(2)),
      companyName: 'Site Manager Ltd',
      companyLogo: 'https://via.placeholder.com/150x50?text=LOGO',
      qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=Worker:${w.employeeNo}`,
      signature: 'https://via.placeholder.com/200x50?text=Digital+Signature',
    };

    const templatePath = path.join(__dirname, '../templates/payslip.ejs');
    const html = await ejs.renderFile(templatePath, payslipData);

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 20, bottom: 20, left: 20, right: 20 },
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${w.employeeNo}-${month}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF Error:', err);
    res.status(500).json({ msg: 'PDF generation failed', error: err.message });
  } finally {
    if (browser) await browser.close();
  }
};

module.exports = { getSalaryReport, generatePayslip };