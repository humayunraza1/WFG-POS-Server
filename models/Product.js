const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true, // e.g. "KitKat"
    trim: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  options: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    name: { type: String, required: true },    // e.g. "Normal", "With Ice Cream"
    price: { type: Number, required: true, min: 0 }
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Product', productSchema);
