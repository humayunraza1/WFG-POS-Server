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
    const {userId,access} = req.user;
    const acc = await Account.findById(userId).select('_id branchCode')
    const { period = 'daily', startDate, endDate, isOpen=false } = req.query;
  console.log(isOpen)
    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if(!access.isAdmin){
      options.branchCode = acc.branchCode;
    }
    if(isOpen) options.isOpen = isOpen
    const stats = await employeeStats.getEmployeeDeliveryStats(period, options);
    
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