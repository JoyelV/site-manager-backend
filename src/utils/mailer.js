const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.BREVO_HOST,
  port: Number(process.env.BREVO_PORT),
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS,
  },
});

const sendOtpEmail = async (email, otp) => {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Your Password Reset OTP",
      html: `
        <h2>Reset Your Password</h2>
        <p>Your OTP is: <strong style="font-size: 1.5em;">${otp}</strong></p>
        <p>It expires in <strong>5 minutes</strong>.</p>
      `,
    });

    console.log("OTP Email sent →", email);
  } catch (error) {
    console.error("Brevo Email Error:", error.message);
  }
};

module.exports = { sendOtpEmail };
