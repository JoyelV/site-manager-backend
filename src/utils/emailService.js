// utils/emailService.js (PRODUCTION VERSION)
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465, // secure true only for 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  pool: true,          // Enables connection pooling
  maxConnections: 5,
  maxMessages: 100,
});

/**
 * Generic reusable email sender
 */
const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const info = await transporter.sendMail({
      from: `"Your App" <${process.env.SMTP_USER}>`,
      to,
      subject,
      text,
      html,
    });

    // Optional: store logs in DB instead of console
    console.log(`Email sent → ${info.messageId}`);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Email send failed:", error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Specific function for expiry reminder email
 */
const sendExpiryReminderEmail = async (toEmail, data) => {
  const subject = "Your Subscription is About to Expire";
  const text = `Hello,

Your subscription will expire on ${data.expiryDate}.
Please renew to continue services.`;

  const html = `
    <h2>Hello,</h2>
    <p>Your subscription will expire on <strong>${data.expiryDate}</strong>.</p>
    <p>Please renew to continue using our services.</p>
  `;

  return sendEmail({ to: toEmail, subject, text, html });
};

module.exports = { sendEmail, sendExpiryReminderEmail };
