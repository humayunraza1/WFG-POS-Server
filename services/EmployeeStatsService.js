const mongoose = require('mongoose');
const Register = require('../models/Register'); // Adjust path as needed
const Order = require('../models/Order'); // Adjust path as needed

class EmployeeStatsService {
  
  /**
   * Get employee delivery stats for different time periods
   * @param {string} period - 'daily', 'weekly', 'monthly', 'custom'
   * @param {Object} options - Additional options
   * @param {Date} options.startDate - Start date for custom range
   * @param {Date} options.endDate - End date for custom range
   * @param {string} options.branchCode - Filter by branch (optional)
   * @returns {Object} Employee stats with delivery counts
   */
  async getEmployeeDeliveryStats(period = 'daily', options = {}) {
    try {
      const { startDate, endDate, branchCode,isOpen } = options;
      
      // Calculate date range based on period
      const dateRange = this.getDateRange(period, startDate, endDate);
      
      // Build the aggregation pipeline
      const pipeline = this.buildAggregationPipeline(dateRange, branchCode,isOpen);
      
      // Execute the aggregation
      const results = await Register.aggregate(pipeline);
      
      // Format the results
      return this.formatResults(results, period, dateRange);
      
    } catch (error) {
      throw new Error(`Error getting employee delivery stats: ${error.message}`);
    }
  }

  /**
   * Get date range based on period type
   */
  getDateRange(period, customStartDate, customEndDate) {
    const now = new Date();
    let startDate, endDate;

    switch (period) {
      case 'daily':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate = new Date(now.setHours(23, 59, 59, 999));
        break;
        
          case 'weekly': {
            // Start: 7 days ago at 00:00:00
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - 6); // last 7 days including today
            startOfWeek.setHours(0, 0, 0, 0);

            // End: now (exact timestamp)
            const endOfWeek = new Date(now);

            startDate = startOfWeek;
            endDate = endOfWeek;
            break;
          }

          case 'monthly': {
            // Start: 1st of the month at 00:00:00
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);

            // End: now (current timestamp)
            endDate = new Date(now);
            break;
          }
                
      case 'custom':
        if (!customStartDate || !customEndDate) {
          throw new Error('Start date and end date are required for custom range');
        }
        startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);
        break;
        
      default:
        throw new Error('Invalid period. Use: daily, weekly, monthly, or custom');
    }

    return { startDate, endDate };
  }

  /**
   * Build MongoDB aggregation pipeline
   */
buildAggregationPipeline(dateRange, branchCode, isOpen) {
  const matchStage = {
    openedAt: {
      $gte: dateRange.startDate,
      $lte: dateRange.endDate
    }
  };

  if (branchCode) {
    matchStage.branchCode = branchCode;
  }
  if (isOpen) {
    console.log("is open is true")
    matchStage.isOpen = true;
  }

  const pipeline = [
    // Match registers in date range and optional filters
    { $match: matchStage },

    // Lookup orders for each register
    {
      $lookup: {
        from: 'orders',
        localField: 'sessionId',
        foreignField: 'registerSession',
        as: 'orders'
      }
    },

    // Unwind orders
    { $unwind: '$orders' },

    // Filter orders with valid serverRef
    {
      $match: {
        'orders.serverRef': { $ne: null, $exists: true }
      }
    },

    // Lookup employee info
    {
      $lookup: {
        from: 'employees',
        localField: 'orders.serverRef',
        foreignField: '_id',
        as: 'employee'
      }
    },

    { $unwind: '$employee' },

    // Group by employee + session
    {
      $group: {
        _id: {
          employeeId: '$employee._id',
          sessionId: '$sessionId'
        },
        employeeName: { $first: '$employee.name' },
        sessionId: { $first: '$sessionId' },
        openedAt: { $first: '$openedAt' },
        closedAt: { $first: '$closedAt' },
        orders: {
          $push: {
            orderId: '$orders._id',
            createdAt: '$orders.createdAt',
            sessionId: '$sessionId'
          }
        },
        deliveries: { $sum: 1 }
      }
    },

    // Group by employee to accumulate sessions
    {
      $group: {
        _id: '$_id.employeeId',
        employeeName: { $first: '$employeeName' },
        sessions: {
          $push: {
            sessionId: '$sessionId',
            openedAt: '$openedAt',
            closedAt: '$closedAt',
            deliveries: '$deliveries',
            orders: '$orders'
          }
        },
        totalDeliveries: { $sum: '$deliveries' }
      }
    },

    // Final projection
    {
      $project: {
        _id: 0,
        employeeId: '$_id',
        employeeName: 1,
        totalDeliveries: 1,
        sessions: 1
      }
    },

    // Sort by totalDeliveries
    { $sort: { totalDeliveries: -1 } }
  ];

  return pipeline;
}




  /**
   * Format results with summary information
   */
  formatResults(results, period, dateRange) {
    const totalEmployees = results.length;
    const totalDeliveries = results.reduce((sum, emp) => sum + emp.totalDeliveries, 0);

    return {
      summary: {
        period,
        dateRange: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        },
        totalEmployees,
        totalDeliveries
      },
      employees: results
    };
  }

  /**
   * Get top performing employees
   */
  async getTopPerformers(period = 'daily', limit = 5, options = {}) {
    const stats = await this.getEmployeeDeliveryStats(period, options);
    return {
      ...stats,
      employees: stats.employees.slice(0, limit)
    };
  }

  /**
   * Get specific employee stats
   */
  async getEmployeeStats(employeeId, period = 'daily', options = {}) {
    const stats = await this.getEmployeeDeliveryStats(period, options);
    const employee = stats.employees.find(emp => 
      emp.employeeId.toString() === employeeId.toString()
    );
    
    if (!employee) {
      return {
        employeeId,
        period,
        dateRange: stats.summary.dateRange,
        found: false,
        message: 'No deliveries found for this employee in the specified period'
      };
    }

    return {
      ...stats.summary,
      employee,
      found: true
    };
  }
}

module.exports = EmployeeStatsService;