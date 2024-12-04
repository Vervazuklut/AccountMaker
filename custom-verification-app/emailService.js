const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendVerificationEmail(to, activationLink) {
  const msg = {
    to,
    from: 'digitalassetscorporationsllc@gmail.com',
    subject: 'Verify Your Account',
    html: `
      <p>Click the link below to verify your account on Digital Assets:</p>
      <p><a href="${activationLink}">Activate Account</a></p>
    `,
  };

  await sgMail.send(msg);
}

module.exports = { sendVerificationEmail };