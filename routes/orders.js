const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Register = require('../models/Register');
const Employee = require('../models/Employees');
const { default: mongoose } = require('mongoose');
const authenticate = require('../middleware/authenticate');
const hasAccess = require('../middleware/hasAccess');
const updateRegister = require('../utils/updateRegister');
const Account = require('../models/Account');

router.use(authenticate);

// Get all orders
router.get('/', hasAccess('isManager'), async (req, res) => {
  const userId = req.user?.userId;
  const { access } = req.user;

  try {
    let orders = [];

    // If Admin or has access to all orders
    if (access.isAdmin || access.canViewOrders) {
      orders = await Order.find()
        .sort({ createdAt: -1 })
        .populate({ path: 'items.product', select: 'name' })
        .populate({ path: 'items.category', select: 'name' });
    } else {
      // Get all registers managed by the current user
      const employee = await Account.findById(userId).populate('employeeRef');

      const registers = await Register.find({ managerRef: employee.employeeRef._id });

      const sessionIds = registers.map(r => r.sessionId);

      // Get orders that belong to those sessions
      orders = await Order.find({ registerSession: { $in: sessionIds } })
        .sort({ createdAt: -1 })
        .populate({ path: 'items.product', select: 'name' })
        .populate({ path: 'items.category', select: 'name' });
    }

    // Attach register session manager info
    const ordersWithSessions = await Promise.all(
      orders.map(async (order) => {
        const orderObj = order.toObject();

        if (orderObj.registerSession) {
          try {
            const session = await Register.findOne({ sessionId: orderObj.registerSession });
            if (session && session.managerRef) {
              orderObj.registerSession = { manager: session.managerRef };
            }
          } catch (err) {
            console.log(`Could not find session ${orderObj.registerSession}:`, err.message);
          }
        }

        return orderObj;
      })
    );

    res.json(ordersWithSessions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// Get all orders for a specific register session
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const orders = await Order.find({ registerSession: sessionId })
      .sort({ createdAt: -1 }) // Most recent first
      .populate({path:'items.product',select:'name'})
      .populate({path:'items.category',select:'name'});
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

// Create new order - Updated to handle both old and new data formats
router.post('/', async (req, res) => {
  const session = await mongoose.startSession();
  const cashierId = req.user?.userId;
  const {orderData} = req.body;
  if (!cashierId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const acc = await Account.findById(cashierId).session(session);

    const finalOrderData = {
      ...orderData,
      cashier: cashierId,
      branchCode: acc.branchCode
    };
    session.startTransaction();
    const order = new Order(finalOrderData);
    const newOrder = await order.save({ session });

    // Update register with new order
    const updated = await Register.findOneAndUpdate(
      { isOpen: true, sessionId: orderData.registerSession },
      { $push: { orders: newOrder._id } },
      { session }
    );

    if (!updated) {
      throw new Error("Register not found or closed");
    }

    // Update register total sales (make sure this function uses the session internally!)
    await updateRegister(orderData.registerSession, session);

    await session.commitTransaction();

    // Populate after committing (not needed in transaction)
    await newOrder.populate({ path: 'items.product', select: 'name' });
    await newOrder.populate({ path: 'items.category', select: 'name' });

    res.status(201).json(newOrder);
  } catch (error) {
    await session.abortTransaction();
    console.error('Order creation error:', error);
    res.status(400).json({ message: error.message });
  } finally {
    session.endSession();
  }
});

// Get daily sales statistics
router.get('/daily-sales/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.user;
    console.log("Session ID:", sessionId);
    console.log("User ID:", userId);
    const startCash = await Register.findOne({ sessionId }).select('startCash');
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
    dailyStats.startCash = startCash ? startCash.startCash : 0;
    res.json(dailyStats);
  } catch (error) {
    console.error('Error fetching daily sales:', error);
    res.status(500).json({ message: error.message });
  }
});

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

    // Calculate new payment values
    let newAmountPaid = order.amountPaid + amountReceived;

    // Cap at final price
    if (newAmountPaid >= order.finalPrice) {
      newAmountPaid = order.finalPrice;
    }

    const newOutstandingPayment = Math.max(0, order.finalPrice - newAmountPaid);
    const newPaymentStatus = newOutstandingPayment <= 0 ? 'paid' : 'pending';

    // Update the order
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      {
        amountPaid: newAmountPaid,
        outstandingPayment: newOutstandingPayment,
        paymentStatus: newPaymentStatus
      },
      { new: true }
    )
      .populate({ path: 'items.product', select: 'name' })
      .populate({ path: 'items.category', select: 'name' });

    // Update register total sales
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


// Delete order
router.delete('/delete/:id',hasAccess("canDeleteOrder"), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      throw new Error('Order not found');
    }
    session.startTransaction();

    // Update register total sales with only the amount actually paid
            await Register.findOneAndUpdate(
              { isOpen: true, sessionId: order.registerSession },
              { $pull: { orders: order._id }},
              {session}
            );  
    await updateRegister(order.registerSession,session);

    await Order.findByIdAndDelete(req.params.id,{session})
    await session.commitTransaction()
    res.json({ message: 'Order deleted',id:req.params.id });
  } catch (error) {
        await session.abortTransaction();
        console.log(error)
    res.status(500).json({ message: error.message});
  }finally{
    session.endSession()
  }
});

module.exports = router;