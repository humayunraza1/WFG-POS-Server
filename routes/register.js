const express = require('express');
const router = express.Router();
const Register = require('../models/Register');
const Order = require('../models/Order');
const Expense = require('../models/Expense');
const Employee = require('../models/Employees');
const { v4: uuidv4 } = require('uuid');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);

// Get available managers
router.get('/managers', async (req, res) => {
  try {
    const managers = await Employee.find({ role: 'manager' }).select('_id name email');
    res.json({ managers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get register status and session data
router.get('/status', async (req, res) => {
  try {
    const cashierId = req.user?.userId;
    const register = await Register.findOne({ isOpen: true, cashier: cashierId })
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

// Open register for a specific cashier and manager
router.post('/open', async (req, res) => {
  try {
    const cashierId = req.user?.userId;
    if (!cashierId) {
      return res.status(401).json({ message: 'Unauthorized: cashier ID missing' });
    }

    const existingRegister = await Register.findOne({ isOpen: true, cashier: cashierId });
    if (existingRegister) {
      return res.status(400).json({ message: 'You already have an open register' });
    }

    const { startCash, managerId } = req.body;

    if (startCash === undefined || startCash < 0) {
      return res.status(400).json({ message: 'Starting cash amount is required and must be positive' });
    }

    if (!managerId) {
      return res.status(400).json({ message: 'Manager ID is required' });
    }

    // Validate manager by ID
    const manager = await Employee.findOne({ _id: managerId, role: 'manager' });
    if (!manager) {
      return res.status(400).json({ message: 'Invalid manager ID or role' });
    }

    const register = new Register({
      sessionId: uuidv4(),
      isOpen: true,
      openedAt: new Date(),
      startCash,
      openingBalance: startCash,
      manager: manager.name,
      managerRef: manager._id,
      cashier: cashierId,
      expenses: [],
      orders: [],
      lastActivity: new Date()
    });

    const newRegister = await register.save();
    res.status(201).json(newRegister);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Close register
// Close register
router.post('/close', async (req, res) => {
  try {
    const cashierId = req.user?.userId;
    const register = await Register.findOne({ isOpen: true, cashier: cashierId })
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
    // const sessionOrders = await Order.find({ registerSession: register.sessionId });
    // const sessionExpenses = await Expense.find({ registerSession: register.sessionId });

    // Calculate cash payment totals
    const cashOrders = register.orders.filter(order => order.paymentType === 'cash');
    const cashRecvd = cashOrders.reduce((sum, order) => sum + order.amountPaid, 0);
    const expectedCash = cashOrders.reduce((sum, order) => sum + order.finalPrice, 0);
    console.log(cashOrders)
    // Calculate online payment totals
    const onlineOrders = register.orders.filter(order => order.paymentType === 'online');
    const onlineRecvd = onlineOrders.reduce((sum, order) => sum + order.amountPaid, 0);
    const expectedOnline = onlineOrders.reduce((sum, order) => sum + order.finalPrice, 0);
    // console.log(cashOrders)
    
    // Calculate totals
    const totalSales = register.orders.reduce((sum, order) => sum + order.finalPrice, 0);
    const totalExpenses = register.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const expectedBalance = register.startCash + expectedCash - totalExpenses;

    // Update register with final data
    register.isOpen = false;
    register.closedAt = new Date();
    register.closingBalance = finalCash;
    register.expectedBalance = expectedBalance;
    register.totalSales = totalSales;
    register.totalExpenses = totalExpenses;
    register.expectedCash = expectedCash;
    register.expectedOnline = expectedOnline;
    register.cashRecvd = cashRecvd;
    register.onlineRecvd = onlineRecvd;

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
    const cashierId = req.user?.userId;
    const register = await Register.findOne({ isOpen: true, cashier: cashierId });
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