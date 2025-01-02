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
              <p>Thank you for signing up. Please copy this link (since the button may not work as google marks messages from new companies as spams), unreport this account as spam and paste it in a new tab/click the button to verify your email and start enjoying our assets.</p>
              <p style="text-align:center;">
                <h2>${activationLink}</h2>
                <h3>This link will be valid for only 5 minutes.</h3>
                <a href="${activationLink}" style="display:inline-block;padding:15px 25px;margin:10px 0;background-color:#28a745;color:#fff;text-decoration:none;border-radius:5px;font-size:16px;">Verify Email</a>
              </p>
              <p>If you did not verify, please ignore this email.</p>
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
function generateEmailHTML(ChoiceOfUser, downloadFile) {
  // Decide which text to display based on user choice
  let content = '';

  if (ChoiceOfUser === 'I have digital assets to contribute') {
    content = `
      <p>
        Thank you for your interest in contributing your digital assets! <br/>
        We have received your file and will review it soon.
      </p>
      ${
        downloadFile
          ? `
            <p>
              Here’s a link to your uploaded file (for our reference):
              <br/>
              <a 
                href="${downloadFile}" 
                style="color: #3f51b5; text-decoration: underline;"
                target="_blank"
                >
                View/Download File
              </a>
            </p>
          `
          : ''
      }
      <p>
        We will be in touch with next steps. <br/>
        If you have any questions, feel free to reply to this email (though it may be an unmonitored inbox—please see instructions below).
      </p>
    `;
  } else if (ChoiceOfUser === 'I would like to take on commission work') {
    content = `
      <p>
        Thank you for your interest in taking on commission work! <br/>
        We appreciate your enthusiasm and will contact you with upcoming projects that match your area of expertise.
      </p>
      <p>
        Stay tuned for further instructions—our team will reach out soon.
      </p>
    `;
  } else {
    // Fallback if somehow ChoiceOfUser is something else
    content = `
      <p>
        We received your request but could not determine your specific choice. 
        Please let us know which services you’re interested in.
      </p>
    `;
  }

  // Build a complete HTML document with inline styles
  const emailHtml = `
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>Digital Assets Email</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          background: #f5f5f5;
          margin: 0;
          padding: 40px 0;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 6px;
          padding: 20px;
          box-shadow: 0 0 8px rgba(0,0,0,0.08);
        }
        h1, h2, p {
          color: #333;
        }
        h1 {
          margin-top: 0;
          color: #3f51b5;
        }
        a {
          color: #3f51b5;
          text-decoration: none;
        }
        .footer {
          margin-top: 20px;
          font-size: 0.85rem;
          color: #999;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Digital Assets — ${ChoiceOfUser}</h1>
        ${content}

        <div class="footer">
          <hr />
          <p>
            <strong>Note:</strong> This is an automated message. 
            Please do not reply directly to this email address.
          </p>
        </div>
      </div>
    </body>
  </html>
  `;

  return emailHtml;
}

// 2. Main function to send the email
async function sendAssetsEmail(to, ChoiceOfUser, downloadFile) {
  // Generate the HTML content based on which option the user selected
  const emailHTML = generateEmailHTML(ChoiceOfUser, downloadFile);

  const msg = {
    to,
    from: 'digitalassetscorporationsllc@gmail.com', // Your verified sender
    subject: `${ChoiceOfUser} - Digital Assets`,
    html: emailHTML,
    trackingSettings: {
      clickTracking: {
        enable: false,
      },
    },
  };

  try {
    await sgMail.send(msg);
    // console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

module.exports = { sendVerificationEmail, sendAssetsEmail};