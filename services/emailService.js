const transporter = require('../utils/mailer');
const ejs = require('ejs');
const path = require('path');

async function sendDailySummaryEmail(business, summary) {
  try {
    if (!business?.email) {
      console.warn('⚠️ No business email found, skipping sendDailySummaryEmail.');
      return;
    }

    if (!business.preferences?.sendDaySummaryReport) {
      console.log('ℹ️ sendDaySummaryReport disabled for this business.');
      return;
    }

    // Format date & time
    const now = new Date();
    const date = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const time = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // render EJS template with footer info
    const templatePath = path.join(__dirname, '../views/email/day-summary.ejs');
    const html = await ejs.renderFile(templatePath, {
      business,
      summary,
      footer: {
        company: 'AzzysPOS',
        email: 'azzyspos@gmail.com',
      },
    });

    // prepare mail
    const mailOptions = {
      from: `"${business.name}" <${process.env.EMAIL_USER}>`,
      to: business.email,
      subject: `Daily Register Summary - ${business.name} | ${date} at ${time}`,
      html,
      attachments: business.logo
        ? [
            {
              filename: business.logo,
              path: path.join(__dirname, `../images/${business.logo}`),
              cid: 'logo@inline',
            },
          ]
        : [],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Daily summary sent to ${business.email} (${info.messageId})`);
  } catch (err) {
    console.error('❌ Error sending daily summary email:', err.message);
  }
}

module.exports = { sendDailySummaryEmail };
