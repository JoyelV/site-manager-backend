// routes/testEmailRoute.js
const express = require('express');
const { sendExpiryReminderEmail } = require('../utils/emailService');
const router = express.Router();

// Only allow this route in development or with a secret key
router.get('/test-email', async (req, res) => {
  try {
    // Fake data that mimics real expiry data
    const testData = {
      expired: [
        {
          name: "John Doe",
          employeeNo: "EMP001",
          docs: ["Visa (expires: 15/10/2025)", "Passport (expires: 20/09/2025)"],
          overdueDays: [38, 63],
        },
      ],
      expiringSoon: [
        {
          name: "Ahmed Khan",
          employeeNo: "EMP045",
          docs: ["Labor Card (expires: 28/12/2025)"],
          daysLeft: [6],
        },
        {
          name: "Rajesh Kumar",
          employeeNo: "EMP078",
          docs: ["Emirates ID (expires: 15/12/2025)"],
          daysLeft: [23],
        },
      ],
    };

    await sendExpiryReminderEmail(process.env.ADMIN_EMAIL, testData);

    res.json({ success: true, message: `Test email sent to ${process.env.ADMIN_EMAIL}` });
  } catch (err) {
    console.error("Test email failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;