const Register = require('../models/Register');
const Order = require('../models/Order');
const Expense = require('../models/Expense');

async function updateRegister(sessionId, session) {
  const [orders, expenses] = await Promise.all([
    Order.find({ registerSession: sessionId }).session(session),
    Expense.find({ registerSession: sessionId }).session(session)
  ]);

  const cashOrders = orders.filter(o => o.paymentType === 'cash');
  const onlineOrders = orders.filter(o => o.paymentType === 'online');

  const cashRecvd = cashOrders.reduce((sum, o) => sum + o.amountPaid, 0);
  const expectedCash = cashOrders.reduce((sum, o) => sum + o.finalPrice, 0);
  const onlineRecvd = onlineOrders.reduce((sum, o) => sum + o.amountPaid, 0);
  const expectedOnline = onlineOrders.reduce((sum, o) => sum + o.finalPrice, 0);

  const totalSales = orders.reduce((sum, o) => sum + o.finalPrice, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  const register = await Register.findOne({ sessionId }).session(session);
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
      lastActivity: new Date()
    },
    { session }
  );
}

module.exports = updateRegister;
