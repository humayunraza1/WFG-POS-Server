const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
require('dotenv').config();
const authRoutes = require('./routes/auth');

const app = express();

app.use(cookieParser());
// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL, // 👈 must match your frontend origin exactly
  credentials: true,              // 👈 allow cookies / auth headers
}));
app.use(express.json());
app.use(morgan('dev'));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employee', require('./routes/EmployeePayment'));
app.use('/api/manager', require('./routes/manager'));
app.use('/api/otp', require('./routes/otp'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/register', require('./routes/register'));
app.use('/api/reports', require('./routes/reports'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
}); 