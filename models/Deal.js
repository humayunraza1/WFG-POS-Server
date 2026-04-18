const mongoose = require('mongoose');

const dealItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    optionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    optionName: {
      type: String,
      required: true,
      trim: true,
    },
    optionPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  { _id: false }
);

const dealSelectionOptionSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    optionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    optionName: {
      type: String,
      required: true,
      trim: true,
    },
    optionPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    priceDelta: {
      type: Number,
      default: 0,
    },
    overridePrice: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  { _id: false }
);

const dealSelectionGroupSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    required: {
      type: Boolean,
      default: true,
    },
    minSelect: {
      type: Number,
      required: true,
      min: 0,
      default: 1,
    },
    maxSelect: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    autoPriceDelta: {
      type: Number,
      default: 0,
    },
    autoOverridePrice: {
      type: Number,
      default: null,
      min: 0,
    },
    items: {
      type: [dealSelectionOptionSchema],
      default: [],
    },
  },
  { _id: false }
);

const dealSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    pricingMode: {
      type: String,
      enum: ['fixed', 'dynamic'],
      default: 'fixed',
    },
    price: {
      type: Number,
      required: false,
      min: 0,
      default: 0,
    },
    items: {
      type: [dealItemSchema],
      default: [],
    },
    selectionGroups: {
      type: [dealSelectionGroupSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

dealSchema.path('selectionGroups').validate(function validateSelectionGroups(groups) {
  if (!Array.isArray(groups)) return true;
  return groups.every((group) => {
    const hasItems = Array.isArray(group.items) && group.items.length > 0;
    const hasCategory = Boolean(group.category);
    return group.minSelect <= group.maxSelect && (hasItems || hasCategory);
  });
}, 'Each selection group must have minSelect less than or equal to maxSelect.');

dealSchema.path('selectionGroups').validate(function validateRequiredGroups(groups) {
  if (!Array.isArray(groups)) return true;
  return groups.every((group) => !group.required || group.minSelect >= 1);
}, 'Required selection groups must have minSelect of at least 1.');

dealSchema.pre('validate', function normalizeSelectionGroups(next) {
  if (Array.isArray(this.selectionGroups)) {
    this.selectionGroups = this.selectionGroups.map((group) => {
      const normalized = { ...(group.toObject?.() ?? group) };
      const required = Boolean(normalized.required);
      const minSelect = Number.isFinite(Number(normalized.minSelect))
        ? Number(normalized.minSelect)
        : (required ? 1 : 0);
      const maxSelect = Number.isFinite(Number(normalized.maxSelect))
        ? Number(normalized.maxSelect)
        : 1;

      normalized.required = required;
      normalized.minSelect = required ? Math.max(1, minSelect) : Math.max(0, minSelect);
      normalized.maxSelect = Math.max(1, maxSelect);
      normalized.autoPriceDelta = Number.isFinite(Number(normalized.autoPriceDelta))
        ? Number(normalized.autoPriceDelta)
        : 0;

      const parsedAutoOverride =
        normalized.autoOverridePrice === '' || normalized.autoOverridePrice === null || typeof normalized.autoOverridePrice === 'undefined'
          ? null
          : Number(normalized.autoOverridePrice);
      normalized.autoOverridePrice =
        parsedAutoOverride === null || Number.isFinite(parsedAutoOverride)
          ? parsedAutoOverride
          : null;

      return normalized;
    });
  }

  next();
});

dealSchema.path('items').validate(function validateDealStructure(items) {
  const hasFixedItems = Array.isArray(items) && items.length > 0;
  const hasSelectionGroups = Array.isArray(this.selectionGroups) && this.selectionGroups.length > 0;
  return hasFixedItems || hasSelectionGroups;
}, 'A deal must include fixed items or at least one selection group.');

dealSchema.pre('validate', function validatePricingMode(next) {
  if (this.pricingMode === 'fixed') {
    const parsedPrice = Number(this.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      this.invalidate('price', 'Fixed deals require a valid non-negative price.');
    }
  }

  if (this.pricingMode === 'dynamic' && (!Number.isFinite(Number(this.price)) || this.price < 0)) {
    this.price = 0;
  }

  next();
});

dealSchema.virtual('regularTotal').get(function getRegularTotal() {
  return this.items.reduce((sum, item) => sum + item.optionPrice * item.quantity, 0);
});

dealSchema.set('toJSON', { virtuals: true });
dealSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Deal', dealSchema);
