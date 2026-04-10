'use strict';

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const ses = new SESClient({ region: 'us-east-1' });
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const FROM_EMAIL  = process.env.FROM_EMAIL;

exports.handler = async (event) => {
  for (const record of event.Records) {
    const message = JSON.parse(record.Sns.Message);
    const { notificationType } = message;

    if (notificationType === 'Bounce') {
      const { bounceType, bounceSubType, bouncedRecipients, timestamp } = message.bounce;
      const recipients = bouncedRecipients.map(r => r.emailAddress).join(', ');
      await sendAdminAlert(
        `SES ${bounceType} Bounce — ${recipients}`,
        `<p><b>Type:</b> ${bounceType} / ${bounceSubType}</p>
         <p><b>Recipients:</b> ${recipients}</p>
         <p><b>Time:</b> ${timestamp}</p>
         <p><b>From:</b> ${message.mail.source}</p>
         <pre style="background:#f4f4f4;padding:12px">${JSON.stringify(message.mail, null, 2)}</pre>`,
      );
    } else if (notificationType === 'Complaint') {
      const { complainedRecipients, complaintFeedbackType, timestamp } = message.complaint;
      const recipients = complainedRecipients.map(r => r.emailAddress).join(', ');
      await sendAdminAlert(
        `SES Spam Complaint — ${recipients}`,
        `<p><b>Feedback type:</b> ${complaintFeedbackType || 'unknown'}</p>
         <p><b>Recipients:</b> ${recipients}</p>
         <p><b>Time:</b> ${timestamp}</p>
         <p><b>From:</b> ${message.mail.source}</p>
         <pre style="background:#f4f4f4;padding:12px">${JSON.stringify(message.mail, null, 2)}</pre>`,
      );
    }
  }
};

async function sendAdminAlert(subject, htmlBody) {
  await ses.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [ADMIN_EMAIL] },
    Message: {
      Subject: { Data: `[MaidLink Alert] ${subject}` },
      Body: { Html: { Data: htmlBody } },
    },
  }));
}
