
const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
    },
    image: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger,
    },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    customer: {
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
      },
      phone: {
        type: String,
        required: true,
        trim: true,
        maxlength: 25,
      },
      email: {
        type: String,
        default: '',
        trim: true,
        lowercase: true,
        maxlength: 254,
      },
    },

    shippingAddress: {
      addressLine1: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200,
      },
      addressLine2: {
        type: String,
        default: '',
        trim: true,
        maxlength: 200,
      },
      landmark: {
        type: String,
        default: '',
        trim: true,
        maxlength: 120,
      },
      city: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
      state: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
      },
      postalCode: {
        type: String,
        required: true,
        trim: true,
        maxlength: 12,
      },
      country: {
        type: String,
        default: 'India',
        trim: true,
      },
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator(items) {
          return Array.isArray(items) && items.length > 0;
        },
        message: 'An order must contain at least one item.',
      },
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    shippingFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentMethod: {
      type: String,
      enum: ['COD', 'RAZORPAY'],
      default: 'COD',
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },

    razorpayOrderId: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100,
      index: true,
    },

    razorpayPaymentId: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100,
    },

    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
      ],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('Order', orderSchema);
