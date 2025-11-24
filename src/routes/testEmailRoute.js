const express = require('express');
const router = express.Router();
const { sendExpiryReminderEmail } = require("../utils/emailService");

router.get("/send-test", async (req, res) => {
  try {
    await sendExpiryReminderEmail(process.env.ADMIN_EMAIL, {
      expired: [],
      expiringSoon: []
    });
    res.json({ message: "Test email sent!" });
  } catch (err) {
    res.status(500).json({ error: "Failed to send test email" });
  }
});

module.exports = router;
