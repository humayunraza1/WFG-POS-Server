const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Category = require('../models/Category');
const Deal = require('../models/Deal');
const getNextProductId = require('../utils/getProdID');
const authenticate = require('../middleware/authenticate');
const hasAccess = require('../middleware/hasAccess'); // make sure this is imported too

router.use(authenticate);

const normalizeDealItems = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Deal must include at least one product item.');
  }

  const productIds = [...new Set(items.map((item) => item.productId).filter(Boolean))];
  if (productIds.length === 0) {
    throw new Error('Deal items must include valid product IDs.');
  }

  const products = await Product.find({ _id: { $in: productIds } }).select('name options');
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  return items.map((item, index) => {
    const { productId, optionId } = item;
    const quantity = Number(item.quantity || 1);

    if (!productId || !optionId) {
      throw new Error(`Deal item at row ${index + 1} is missing product or option.`);
    }

    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error(`Deal item quantity at row ${index + 1} must be at least 1.`);
    }

    const product = productMap.get(String(productId));
    if (!product) {
      throw new Error(`Product not found for deal item at row ${index + 1}.`);
    }

    const selectedOption = product.options.find(
      (option) => String(option._id) === String(optionId)
    );

    if (!selectedOption) {
      throw new Error(`Selected option does not belong to product at row ${index + 1}.`);
    }

    return {
      product: product._id,
      optionId: selectedOption._id,
      productName: product.name,
      optionName: selectedOption.name,
      optionPrice: Number(selectedOption.price),
      quantity,
    };
  });
};

const normalizeDealSelectionGroups = async (selectionGroups = []) => {
  if (!Array.isArray(selectionGroups) || selectionGroups.length === 0) {
    return [];
  }

  const allItems = selectionGroups.flatMap((group) => group.items || []);
  const productIds = [...new Set(allItems.map((item) => item.productId).filter(Boolean))];
  const categoryIds = [...new Set(selectionGroups.map((group) => group.categoryId).filter(Boolean))];

  if (productIds.length === 0 && categoryIds.length === 0) {
    throw new Error('Selection groups must include product options or a category for auto-apply.');
  }

  const [products, categories] = await Promise.all([
    productIds.length > 0
      ? Product.find({ _id: { $in: productIds } }).select('name category options')
      : [],
    categoryIds.length > 0
      ? Category.find({ _id: { $in: categoryIds } }).select('_id')
      : [],
  ]);

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const categorySet = new Set(categories.map((category) => String(category._id)));

  return selectionGroups.map((group, index) => {
    const candidateItems = (group.items || []).filter((item) => item?.productId && item?.optionId);
    const hasExplicitItems = candidateItems.length > 0;
    const hasCategory = Boolean(group.categoryId);

    if (!hasExplicitItems && !hasCategory) {
      throw new Error(`Selection group at row ${index + 1} must include options or select a category.`);
    }

    if (hasCategory && !categorySet.has(String(group.categoryId))) {
      throw new Error(`Selection group at row ${index + 1} has an invalid category.`);
    }

    const required = group.required !== false;
    const parsedMin = Number(group.minSelect);
    const parsedMax = Number(group.maxSelect);

    let minSelect = Number.isFinite(parsedMin) ? parsedMin : (required ? 1 : 0);
    let maxSelect = Number.isFinite(parsedMax) ? parsedMax : 1;

    minSelect = required ? Math.max(1, minSelect) : Math.max(0, minSelect);
    maxSelect = Math.max(1, maxSelect);

    if (minSelect > maxSelect) {
      throw new Error(`Selection group at row ${index + 1} has minSelect greater than maxSelect.`);
    }

    const parsedAutoDelta = Number(group.autoPriceDelta || 0);
    const parsedAutoOverride =
      group.autoOverridePrice === '' || group.autoOverridePrice === null || typeof group.autoOverridePrice === 'undefined'
        ? null
        : Number(group.autoOverridePrice);

    if (!Number.isFinite(parsedAutoDelta)) {
      throw new Error(`Selection group at row ${index + 1} has invalid auto price delta.`);
    }

    if (parsedAutoOverride !== null && (!Number.isFinite(parsedAutoOverride) || parsedAutoOverride < 0)) {
      throw new Error(`Selection group at row ${index + 1} has invalid auto override price.`);
    }

    const normalizedItems = candidateItems.map((item, itemIndex) => {
      const product = productMap.get(String(item.productId));
      if (!product) {
        throw new Error(`Selection item ${itemIndex + 1} in group ${index + 1} has invalid product.`);
      }

      const selectedOption = (product.options || []).find(
        (option) => String(option._id) === String(item.optionId)
      );
      if (!selectedOption) {
        throw new Error(`Selection item ${itemIndex + 1} in group ${index + 1} has invalid option.`);
      }

      const parsedDelta =
        item.priceDelta === '' || item.priceDelta === null || typeof item.priceDelta === 'undefined'
          ? parsedAutoDelta
          : Number(item.priceDelta);
      const parsedOverride =
        item.overridePrice === '' || item.overridePrice === null || typeof item.overridePrice === 'undefined'
          ? parsedAutoOverride
          : Number(item.overridePrice);

      if (!Number.isFinite(parsedDelta)) {
        throw new Error(`Selection item ${itemIndex + 1} in group ${index + 1} has invalid price delta.`);
      }

      if (parsedOverride !== null && (!Number.isFinite(parsedOverride) || parsedOverride < 0)) {
        throw new Error(`Selection item ${itemIndex + 1} in group ${index + 1} has invalid override price.`);
      }

      return {
        product: product._id,
        category: product.category,
        optionId: selectedOption._id,
        productName: product.name,
        optionName: selectedOption.name,
        optionPrice: Number(selectedOption.price),
        priceDelta: parsedDelta,
        overridePrice: parsedOverride,
      };
    });

    return {
      label: (group.label || `Group ${index + 1}`).trim(),
      category: hasCategory ? group.categoryId : null,
      required,
      minSelect,
      maxSelect,
      autoPriceDelta: parsedAutoDelta,
      autoOverridePrice: parsedAutoOverride,
      items: normalizedItems,
    };
  });
};

