const express = require('express');
const router = express.Router();
const Register = require('../models/Register');
const Order = require('../models/Order');
const Expense = require('../models/Expense');
const Employee = require('../models/Employees');
const { v4: uuidv4 } = require('uuid');
const authenticate = require('../middleware/authenticate');
const Account = require('../models/Account');
const { sendDailySummaryEmail } = require('../services/emailService');

router.use(authenticate);

function getItemCategoryName(item) {
  return item.categoryName || item.category?.name || 'Uncategorized';
}

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
      throw new Error('Unauthorized: cashier ID missing');
    }

    const existingRegister = await Register.findOne({ isOpen: true, cashier: cashierId });
    if (existingRegister) {
      throw new Error('You already have an open register' );
    }

    const { startCash, managerId } = req.body;

    if (startCash === undefined || startCash < 0) {
      throw new Error ('Starting cash amount is required and must be positive' );
    }

    if (!managerId) {
       throw new Error ('Manager ID is required');
    }

    // Validate manager by ID
    const manager = await Employee.findOne({ _id: managerId, role: 'manager' });
    const managerAcc = await Account.findOne({employeeRef:managerId})
    if (!manager) {
      throw new Error("Manager Acc not found")
    }

    const register = new Register({
      sessionId: uuidv4(),
      isOpen: true,
      openedAt: new Date(),
      startCash,
      branchCode:managerAcc.branchCode,
      openingBalance: startCash,
      manager: manager.name,
      managerRef: managerAcc._id,
      cashier: cashierId,
      expenses: [],
      orders: [],
      lastActivity: new Date()
    });

    const newRegister = await register.save();
    res.status(201).json(newRegister);
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: error.message });
  }
});


