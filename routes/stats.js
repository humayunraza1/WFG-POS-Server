const express = require('express');
const router = express.Router();
const Account = require('../models/Account');
const EmployeeStatsService = require('../services/EmployeeStatsService'); // Adjust path
const authenticate = require('../middleware/authenticate');

const employeeStats = new EmployeeStatsService();

router.use(authenticate)
/**
 * GET /api/employee-stats
 * Get employee delivery statistics
 * Query params:
 * - period: daily|weekly|monthly|custom (default: daily)
 * - startDate: YYYY-MM-DD (required for custom)
 * - endDate: YYYY-MM-DD (required for custom)  
 * - branchCode: string (optional)
 */
router.get('/', async (req, res) => {
  try {
    const { userId } = req.user; // uses userId from auth middleware
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // find active register/session for this cashier
    const activeRegister = await Register.findOne({ cashier: userId, isOpen: true }).select('sessionId');
    if (!activeRegister) {
      return res.json({ success: true, data: [], message: 'No active register session found for this user' });
    }

    const sessionId = activeRegister.sessionId;

    // fetch all orders for this session and populate serverRef name only
    const orders = await Order.find({ registerSession: sessionId })
      .populate({ path: 'serverRef', select: 'name' })
      .lean();

    // group by serverRef (serverRef may be null)
    const groups = new Map(); // key = serverId string or 'unassigned'

    for (const o of orders) {
      const serverId = o.serverRef?._id?.toString() ?? 'unassigned';
      const serverName = o.serverRef?.name ?? 'Unassigned';

      if (!groups.has(serverId)) {
        groups.set(serverId, {
          serverId: serverId === 'unassigned' ? null : serverId,
          serverName,
          orders: [],
          orderCount: 0,
          totalValue: 0
        });
      }

      const bucket = groups.get(serverId);

      // push minimal order info as requested
      bucket.orders.push({
        id: o._id,
        dateOrdered: o.dateOrdered,
        finalPrice: o.finalPrice
      });

      bucket.orderCount += 1;
      bucket.totalValue += (typeof o.finalPrice === 'number' ? o.finalPrice : 0);
    }

    // convert map -> array
    const result = Array.from(groups.values());

    // Optional: sort by serverName (or totalValue) if you want
    // result.sort((a,b) => a.serverName.localeCompare(b.serverName));

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('by-server route error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/employee-stats/top
 * Get top performing employees
 * Query params: same as above plus 'limit'
 */
router.get('/top', async (req, res) => {
  try {
    const { 
      period = 'daily', 
      limit = 5, 
      startDate, 
      endDate, 
      branchCode 
    } = req.query;
    
    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (branchCode) options.branchCode = branchCode;

    const stats = await employeeStats.getTopPerformers(
      period, 
      parseInt(limit), 
      options
    );
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/employee-stats/:employeeId
 * Get specific employee statistics
 */
router.get('/:employeeId', async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { period = 'daily', startDate, endDate, branchCode } = req.query;
    
    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (branchCode) options.branchCode = branchCode;

    const stats = await employeeStats.getEmployeeStats(employeeId, period, options);
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;