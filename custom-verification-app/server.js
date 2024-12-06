// server.js

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { sendVerificationEmail } = require('./emailService');
const { Shopify } = require('@shopify/shopify-api');
const { json } = require('body-parser');
const app = express();
const cookieParser = require('cookie-parser');
app.use(cookieParser());
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
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

app.use(cors({
  origin: 'https://gh5rsb-rj.myshopify.com',
  credentials: true,
}));
// Configure AWS SDK
AWS.config.update({ region: process.env.AWS_REGION }); 
const dynamoDb = new AWS.DynamoDB.DocumentClient();
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
    res.cookie('verifiedUserEmail', email, { sameSite: 'None' });
    res.send("your email has been verified.")
    });

// AWS SDK and UUID


app.post('/get-stats', async (req, res) => {
  try {
    const email = req.cookies.verifiedUserEmail;
    console.log('Email from cookie:', email);

    if (!email) {
      return res.status(400).send('User not authenticated.');
    }

    const getParams = {
      TableName: 'Account',
      Key: { 'users': email }
    };

    const result = await dynamoDb.get(getParams).promise();

    if (!result.Item) {
      return res.status(400).send('Invalid Email.');
    }

    res.json(result.Item);

  } catch (error) {
    console.error('Error in /get-stats:', error.message);
    res.status(500).send('Server error.');
  }
});

app.post('/register-user', async (req, res) => {
  try {
    if (!verifyProxySignature(req.query)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const email = req.body.email;
    const getParams = {
      TableName: 'Account',
      Key: { 'users': email }
    };

    const result = await dynamoDb.get(getParams).promise();

    if (result.Item) {
      return res.status(400).json({ success: false, message: 'Email already exists.' });
    }

    // Generate a unique UserID
    const userID = uuidv4();

    // Create new user data
    const newUser = {
      'users': email,
      'Name': email.split('@')[0],
      'Download Credits': 50,
      'Money': 0,
      'UserID': userID
    };

    const putParams = {
      TableName: 'Account', 
      Item: newUser
    };

    // Put the new user into DynamoDB
    await dynamoDb.put(putParams).promise();

    res.status(200).json({ success: true, message: 'User added successfully.' });

  } catch (error) {
    console.error('Error in /register-user:', error.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));

