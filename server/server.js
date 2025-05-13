// server/server.js

const express = require("express");
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
require('dotenv').config();

const HOST = '0.0.0.0';
const PORT = process.env.PORT || 3002;
const app = express();

app.use(cors());
app.use(express.json());

// PostgreSQL connection setup
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

client.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('Connection error', err.stack));

// JWT authentication middleware (optional for future use)
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // invalid token
    req.user = user; // decoded payload
    next();
  });
}

app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Check if user already exists
    const existing = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the user
    const result = await client.query(
      `INSERT INTO users (name, email, password) 
       VALUES ($1, $2, $3) 
       RETURNING id, name, email, created_at`,
      [name, email, hashedPassword]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid email or password' });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '1d' });

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at,
      },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const result = await client.query('SELECT id, name, email, created_at FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ user });
  } catch (err) {
    console.error('Profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



// GET /api/tee-times
app.get('/api/tee-times', async (req, res) => {
  try {
    const { date } = req.query;

    let query = `
      SELECT 
        tt.id,
        tt.tee_time,
        tt.hole_count,
        tt.spots_left,
        tt.price_walk,
        tt.price_with_cart,
        c.course_name,
        c.course_state
      FROM tee_times tt
      JOIN courses c ON tt.course_id = c.id
    `;

    const params = [];

    if (date) {
      query += ` WHERE DATE(tt.tee_time) = $1`;
      params.push(date);
    }

    query += ` ORDER BY tt.tee_time ASC`;

    const result = await client.query(query, params);

    const formatted = result.rows.map(row => ({
      id: row.id.toString(),
      time: new Date(row.tee_time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      spotsLeft: row.spots_left,
      holes: row.hole_count,
      priceWalk: parseFloat(row.price_walk),
      priceWithCart: parseFloat(row.price_with_cart),
      courseName: row.course_name,
      state: row.state
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching tee times:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
});
