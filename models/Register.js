const mongoose = require('mongoose');

// Define available managers
const MANAGERS = ['Hamza', 'Wajeeh', 'Talal'];

const registerSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  manager: {
    type: String,
    required: true,
    enum: MANAGERS
  },
  isOpen: {
    type: Boolean,
    default: false
  },
  openedAt: {
    type: Date
  },
  closedAt: {
    type: Date
  },
  startCash: {
    type: Number,
    required: true,
    default: 0
  },
  openingBalance: {
    type: Number,
    default: 0
  },
  closingBalance: {
    type: Number
  },
  expectedBalance: {
    type: Number
  },
  totalSales: {
    type: Number,
    default: 0
  },
  totalExpenses: {
    type: Number,
    default: 0
  },
  expenses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  }],
  orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Export the model with the MANAGERS constant for use in routes
module.exports = {
  Register: mongoose.model('Register', registerSchema),
  MANAGERS
};