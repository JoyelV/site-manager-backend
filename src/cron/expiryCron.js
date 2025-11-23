const cron = require("node-cron");
const Worker = require("../models/Worker");
const { sendExpiryReminderEmail } = require("../utils/emailService");

const EXPIRY_THRESHOLD_DAYS = 30; // Alert if expiring in 30 days or less
const ALREADY_EXPIRED_DAYS = 0;   // Already past expiry

const getDaysDifference = (date) => {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(date);
  exp.setHours(0, 0, 0, 0);
  return Math.floor((exp - today) / (1000 * 60 * 60 * 24));
};

const formatDate = (date) => {
  return date ? new Date(date).toLocaleDateString("en-GB") : "N/A";
};

const startExpiryCron = () => {
  // Runs every day at 23:40 IST (which is 18:10 UTC) → "10 18 * * *"
  // Or keep your current: "40 23 * * *" if server is in IST timezone
  cron.schedule("40 23 * * *", async () => {
    console.log("Running document expiry check...");

    try {
      const workers = await Worker.find({
        $or: [
          { visaExpDate: { $ne: null } },
          { laborCardExpDate: { $ne: null } },
          { emiratesIdExpDate: { $ne: null } },
          { passportExpDate: { $ne: null } },
        ],
      }).select(
        "firstName lastName employeeNo visaExpDate laborCardExpDate emiratesIdExpDate passportExpDate"
      );

      const expired = [];      // Already expired
      const expiringSoon = []; // Will expire in ≤30 days

      workers.forEach((worker) => {
        const docs = [
          { name: "Visa", date: worker.visaExpDate },
          { name: "Labor Card", date: worker.laborCardExpDate },
          { name: "Emirates ID", date: worker.emiratesIdExpDate },
          { name: "Passport", date: worker.passportExpDate },
        ];

        docs.forEach(({ name, date }) => {
          if (!date) return;

          const days = getDaysDifference(date);
          if (days === null) return;

          const formattedDate = formatDate(date);
          const docInfo = `${name} (expires: ${formattedDate})`;

          if (days < 0) {
            // Already expired
            let entry = expired.find(e => e.employeeNo === worker.employeeNo);
            if (!entry) {
              entry = {
                name: `${worker.firstName} ${worker.lastName}`,
                employeeNo: worker.employeeNo,
                docs: [],
                overdueDays: [],
              };
              expired.push(entry);
            }
            entry.docs.push(docInfo);
            entry.overdueDays.push(Math.abs(days));
          } else if (days <= EXPIRY_THRESHOLD_DAYS) {
            // Expiring soon
            let entry = expiringSoon.find(e => e.employeeNo === worker.employeeNo);
            if (!entry) {
              entry = {
                name: `${worker.firstName} ${worker.lastName}`,
                employeeNo: worker.employeeNo,
                docs: [],
                daysLeft: [],
              };
              expiringSoon.push(entry);
            }
            entry.docs.push(docInfo);
            entry.daysLeft.push(days);
          }
        });
      });

      // Send email if there's anything to report
      if (expired.length > 0 || expiringSoon.length > 0) {
        await sendExpiryReminderEmail(process.env.ADMIN_EMAIL, {
          expired,
          expiringSoon,
        });
        console.log(`Expiry alert email sent: ${expired.length} expired, ${expiringSoon.length} expiring soon`);
      } else {
        console.log("No document expiries detected today.");
      }
    } catch (err) {
      console.error("Expiry Cron Job Failed:", err);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Dubai", // Recommended: explicit timezone (UAE)
  });

  console.log("Document expiry cron job scheduled daily at 23:40 GST (Dubai time)");
};

module.exports = { startExpiryCron };