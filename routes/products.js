const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const getNextProductId = require('../utils/getProdID');
const authenticate = require('../middleware/authenticate');
const hasAccess = require('../middleware/hasAccess'); // make sure this is imported too

router.use(authenticate);

// ✅ Get all products with category populated
router.get('/', async (req, res) => {
  try {
    const products = await Product.find().populate('category');
    res.json(products);
   } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// ✅ Get all products with category populated
router.get('/categories', async (req, res) => {
  try {
    const products = await Category.find();
    res.json(products);
   } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Get single product by ID
// router.get('/:id', async (req, res) => {
//   try {
//     const product = await Product.findById(req.params.id).populate('category');
//     if (!product) return res.status(404).json({ message: 'Product not found' });
//     res.json(product);
//   } catch (error) {
//     res.status(500).json({ message: error.message });
//   }
// });

// Create a new category
// Create a new category with counter-based customId
router.post('/add-category', hasAccess("isManager"), async (req, res) => {
  try {
    const { name, imageUrl } = req.body;

    if (!name || !imageUrl) {
      return res.status(400).json({ message: "Both name and imageUrl are required." });
    }

    // Check for duplicate category name
    const existing = await Category.findOne({ name });
    if (existing) {
      return res.status(409).json({ message: "A category with this name already exists." });
    }

    // Get the next sequence number for category
    const newProductId = await getNextProductId();



    const newCategory = new Category({
      customId:newProductId,
      name,
      imageUrl
    });

    const savedCategory = await newCategory.save();
    res.status(201).json({ category: savedCategory });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(400).json({ message: error.message });
  }
});

// ✅ Create a new product
router.post('/add-product', hasAccess("isManager"), async (req, res) => {
  try {
    const { name, imageUrl, categoryId, options } = req.body;

    // Ensure required fields are provided
    if (!categoryId) {
      return res.status(400).json({ message: "Category selection is required." });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(400).json({ message: "Invalid category selected. Please choose a valid category from the list." });
    }

    const product = new Product({
      name,
      imageUrl,
      category: category._id,
      options
    });

    const savedProduct = await product.save();
    const populatedProduct = await savedProduct.populate('category');

    res.status(201).json({ product: populatedProduct });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get all products for a given category
router.get('/:categoryId', async (req, res) => {
  try {
    const { categoryId } = req.params;

    const products = await Product.find({ category: categoryId }).populate('category');
    
    res.json(products);
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({ message: 'Failed to fetch products by category.' });
  }
});

router.post('/bulk-add', hasAccess("isManager"), async (req, res) => {
  try {
    const productList = req.body;
    console.log("bulk add: ",req.body)
    if (!Array.isArray(productList) || productList.length === 0) {
      return res.status(400).json({ message: "Request body must be a non-empty array of products." });
    }

    // Validate and prepare data
    const categoryIds = [...new Set(productList.map(p => p.categoryId))];
    const categories = await Category.find({ _id: { $in: categoryIds } });

    const validCategoryMap = new Map();
    categories.forEach(cat => validCategoryMap.set(cat._id.toString(), cat));

    const validProducts = productList.filter(p =>
      p.name &&
      p.imageUrl &&
      Array.isArray(p.options) && p.options.length > 0 &&
      validCategoryMap.has(p.categoryId)
    );

    if (validProducts.length === 0) {
      return res.status(400).json({ message: "No valid products to add. Please check your input." });
    }

    const productsToInsert = validProducts.map(p => ({
      name: p.name,
      imageUrl: p.imageUrl,
      category: p.categoryId,
      options: p.options.map(opt => ({
        name: opt.name,
        price: Number(opt.price)
      }))
    }));

    const insertedProducts = await Product.insertMany(productsToInsert, { ordered: false });

    res.status(201).json({
      message: `${insertedProducts.length} products added successfully.`,
      insertedCount: insertedProducts.length,
      failedCount: productList.length - insertedProducts.length
    });
  } catch (error) {
    console.error('Bulk add error:', error);
    res.status(500).json({ message: 'Failed to add products in bulk.', error: error.message });
  }
});


// ✅ Update existing product
router.patch('/edit-product/:id', hasAccess("isManager"), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const { name, imageUrl, options, categoryId } = req.body;

    if (name) product.name = name;
    if (imageUrl) product.imageUrl = imageUrl;
    if (options && Array.isArray(options)) {
      product.options = options;
    }

    if (categoryId) {
      const existingCategory = await Category.findById(categoryId);
      if (!existingCategory) {
        return res.status(400).json({ message: 'Selected category does not exist. Please create it first before editing the product.' });
      }
      product.category = categoryId;
    }

    await product.save();
    const updatedProduct = await product.populate('category');

    res.json({message:"Product updated successfully", product: updatedProduct });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(400).json({ message: error.message });
  }
});


// Get all categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }); // optional: sort alphabetically
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Failed to fetch categories' });
  }
});

module.exports = router;
