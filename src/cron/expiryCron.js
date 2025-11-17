const cron = require('node-cron');
const Worker = require('../models/Worker');
const { sendExpiryReminderEmail } = require('../utils/emailService');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'varghesejoyel71@gmail.com';

cron.schedule('0 8 * * *', async () => {   
  // Runs every day at 8 AM
  console.log('Running document expiry checker...');

  const today = new Date();
  const upcomingThreshold = new Date();
  upcomingThreshold.setDate(today.getDate() + 30);

  const workers = await Worker.find();

  const expiredWorkers = [];

  for (const w of workers) {
    const expiredDocs = [];

    if (w.passportExpDate && new Date(w.passportExpDate) <= upcomingThreshold) {
      expiredDocs.push(`Passport Expiry: ${new Date(w.passportExpDate).toDateString()}`);
    }
    if (w.visaExpDate && new Date(w.visaExpDate) <= upcomingThreshold) {
      expiredDocs.push(`Visa Expiry: ${new Date(w.visaExpDate).toDateString()}`);
    }
    if (w.emiratesIdExpDate && new Date(w.emiratesIdExpDate) <= upcomingThreshold) {
      expiredDocs.push(`Emirates ID Expiry: ${new Date(w.emiratesIdExpDate).toDateString()}`);
    }

    if (expiredDocs.length > 0) {
      expiredWorkers.push({
        firstName: w.firstName,
        lastName: w.lastName,
        employeeNo: w.employeeNo,
        expiredDocs,
      });
    }
  }

  if (expiredWorkers.length > 0) {
    await sendExpiryReminderEmail(ADMIN_EMAIL, expiredWorkers);
    console.log("Expiry email sent.");
  } else {
    console.log("No expiring documents found.");
  }
});