const expandSelectionGroupsForResponse = async (deals) => {
  const plainDeals = deals.map((deal) => deal.toObject({ virtuals: true }));

  const categoryIds = [
    ...new Set(
      plainDeals.flatMap((deal) =>
        (deal.selectionGroups || [])
          .filter((group) => (!group.items || group.items.length === 0) && group.category)
          .map((group) => String(group.category))
      )
    ),
  ];

  const categoryProducts = categoryIds.length > 0
    ? await Product.find({ category: { $in: categoryIds } }).select('name category options')
    : [];

  const categoryProductsMap = categoryProducts.reduce((map, product) => {
    const categoryKey = String(product.category);
    if (!map.has(categoryKey)) {
      map.set(categoryKey, []);
    }
    map.get(categoryKey).push(product);
    return map;
  }, new Map());

  return plainDeals.map((deal) => {
    const selectionGroups = (deal.selectionGroups || []).map((group) => {
      const groupCategoryId = group.category ? String(group.category) : null;
      const hasExplicitItems = Array.isArray(group.items) && group.items.length > 0;

      let responseItems = group.items || [];
      if (!hasExplicitItems && groupCategoryId) {
        const productsInCategory = categoryProductsMap.get(groupCategoryId) || [];
        responseItems = productsInCategory.flatMap((product) =>
          (product.options || []).map((option) => ({
            product: product._id,
            category: product.category,
            optionId: option._id,
            productName: product.name,
            optionName: option.name,
            optionPrice: Number(option.price),
            priceDelta: Number(group.autoPriceDelta || 0),
            overridePrice:
              group.autoOverridePrice === null || typeof group.autoOverridePrice === 'undefined'
                ? null
                : Number(group.autoOverridePrice),
          }))
        );
      }

      return {
        ...group,
        categoryId: groupCategoryId,
        items: responseItems.map((item) => ({
          ...item,
          productId: item.product?._id || item.product,
          categoryId: item.category?._id || item.category,
        })),
      };
    });

    return {
      ...deal,
      selectionGroups,
    };
  });
};

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
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
   } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/deals', async (req, res) => {
  try {
    const { status = 'active' } = req.query;
    const query = {};

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const deals = await Deal.find(query).populate('category').sort({ createdAt: -1 });
    const hydratedDeals = await expandSelectionGroupsForResponse(deals);
    res.json(hydratedDeals);
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ message: 'Failed to fetch deals.' });
  }
});

