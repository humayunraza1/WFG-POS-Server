const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Expense = require('../models/Expense');
const Register = require('../models/Register');
const Report = require('../models/Report');
const authenticate = require('../middleware/authenticate');
const hasAccess = require('../middleware/hasAccess');

router.use(authenticate);
// // Get report
// router.get('/:period', async (req, res) => {
//   try {
//     const { start, end } = getDateRange(req.params.period);
    
//     // Get orders
//     const orders = await Order.find({
//       dateOrdered: { $gte: start, $lte: end }
//     }).populate('items.product');

//     // Get expenses
//     const expenses = await Expense.find({
//       dateAdded: { $gte: start, $lte: end }
//     });

//     // Calculate totals
//     const totalSales = orders.reduce((sum, order) => sum + order.finalPrice, 0);
//     const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
//     const netProfit = totalSales - totalExpenses;

//     // Calculate payment type distribution
//     const paymentTypes = orders.reduce((acc, order) => {
//       acc[order.paymentType] = (acc[order.paymentType] || 0) + order.finalPrice;
//       return acc;
//     }, {});

//     res.json({
//       period: req.params.period,
//       dateRange: { start, end },
//       totalOrders: orders.length,
//       totalSales,
//       totalExpenses,
//       netProfit,
//       paymentTypes,
//       orders,
//       expenses
//     });
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// Add this to your register.js routes file

