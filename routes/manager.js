const express = require('express');
const jwt = require('jsonwebtoken');
const Account = require('../models/Account');
const Employee = require('../models/Employees');
const hasAccess = require('../middleware/hasAccess');
const authenticateManager = require('../middleware/authenticateManager');
const Order = require('../models/Order');
const Register = require('../models/Register');
const Employees = require('../models/Employees');
const Product = require('../models/Product');
const Variant = require('../models/Flavors');
const getNextProductId = require('../utils/getProdID');
const Expense = require('../models/Expense');
const updateRegister = require('../utils/updateRegister');
const router = express.Router();
router.use(authenticateManager);

// JWT Secret keys (in production, use environment variables)
const JWT_SECRET = process.env.JWT_SECRET 
const REFRESH_SECRET = process.env.REFRESH_SECRET
// Token expiration times
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '2d'; // 7 days


router.post('/add-account', hasAccess("canAssignAccount"), async (req, res) => {
  try {
    const { employeeId, username, password, access = {} } = req.body;
    const currAccess = req.user.access;
    console.log("Current User Access:", currAccess);
        const employee = await Employee.findById(employeeId);
        if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    if (employee.accountRef) {
      return res.status(400).json({ message: 'This employee already has an account'
      });
    }
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Filter access flags based on current user's privileges
    const currentAccess = req.user.access || {};
    const adminOnlyFlags = ['isAdmin', 'isManager', 'canEditRoles', 'canDeleteEmployees','canAssignAccount', 'canAddEmployee', 'canDeleteOrders', 'canViewReports'];
    const deniedFlags = [];
    const filteredAccess = {};

        for (const key in access) {
          if (adminOnlyFlags.includes(key)) {
            if (currentAccess.isAdmin) {
              filteredAccess[key] = access[key];
            } else {
              if (access[key]) deniedFlags.push(key); // Only flag if trying to enable it
            }
          } else {
            filteredAccess[key] = access[key];
          }
        }
      
  if (deniedFlags.length > 0) {
  return res.status(403).json({
    message: 'You are not allowed to assign the following permissions:',
    denied: deniedFlags
  });
}

    // Create new account and employee record
    const newAccount = new Account({ username, password, access: filteredAccess });
    await newAccount.save();
    await employee.updateOne({ accountRef: newAccount._id });

    res.status(201).json({
      message: 'Account created successfully',
      user: { id: newAccount._id, username: newAccount.username }
    });

  } catch (error) {
    console.error('Admin creation error:', error);
    res.status(500).json({ message: 'Server error during account creation' });
  }
});

router.post('/add-employee', hasAccess("canAddEmployee"), async (req, res) => {
  try {
    const { name, email, salary,number, role} = req.body;

    const addEmployee = new Employee({
      name,
      email,
      salary,
      number,
      role,
      accountRef: null,
    });
    await addEmployee.save();

    res.status(201).json({
      message: 'Employee added successfully',
      user: { id: addEmployee._id, name: addEmployee.name }
    });

  } catch (error) {
    console.error('Admin creation error:', error);
    res.status(500).json({ message: 'Server error during account creation' });
  }
});

