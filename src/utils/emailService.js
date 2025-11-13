const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const sendExpiryReminderEmail = async (toEmail, workers) => {
  if (workers.length === 0) return;

  const expiredList = workers.map(w => `
    <li>
      <strong>${w.firstName} ${w.lastName}</strong> (${w.employeeNo})<br/>
      ${w.expiredDocs.join(', ')}
    </li>
  `).join('');

  const html = `
    <h2>⚠️ Expiry Reminder Alert</h2>
    <p>The following workers have expired or soon-to-expire documents:</p>
    <ul>${expiredList}</ul>
    <p>Please take necessary action immediately.</p>
  `;

  await transporter.sendMail({
    from: `"Site Manager" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: 'Worker Document Expiry Alert',
    html,
  });
};

module.exports = { sendExpiryReminderEmail };