router.post('/deals', hasAccess('isManager'), async (req, res) => {
  try {
    const {
      name,
      imageUrl,
      categoryId,
      pricingMode = 'fixed',
      price,
      items,
      selectionGroups,
      isActive,
    } = req.body;

    if (!name || !categoryId) {
      return res.status(400).json({ message: 'Deal name and category are required.' });
    }

    const normalizedPrice = Number(price || 0);
    if (pricingMode === 'fixed' && (!Number.isFinite(normalizedPrice) || normalizedPrice < 0)) {
      return res.status(400).json({ message: 'Fixed deal price must be a valid non-negative number.' });
    }

    if (!['fixed', 'dynamic'].includes(pricingMode)) {
      return res.status(400).json({ message: 'pricingMode must be either fixed or dynamic.' });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(400).json({ message: 'Selected category does not exist.' });
    }

    const normalizedItems = Array.isArray(items) && items.length > 0
      ? await normalizeDealItems(items)
      : [];
    const normalizedSelectionGroups = await normalizeDealSelectionGroups(selectionGroups);

    if (normalizedItems.length === 0 && normalizedSelectionGroups.length === 0) {
      return res.status(400).json({
        message: 'A deal must have assigned items or at least one selection group.',
      });
    }

    const deal = await Deal.create({
      name,
      imageUrl,
      category: category._id,
      pricingMode,
      price: pricingMode === 'fixed' ? normalizedPrice : 0,
      items: normalizedItems,
      selectionGroups: normalizedSelectionGroups,
      isActive: typeof isActive === 'boolean' ? isActive : true,
    });

    const populatedDeal = await deal.populate('category');
    const [hydratedDeal] = await expandSelectionGroupsForResponse([populatedDeal]);
    res.status(201).json({ message: 'Deal created successfully', deal: hydratedDeal });
  } catch (error) {
    console.error('Error creating deal:', error);
    res.status(400).json({ message: error.message || 'Failed to create deal.' });
  }
});

router.patch('/deals/:id', hasAccess('isManager'), async (req, res) => {
  try {
    const deal = await Deal.findById(req.params.id);
    if (!deal) {
      return res.status(404).json({ message: 'Deal not found.' });
    }

    const { name, imageUrl, categoryId, pricingMode, price, items, selectionGroups, isActive } = req.body;

    if (typeof name !== 'undefined') deal.name = name;
    if (typeof imageUrl !== 'undefined') deal.imageUrl = imageUrl;

    if (typeof pricingMode !== 'undefined') {
      if (!['fixed', 'dynamic'].includes(pricingMode)) {
        return res.status(400).json({ message: 'pricingMode must be either fixed or dynamic.' });
      }
      deal.pricingMode = pricingMode;
    }

    if (typeof price !== 'undefined') {
      const normalizedPrice = Number(price);
      if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
        return res.status(400).json({ message: 'Deal price must be a valid positive number.' });
      }
      deal.price = normalizedPrice;
    }

    if (deal.pricingMode === 'dynamic' && typeof price === 'undefined') {
      deal.price = 0;
    }

    if (typeof isActive === 'boolean') {
      deal.isActive = isActive;
    }

    if (categoryId) {
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(400).json({ message: 'Selected category does not exist.' });
      }
      deal.category = category._id;
    }

    if (typeof items !== 'undefined') {
      deal.items = Array.isArray(items) && items.length > 0
        ? await normalizeDealItems(items)
        : [];
    }

    if (typeof selectionGroups !== 'undefined') {
      deal.selectionGroups = await normalizeDealSelectionGroups(selectionGroups);
    }

    await deal.save();
    const populatedDeal = await deal.populate('category');
    const [hydratedDeal] = await expandSelectionGroupsForResponse([populatedDeal]);
    res.json({ message: 'Deal updated successfully', deal: hydratedDeal });
  } catch (error) {
    console.error('Error updating deal:', error);
    res.status(400).json({ message: error.message || 'Failed to update deal.' });
  }
});

router.patch('/deals/:id/status', hasAccess('isManager'), async (req, res) => {
  try {
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be a boolean value.' });
    }

    const deal = await Deal.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).populate('category');

    if (!deal) {
      return res.status(404).json({ message: 'Deal not found.' });
    }

    res.json({ message: 'Deal status updated successfully', deal });
  } catch (error) {
    console.error('Error updating deal status:', error);
    res.status(400).json({ message: error.message || 'Failed to update deal status.' });
  }
});

router.delete('/deals/:id', hasAccess('isManager'), async (req, res) => {
  try {
    const deletedDeal = await Deal.findByIdAndDelete(req.params.id);

    if (!deletedDeal) {
      return res.status(404).json({ message: 'Deal not found.' });
    }

    res.json({ message: 'Deal deleted successfully.' });
  } catch (error) {
    console.error('Error deleting deal:', error);
    res.status(400).json({ message: error.message || 'Failed to delete deal.' });
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

module.exports = router;