//order count by open registers with that manager
router.get('/daily-count',async (req, res) => {
  try {
    const managerId = req.user?.userId;
    if (!managerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Step 1: Find all open registers for this manager & populate cashier
    const registers = await Register.find({ isOpen: true, managerRef: managerId })
      .populate({
        path: 'cashier',
        model: 'Employee',
        select: 'name email'
      });

    if (!registers.length) {
      return res.json({ message: 'No open registers for this manager', registers: [] });
    }

    // Step 2: Count orders placed after each register's openedAt
    const result = await Promise.all(registers.map(async (register) => {
      const orderCount = await Order.countDocuments({
        _id: { $in: register.orders },
        dateOrdered: { $gte: register.openedAt }
      });

      return {
        sessionId: register.sessionId,
        openedAt: register.openedAt,
        cashier: register.cashier, // populated with name + email
        orderCount
      };
    }));

    res.json({ registers: result });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find({})
      .sort({ createdAt: -1 })
      .populate('items.product')
      .populate('items.variant');

    // Manually fetch register session data for each order
    const ordersWithSessions = await Promise.all(
      orders.map(async (order) => {
        const orderObj = order.toObject();
        if (orderObj.registerSession) {
          try {
            const session = await Register.findOne({sessionId: orderObj.registerSession});
            if (session && session.manager) {
              orderObj.registerSession = { manager: session.manager };
            }
          } catch (err) {
            console.log(`Could not find session ${orderObj.registerSession}:`, err.message);
            // Keep the original string if session not found
          }
        }
        return orderObj;
      })
    );

    res.json(ordersWithSessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Delete order
router.delete('/delete-order/:id',hasAccess("canDeleteOrders"), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    // Update register total sales with only the amount actually paid
            await Register.findOneAndUpdate(
              { isOpen: true, sessionId: order.registerSession },
              { $pull: { orders: order._id }}
            );  
    await updateRegister(order.registerSession);

    await order.deleteOne();
    res.json({ message: 'Order deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


router.get('/registers/active', async (req, res) => {
  try {
    const managerAccId = req.user.userId;
    const role = req.user.role;
    if (role=="manager"){

      const managerId = await Employees.find({ accountRef: managerAccId }).select('_id');
      const registers = await Register.find({ isOpen: true, managerRef: managerId })
      .select('sessionId openedAt cashier')
      .populate('cashier', 'username');
      
      res.json(registers);
    }else if (role=="admin") {
      const registers = await Register.find({ isOpen: true })
      .select('sessionId openedAt cashier')
      .populate('cashier', 'username');
      
      res.json(registers);
    }

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/registers/summary', async (req, res) => {
  try {
    const { sessionId } = req.query;
    const manager = req.user.userId;
    const role = req.user.role;
      const managerId = await Employees.find({ accountRef: manager }).select('_id');

      let registers = [];
    if (role == "manager"){

      if (!sessionId || sessionId === 'ALL') {
        // All open registers for the logged-in manager
        registers = await Register.find({ isOpen: true, managerRef: managerId })
        .populate('orders')
        .populate('expenses')
        .populate('cashier', 'username');
      } else {
        // Specific session only
        const register = await Register.findOne({ sessionId })
        .populate('orders')
        .populate('expenses')
        .populate('cashier', 'username');
        
        console.log("Register found:", register);

        if (!register) {
          return res.status(404).json({ message: 'Register not found' });
        }
        
        registers = [register];
      }
    }else if (role == "admin") {
      if (!sessionId || sessionId === 'ALL') {
        // All open registers for all managers
        registers = await Register.find({ isOpen: true })
        .populate('orders')
        .populate('expenses')
        .populate('cashier', 'username');
      } else {
        // Specific session only
        const register = await Register.findOne({ sessionId })
        .populate('orders')
        .populate('expenses')
        .populate('cashier', 'username');
        if (!register) {
          return res.status(404).json({ message: 'Register not found' });
        }
        registers = [register];
      }
    }
    // Combine stats across one or more registers
    const combined = {
      sessionCount: registers.length,
      orderCount: 0,
      totalSales: 0,
      cashRecvd: 0,
      onlineRecvd: 0,
      expectedCash: 0,
      expectedOnline: 0,
      totalExpenses: 0,
      startCash: 0,
      openingBalance: 0,
      closingBalance: 0,
      orders: [],
      expenses: [],
      registers: []
    };

    registers.forEach(reg => {
      combined.orderCount += reg.orders.length;
      combined.totalSales += reg.totalSales || 0;
      combined.cashRecvd += reg.cashRecvd || 0;
      combined.onlineRecvd += reg.onlineRecvd || 0;
      combined.expectedCash += reg.expectedCash || 0;
      combined.expectedOnline += reg.expectedOnline || 0;
      combined.totalExpenses += reg.totalExpenses || 0;
      combined.startCash += reg.startCash || 0;
      combined.openingBalance += reg.openingBalance || 0;
      combined.closingBalance += reg.closingBalance || 0;
      combined.orders.push(...reg.orders);
      combined.expenses.push(...reg.expenses);
      combined.registers.push({
        sessionId: reg.sessionId,
        openedAt: reg.openedAt,
        cashier: reg.cashier,
        startCash: reg.startCash,
        closingBalance: reg.closingBalance? reg.closingBalance : 0,
        expectedBalance: reg.expectedBalance? reg.expectedBalance : 0,
      });
    });

    res.json(combined);
  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET /employees
router.get('/employees', async (req, res) => {
  try {
    const userRole = req.user?.role;

    if (!userRole) {
      return res.status(401).json({ message: 'Unauthorized: role missing' });
    }

    let filter = {};

    // If the user is a manager, limit to specific visible roles
    if (userRole === 'manager') {
      filter.role = { $in: ['cashier', 'chef', 'employee', 'cleaner', 'waiter'] };
    }

    // If the user is admin or company, return all employees
    const employees = await Employee.find(filter).select('_id name email role phone salary accountRef');

    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Add/Update products

router.post('/add-product', async (req, res) => {
  try {
    const newProductId = await getNextProductId();
    console.log('New Product ID:', newProductId);
    console.log(req.body)
    const product = new Product({
      customId: newProductId,
      name: req.body.name,
      imageUrl: req.body.imageUrl
    });

    const savedProduct = await product.save();
    // Save variants
    const variantDocs = await Promise.all(req.body.variants.map(async (variant, index) => {
      return await new Variant({
        customId: `${newProductId}-${index + 1}`,
        name: variant.name,
        price: variant.price,
        imageUrl: variant.imageUrl,
        product: savedProduct._id
      }).save();
    }));

    res.status(201).json({ product: savedProduct, variants: variantDocs });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update product
// Update product
router.patch('/edit-product/:id',hasAccess("canEditProducts"), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Update basic product fields
    if (req.body.name) product.name = req.body.name;
    if (req.body.imageUrl) product.imageUrl = req.body.imageUrl;

    await product.save();

    // Optional: update variants if provided
    if (req.body.variants && Array.isArray(req.body.variants)) {
      // Option 1: Delete all and re-add (simple & clean)
      await Variant.deleteMany({ product: product._id });

      const updatedVariants = await Promise.all(
        req.body.variants.map((variant, index) =>
          new Variant({
            customId: `${product.customId}-${index + 1}`,
            name: variant.name,
            price: variant.price,
            imageUrl: variant.imageUrl,
            product: product._id
          }).save()
        )
      );

      return res.json({ product, variants: updatedVariants });
    }

    res.json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Expenses

// Get all expenses
router.get('/expenses', async (req, res) => {
  try {
    const expenses = await Expense.find();
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Add new expense
router.post('/add-expense',hasAccess("canAddExpense"), async (req, res) => {
  const expense = new Expense({
    registerSession: req.body.registerSession,
    name: req.body.name,
    amount: req.body.amount
  });

  try {
    const newExpense = await expense.save();
      // Update register total expenses
    await Register.findOneAndUpdate(
      { isOpen: true, sessionId: req.body.registerSession },
      { $push: { expenses: newExpense._id }}
    );  
  await updateRegister(req.body.registerSession);
    res.status(201).json(newExpense);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update expense
router.put('/update-expense/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, amount } = req.body;
    
    // Get the old expense to calculate the difference
    const oldExpense = await Expense.findById(id);
    if (!oldExpense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    
    const amountDifference = amount - oldExpense.amount;
    
    // Update the expense
    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      { name, amount },
      { new: true }
    );
    
    // Update register total expenses with the difference
    await updateRegister(oldExpense.registerSession);


    res.json(updatedExpense);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete expense
router.delete('/delete-expense/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the expense to subtract its amount from register
    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ message: 'Expense not found' });
    }
    await Register.findOneAndUpdate(
      { isOpen: true, sessionId: expense.registerSession },
      { $pull: { expenses: expense._id } }
    );
    // Delete the expense
    await Expense.findByIdAndDelete(id);
    
  await updateRegister(req.body.registerSession);
    
    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Register Sessions
// Get all register sessions with optional date filtering and manager filtering
router.get('/register/sessions', async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const account = await Account.findById(userId);
    const employee = await Employees.findOne({ accountRef: userId });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    const managerId = employee._id;

    const { startDate, endDate } = req.query;
    
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
    if (!account.isAdmin) {
      // If not admin, filter by manager
      filter.managerRef = managerId;
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
router.get('/register/sessions/:id', async (req, res) => {
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

module.exports = router;