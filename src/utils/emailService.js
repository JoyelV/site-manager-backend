import { TransactionalEmailsApi, TransactionalEmailsApiApiKeys, SendSmtpEmail } from "@getbrevo/brevo";

const apiInstance = new TransactionalEmailsApi();

apiInstance.setApiKey(
  TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

// Send Expiry Reminder Email
const sendExpiryReminderEmail = async (toEmail, data) => {
  const { expired, expiringSoon } = data;

  // Build HTML email
  let htmlContent = `
    <h2>Document Expiry Reminder</h2>
  `;

  if (expired.length > 0) {
    htmlContent += `
      <h3>❌ Already Expired Documents</h3>
      <ul>
        ${expired
          .map(
            (w) => `
          <li><strong>${w.name}</strong> (Employee No: ${w.employeeNo})<br>
          Documents: ${w.docs.join(", ")}
          </li>`
          )
          .join("")}
      </ul>
    `;
  }

  if (expiringSoon.length > 0) {
    htmlContent += `
      <h3>⚠️ Expiring Soon (within 30 days)</h3>
      <ul>
        ${expiringSoon
          .map(
            (w) => `
          <li><strong>${w.name}</strong> (Employee No: ${w.employeeNo})<br>
          Documents: ${w.docs.join(", ")}
          </li>`
          )
          .join("")}
      </ul>
    `;
  }

  const sendSmtpEmail = new SendSmtpEmail();
  sendSmtpEmail.subject = "Document Expiry Notification";
  sendSmtpEmail.htmlContent = htmlContent;
  sendSmtpEmail.sender = { name: "Site Manager", email: process.env.ADMIN_EMAIL };
  sendSmtpEmail.to = [{ email: toEmail }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log("Brevo Email Sent Successfully");
  } catch (error) {
    console.error("Brevo Email Sending Error:", error);
  }
};

export default { sendExpiryReminderEmail };