// Close register
// Close register
router.post('/close', async (req, res) => {
  try {
    const cashierId = req.user?.userId;

    // ---- Fetch register with nested population ----
    const register = await Register.findOne({ isOpen: true, cashier: cashierId })
      .populate({
        path: 'orders',
        populate: [
          {
            path: 'items.product',
            select: 'name'
          },
          {
            path: 'items.category',
            select: 'name isPartnership partnershipBusinessName partnershipSharePercent'
          }
        ]
      })
      .populate('expenses');

    if (!register) {
      return res.status(400).json({ message: 'Register is not open' });
    }

    const { finalCash } = req.body;
    if (finalCash === undefined || finalCash < 0) {
      return res.status(400).json({ message: 'Final cash amount is required and must be positive' });
    }

    // ---- Compute all totals ----
    const cashOrders = register.orders.filter(order => order.paymentType === 'cash');
    const onlineOrders = register.orders.filter(order => order.paymentType === 'online');
    const cardOrders = register.orders.filter(order => order.paymentType === 'card');

    const cashRecvd = cashOrders.reduce((sum, order) => sum + (order.amountPaid || 0), 0);
    const expectedCash = cashOrders.reduce((sum, order) => sum + (order.finalPrice || 0), 0);

    const onlineRecvd = onlineOrders.reduce((sum, order) => sum + (order.amountPaid || 0), 0);
    const expectedOnline = onlineOrders.reduce((sum, order) => sum + (order.finalPrice || 0), 0);
    const cardRecvd = cardOrders.reduce((sum, order) => sum + (order.amountPaid || 0), 0);
    const expectedCard = cardOrders.reduce((sum, order) => sum + (order.finalPrice || 0), 0);

    const totalSales = register.orders.reduce((sum, order) => sum + (order.finalPrice || 0), 0);
    const totalExpenses = register.expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
    const expectedBalance = register.startCash + expectedCash - totalExpenses;

    // ---- Update register fields ----
    register.isOpen = false;
    register.closedAt = new Date();
    register.closingBalance = finalCash;
    register.expectedBalance = expectedBalance;
    register.totalSales = totalSales;
    register.totalExpenses = totalExpenses;
    register.expectedCash = expectedCash;
    register.expectedOnline = expectedOnline;
    register.expectedCard = expectedCard;
    register.cashRecvd = cashRecvd;
    register.onlineRecvd = onlineRecvd;
    register.cardRecvd = cardRecvd;

    const closedRegister = await register.save();

    // ---- Fetch cashier + business preferences ----
    const cashierAccount = await Account.findById(cashierId).populate('businessRef');
    const business = cashierAccount?.businessRef;

    // ---- Prepare summary ----
    let summary = null;

    if (business?.preferences?.sendDaySummaryReport) {
      try {
        const itemSummaryMap = {};
        const categorySummaryMap = {};
        let absoluteTotal = 0;

        (register.orders || []).forEach(order => {
          (order.items || []).forEach(item => {
            const productName = item.product?.name || 'Unknown Product';
            const optionName = item.optionName ? ` - ${item.optionName}` : '';
            const name = `${productName}${optionName}`;
            const categoryName = getItemCategoryName(item);

            // ---- Per-item aggregation (also track category) ----
            if (!itemSummaryMap[name]) {
              itemSummaryMap[name] = { totalCount: 0, totalRevenue: 0, category: categoryName };
            }
            // If the item name appears under multiple categories (rare), prefer the first seen
            if (!itemSummaryMap[name].category) itemSummaryMap[name].category = categoryName;
            itemSummaryMap[name].totalCount += (item.quantity || 0);
            itemSummaryMap[name].totalRevenue += (item.totalPrice || 0);

            // ---- Per-category aggregation ----
            if (!categorySummaryMap[categoryName]) {
              categorySummaryMap[categoryName] = { totalCount: 0, totalRevenue: 0 };
            }
            categorySummaryMap[categoryName].totalCount += (item.quantity || 0);
            categorySummaryMap[categoryName].totalRevenue += (item.totalPrice || 0);

            absoluteTotal += (item.totalPrice || 0);
          });
        });

        const itemSummaryArray = Object.entries(itemSummaryMap).map(([name, data]) => ({
          name,
          category: data.category || 'Uncategorized',
          totalCount: data.totalCount,
          totalRevenue: data.totalRevenue,
        }));

        const categorySummaryArray = Object.entries(categorySummaryMap).map(([category, data]) => ({
          category,
          totalCount: data.totalCount,
          totalRevenue: data.totalRevenue,
        }));

        const totalDiscount = register.totalDiscount || 0;
        const finalAmountSold = absoluteTotal - totalDiscount;

        // ---- Tax totals ----
        const taxCollectedCash = cashOrders.reduce((sum, o) => sum + (o.tax || 0), 0);
        const taxCollectedCard = cardOrders.reduce((sum, o) => sum + (o.tax || 0), 0);
        const totalTaxCollected = taxCollectedCash + taxCollectedCard;

        // ---- Order counts ----
        const totalOrders = register.orders.length;
        const cashOrderCount = cashOrders.length;
        const onlineOrderCount = onlineOrders.length;
        const cardOrderCount = cardOrders.length;

        summary = {
          itemSummary: itemSummaryArray,
          categorySummary: categorySummaryArray,
          absoluteTotal,
          totalDiscount,
          finalAmountSold,
          cashRecvd,
          onlineRecvd,
          cardRecvd,
          digitalRecvd: onlineRecvd + cardRecvd,
          expectedCash,
          expectedOnline,
          expectedCard,
          expectedDigital: expectedOnline + expectedCard,
          taxCollectedCash,
          taxCollectedCard,
          totalTaxCollected,
          totalOrders,
          cashOrderCount,
          onlineOrderCount,
          cardOrderCount,
          totalExpenses,
          closingBalance: finalCash,
          startCash: register.startCash,
          openedAt: register.openedAt,
          closedAt: new Date(),
          manager: register.manager,
        };

        // ---- Send daily summary email ----
        await sendDailySummaryEmail(business, summary);
      } catch (summaryErr) {
        console.error('Error creating/sending daily summary:', summaryErr);
      }
    }

    // ---- Final response ----
    return res.json({
      message: 'Register closed successfully',
      register: closedRegister,
      summary
    });

  } catch (error) {
    console.error('Error closing register:', error);
    return res.status(400).json({ message: error.message });
  }
});

