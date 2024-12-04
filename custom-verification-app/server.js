require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const { sendVerificationEmail } = require('./emailService');
const { Shopify } = require('@shopify/shopify-api');

const app = express();
app.use(bodyParser.json());

// In-memory token storage (use a database in production)
let tokens = {};

// Verify proxy signature (for security)
function verifyProxySignature(query) {
  const { signature, ...rest } = query;
  const keys = Object.keys(rest).sort();
  const message = keys.map(key => `${key}=${rest[key]}`).join('');
  const providedSignature = query.signature;

  const calculatedSignature = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

  return calculatedSignature === providedSignature;
}

// App Proxy endpoint to send custom verification emails
app.post('/send-custom-email', async (req, res) => {
  // Verify the request came from Shopify
  if (!verifyProxySignature(req.query)) {
    return res.status(403).json({ success: false, message: 'Unauthorized' });
  }

  const email = req.body.email;

  // Generate a secure random token
  const token = crypto.randomBytes(32).toString('hex');

  // Store the token with an expiration time (e.g., 1 hour)
  tokens[token] = { email, expires: Date.now() + 3600 * 1000 };

  // Construct the activation link
  const activationLink = `https://gh5rsb-rj.myshopify.com/pages/verify?token=${token}`;

  // Send the custom email
  try {
    await sendVerificationEmail(email, activationLink);
    res.json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, message: 'Failed to send email.' });
  }
});

// App Proxy endpoint to handle token validation
app.get('/activate', async (req, res) => {
  const token = req.query.token;
  const tokenData = tokens[token];

  if (!tokenData || tokenData.expires < Date.now()) {
    return res.status(400).send('Invalid or expired token.');
  }

  const email = tokenData.email;

  // Remove the token after use
  delete tokens[token];

  try {
    // Authenticate the customer to get the access token
    const customerAccessToken = await authenticateCustomer(email);

    // Here you can choose to set a cookie or redirect the user
    // For simplicity, we'll display a confirmation message
    res.send('Your account has been verified. You can now log in.');
  } catch (error) {
    console.error('Error activating account:', error);
    res.status(500).send('An error occurred while activating your account.');
  }
});

// Helper function to authenticate the customer
async function authenticateCustomer(email) {
  const storefrontAccessToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  const shop = process.env.SHOPIFY_SHOP_DOMAIN;

  const queryToken = `
    mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerAccessToken {
          accessToken
          expiresAt
        }
        customerUserErrors {
          code
          field
          message
        }
      }
    }
  `;

  // Since the customer's password is unknown, you may need to prompt them to reset it
  // For this example, we'll assume the account is already activated

  const variablesToken = {
    input: {
      email: email,
      password: 'dummy-password',
    },
  };

  const responseToken = await fetch(`https://${shop}/api/2024-10/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': storefrontAccessToken,
    },
    body: JSON.stringify({ query: queryToken, variables: variablesToken }),
  });

  const resultToken = await responseToken.json();

  if (resultToken.data.customerAccessTokenCreate.customerUserErrors.length > 0) {
    const errorMessage =
      resultToken.data.customerAccessTokenCreate.customerUserErrors[0].message;
    throw new Error(errorMessage);
  }

  return resultToken.data.customerAccessTokenCreate.customerAccessToken
    .accessToken;
}
app.get('/verify', (req, res) => {
    const token = req.query.token;
    const tokenData = tokens[token];
    
    if (!tokenData || tokenData.expires < Date.now()) {
        return res.status(400).send('Invalid or expired token.');
        }
    
    const email = tokenData.email;
    
    // Remove the token after use to prevent reuse
    delete tokens[token];
    
    // Optionally, create a session or set a cookie
    res.cookie('verifiedUserEmail', email, { httpOnly: true, secure: true });
    
    // Redirect to a confirmation page or send a success message
    res.redirect('/verified');
    });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));