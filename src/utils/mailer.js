const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const sendOtpEmail = async (email, otp) => {
  await transporter.sendMail({
    from: `"Site Manager" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your Password Reset OTP',
    html: `
      <h2>Reset Your Password</h2>
      <p>Your OTP is: <strong style="font-size: 1.5em;">${otp}</strong></p>
      <p>It expires in <strong>5 minutes</strong>.</p>
    `,
  });
};

module.exports = { sendOtpEmail };