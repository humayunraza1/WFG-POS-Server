// models/DeletedOrder.js
const mongoose = require('mongoose');

const deletedOrderSchema = new mongoose.Schema({
  originalOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  registerSession: {
    type: String,
    required: true
  },
  cashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: false
  },
  branchCode: {
    type: String,
    default: null
  },
  items: [{
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category'
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    },
    option: {
      type: mongoose.Schema.Types.ObjectId
    },
    optionName: String,
    categoryName: {
      type: String,
      default: ''
    },
    isPartnershipCategory: {
      type: Boolean,
      default: false
    },
    partnershipBusinessName: {
      type: String,
      default: ''
    },
    partnershipSharePercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    unitPrice: Number,
    quantity: Number,
    totalPrice: Number
  }],
  discount: Number,
  paymentType: String,
  actualPrice: Number,
  finalPrice: Number,
  amountPaid: Number,
  paymentStatus: String,
  dateOrdered: Date,

  // --- Deletion Metadata ---
  deletedAt: {
    type: Date,
    default: Date.now
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true
  },
  deleteReason: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DeletedOrder', deletedOrderSchema);
