const express = require('express');
const jwt = require('jsonwebtoken');
const { default: mongoose } = require('mongoose');
const Account = require('../models/Account');
const Employee = require('../models/Employees');
const hasAccess = require('../middleware/hasAccess');
const Order = require('../models/Order');
const Register = require('../models/Register');
const Employees = require('../models/Employees');
const getNextProductId = require('../utils/getProdID');
const Expense = require('../models/Expense');
const { default: Role } = require('../models/Role');
const updateRegister = require('../utils/updateRegister');
const authenticate = require('../middleware/authenticate');
const router = express.Router();
router.use(authenticate);


router.get('/', async(req,res)=>{
  try{
    const {role} = req.query;
    const {userId} = req.user;
    const acc = await Account.findById(userId).select('branchCode')
    const employees = await Employees.find({role:role,branchCode:acc.branchCode}).select('_id name')
    console.log("role passed: ",role)
    console.log(employees)
    res.status(200).send(employees)
  }catch(err){
    console.log(err)
    res.status(500).send(err)
  }
})

router.get('/employees-without-accounts', hasAccess('isManager'), async (req, res) => {
  try {
    const { access, userId } = req.user;
    
    // Get all employee IDs that are already referenced in accounts
    const accountsWithEmployees = await Account.find({ 
      employeeRef: { $exists: true, $ne: null } 
    }).select('employeeRef');
    
    const assignedEmployeeIds = accountsWithEmployees.map(account => account.employeeRef);
    
    let availableEmployees = [];
    
    if (access.isAdmin) {
      // Admin can see all employees without accounts
      availableEmployees = await Employees.find({
        _id: { $nin: assignedEmployeeIds },
        role: { $ne: 'company' }
      }).select('_id name email role branchCode');
    } else {
      // Manager can only see employees from their branch without accounts
      const currentUser = await Account.findById(userId);
      availableEmployees = await Employees.find({
        _id: { $nin: assignedEmployeeIds },
        branchCode: currentUser.branchCode,
        role: { $nin: ['company', 'manager'] }
      }).select('_id name email role');
    }
    
    res.json(availableEmployees);
  } catch (err) {
    console.error('Error fetching employees without accounts:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// router.post('/add-admin',async(req,res)=>{
//   try{
//     const {username,password,access={},businessRef} = req.body;
//         const newAccount = new Account({ username, password, access });
//     await newAccount.save();
//       res.status(201).json({
//       message: 'Account created successfully',
//       user: { id: newAccount._id, username: newAccount.username }
//     });
//   }catch(err){
//     res.status(500).json({ message: 'Server error during account creation',err });
//   }

// })

router.post('/add-account', hasAccess("isManager"), async (req, res) => {
  try {
    const { username, password, access = {},branchCode=null } = req.body;
    const {userId} = req.user;
    const account = await Account.findById(userId);
    const currentAccess = req.user.access || {};

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }
    let brC=''
    if(!branchCode && !currentAccess.isAdmin){
      brC = account.branchCode
    }else{
      brC = branchCode
    }

    // Check if isCashier is true and other access flags are also true
    const adminOnlyFlags = ['isAdmin', 'isManager', 'canGenReport'];
    const deniedFlags = [];
    const filteredAccess = {};

    for (const key in access) {
      if (adminOnlyFlags.includes(key)) {
        if (currentAccess.isAdmin) {
          filteredAccess[key] = access[key];
        } else {
          if (access[key]) deniedFlags.push(key);
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

    // Create new account
    const newAccount = new Account({ username, password, businessRef: account.businessRef,access: filteredAccess,isActive:false,branchCode:brC });
    await newAccount.save();

    res.status(201).json({
      message: 'Account created successfully',
      user: newAccount
    });

  } catch (error) {
    console.error('Admin creation error:', error);
    res.status(500).json({ message: 'Server error during account creation' });
  }
});


router.put('/assign-account',hasAccess('isManager'),async(req,res)=>{
  try{
    const {accId,empId} = req.body;
    const acc = await Account.findById(accId)
    const emp = await Employees.findById(empId)
    if (acc.employeeRef){
      throw new Error("Kindly remove existing employee to assign new one.")
    }
    if(!emp){
      throw new Error("Employee not found, please retry.")
    }

    acc.employeeRef = empId
    await acc.save()
    res.status(200).send(acc)
  }catch(err){
    console.log(err)
    return res.status(500).send(err)
  }
})


// Edit Account
// Edit Account
router.put('/edit-account/:accountId', hasAccess("isManager"), async (req, res) => {
  try {
    const { accountId } = req.params;
    const { username, password, access = {}, branchCode } = req.body;
    const currentAccess = req.user.access || {};

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Only update fields that are provided
    if (username) {
      account.username = username;
    }

    if (password) {
      account.password = password; // Will be hashed by .pre('save') hook
    }

    if(branchCode){
      account.branchCode = branchCode
    }

    // Handle access updates
    if (Object.keys(access).length > 0) {

      // Check if isCashier is true and other access flags are also true
      const adminOnlyFlags = [
        'isAdmin', 'isManager', 'canViewAllRegisters',
         'canGenReport'
      ];
      const deniedFlags = [];
      const updatedAccess = {};

      for (const key in access) {
        if (adminOnlyFlags.includes(key)) {
          if (currentAccess.isAdmin) {
            updatedAccess[key] = access[key];
          } else if (access[key]) {
            deniedFlags.push(key);
          }
        } else {
          updatedAccess[key] = access[key];
        }
      }

      if (deniedFlags.length > 0) {
        return res.status(403).json({
          message: 'You are not allowed to assign the following permissions:',
          denied: deniedFlags
        });
      }

      account.access = updatedAccess;
    }

    await account.save();
    res.json({ message: 'Account updated successfully' });

  } catch (error) {
    console.error('Edit account error:', error);
    res.status(500).json({ message: 'Server error during account update' });
  }
});


router.put('/account-status',hasAccess('isManager'),async(req,res)=>{
  try{
    const {accId,newStatus} = req.body
    console.log(accId,newStatus)
    const {access} = req.user;
    const account = await Account.findById(accId).select('-password').populate('employeeRef')

    if (account.access.isAdmin){
      throw new Error("Insufficient permissions, contact support")
    }
    if(account.access.isManager && !access.isAdmin){
      throw new Error("Insufficient permissions, contact support")
    }


    if(!account.employeeRef && newStatus == true){
      return res.status(402).json({message: "Assign an employee first"})
    }else{
      account.isActive = newStatus
    }
    await account.save()
    // console.log(account)
    return res.status(200).send(account)
  }catch(err){
    console.log(err)
    return res.status(402).send(err)
  }
})


router.get('/accounts', hasAccess('isManager'), async (req, res) => {
  try {
    const { access,userId } = req.user;
    
    // Get all accounts excluding password field
    const user = await Account.findById(userId)
    let accounts = []
    if(access.isAdmin){
      accounts = await Account.find({}).select('_id username access branchCode createdAt isActive employeeRef').populate('employeeRef','_id name');
      accounts = accounts.filter(account => !account.access.isAdmin);
    }else{
      accounts = await Account.find({branchCode:user.branchCode}).select('_id username access createdAt isActive employeeRef').populate('employeeRef','_id name')
      accounts = accounts.filter(account => !account.access.isAdmin && !account.access.isManager);
    }
        
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
    console.log(err);
  }
});

router.get('/account/:accountId', hasAccess("isManager"), async (req, res) => {
  try {
    const { accountId } = req.params;

    const account = await Account.findById(accountId).select('-password');
    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    res.json(account)

  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ message: 'Server error fetching account details' });
  }
});


router.post('/add-employee', hasAccess("isManager"), async (req, res) => {
  try {
    const { name, email, salary,number,branchCode = null, role, salaryDate} = req.body;
    const {userId,access} = req.user;
    const manager = await Account.findById(userId).populate('employeeRef')
    let code=''
    if (access.isAdmin){
      code = branchCode
    }else{
      code = manager.employeeRef.branchCode
    }

    const addEmployee = new Employee({
      name,
      email,
      branchCode: code,
      salary,
      phone:number,
      salaryCycleStartDay:salaryDate,
      role
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

router.get('/registers/active',hasAccess("isManager"), async (req, res) => {
  try {
    const managerAccId = req.user.userId;
    const access = req.user.access;
    if (!access.isAdmin && !access.canViewAllRegisters){

      const managerId = await Account.find(managerAccId).populate('employeeRef','_id name');
      const registers = await Register.find({ isOpen: true, managerRef: managerId.employeeRef._id })
      .select('sessionId openedAt cashier')
      .populate('cashier', 'username');
      
      res.json(registers);
    }else{
      const registers = await Register.find({ isOpen: true })
      .select('sessionId openedAt cashier')
      .populate('cashier', 'username');
      
      res.json(registers);
    }

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/registers/summary', hasAccess("isManager"), async (req, res) => {
  try {
    const { sessionId } = req.query;
    const manager = req.user.userId;
    const account = await Account.findById(manager).populate('employeeRef','_id name');

    let registers = [];

    if (account.access.isManager && !account.access.isAdmin && !account.access.canViewAllRegisters) {
      if (!sessionId || sessionId === 'ALL') {
        // All open registers for the logged-in manager
        registers = await Register.find({ isOpen: true, managerRef: account.employeeRef._id })
          .populate({
            path: 'orders',
            populate: [
              { path: 'items.product', select: 'name' },
              { path: 'items.category', select: 'name' }
            ]
          })
          .populate('expenses')
          .populate('cashier', 'username');
      } else {
        // Specific session only for the manager (could be multiple)
        registers = await Register.find({
          sessionId,
          isOpen: true,
          managerRef: account.employeeRef._id
        })
          .populate({
            path: 'orders',
            populate: [
              { path: 'items.product', select: 'name' },
              { path: 'items.category', select: 'name' }
            ]
          })
          .populate('expenses')
          .populate('cashier', 'username');
      }
    } else if (account.access.isAdmin || account.access.canViewAllRegisters) {
      if (!sessionId || sessionId === 'ALL') {
        // All open registers across all managers
        registers = await Register.find({ isOpen: true })
          .populate({
            path: 'orders',
            populate: [
              { path: 'items.product', select: 'name' },
              { path: 'items.category', select: 'name' }
            ]
          })
          .populate('expenses')
          .populate('cashier', 'username');
      } else {
        // Specific session only (could be multiple)
        registers = await Register.find({ sessionId })
          .populate({
            path: 'orders',
            populate: [
              { path: 'items.product', select: 'name' },
              { path: 'items.category', select: 'name' }
            ]
          })
          .populate('expenses')
          .populate('cashier', 'username');
      }
    }

    if (!registers || registers.length === 0) {
      return res.status(404).json({ message: 'No registers found' });
    }

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
      const orders = reg.orders || [];
      const expenses = reg.expenses || [];

      combined.orderCount += orders.length;
      combined.totalSales += reg.totalSales || 0;
      combined.cashRecvd += reg.cashRecvd || 0;
      combined.onlineRecvd += reg.onlineRecvd || 0;
      combined.expectedCash += reg.expectedCash || 0;
      combined.expectedOnline += reg.expectedOnline || 0;
      combined.totalExpenses += reg.totalExpenses || 0;
      combined.startCash += reg.startCash || 0;
      combined.openingBalance += reg.openingBalance || 0;
      combined.closingBalance += reg.closingBalance || 0;

      combined.orders.push(...orders);
      combined.expenses.push(...expenses);
      combined.registers.push({
        sessionId: reg.sessionId,
        openedAt: reg.openedAt,
        cashier: reg.cashier,
        startCash: reg.startCash,
        closingBalance: reg.closingBalance || 0,
        expectedBalance: reg.expectedBalance || 0
      });
    });

    res.json(combined);
  } catch (error) {
    console.error('Error getting summary:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET /employees
router.get('/employees', hasAccess('isManager'), async (req, res) => {
  try {
    const { userId, access } = req.user;

    const account = await Account.findById(userId).select('branchCode businessRef');
    const filter = {
      role: { $ne: 'company' } // always exclude 'company'
    };

    if (!access.isAdmin) {
      // Fetch all roles for the current business
      const roles = await Role.find({ businessRef: account.businessRef }).select('name');

      // Filter out 'manager' and 'admin'
      const allowedRoles = roles
        .map(role => role.name)
        .filter(roleName => roleName !== 'manager' && roleName !== 'admin');

      filter.branchCode = account.branchCode;
      filter.role = { $in: allowedRoles, $ne: 'company' };
    }

    const employees = await Employee.find(filter).select('_id name email role phone salary branchCode');
    res.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: error.message });
  }
});


router.put('/update-employee',hasAccess('isManager'),async (req,res)=>{
  try{
    const {id,employeeData} = req.body;
    console.log("Employee Data: ",employeeData)
    const {access} = req.user;
    const employee = await Employee.findById(id)
    if(!employee){
      throw new Error("No employee found");
    }

    if(employeeData.branchCode != employee.branchCode){
      if(!access.isAdmin){
        throw new Error("Insufficient Permission to update Branch code. Contact Support")
      }else{
        employee.branchCode = employeeData.branchCode
      }
    }    
    if(employeeData.salary != employee.salary){
      employee.salary = employeeData.salary
    }

    if(employeeData.name != employee.name){
      employee.name = employeeData.name
    }
    if(employeeData.email != employee.email){
      employee.email = employeeData.email
    }
    if(employeeData.role != employee.role){
      employee.role = employeeData.role
    }
    await employee.save()
    res.status(200).json({message:"Employee details updated",employee})
  }catch(err){
    console.log(err)
    res.json(err)
  }
})

// Expenses

// Get all expenses
router.get('/expenses', hasAccess("isManager"), async (req, res) => {
  try {
    const { access, userId } = req.user;
    let expenses = [];

    if (!access.isAdmin) {
      const registers = await Register.find({ managerRef: userId }).select('sessionId');
      const sessionIds = registers.map(reg => reg.sessionId);

      expenses = await Expense.find({ registerSession: { $in: sessionIds } });
    } else {
      expenses = await Expense.find();
    }

    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Register Sessions
// Get all register sessions with optional date filtering and manager filtering
router.get('/register/sessions',hasAccess("isManager"), async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const account = await Account.findById(userId).populate('employeeRef');

    const managerId = account.employeeRef._id;

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
    if (!account.access.isAdmin && !account.access.canViewAllRegisters) {
      // If not admin, filter by manager
      filter.managerRef = userId;
    }
    const sessions = await Register.find(filter)
      .populate({
        path: 'orders',
        populate: {
          path: 'items.product items.category',
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
router.get('/register/sessions/:id',hasAccess("isManager"), async (req, res) => {
  try {
    const { id } = req.params;
    const {userId} = req.user;
    const access = req.user?.access;
    const manager = await Account.findById(userId).populate('employeeRef');

    const session = await Register.findById(id)
      .populate({
        path: 'orders',
        populate: {
          path: 'items.product items.category',
          select: 'name price'
        }
      })
      .populate('expenses');
    
      if (!session) {
        return res.status(404).json({ message: 'Register session not found' });
      }
    if (!access.isAdmin || !access.canViewAllRegisters){
      if(session.managerRef.toString() !== manager._id.toString()) {
        return res.status(403).json({ message: 'Access denied: You do not have permission to view this session' });
    }
  }
    res.json(session);
  } catch (error) {
    console.error('Error fetching register session:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;