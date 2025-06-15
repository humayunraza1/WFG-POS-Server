const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Expense = require('../models/Expense');

// Helper function to get date range
const getDateRange = (period) => {
  const now = new Date();
  const start = new Date();
  
  switch (period) {
    case 'daily':
      start.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      start.setDate(now.getDate() - 7);
      break;
    case 'monthly':
      start.setMonth(now.getMonth() - 1);
      break;
    case 'quarterly':
      start.setMonth(now.getMonth() - 3);
      break;
    case 'annual':
      start.setFullYear(now.getFullYear() - 1);
      break;
    default:
      start.setHours(0, 0, 0, 0);
  }
  
  return { start, end: now };
};

// Get report
router.get('/:period', async (req, res) => {
  try {
    const { start, end } = getDateRange(req.params.period);
    
    // Get orders
    const orders = await Order.find({
      dateOrdered: { $gte: start, $lte: end }
    }).populate('items.product');

    // Get expenses
    const expenses = await Expense.find({
      dateAdded: { $gte: start, $lte: end }
    });

    // Calculate totals
    const totalSales = orders.reduce((sum, order) => sum + order.finalPrice, 0);
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const netProfit = totalSales - totalExpenses;

    // Calculate payment type distribution
    const paymentTypes = orders.reduce((acc, order) => {
      acc[order.paymentType] = (acc[order.paymentType] || 0) + order.finalPrice;
      return acc;
    }, {});

    res.json({
      period: req.params.period,
      dateRange: { start, end },
      totalOrders: orders.length,
      totalSales,
      totalExpenses,
      netProfit,
      paymentTypes,
      orders,
      expenses
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 