require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { sendVerificationEmail } = require('./emailService');
const { Shopify } = require('@shopify/shopify-api');
const app = express();
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
// Import AWS SDK v3 modules
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

app.use(helmet());
app.use(cookieParser());
//app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: 'https://gh5rsb-rj.myshopify.com/pages/verify',
  credentials: true,
}));

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://meet.google.com; worker-src 'self' https://meet.google.com; object-src 'none';"
  );
  next();
});

app.use(express.json({
  verify: (req, res, buf) => {
  req.rawBody = buf;
  }
  }));
let tokens = {};

// Initialize AWS SDK v3 clients
const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const dynamoDb = DynamoDBDocumentClient.from(dynamoDBClient);

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

    res.json({ success: true });
  } catch (error) {
    console.error('Error in /send-custom-email:', error.message);
    res.status(500).json({ success: false, message: 'Failed to send email.' });
  }
});

app.get('/verify', (req, res) => {
  const token = req.query.token;
  const tokenData = tokens[token];

  if (!tokenData || tokenData.expires < Date.now()) {
    return res.status(400).send({message: 'Invalid or expired token.'});
  }
  const email = tokenData.email;
  delete tokens[token];

  // Generate JWT token
  const jwtToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: '1h' });

  res.json({ message: 'Your email has been verified.', token: jwtToken });
});

