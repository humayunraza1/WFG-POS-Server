const Counter = require('../models/Counter');

async function getNextProductId() {
  const counter = await Counter.findOneAndUpdate(
    { name: 'product' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `WFG-${counter.seq}`;
}

module.exports = getNextProductId;