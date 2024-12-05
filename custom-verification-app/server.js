// server.js

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { sendVerificationEmail } = require('./emailService');
const { Shopify } = require('@shopify/shopify-api');
const fs = require('fs');
const { json } = require('body-parser');
let rawData = fs.readFileSync('users.json');
const fsPromise = require('fs').promises;
const { Mutex } = require('async-mutex');
const mutex = new Mutex();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://meet.google.com; worker-src 'self' https://meet.google.com; object-src 'none';"
      );
      next();
    });
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


app.post('/send-custom-email', async (req, res) => {

  try {
    // Verify the request came from Shopify
    if (!verifyProxySignature(req.query)) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const email = req.body.email;
    const token = crypto.randomBytes(32).toString('hex');

    tokens[token] = { email, expires: Date.now() + 5 * 60 * 1000 };


    const activationLink = `https://gh5rsb-rj.myshopify.com/pages/verify?token=${token}`;

    await sendVerificationEmail(email, activationLink);
    //console.log('Verification email sent successfully.');

    res.json({ success: true });
  } catch (error) {
    console.error('Error in /send-custom-email:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send email.' });
  }
});


// App Proxy endpoint to handle token validation
/*
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
    const customerAccessToken = await authenticateCustomer(email);
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

*/

app.get('/verify', (req, res) => {
    const token = req.query.token;
    const tokenData = tokens[token];
    
    if (!tokenData || tokenData.expires < Date.now()) {
      return res.status(400).send('Invalid or expired token.');
    }
    const email = tokenData.email;
    delete tokens[token];
    //set a cookie
    console.log(email);
    res.cookie('verifiedUserEmail', email, { httpOnly: true, secure: true });
    res.send("your email has been verified.")
    });
app.post('/get-stats', async (req, res) => {
      try {
      let rawData = await fsPromise.readFile('users.json', 'utf8');
      let jsonData = JSON.parse(rawData);
      let users = jsonData.users;
      const email = req.body.cookie;
      console.log(email);
      const user = users.find(user => user.Email === email);
      
      if (!user) {
      return res.status(400).send('Invalid Email.');
      }
      
      // Send the user data as JSON
      res.json(user);
      
      } catch (error) {
      console.error('Error in /get-stats:', error.message);
      res.status(500).send('Server error.');
      }
});
app.post('/register-user', async (req, res) => {
  const release = await mutex.acquire();
  try {
    if (!verifyProxySignature(req.query)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const email = req.body.email;

    // Read the existing users.json file
    let rawData = await fsPromise.readFile('users.json', 'utf-8');
    let jsonData = JSON.parse(rawData);
    let users = jsonData.users;

    // Check if the email already exists
    let existingUser = users.find(user => user.email === email);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already exists.' });
    }

    // Create new user data
    let Data = {
      "Email": email,
      "stats": {
        "NumberID": users.length + 1, // Adjusted for uniqueness
        "name": email.split("@")[0],
        "download_credits": 50,
        "Money": 0
      }
    }

    // Add the new user to the users array
    users.push(Data);

    // Write the updated data back to users.json
    await fsPromise.writeFile('users.json', JSON.stringify(jsonData, null, 2));
    console.log(jsonData);
    res.status(200).json({ success: true, message: 'User added successfully.' });

  } catch (error) {
    console.error('Error in /register-user:', error.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  } finally {
      release(); // Release the mutex
  }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));