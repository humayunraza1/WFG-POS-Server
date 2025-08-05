const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
require('dotenv').config();

const connectDB = require('./db'); // We'll make a db.js for caching
const authRoutes = require('./routes/auth');

const app = express();

app.use(cookieParser());
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));

// Connect to MongoDB (cached connection)
connectDB().catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/settings', require('./routes/preferences'));
app.use('/api/roles', require('./routes/roles'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/business', require('./routes/business'));
app.use('/api/employee', require('./routes/EmployeePayment'));
app.use('/api/branch', require('./routes/branch'));
app.use('/api/manager', require('./routes/manager'));
app.use('/api/otp', require('./routes/otp'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/register', require('./routes/register'));
app.use('/api/reports', require('./routes/reports'));

module.exports = app; // Export app instead of listening
