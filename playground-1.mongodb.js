use("SAMPLE_POS");

// Step 1: Migrate old "products" into "categories"
const oldCategories = db.products.find().toArray();
db.createCollection("categories");

oldCategories.forEach(doc => {
  db.categories.insertOne({
    _id: doc._id, // preserve original ID
    customId: doc.customId,
    name: doc.name,
    imageUrl: doc.imageUrl,
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date()
  });
});

print(`✅ Migrated ${oldCategories.length} documents to categories`);

// Step 2: Create new "products_v2" collection
const baseIds = db.variants
  .distinct("customId")
  .map(id => id.split("-").slice(0, 2).join("-"));

const uniqueBaseIds = [...new Set(baseIds)];
db.createCollection("products_v2");

uniqueBaseIds.forEach(baseId => {
  const relatedVariants = db.variants.find({ customId: { $regex: `^${baseId}-` } }).toArray();
  if (relatedVariants.length === 0) return;

  const first = relatedVariants[0];

  const categoryId = first.product; // from old variant → refers to old product._id → now category._id

  const options = relatedVariants.map(v => ({
    name: v.name.replace(first.name.split(" ")[0], "").trim() || "Regular",
    price: v.price
  }));

  const productDoc = {
    customId: baseId,
    name: first.name.split(" ")[0], // base product name (e.g. "KitKat")
    imageUrl: first.imageUrl,
    category: categoryId, // ref to categories collection
    options,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  db.products_v2.insertOne(productDoc);
  print(`✅ Created product ${baseId} with ${options.length} options`);
});

print("✅ All products migrated to products_v2 with category references.");
