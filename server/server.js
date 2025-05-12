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
