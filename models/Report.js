const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  dateRange: {
    startDate: String,
    endDate: String
  },
  summary: {
    totalSessions: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    totalExpenseItems: { type: Number, default: 0 },
    totalSales: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    netRevenue: { type: Number, default: 0 },
    totalCashReceived: { type: Number, default: 0 },
    totalOnlinePayments: { type: Number, default: 0 },
    expectedCash: { type: Number, default: 0 },
    expectedOnline: { type: Number, default: 0 },
    totalOutstanding: { type: Number, default: 0 },
    netCashFlow: { type: Number, default: 0 }
  },
  salesByManager: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  productSummary: [{
    productId: String,
    variantId: String,
    productName: String,
    variantName: String,
    price: Number,
    quantitySold: Number,
    totalRevenue: Number
  }],
  sessions: [{
    sessionId: String,
    manager: String,
    openedAt: Date,
    closedAt: Date,
    startCash: Number,
    closingBalance: Number,
    expectedBalance: Number,
    totalSales: Number,
    totalExpenses: Number,
    isOpen: Boolean
  }],
  orders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  expenses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense'
  }],
  generatedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Report', reportSchema);