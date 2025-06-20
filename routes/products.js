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


router.post('/', async (req, res) => {
  try {
    const newProductId = await getNextProductId();
    console.log('New Product ID:', newProductId);
    console.log(req.body)
    const product = new Product({
      customId: newProductId,
      name: req.body.name,
      imageUrl: req.body.imageUrl
    });

    const savedProduct = await product.save();
    // Save variants
    const variantDocs = await Promise.all(req.body.variants.map(async (variant, index) => {
      return await new Variant({
        customId: `${newProductId}-${index + 1}`,
        name: variant.name,
        price: variant.price,
        imageUrl: variant.imageUrl,
        product: savedProduct._id
      }).save();
    }));

    res.status(201).json({ product: savedProduct, variants: variantDocs });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update product
// Update product
router.patch('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Update basic product fields
    if (req.body.name) product.name = req.body.name;
    if (req.body.imageUrl) product.imageUrl = req.body.imageUrl;

    await product.save();

    // Optional: update variants if provided
    if (req.body.variants && Array.isArray(req.body.variants)) {
      // Option 1: Delete all and re-add (simple & clean)
      await Variant.deleteMany({ product: product._id });

      const updatedVariants = await Promise.all(
        req.body.variants.map((variant, index) =>
          new Variant({
            customId: `${product.customId}-${index + 1}`,
            name: variant.name,
            price: variant.price,
            imageUrl: variant.imageUrl,
            product: product._id
          }).save()
        )
      );

      return res.json({ product, variants: updatedVariants });
    }

    res.json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});


module.exports = router; 