require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const Database = require('better-sqlite3');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Basic rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
});
app.use(limiter);

// Initialize DB (SQLite)
const db = new Database('ebookiez.db');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT UNIQUE,
  receipt TEXT,
  amount INTEGER,
  currency TEXT,
  status TEXT,
  customer_name TEXT,
  customer_email TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id TEXT UNIQUE,
  order_id TEXT,
  signature TEXT,
  method TEXT,
  status TEXT,
  raw_payload TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);
`);

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Create order - server side (secure)
app.post('/api/create-order', [
  body('amount').isInt({ min: 1 }),
  body('currency').optional().isString(),
  body('receipt').optional().isString(),
  body('customer_name').optional().isString(),
  body('customer_email').optional().isEmail(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { amount, currency = 'INR', receipt = `rcpt_${Date.now()}`, customer_name, customer_email } = req.body;
    const options = {
      amount: Math.round(amount), // in paise
      currency,
      receipt,
      payment_capture: 1,
      notes: { customer_email: customer_email || '', customer_name: customer_name || '' }
    };
    const order = await razorpay.orders.create(options);

    // Persist order in DB
    const insert = db.prepare(`INSERT INTO orders (order_id, receipt, amount, currency, status, customer_name, customer_email) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insert.run(order.id, receipt, order.amount, order.currency, 'created', customer_name || '', customer_email || '');

    return res.json({ order });
  } catch (err) {
    console.error('create-order error', err);
    return res.status(500).json({ error: 'Could not create order', details: err.message });
  }
});

// Verify payment (client posts after successful checkout)
app.post('/api/verify-payment', [
  body('razorpay_order_id').exists(),
  body('razorpay_payment_id').exists(),
  body('razorpay_signature').exists(),
], (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const expectedSignature = hmac.digest('hex');
    const verified = expectedSignature === razorpay_signature;

    // Persist payment
    const insertPayment = db.prepare(`INSERT OR IGNORE INTO payments (payment_id, order_id, signature, method, status, raw_payload) VALUES (?, ?, ?, ?, ?, ?)`);
    insertPayment.run(razorpay_payment_id, razorpay_order_id, razorpay_signature, 'unknown', verified ? 'paid' : 'failed', JSON.stringify(req.body));

    // Update order status if verified
    if (verified) {
      const updateOrder = db.prepare(`UPDATE orders SET status = ? WHERE order_id = ?`);
      updateOrder.run('paid', razorpay_order_id);
      return res.json({ verified: true, payment: { razorpay_order_id, razorpay_payment_id } });
    } else {
      return res.status(400).json({ verified: false, message: 'Signature mismatch' });
    }
  } catch (err) {
    console.error('verify-payment error', err);
    return res.status(500).json({ verified: false, message: err.message });
  }
});

// Webhook endpoint - verify x-razorpay-signature header
app.post('/api/webhook', (req, res) => {
  const secret = process.env.WEBHOOK_SECRET || process.env.RAZORPAY_KEY_SECRET || '';
  const signature = req.headers['x-razorpay-signature'] || '';
  const bodyString = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', secret).update(bodyString).digest('hex');

  if (signature === expected) {
    // handle webhook event types (payment.captured etc)
    const event = req.body.event;
    const payload = req.body.payload || {};
    if (event === 'payment.captured' && payload.payment && payload.payment.entity) {
      const p = payload.payment.entity;
      // persist payment
      const insertP = db.prepare(`INSERT OR IGNORE INTO payments (payment_id, order_id, signature, method, status, raw_payload) VALUES (?, ?, ?, ?, ?, ?)`);
      insertP.run(p.id, p.order_id, signature, p.method, 'paid', JSON.stringify(p));
      const updateOrder = db.prepare(`UPDATE orders SET status = ? WHERE order_id = ?`);
      updateOrder.run('paid', p.order_id);
    }
    // acknowledge
    return res.status(200).json({ ok: true });
  } else {
    return res.status(400).json({ ok: false, message: 'Invalid signature' });
  }
});

// Admin: list orders (protected by ADMIN_API_KEY header)
app.get('/api/admin/orders', (req, res) => {
  const key = req.headers['x-admin-key'] || '';
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  const rows = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  res.json({ orders: rows });
});

app.listen(PORT, () => {
  console.log(`Secure ebookiez server listening on port ${PORT}`);
});