app.post('/get-stats', async (req, res) => {
  try {
    if (!verifyProxySignature(req.query)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }


    const authHeader = req.headers.authorization;
    console.log('Authorization Header:', authHeader);

    if (!authHeader) {
      return res.status(401).send('No authorization token provided.');
    }

    const token = authHeader.split(' ')[1]; // Expected format: "Bearer <token>"

    // Verify the token
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;
    console.log('Email from token:', email);

    const getParams = {
      TableName: 'Account',
      Key: { 'users': email }
    };

    // Use send method with GetCommand
    const result = await dynamoDb.send(new GetCommand(getParams));

    if (!result.Item) {
      return res.status(400).send('Invalid Email.');
    }

    res.json(result.Item);

  } catch (error) {
    console.error('Error in /get-stats:', error.message);
    res.status(401).send('Invalid or expired token.');
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

    // Use send method with GetCommand
    const result = await dynamoDb.send(new GetCommand(getParams));

    if (result.Item) {
      return res.status(400).json({ success: false, message: 'Email already exists.' });
    }

    // Generate a unique UserID
    const userID = uuidv4();

    // Create new user data
    const newUser = {
      'users': email,
      'Name': email.split('@')[0],
      'Download_Credits': 50,
      'Money': 0,
      'UserID': userID
    };

    const putParams = {
      TableName: 'Account',
      Item: newUser
    };

    // Use send method with PutCommand
    await dynamoDb.send(new PutCommand(putParams));

    res.status(200).json({ success: true, message: 'User added successfully.' });

  } catch (error) {
    console.error('Error in /register-user:', error.message);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});
app.post('/SpendCredits', async (req, res) => {
  try {
  if (!verifyProxySignature(req.query)) {
  return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  
  const authHeader = req.headers.authorization;
  console.log('Authorization Header:', authHeader);
  
  if (!authHeader) {
  return res.status(401).send('No authorization token provided.');
  }
  const token = authHeader.split(' ')[1]; // Expected format: "Bearer <token>"
  const decoded = jwt.verify(token, JWT_SECRET);
  const email = decoded.email;
  const getParams = {
  TableName: 'Account',
  Key: { 'users': email }
  };
  const result = await dynamoDb.send(new GetCommand(getParams));
  
  if (!result.Item) {
  res.status(404).json({ success: false, message: 'User not found' });
  return;
  }
  
  const currentCredits = result.Item.Download_Credits;
  
  if (currentCredits - 1 < 0) {
  res.status(400).json({ success: false, message: 'Not enough credits!' });
  return;
  }
  
  const command = new UpdateCommand({
  ...getParams,
  UpdateExpression: "set Download_Credits = :amount",
  ExpressionAttributeValues: {
  ":amount": currentCredits - 1,
  },
  ReturnValues: "ALL_NEW",
  });
  
  const updateResult = await dynamoDb.send(command);
  
  if (!updateResult.Attributes) {
  res.status(500).json({ success: false, message: 'Failed to update credits.' });
  return;
  }
  
  console.log('Updated Credits:', updateResult.Attributes.Download_Credits);
  
  return res.status(200).json({ success: true, message: "Credit Spent!", updatedCredits: updateResult.Attributes.Download_Credits });
  } catch (error) {
  console.error('Error in /SpendCredits:', error.message);
  res.status(500).json({ success: false, message: 'Server error.' });
  }
  });
app.post('/ChangeMoney', async (req, res) => {
  try {
  if (!verifyProxySignature(req.query)) {
  return res.status(403).json({ success: false, message: 'Unauthorized' });
  }
  
  const authHeader = req.headers.authorization;
  console.log('Authorization Header:', authHeader);
  
  if (!authHeader) {
  return res.status(401).send('No authorization token provided.');
  }
  const token = authHeader.split(' ')[1]; // Expected format: "Bearer <token>"
  const decoded = jwt.verify(token, JWT_SECRET);
  const email = decoded.email;
  const getParams = {
  TableName: 'Account',
  Key: { 'users': email }
  };
  const result = await dynamoDb.send(new GetCommand(getParams));
  
  if (!result.Item) {
  res.status(404).json({ success: false, message: 'User not found' });
  return;
  }
  
  const currentCredits = result.Item.Money;
  
  if (currentCredits - req.body.cost < 0) {
  res.status(400).json({ success: false, message: 'Not enough money!' });
  return;
  }
  
  const command = new UpdateCommand({
  ...getParams,
  UpdateExpression: "set Money = :amount",
  ExpressionAttributeValues: {
  ":amount": currentCredits - req.body.cost,
  },
  ReturnValues: "ALL_NEW",
  });
  
  const updateResult = await dynamoDb.send(command);
  
  if (!updateResult.Attributes) {
  res.status(500).json({ success: false, message: 'Failed to update money.' });
  return;
  }
  
  console.log('Updated Credits:', updateResult.Attributes.Download_Credits);
  
  return res.status(200).json({ success: true, message: "Money Spent!", updatedCredits: updateResult.Attributes.Download_Credits });
  } catch (error) {
  console.error('Error in /SpendCredits:', error.message);
  res.status(500).json({ success: false, message: 'Server error.' });
  }
});
/*
function verifyWebhookHMAC(rawBody, hmacHeader, secret) {
  const generatedHmac = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return generatedHmac === hmacHeader;
}
*/
function verifyWebhookHMAC(rawBody, hmacHeader, secret) {
  const generatedHash = crypto
  .createHmac('sha256', secret)
  .update(rawBody)
  .digest('base64');
  
  const hashBuffer = Buffer.from(generatedHash, 'utf8');
  const hmacBuffer = Buffer.from(hmacHeader || '', 'utf8');
  
  if (hashBuffer.length !== hmacBuffer.length) {
  return false;
  }
  
  return crypto.timingSafeEqual(hashBuffer, hmacBuffer);
  }
  
  app.post('/webhooks/order_paid', async (req, res) => {
  try {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const rawBody = req.rawBody;
  
  if (!rawBody) {
    console.error('rawBody is undefined');
    return res.status(400).send('Invalid request');
  }
  console.log(rawBody);
  /*
  const verified = verifyWebhookHMAC(rawBody, hmac, process.env.SHOPIFY_API_SECRET);
  
  if (!verified) {
    console.error('Webhook verification failed');
    return res.status(401).send('Webhook verification failed');
  }
  */
 
  const order = req.body;
  const MoneyAdded = parseFloat(order.total_price);
  const email = order.customer && order.customer.email;
  
  if (!email) {
    return res.status(400).send('Customer email not found in order data');
  }
  
  const lineItems = order.line_items || [];
  let hasMoneyTopUp = false;
  
  for (const item of lineItems) {
    if (item.title === "MoneyTopUp") {
      hasMoneyTopUp = true;
      break;
    }
  }
  
  if (hasMoneyTopUp) {
    const updateCommand = new UpdateCommand({
      TableName: 'Account',
      Key: { users: email },
      UpdateExpression: "ADD Money :amount",
      ExpressionAttributeValues: { ":amount": MoneyAdded + 10 },
      ReturnValues: "ALL_NEW",
    });
  
    const updateResult = await dynamoDb.send(updateCommand);
  
    if (!updateResult.Attributes) {
      console.error('Failed to update money for user:', email);
      return res.status(500).json({ success: false, message: 'Failed to update money.' });
    }
  
    console.log(`Updated Money for user ${email}:`, updateResult.Attributes.Money);
  }
  
  res.status(200).send('Webhook processed successfully');
  } catch (error) {
  console.error('Error processing webhook:', error);
  if (!res.headersSent) {
  res.status(500).send('Error processing webhook');
  }
  }
  });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`App listening on port ${PORT}`));