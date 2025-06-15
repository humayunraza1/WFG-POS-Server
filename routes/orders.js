const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const {Register} = require('../models/Register');
const { default: mongoose } = require('mongoose');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);
// Get all orders
// Update the GET all orders route in orders.js to manually fetch and include register session data
router.get('/', async (req, res) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 }) // Most recent first
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
    const register = await Register.findOne({ isOpen: true });
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
  
  const { amountPaid = 0 } = req.body; // Add amountPaid to request body
  
  const order = new Order({
    registerSession: req.body.registerSession,
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
    
    // Update register total sales with only the amount actually paid
    await Register.findOneAndUpdate(
      { isOpen: true },
      { $inc: { totalSales: amountPaid } }
    );

    res.status(201).json(newOrder);
  } catch (error) {
    console.log(error);
    res.status(400).json({ message: error.message });
  }
});


// Update the daily sales route to only count actual payments received
router.get('/daily-sales/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const result = await Order.aggregate([
      {
        $match: {
          registerSession: sessionId
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$amountPaid' }, // Changed from finalPrice to amountPaid
          totalPendingPayment: { $sum: '$outstandingPayment' }, // Add pending payment
          orderCount: { $sum: 1 }
        }
      }
    ]);

    const dailyStats = result[0] || { 
      totalSales: 0, 
      totalPendingPayment: 0,
      orderCount: 0 
    };
    res.json(dailyStats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Delete order
router.delete('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    // Update register total sales
    await Register.findOneAndUpdate(
      { isOpen: true },
      { $inc: { totalSales: -order.finalPrice } }
    );

    await order.deleteOne();
    res.json({ message: 'Order deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Summary & Analytics
// Get summary data with filters - FIXED VERSION
router.get('/summary', async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    // Build date filter based on period
    switch (period) {
      case 'today':
        dateFilter = {
          dateOrdered: {
            $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
          }
        };
        break;
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        dateFilter = { dateOrdered: { $gte: weekStart } };
        break;
      case 'monthly':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = { dateOrdered: { $gte: monthStart } };
        break;
      case 'quarterly':
        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        dateFilter = { dateOrdered: { $gte: quarterStart } };
        break;
      case 'yearly':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        dateFilter = { dateOrdered: { $gte: yearStart } };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            dateOrdered: {
              $gte: new Date(startDate),
              $lte: new Date(endDate)
            }
          };
        }
        break;
      default: // 'all'
        dateFilter = {};
    }

    // Get summary statistics
    const summaryData = await Order.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$finalPrice' },
          totalOrders: { $sum: 1 },
          totalItems: { 
            $sum: { 
              $reduce: {
                input: '$items',
                initialValue: 0,
                in: { $add: ['$$value', '$$this.quantity'] }
              }
            }
          },
          avgOrderValue: { $avg: '$finalPrice' }
        }
      }
    ]);

    // Get recent orders
    const recentOrders = await Order.find(dateFilter)
      .sort({ dateOrdered: -1 })
      .limit(50)
      .populate('items.product')
      .populate('items.variant');

    // Calculate daily average if not 'all' period
    let dailyAverage = 0;
    if (period !== 'all' && summaryData.length > 0) {
      const daysDiff = period === 'today' ? 1 : Math.ceil((now - new Date(startDate || getStartDateByPeriod(period))) / (1000 * 60 * 60 * 24));
      dailyAverage = summaryData[0].totalSales / Math.max(daysDiff, 1);
    }

    const result = summaryData.length > 0 ? {
      ...summaryData[0],
      dailyAverage: Math.round(dailyAverage),
      recentOrders
    } : {
      totalSales: 0,
      totalOrders: 0,
      totalItems: 0,
      avgOrderValue: 0,
      dailyAverage: 0,
      recentOrders: []
    };

    res.json(result);
  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ message: error.message });
  }
});

