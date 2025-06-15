const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  registerSession: {
    type: String,
    required: true
  },
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
  }],
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentType: {
    type: String,
    enum: ['cash', 'online'],
    required: true
  },
  finalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid'],
    default: 'pending'
  },
  outstandingPayment: {
    type: Number,
    default: function() {
      return this.finalPrice;
    },
    min: 0
  },
  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  dateOrdered: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Pre-save middleware to calculate payment status and outstanding payment
orderSchema.pre('save', function(next) {
  if (this.amountPaid >= this.finalPrice) {
    this.paymentStatus = 'paid';
    this.outstandingPayment = 0;
    this.amountPaid = this.finalPrice; // Prevent overpayment
  } else {
    this.paymentStatus = 'pending';
    this.outstandingPayment = this.finalPrice - this.amountPaid;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);