// Live summary for open register (used by client to show live counts)
router.get('/live-summary', async (req, res) => {
  try {
    const cashierId = req.user?.userId;
    const { sessionId } = req.query;

    // If sessionId provided, prefer that register, otherwise use active open register for cashier
    const query = sessionId ? { sessionId } : { isOpen: true, cashier: cashierId };

    const register = await Register.findOne(query)
      .populate({
        path: 'orders',
        populate: [
          {
            path: 'items.product',
            select: 'name'
          },
          {
            path: 'items.category',
            select: 'name isPartnership partnershipBusinessName partnershipSharePercent'
          }
        ]
      })
      .populate('expenses');

    if (!register) {
      return res.status(400).json({ message: 'Register not found or not open' });
    }

    // ---- Compute aggregates (same as close but without mutating register) ----
    const cashOrders = (register.orders || []).filter(order => order.paymentType === 'cash');
    const onlineOrders = (register.orders || []).filter(order => order.paymentType === 'online');
    const cardOrders = (register.orders || []).filter(order => order.paymentType === 'card');

    const cashRecvd = cashOrders.reduce((sum, order) => sum + (order.amountPaid || 0), 0);
    const expectedCash = cashOrders.reduce((sum, order) => sum + (order.finalPrice || 0), 0);

    const onlineRecvd = onlineOrders.reduce((sum, order) => sum + (order.amountPaid || 0), 0);
    const expectedOnline = onlineOrders.reduce((sum, order) => sum + (order.finalPrice || 0), 0);
    const cardRecvd = cardOrders.reduce((sum, order) => sum + (order.amountPaid || 0), 0);
    const expectedCard = cardOrders.reduce((sum, order) => sum + (order.finalPrice || 0), 0);

    const totalSales = (register.orders || []).reduce((sum, order) => sum + (order.finalPrice || 0), 0);
    const totalExpenses = (register.expenses || []).reduce((sum, expense) => sum + (expense.amount || 0), 0);

    // Build per-item and per-category summaries
    const itemSummaryMap = {};
    const categorySummaryMap = {};
    let absoluteTotal = 0;

    (register.orders || []).forEach(order => {
      (order.items || []).forEach(item => {
        const productName = item.product?.name || 'Unknown Product';
        const optionName = item.optionName ? ` - ${item.optionName}` : '';
        const name = `${productName}${optionName}`;
        const categoryName = getItemCategoryName(item);

        if (!itemSummaryMap[name]) {
          itemSummaryMap[name] = { totalCount: 0, totalRevenue: 0, category: categoryName };
        }
        if (!itemSummaryMap[name].category) itemSummaryMap[name].category = categoryName;
        itemSummaryMap[name].totalCount += (item.quantity || 0);
        itemSummaryMap[name].totalRevenue += (item.totalPrice || 0);

        if (!categorySummaryMap[categoryName]) {
          categorySummaryMap[categoryName] = { totalCount: 0, totalRevenue: 0 };
        }
        categorySummaryMap[categoryName].totalCount += (item.quantity || 0);
        categorySummaryMap[categoryName].totalRevenue += (item.totalPrice || 0);

        absoluteTotal += (item.totalPrice || 0);
      });
    });

    const itemSummaryArray = Object.entries(itemSummaryMap).map(([name, data]) => ({
      name,
      category: data.category || 'Uncategorized',
      totalCount: data.totalCount,
      totalRevenue: data.totalRevenue,
    }));

    const categorySummaryArray = Object.entries(categorySummaryMap).map(([category, data]) => ({
      category,
      totalCount: data.totalCount,
      totalRevenue: data.totalRevenue,
    }));

    const totalDiscount = register.totalDiscount || 0;
    const finalAmountSold = absoluteTotal - totalDiscount;

    const summary = {
      itemSummary: itemSummaryArray,
      categorySummary: categorySummaryArray,
      absoluteTotal,
      totalDiscount,
      finalAmountSold,
      cashRecvd,
      onlineRecvd,
      cardRecvd,
      digitalRecvd: onlineRecvd + cardRecvd,
      expectedCash,
      expectedOnline,
      expectedCard,
      expectedDigital: expectedOnline + expectedCard,
      totalExpenses,
      // include a few register meta fields for client convenience
      sessionId: register.sessionId,
      openedAt: register.openedAt,
      startCash: register.startCash,
      manager: register.manager,
    };

    return res.json({ summary, register: { _id: register._id, sessionId: register.sessionId, isOpen: register.isOpen } });
  } catch (error) {
    console.error('Error fetching live summary:', error);
    return res.status(400).json({ message: error.message });
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