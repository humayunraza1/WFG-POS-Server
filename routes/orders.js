const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Register = require('../models/Register');
const { default: mongoose } = require('mongoose');
const authenticate = require('../middleware/authenticate');
const hasAccess = require('../middleware/hasAccess');
const updateRegister = require('../utils/updateRegister');

router.use(authenticate);
// Get all orders
// Update the GET all orders route in orders.js to manually fetch and include register session data
router.get('/', async (req, res) => {
  const cashierId = req.user?.userId;
  try {
    const orders = await Order.find({ cashier: cashierId })
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

// Get all orders for a specific register session
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const orders = await Order.find({ registerSession: sessionId })
      .sort({ createdAt: -1 }) // Most recent first
      .populate('items.product')
      .populate('items.variant');
    res.json(orders);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// Get daily order count
router.get('/daily-count', async (req, res) => {
  try {
    const cashierId = req.user?.userId;
    const register = await Register.findOne({ isOpen: true, cashier: cashierId });
    if (!register) {
      return res.status(400).json({ message: 'Register is not open' });
    }

    const orders = await Order.countDocuments({
      dateOrdered: {
        $gte: register.openedAt
      }
    });
    res.json({ count: orders });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Also update the existing POST route to handle initial payment
// Replace the existing POST route with this updated version:
router.post('/', async (req, res) => {
  console.log(req.body);
  const casherId = req.user?.userId;
  if (!casherId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const { amountPaid = 0 } = req.body; // Add amountPaid to request body
  
  const order = new Order({
    registerSession: req.body.registerSession,
    cashier: casherId, // Use the authenticated user's ID
    actualPrice: req.body.subtotal, // Calculate actual price
    items: req.body.items,
    discount: req.body.discount,
    paymentType: req.body.paymentType,
    finalPrice: req.body.finalPrice,
    amountPaid: amountPaid
  });

  try {
    const newOrder = await order.save();
    
    // Populate the product and variant data before sending response
    await newOrder.populate('items.product');
    await newOrder.populate('items.variant');
        await Register.findOneAndUpdate(
          { isOpen: true, sessionId: req.body.registerSession },
          { $push: { orders: newOrder._id }}
        );  
    // Update register total sales with only the amount actually paid
    await updateRegister(req.body.registerSession);


    res.status(201).json(newOrder);
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message });
  }
});


// Update the daily sales route to only count actual payments received
router.get('/daily-sales/:sessionId',hasAccess("isCashier"), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {userId} = req.user;
    console.log("Session ID:", sessionId);
    console.log("User ID:", userId);
    const result = await Order.aggregate([
  {
    $match: {
      registerSession: sessionId
    }
  },
  {
    $group: {
      _id: null,
      cashRecvd: {
        $sum: {
          $cond: [
            { $eq: ['$paymentType', 'cash'] },
            '$amountPaid',
            0
          ]
        }
      },
      onlinePaymnt: {
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
      totalSales: { $sum: '$finalPrice' },
      totalPendingPayment: { $sum: '$outstandingPayment' },
      orderCount: { $sum: 1 }
    }
  }
]);
    const dailyStats = result[0] || {
      cashRecvd: 0,
      onlinePaymnt: 0,
      expectedCash: 0,
      expectedOnline: 0,
      totalSales: 0, 
      totalPendingPayment: 0,
      orderCount: 0 
    };
    res.json(dailyStats);
  } catch (error) {
    console.error('Error fetching daily sales:', error);
    res.status(500).json({ message: error.message });
  }
});


  // Update payment for an order - PATCH route
  router.patch('/:id/payment', async (req, res) => {
    try {
      const cashierId = req.user?.userId;
      const { id } = req.params;
      const { amountReceived } = req.body;

      // Validate input
      if (!amountReceived || amountReceived <= 0) {
        return res.status(400).json({ message: 'Amount received must be greater than 0' });
      }

      // Find the order
      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Check if payment amount is valid
      if (amountReceived > order.outstandingPayment) {
        return res.status(400).json({ 
          message: `Amount cannot exceed outstanding payment of PKR ${order.outstandingPayment}` 
        });
      }

      // Update the payment
      const newAmountPaid = order.amountPaid + amountReceived;
      const newOutstandingPayment = order.finalPrice - newAmountPaid;
      const newPaymentStatus = newOutstandingPayment <= 0 ? 'paid' : 'pending';

      // Update the order
      const updatedOrder = await Order.findByIdAndUpdate(
        id,
        {
          amountPaid: newAmountPaid,
          outstandingPayment: Math.max(0, newOutstandingPayment),
          paymentStatus: newPaymentStatus
        },
        { new: true }
      ).populate('items.product').populate('items.variant');
    // Update register total sales with only the amount actually paid
      await updateRegister(order.registerSession);

      res.json({
        success: true,
        order: updatedOrder,
        message: `Payment of PKR ${amountReceived} recorded successfully`
      });

    } catch (error) {
      console.error('Payment update error:', error);
      res.status(500).json({ message: error.message });
    }
});

module.exports = router; 