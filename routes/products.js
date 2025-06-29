const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Variant = require('../models/Flavors');
const getNextProductId = require('../utils/getProdID');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    // Fetch all products
    const products = await Product.find();

    // For each product, attach its variants
    const productsWithVariants = await Promise.all(
      products.map(async (product) => {
        const variants = await Variant.find({ product: product._id });
        return {
          ...product.toObject(), // convert Mongoose doc to plain object
          variants
        };
      })
    );

    res.json(productsWithVariants);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const variants = await Variant.find({ product: product._id });

    res.json({ ...product.toObject(), variants });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router; 