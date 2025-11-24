const cron = require("node-cron");
const Worker = require("../models/Worker");
const { sendExpiryReminderEmail } = require("../utils/emailService").default;

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
  // Runs every day at 11:00 PM IST
  cron.schedule("0 23 * * *", async () => {
    console.log("Running document expiry check at 11 PM IST...");
  console.log("[CRON TRIGGERED]", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));

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

      const expired = [];
      const expiringSoon = [];

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
          const formattedDate = formatDate(date);
          const docInfo = `${name} (expires: ${formattedDate})`;

          if (days < 0) {
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

      if (expired.length > 0 || expiringSoon.length > 0) {
        await sendExpiryReminderEmail(process.env.ADMIN_EMAIL, {
          expired,
          expiringSoon,
        });
        console.log(`Expiry alert email sent`);
      } else {
        console.log("No document expiries detected today.");
      }
    } catch (err) {
      console.error("Expiry Cron Job Failed:", err);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata", // ✔ India standard time
  });

  console.log("Document expiry cron scheduled daily at 11:00 PM IST");
};


module.exports = { startExpiryCron };