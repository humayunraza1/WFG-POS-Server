const express = require('express');
const router = express.Router();
const { Register, MANAGERS } = require('../models/Register');
const Order = require('../models/Order');
const Expense = require('../models/Expense');
const { v4: uuidv4 } = require('uuid');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);

// Get available managers
router.get('/managers', async (req, res) => {
  try {
    res.json({ managers: MANAGERS });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get register status and session data
router.get('/status', async (req, res) => {
  try {
    const register = await Register.findOne({ isOpen: true })
      .populate('orders')
      .populate('expenses');
    
    if (!register) {
      return res.json({ isOpen: false });
    }

    res.json({
      isOpen: true,
      sessionId: register.sessionId,
      register: register,
      orders: register.orders,
      expenses: register.expenses
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
});

// Open register
router.post('/open', async (req, res) => {
  try {
    const existingRegister = await Register.findOne({ isOpen: true });
    if (existingRegister) {
      return res.status(400).json({ message: 'Register is already open' });
    }

    const { startCash, manager } = req.body;
    
    if (startCash === undefined || startCash < 0) {
      return res.status(400).json({ message: 'Starting cash amount is required and must be positive' });
    }

    if (!manager) {
      return res.status(400).json({ message: 'Manager is required' });
    }

    if (!MANAGERS.includes(manager)) {
      return res.status(400).json({ message: 'Invalid manager selection' });
    }

    const register = new Register({
      sessionId: uuidv4(),
      manager: manager,
      isOpen: true,
      openedAt: new Date(),
      startCash: startCash,
      openingBalance: startCash,
      expenses: [],
      orders: [],
      lastActivity: new Date()
    });

    const newRegister = await register.save();
    res.status(201).json(newRegister);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Close register
router.post('/close', async (req, res) => {
  try {
    const register = await Register.findOne({ isOpen: true })
      .populate('orders')
      .populate('expenses');
    
    if (!register) {
      return res.status(400).json({ message: 'Register is not open' });
    }

    const { finalCash } = req.body;
    
    if (finalCash === undefined || finalCash < 0) {
      return res.status(400).json({ message: 'Final cash amount is required and must be positive' });
    }

    // Get all orders and expenses for this session
    const sessionOrders = await Order.find({ registerSession: register.sessionId });
    // FIX: Use sessionId instead of _id to find expenses
    const sessionExpenses = await Expense.find({ registerSession: register.sessionId });

    // Calculate totals
    const totalSales = sessionOrders.reduce((sum, order) => sum + order.finalPrice, 0);
    const totalExpenses = sessionExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    // Update register with final data
    register.isOpen = false;
    register.closedAt = new Date();
    register.finalCash = finalCash;
    register.closingBalance = finalCash;
    register.totalSales = totalSales;
    register.totalExpenses = totalExpenses;
    register.orders = sessionOrders.map(order => order._id);
    register.expenses = sessionExpenses.map(expense => expense._id);

    const closedRegister = await register.save();
    res.json(closedRegister);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all register sessions with optional date filtering and manager filtering
router.get('/sessions', async (req, res) => {
  try {
    const { startDate, endDate, manager } = req.query;
    
    // Build filter object
    let filter = {};
    
    // Date filter
    if (startDate || endDate) {
      filter.openedAt = {};
      if (startDate) {
        filter.openedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        // Add 1 day to endDate to include the entire end day
        const endDatePlusOne = new Date(endDate);
        endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
        filter.openedAt.$lt = endDatePlusOne;
      }
    }

    // Manager filter
    if (manager && manager !== 'ALL') {
      filter.manager = manager;
    }

    const sessions = await Register.find(filter)
      .populate({
        path: 'orders',
        populate: {
          path: 'items.product items.variant',
          select: 'name price'
        }
      })
      .populate('expenses')
      .sort({ openedAt: -1 }); // Most recent first

    res.json(sessions);
  } catch (error) {
    console.error('Error fetching register sessions:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get a specific register session by ID
router.get('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const session = await Register.findById(id)
      .populate({
        path: 'orders',
        populate: {
          path: 'items.product items.variant',
          select: 'name price'
        }
      })
      .populate('expenses');

    if (!session) {
      return res.status(404).json({ message: 'Register session not found' });
    }

    res.json(session);
  } catch (error) {
    console.error('Error fetching register session:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update last activity
router.post('/activity', async (req, res) => {
  try {
    const register = await Register.findOne({ isOpen: true });
    if (!register) {
      return res.status(400).json({ message: 'Register is not open' });
    }

    register.lastActivity = new Date();
    await register.save();
    res.json({ message: 'Activity updated' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;