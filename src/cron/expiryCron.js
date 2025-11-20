const cron = require("node-cron");
const Worker = require("../models/Worker");
const { sendExpiryReminderEmail } = require("../utils/emailService");

const EXPIRY_THRESHOLD_DAYS = 30;

const checkExpiry = (expDate) => {
  if (!expDate) return false;
  const today = new Date();
  const expiry = new Date(expDate);
  const diff = (expiry - today) / (1000 * 60 * 60 * 24);
  return diff <= EXPIRY_THRESHOLD_DAYS;
};

const startExpiryCron = () => {
  const task = cron.schedule("40 23 * * *", async () => {
    console.log("📅 Running nightly expiry check at 23:30 IST / 18:30 UTC...");

    try {
      const workers = await Worker.find();
      const expiredWorkers = [];

      workers.forEach((w) => {
        const expiredDocs = [];

        if (checkExpiry(w.visaExpDate)) expiredDocs.push(`Visa expiring on ${w.visaExpDate}`);
        if (checkExpiry(w.laborCardExpDate)) expiredDocs.push(`Labor Card expiring on ${w.laborCardExpDate}`);
        if (checkExpiry(w.emiratesIdExpDate)) expiredDocs.push(`Emirates ID expiring on ${w.emiratesIdExpDate}`);
        if (checkExpiry(w.passportExpDate)) expiredDocs.push(`Passport expiring on ${w.passportExpDate}`);

        if (expiredDocs.length > 0) {
          expiredWorkers.push({
            firstName: w.firstName,
            lastName: w.lastName,
            employeeNo: w.employeeNo,
            expiredDocs,
          });
        }
      });

      if (expiredWorkers.length > 0) {
        await sendExpiryReminderEmail(process.env.ADMIN_EMAIL, expiredWorkers);
        console.log("📧 Expiry reminder email sent.");
      } else {
        console.log("✅ No expired documents today.");
      }
    } catch (err) {
      console.error("Cron Job Error:", err);
    }
  }, { scheduled: true });

  console.log("⏱️ Expiry cron scheduled: Runs every day at 23:40 IST (40 23 * * * UTC)");
  return task;
};

module.exports = { startExpiryCron };
