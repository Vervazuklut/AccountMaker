// emailService.js

require('dotenv').config();
const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendVerificationEmail(to, activationLink) {
  const msg = {
    to,
    from: 'digitalassetscorporationsllc@gmail.com',
    subject: 'Verify Your Account - Digital Assets',
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <table width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;">
          <tr>
            <td style="background-color:#f4f4f4;padding:20px;text-align:center;">
              <h1 style="color:#007bff;">Welcome to Digital Assets!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:20px;">
              <p>Thank you for signing up. Please copy this link and paste it in a new tab to verify your account and start enjoying our assets.</p>
              <p style="text-align:center;">
                <h2>${activationLink}</h2>
                <h3>This link will be valid for only 5 minutes.</h3>
              </p>
              <p>If you did not sign up for this account, please ignore this email.</p>
              <p style="margin-top:40px;">Best regards,<br/>The Digital Assets Team</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f4f4f4;padding:10px;text-align:center;font-size:12px;color:#777;">
              &copy; ${new Date().getFullYear()} Digital Assets Corporation LLC. All rights reserved.
            </td>
          </tr>
        </table>
      </div>
    `,
    trackingSettings: {
        clickTracking: {
        enable: false,
        },
    },
  };

  try {
    await sgMail.send(msg);
    //console.log('Verification email sent to', to);
    //console.log('Activation link is:', activationLink);
    //console.log('Generated email HTML:', msg.html);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error; // Re-throw the error to be caught in the calling function
  }
}

module.exports = { sendVerificationEmail };