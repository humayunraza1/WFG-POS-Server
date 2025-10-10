const Register = require('../models/Register');
const Order = require('../models/Order');
const Expense = require('../models/Expense');
const DeletedOrder = require('../models/DeletedOrder');

async function updateRegister(sessionId, session) {
  const [orders, expenses, deletedOrders] = await Promise.all([
    Order.find({ registerSession: sessionId }).session(session),
    Expense.find({ registerSession: sessionId }).session(session),
    DeletedOrder.find({ registerSession: sessionId }).session(session)
  ]);

  // --- Active Orders ---
  const cashOrders = orders.filter(o => o.paymentType === 'cash');
  const onlineOrders = orders.filter(o => o.paymentType === 'online');

  const cashRecvd = cashOrders.reduce((sum, o) => sum + o.amountPaid, 0);
  const expectedCash = cashOrders.reduce((sum, o) => sum + o.finalPrice, 0);
  const onlineRecvd = onlineOrders.reduce((sum, o) => sum + o.amountPaid, 0);
  const expectedOnline = onlineOrders.reduce((sum, o) => sum + o.finalPrice, 0);
  const totalSales = orders.reduce((sum, o) => sum + o.finalPrice, 0);

  // --- Deleted Orders ---
  const deletedCashOrders = deletedOrders.filter(o => o.paymentType === 'cash');
  const deletedOnlineOrders = deletedOrders.filter(o => o.paymentType === 'online');

  const deletedCash = deletedCashOrders.reduce((sum, o) => sum + o.finalPrice, 0);
  const deletedOnline = deletedOnlineOrders.reduce((sum, o) => sum + o.finalPrice, 0);
  const deletedSales = deletedOrders.reduce((sum, o) => sum + o.finalPrice, 0);

  // --- Expenses ---
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // --- Register Calculations ---
  const register = await Register.findOne({ sessionId });
  const expectedBalance = register.startCash + expectedCash - totalExpenses;

  await Register.findOneAndUpdate(
    { sessionId },
    {
      totalSales,
      totalExpenses,
      cashRecvd,
      onlineRecvd,
      expectedCash,
      expectedOnline,
      expectedBalance,
      // 🆕 Add tracking for deleted orders
      deletedSales,
      deletedCash,
      deletedOnline,
      lastActivity: new Date()
    },
    { session }
  );
}

module.exports = updateRegister;