// Generate comprehensive report for date range
router.get('/create-report',hasAccess("canGenReport"), async (req, res) => {
  try {
    let { startDate, endDate } = req.query;
    
    // Set default date range if not provided (last 30 days)
    if (!startDate || !endDate) {
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(now.getDate() - 30);
      
      // Use the actual Date objects instead of converting to strings
      startDate = thirtyDaysAgo;
      endDate = now;
    }

    // Parse dates and ensure end date includes the full day
    const start = startDate instanceof Date ? startDate : new Date(startDate);
    const end = endDate instanceof Date ? endDate : new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include entire end day
    
    // Validate dates
    if (start > end) {
      return res.status(400).json({ message: 'Start date must be before end date' });
    }

    // Find all register sessions within the date range
    const sessions = await Register.find({
      openedAt: {
        $gte: start,
        $lte: end
      }
    }).populate({
      path: 'orders expenses'
    });

    if (sessions.length === 0) {
      return res.json({
        dateRange: { startDate, endDate },
        totalSessions: 0,
        totalSales: 0,
        totalExpenses: 0,
        totalCashReceived: 0,
        totalOnlinePayments: 0,
        expectedCash: 0,
        expectedOnline: 0,
        totalOutstanding: 0,
        salesByManager: {},
        sessions: [],
        orders: [],
        expenses: []
      });
    }

    // Get session IDs for aggregation queries
    const sessionIds = sessions.map(session => session.sessionId);

    // Aggregate all orders within the date range
    const orderStats = await Order.aggregate([
      {
        $match: {
          registerSession: { $in: sessionIds },
          dateOrdered: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$finalPrice' },
          totalCashReceived: {
            $sum: {
              $cond: [
                { $eq: ['$paymentType', 'cash'] },
                '$amountPaid',
                0
              ]
            }
          },
          totalOnlinePayments: {
            $sum: {
              $cond: [
                { $eq: ['$paymentType', 'online'] },
                '$amountPaid',
                0
              ]
            }
          },
          expectedCash: {
            $sum: {
              $cond: [
                { $eq: ['$paymentType', 'cash'] },
                '$finalPrice',
                0
              ]
            }
          },
          expectedOnline: {
            $sum: {
              $cond: [
                { $eq: ['$paymentType', 'online'] },
                '$finalPrice',
                0
              ]
            }
          },
          totalOutstanding: { $sum: '$outstandingPayment' },
          totalOrders: { $sum: 1 }
        }
      }
    ]);

    // Aggregate expenses within the date range
    const expenseStats = await Expense.aggregate([
      {
        $match: {
          registerSession: { $in: sessionIds },
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$amount' },
          totalExpenseItems: { $sum: 1 }
        }
      }
    ]);

    // Get sales by manager
    const salesByManager = {};
    for (const session of sessions) {
      const sessionOrders = await Order.find({
        registerSession: session.sessionId,
        dateOrdered: { $gte: start, $lte: end }
      });
      
      const managerSales = sessionOrders.reduce((sum, order) => sum + order.finalPrice, 0);
      const managerCashReceived = sessionOrders
        .filter(order => order.paymentType === 'cash')
        .reduce((sum, order) => sum + order.amountPaid, 0);
      const managerOnlineReceived = sessionOrders
        .filter(order => order.paymentType === 'online')
        .reduce((sum, order) => sum + order.amountPaid, 0);

      if (!salesByManager[session.manager]) {
        salesByManager[session.manager] = {
          totalSales: 0,
          cashReceived: 0,
          onlineReceived: 0,
          sessions: 0,
          orders: 0
        };
      }
      
      salesByManager[session.manager].totalSales += managerSales;
      salesByManager[session.manager].cashReceived += managerCashReceived;
      salesByManager[session.manager].onlineReceived += managerOnlineReceived;
      salesByManager[session.manager].sessions += 1;
      salesByManager[session.manager].orders += sessionOrders.length;
    }

    // Get all detailed orders and expenses for the report
    const allOrders = await Order.find({
      registerSession: { $in: sessionIds },
      dateOrdered: { $gte: start, $lte: end }
    })
    .populate('items.product')
    .populate('items.category')
    .sort({ dateOrdered: -1 });

    const allExpenses = await Expense.find({
      registerSession: { $in: sessionIds },
      createdAt: { $gte: start, $lte: end }
    }).sort({ createdAt: -1 });

    // Generate product summary from all orders
    const productSummary = {};
    
    for (const order of allOrders) {
      for (const item of order.items) {
        const productId = item.product._id.toString();
        const variantId = item.variant._id.toString();
        const productName = item.product.name;
        const variantName = item.variant.name;
        const variantPrice = item.variant.price;
        
        // Create unique key for product-variant combination
        const productVariantKey = `${productId}-${variantId}`;
        
        if (!productSummary[productVariantKey]) {
          productSummary[productVariantKey] = {
            productId: productId,
            variantId: variantId,
            productName: productName,
            variantName: variantName,
            price: variantPrice,
            quantitySold: 0,
            totalRevenue: 0
          };
        }
        
        productSummary[productVariantKey].quantitySold += item.quantity;
        productSummary[productVariantKey].totalRevenue += (item.quantity * variantPrice);
      }
    }
    
    // Convert to array and sort by quantity sold (descending)
    const productSummaryArray = Object.values(productSummary)
      .sort((a, b) => b.quantitySold - a.quantitySold);

    // Prepare response data
    const orderData = orderStats[0] || {
      totalSales: 0,
      totalCashReceived: 0,
      totalOnlinePayments: 0,
      expectedCash: 0,
      expectedOnline: 0,
      totalOutstanding: 0,
      totalOrders: 0
    };

    const expenseData = expenseStats[0] || {
      totalExpenses: 0,
      totalExpenseItems: 0
    };

    // Calculate net cash flow
    const netCashFlow = orderData.totalCashReceived - expenseData.totalExpenses;

    const reportData = {
      startDate: start,
      endDate: end,
      dateRange: { 
        startDate: start.toISOString().split('T')[0], 
        endDate: end.toISOString().split('T')[0] 
      },
      summary: {
        totalSessions: sessions.length,
        totalOrders: orderData.totalOrders,
        totalExpenseItems: expenseData.totalExpenseItems,
        totalSales: orderData.totalSales,
        totalExpenses: expenseData.totalExpenses,
        netRevenue: orderData.totalSales - expenseData.totalExpenses,
        totalCashReceived: orderData.totalCashReceived,
        totalOnlinePayments: orderData.totalOnlinePayments,
        expectedCash: orderData.expectedCash,
        expectedOnline: orderData.expectedOnline,
        totalOutstanding: orderData.totalOutstanding,
        netCashFlow: netCashFlow
      },
      salesByManager,
      productSummary: productSummaryArray,
      sessions: sessions.map(session => ({
        sessionId: session.sessionId,
        manager: session.manager,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        startCash: session.startCash,
        closingBalance: session.closingBalance,
        expectedBalance: session.expectedBalance,
        totalSales: session.totalSales,
        totalExpenses: session.totalExpenses,
        isOpen: session.isOpen
      })),
      orders: allOrders.map(order => order._id),
      expenses: allExpenses.map(expense => expense._id)
    };

    // Save report to database
    const savedReport = await Report.create(reportData);

    // Return the report ID for retrieval
    res.json({
      success: true,
      reportId: savedReport._id,
      message: 'Report generated successfully',
      reportUrl: `/report/${savedReport._id}`
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get saved report by ID
router.get('/get-report/:id',hasAccess("canGenReport"), async (req, res) => {
  try {
    const { id } = req.params;
    
    const report = await Report.findById(id)
      .populate({
        path: 'orders',
        populate: {
          path: 'items.product items.category',
          select: 'name price'
        }
      })
      .populate('expenses');

    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.json(report);
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ message: error.message });
  }
});


router.get('/',hasAccess("canGenReport"), async (req, res) => {
  try {
    const reports = await Report.find({}, {
      _id: 1,
      startDate: 1,
      endDate: 1,
      createdAt: 1
    }).sort({ createdAt: -1 }); // Most recent first

    res.json(reports);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 