// REPLACE the top-products route in orders.js with this:
router.get('/analytics/top-products', async (req, res) => {
  try {
    const { period, startDate, endDate, sessionId, limit = 10 } = req.query;
    
    let matchFilter = {};
    
    // Add date/session filters
    if (sessionId) {
      matchFilter.registerSession = sessionId;
    } else {
      matchFilter = buildDateFilter(period, startDate, endDate);
    }

    const topProducts = await Order.aggregate([
      { $match: matchFilter },
      // First, calculate the number of items per order for proper revenue distribution
      {
        $addFields: {
          totalItemsInOrder: {
            $reduce: {
              input: '$items',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.quantity'] }
            }
          }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          totalQuantity: { $sum: '$items.quantity' },
          // Calculate revenue based on item proportion of the order
          totalRevenue: { 
            $sum: { 
              $multiply: [
                '$finalPrice',
                { $divide: ['$items.quantity', '$totalItemsInOrder'] }
              ]
            }
          },
          orderCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$product' },
      {
        $project: {
          name: '$product.name',
          image: '$product.image', // Include product image
          totalQuantity: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          orderCount: 1
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json(topProducts);
  } catch (error) {
    console.error('Error fetching top products:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get top selling variants - FIXED VERSION
router.get('/analytics/top-variants', async (req, res) => {
  try {
    const { period, startDate, endDate, sessionId, limit = 10 } = req.query;
    
    let matchFilter = {};
    
    if (sessionId) {
      matchFilter.registerSession = sessionId;
    } else {
      matchFilter = buildDateFilter(period, startDate, endDate);
    }

    const topVariants = await Order.aggregate([
      { $match: matchFilter },
      // First, calculate the number of items per order for proper revenue distribution
      {
        $addFields: {
          totalItemsInOrder: {
            $reduce: {
              input: '$items',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.quantity'] }
            }
          }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.variant',
          productId: { $first: '$items.product' },
          totalQuantity: { $sum: '$items.quantity' },
          // Calculate revenue based on item proportion of the order
          totalRevenue: { 
            $sum: { 
              $multiply: [
                '$finalPrice',
                { $divide: ['$items.quantity', '$totalItemsInOrder'] }
              ]
            }
          },
          // Calculate average price per unit
          avgPrice: { 
            $avg: { 
              $multiply: [
                '$finalPrice',
                { $divide: ['$items.quantity', '$totalItemsInOrder'] }
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'variants', // Change this to match your variants collection name
          localField: '_id',
          foreignField: '_id',
          as: 'variant'
        }
      },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: '$variant' },
      { $unwind: '$product' },
      {
        $project: {
          variantName: '$variant.name',
          productName: '$product.name',
          totalQuantity: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          avgPrice: { $round: [{ $divide: ['$totalRevenue', '$totalQuantity'] }, 2] }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json(topVariants);
  } catch (error) {
    console.error('Error fetching top variants:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get product analytics - FIXED VERSION
router.get('/analytics/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { period, startDate, endDate, sessionId } = req.query;
    
    // Convert string to ObjectId properly
    const productObjectId = new mongoose.Types.ObjectId(productId);
    
    let matchFilter = { 'items.product': productObjectId };
    
    if (sessionId) {
      matchFilter.registerSession = sessionId;
    } else {
      Object.assign(matchFilter, buildDateFilter(period, startDate, endDate));
    }

    // Product performance stats
    const productStats = await Order.aggregate([
      { $match: matchFilter },
      // Calculate total items per order first
      {
        $addFields: {
          totalItemsInOrder: {
            $reduce: {
              input: '$items',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.quantity'] }
            }
          }
        }
      },
      { $unwind: '$items' },
      { $match: { 'items.product': productObjectId } },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { 
            $sum: { 
              $multiply: [
                '$finalPrice',
                { $divide: ['$items.quantity', '$totalItemsInOrder'] }
              ]
            }
          },
          orderCount: { $sum: 1 },
          avgOrderValue: { 
            $avg: { 
              $multiply: [
                '$finalPrice',
                { $divide: ['$items.quantity', '$totalItemsInOrder'] }
              ]
            }
          }
        }
      }
    ]);

    // Daily sales data
    const dailySales = await Order.aggregate([
      { $match: matchFilter },
      {
        $addFields: {
          totalItemsInOrder: {
            $reduce: {
              input: '$items',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.quantity'] }
            }
          }
        }
      },
      { $unwind: '$items' },
      { $match: { 'items.product': productObjectId } },
      {
        $group: {
          _id: {
            year: { $year: '$dateOrdered' },
            month: { $month: '$dateOrdered' },
            day: { $dayOfMonth: '$dateOrdered' }
          },
          quantity: { $sum: '$items.quantity' },
          revenue: { 
            $sum: { 
              $multiply: [
                '$finalPrice',
                { $divide: ['$items.quantity', '$totalItemsInOrder'] }
              ]
            }
          }
        }
      },
      {
        $project: {
          date: {
            $cond: {
              if: { $and: [
                { $ne: ['$_id.year', null] },
                { $ne: ['$_id.month', null] },
                { $ne: ['$_id.day', null] }
              ]},
              then: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: '$_id.day'
                }
              },
              else: new Date()
            }
          },
          quantity: { $ifNull: ['$quantity', 0] },
          revenue: { $round: [{ $ifNull: ['$revenue', 0] }, 2] }
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.json({
      stats: productStats[0] || { totalQuantity: 0, totalRevenue: 0, orderCount: 0, avgOrderValue: 0 },
      dailySales
    });
  } catch (error) {
    console.error('Error fetching product analytics:', error);
    res.status(500).json({ message: error.message });
  }
});


// Get variant analytics - FIXED VERSION
router.get('/analytics/variant/:variantId', async (req, res) => {
  try {
    const { variantId } = req.params;
    const { period, startDate, endDate, sessionId } = req.query;
    
    // Convert string to ObjectId properly
    const variantObjectId = new mongoose.Types.ObjectId(variantId);
    
    let matchFilter = { 'items.variant': variantObjectId };
    
    if (sessionId) {
      matchFilter.registerSession = sessionId;
    } else {
      Object.assign(matchFilter, buildDateFilter(period, startDate, endDate));
    }

    const variantStats = await Order.aggregate([
      { $match: matchFilter },
      {
        $addFields: {
          totalItemsInOrder: {
            $reduce: {
              input: '$items',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.quantity'] }
            }
          }
        }
      },
      { $unwind: '$items' },
      { $match: { 'items.variant': variantObjectId } },
      {
        $group: {
          _id: null,
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { 
            $sum: { 
              $multiply: [
                '$finalPrice',
                { $divide: ['$items.quantity', '$totalItemsInOrder'] }
              ]
            }
          },
          avgPrice: { 
            $avg: { 
              $multiply: [
                '$finalPrice',
                { $divide: ['$items.quantity', '$totalItemsInOrder'] }
              ]
            }
          }
        }
      }
    ]);

    const dailySales = await Order.aggregate([
      { $match: matchFilter },
      {
        $addFields: {
          totalItemsInOrder: {
            $reduce: {
              input: '$items',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.quantity'] }
            }
          }
        }
      },
      { $unwind: '$items' },
      { $match: { 'items.variant': variantObjectId } },
      {
        $group: {
          _id: {
            year: { $year: '$dateOrdered' },
            month: { $month: '$dateOrdered' },
            day: { $dayOfMonth: '$dateOrdered' }
          },
          quantity: { $sum: '$items.quantity' },
          revenue: { 
            $sum: { 
              $multiply: [
                '$finalPrice',
                { $divide: ['$items.quantity', '$totalItemsInOrder'] }
              ]
            }
          }
        }
      },
      {
        $project: {
          date: {
            $cond: {
              if: { $and: [
                { $ne: ['$_id.year', null] },
                { $ne: ['$_id.month', null] },
                { $ne: ['$_id.day', null] }
              ]},
              then: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: '$_id.day'
                }
              },
              else: new Date()
            }
          },
          quantity: { $ifNull: ['$quantity', 0] },
          revenue: { $round: [{ $ifNull: ['$revenue', 0] }, 2] }
        }
      },
      { $sort: { date: 1 } }
    ]);

    res.json({
      stats: variantStats[0] || { totalQuantity: 0, totalRevenue: 0, avgPrice: 0 },
      dailySales
    });
  } catch (error) {
    console.error('Error fetching variant analytics:', error);
    res.status(500).json({ message: error.message });
  }
});


// Get chart data for trends - FIXED VERSION
router.get('/analytics/chart', async (req, res) => {
  try {
    const { type, period, metric } = req.query;
    
    let groupBy = {};
    let dateRange = {};
    let sortBy = {};
    const now = new Date();
    
    // Define grouping and date range based on period
    switch (period) {
      case 'daily':
        groupBy = {
          year: { $year: '$dateOrdered' },
          month: { $month: '$dateOrdered' },
          day: { $dayOfMonth: '$dateOrdered' }
        };
        sortBy = { '_id.year': 1, '_id.month': 1, '_id.day': 1 };
        dateRange = { dateOrdered: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } };
        break;
      case 'weekly':
        groupBy = {
          year: { $year: '$dateOrdered' },
          week: { $week: '$dateOrdered' }
        };
        sortBy = { '_id.year': 1, '_id.week': 1 };
        dateRange = { dateOrdered: { $gte: new Date(now.getTime() - 4 * 7 * 24 * 60 * 60 * 1000) } };
        break;
      case 'monthly':
        groupBy = {
          year: { $year: '$dateOrdered' },
          month: { $month: '$dateOrdered' }
        };
        sortBy = { '_id.year': 1, '_id.month': 1 };
        dateRange = { dateOrdered: { $gte: new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000) } };
        break;
      case 'yearly':
        groupBy = { year: { $year: '$dateOrdered' } };
        sortBy = { '_id.year': 1 };
        dateRange = { dateOrdered: { $gte: new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000) } };
        break;
      default:
        // Default to weekly if period is not recognized
        groupBy = {
          year: { $year: '$dateOrdered' },
          week: { $week: '$dateOrdered' }
        };
        sortBy = { '_id.year': 1, '_id.week': 1 };
        dateRange = { dateOrdered: { $gte: new Date(now.getTime() - 4 * 7 * 24 * 60 * 60 * 1000) } };
    }

    // Define what to calculate based on metric
    let calculations = {};
    switch (metric) {
      case 'revenue':
        calculations = { value: { $sum: '$finalPrice' } };
        break;
      case 'orders':
        calculations = { value: { $sum: 1 } };
        break;
      case 'items':
        calculations = { 
          value: { 
            $sum: { 
              $reduce: {
                input: '$items',
                initialValue: 0,
                in: { $add: ['$$value', '$$this.quantity'] }
              }
            }
          }
        };
        break;
      case 'avg_order':
        calculations = { value: { $avg: '$finalPrice' } };
        break;
      default:
        calculations = { value: { $sum: '$finalPrice' } };
    }

    const chartData = await Order.aggregate([
      { $match: dateRange },
      {
        $group: {
          _id: groupBy,
          ...calculations
        }
      },
      {
        $project: {
          period: {
            $switch: {
              branches: [
                {
                  case: { $and: [
                    { $ne: ['$_id.day', null] },
                    { $ne: ['$_id.month', null] },
                    { $ne: ['$_id.year', null] }
                  ]},
                  then: { 
                    $dateToString: { 
                      format: '%b %d', 
                      date: { 
                        $dateFromParts: {
                          year: '$_id.year',
                          month: '$_id.month',
                          day: '$_id.day'
                        }
                      }
                    }
                  }
                },
                {
                  case: { $and: [
                    { $ne: ['$_id.week', null] },
                    { $ne: ['$_id.year', null] }
                  ]},
                  then: { 
                    $concat: [
                      'Week ', 
                      { $toString: '$_id.week' }, 
                      '/', 
                      { $toString: '$_id.year' }
                    ] 
                  }
                },
                {
                  case: { $and: [
                    { $ne: ['$_id.month', null] },
                    { $ne: ['$_id.year', null] }
                  ]},
                  then: { 
                    $dateToString: { 
                      format: '%b %Y', 
                      date: { 
                        $dateFromParts: {
                          year: '$_id.year',
                          month: '$_id.month',
                          day: 1
                        }
                      }
                    }
                  }
                }
              ],
              default: { $toString: '$_id.year' }
            }
          },
          value: { $round: [{ $ifNull: ['$value', 0] }, 2] },
          _id: 1
        }
      },
      { $sort: sortBy }
    ]);

    res.json(chartData);
  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ message: error.message });
  }
});

// Helper function to build date filter
function buildDateFilter(period, startDate, endDate) {
  const now = new Date();
  
  switch (period) {
    case 'today':
      return {
        dateOrdered: {
          $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          $lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
        }
      };
    case 'weekly':
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      return { dateOrdered: { $gte: weekStart } };
    case 'monthly':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { dateOrdered: { $gte: monthStart } };
    case 'quarterly':
      const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      return { dateOrdered: { $gte: quarterStart } };
    case 'yearly':
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { dateOrdered: { $gte: yearStart } };
    case 'custom':
      if (startDate && endDate) {
        return {
          dateOrdered: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        };
      }
      break;
    default:
      return {};
  }
}


// REPLACE the product-variants route in orders.js with this:
router.get('/analytics/product-variants', async (req, res) => {
  try {
    const { productId, period, startDate, endDate, sessionId, limit = 20 } = req.query;
    
    if (!productId) {
      return res.status(400).json({ message: 'Product ID is required' });
    }

    // Convert string to ObjectId properly
    const productObjectId = new mongoose.Types.ObjectId(productId);
    
    let matchFilter = { 'items.product': productObjectId };
    
    // Add date/session filters
    if (sessionId) {
      matchFilter.registerSession = sessionId;
    } else {
      Object.assign(matchFilter, buildDateFilter(period, startDate, endDate));
    }

    const productVariants = await Order.aggregate([
      { $match: matchFilter },
      // First, calculate the number of items per order for proper revenue distribution
      {
        $addFields: {
          totalItemsInOrder: {
            $reduce: {
              input: '$items',
              initialValue: 0,
              in: { $add: ['$$value', '$$this.quantity'] }
            }
          }
        }
      },
      { $unwind: '$items' },
      // Only include items for the specified product
      { $match: { 'items.product': productObjectId } },
      {
        $group: {
          _id: '$items.variant',
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { 
            $sum: { 
              $multiply: [
                '$finalPrice',
                { $divide: ['$items.quantity', '$totalItemsInOrder'] }
              ]
            }
          },
          orderCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'variants',
          localField: '_id',
          foreignField: '_id',
          as: 'variant'
        }
      },
      { $unwind: '$variant' },
      {
        $project: {
          variantName: '$variant.name',
          variantImage: '$variant.image', // Include variant image
          totalQuantity: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          avgPrice: { $round: [{ $divide: ['$totalRevenue', '$totalQuantity'] }, 2] },
          orderCount: 1
        }
      },
      { $sort: { totalRevenue: -1 } }, // Sort by revenue descending
      { $limit: parseInt(limit) }
    ]);

    res.json(productVariants);
  } catch (error) {
    console.error('Error fetching product variants:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update payment for an order - PATCH route
router.patch('/:id/payment', async (req, res) => {
  try {
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

    // Update register total sales only for the newly received amount
    // (since we're now tracking actual cash received)
    await Register.findOneAndUpdate(
      { isOpen: true },
      { $inc: { totalSales: amountReceived } }
    );

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



function getStartDateByPeriod(period) {
  const now = new Date();
  switch (period) {
    case 'weekly':
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      return weekStart;
    case 'monthly':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarterly':
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case 'yearly':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return now;
  }
}

module.exports = router; 