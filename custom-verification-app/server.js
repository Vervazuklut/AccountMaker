// server.js

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch'); // Ensure this is installed via npm
const { sendVerificationEmail } = require('./emailService');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory token storage
let tokens = {};

// Endpoint to handle account creation and activation request
app.post('/apps/AccountCreator/request-activation', async (req, res) => {
  try {
    const email = req.body.email;
    console.log('Received activation request for email:', email);

    // Create customer account if not already created
    const customer = await createOrFindCustomerAccount(email);

    if (customer.errors) {
      // Handle errors appropriately
      console.error('Error creating customer account:', customer.errors);
      res.status(500).json({ success: false, message: 'Failed to create customer account.' });
      return;
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');

    // Store the token with an expiration time (e.g., 1 hour)
    tokens[token] = { email, expires: Date.now() + 3600 * 1000 };

    // Construct the activation link
    const activationLink = `https://${process.env.SHOPIFY_SHOP_DOMAIN}/apps/AccountCreator/activate?token=${encodeURIComponent(token)}`;

    // Send the custom email
    await sendVerificationEmail(email, activationLink);
    console.log('Verification email sent successfully.');

    res.json({ success: true });
  } catch (error) {
    console.error('Error in /request-activation:', error.message);
    res.status(500).json({ success: false, message: 'An error occurred during signup.' });
  }
});

// Endpoint to handle token validation and account activation
app.get('/apps/AccountCreator/activate', async (req, res) => {
  const token = req.query.token;
  const tokenData = tokens[token];

  if (!tokenData || tokenData.expires < Date.now()) {
    return res.status(400).send('Invalid or expired token.');
  }

  const email = tokenData.email;

  // Remove the token after use
  delete tokens[token];

  try {
    // Activate the customer account
    await sendAccountActivationEmail(email);

    // Inform the user
    res.send('Your account has been verified. Please check your email to set your password.');
  } catch (error) {
    console.error('Error activating account:', error);
    res.status(500).send('An error occurred while activating your account.');
  }
});

// Helper functions

async function createOrFindCustomerAccount(email) {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const adminAccessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  // Check if customer already exists
  const customerSearchResponse = await fetch(`https://${shopDomain}/admin/api/2024-10/customers/search.json?query=email:${encodeURIComponent(email)}`, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': adminAccessToken,
      'Content-Type': 'application/json',
    },
  });

  const customerSearchResult = await customerSearchResponse.json();

  if (customerSearchResult.customers.length > 0) {
    // Customer already exists
    return customerSearchResult.customers[0];
  } else {
    // Create a new customer account
    const response = await fetch(`https://${shopDomain}/admin/api/2024-10/customers.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': adminAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: {
          email: email,
          accepts_marketing: false,
          verified_email: false,
          tags: 'app',
        },
      }),
    });

    const result = await response.json();
    return result.customer || result;
  }
}

async function sendAccountActivationEmail(email) {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  const adminAccessToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

  // Fetch the customer ID by email
  const customerSearchResponse = await fetch(`https://${shopDomain}/admin/api/2024-10/customers/search.json?query=email:${encodeURIComponent(email)}`, {
    method: 'GET',
    headers: {
      'X-Shopify-Access-Token': adminAccessToken,
      'Content-Type': 'application/json',
    },
  });

  const customerSearchResult = await customerSearchResponse.json();

  if (customerSearchResult.customers.length === 0) {
    throw new Error('Customer not found.');
  }

  const customerId = customerSearchResult.customers[0].id;

  // Send account activation email via Shopify
  const sendInviteResponse = await fetch(`https://${shopDomain}/admin/api/2024-10/customers/${customerId}/send_invite.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': adminAccessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer_invite: {
        to: email,
      },
    }),
  });

  if (!sendInviteResponse.ok) {
    const errorResponse = await sendInviteResponse.text();
    throw new Error('Failed to send account activation email: ' + errorResponse);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));