
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { rateLimit } = require('express-rate-limit');

const Product = require('../models/Product');
const Order = require('../models/Order');
const sendOrderStatusEmail = require('../services/sendOrderStatusEmail');

const router = express.Router();

// ============================================
// IMAGE UPLOAD CONFIGURATION
// ============================================

const isVercel = process.env.VERCEL === '1';
const uploadsDir = path.join(__dirname, '..', 'uploads');

// Vercel's deployed application directory is not writable.
// Create the uploads directory only during local development.
if (!isVercel) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const imageTypes = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/avif': '.avif',
};

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, uploadsDir);
    },
    filename: (_req, file, callback) => {
      const extension = imageTypes[file.mimetype];

      if (!extension) {
        return callback(new Error('Unsupported image type'));
      }

      return callback(
        null,
        `${crypto.randomBytes(16).toString('hex')}${extension}`,
      );
    },
  }),
  fileFilter: (_req, file, callback) => {
    if (!imageTypes[file.mimetype]) {
      return callback(
        new Error('Only JPG, PNG, WEBP and AVIF images are allowed'),
      );
    }

    return callback(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

// ============================================
// PRODUCT VALIDATION HELPERS
// ============================================

const productFields = [
  'name',
  'slug',
  'shortDescription',
  'description',
  'price',
  'compareAtPrice',
  'image',
  'images',
  'stock',
  'isActive',
];

function pickProductFields(body) {
  const result = {};

  for (const field of productFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      result[field] = body[field];
    }
  }

  return result;
}

function validateProduct(data, creating = false) {
  if (creating) {
    for (const field of ['name', 'slug', 'price', 'image']) {
      if (
        !Object.prototype.hasOwnProperty.call(data, field) ||
        data[field] === '' ||
        data[field] === null ||
        data[field] === undefined
      ) {
        return `${field} is required`;
      }
    }
  }

  for (const field of [
    'name',
    'slug',
    'shortDescription',
    'description',
    'image',
  ]) {
    if (
      field in data &&
      (typeof data[field] !== 'string' || !data[field].trim())
    ) {
      return `${field} must be a non-empty string`;
    }
  }

  if (
    'slug' in data &&
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)
  ) {
    return 'Slug must use lowercase letters, numbers and single hyphens between words';
  }

  for (const field of ['price', 'compareAtPrice']) {
    if (
      field in data &&
      data[field] !== null &&
      (typeof data[field] !== 'number' ||
        !Number.isFinite(data[field]) ||
        data[field] < 0)
    ) {
      return `${field} must be a non-negative number`;
    }
  }

  if (
    'stock' in data &&
    (!Number.isInteger(data.stock) || data.stock < 0)
  ) {
    return 'Stock must be a non-negative whole number';
  }

  if ('isActive' in data && typeof data.isActive !== 'boolean') {
    return 'isActive must be true or false';
  }

  if (
    'images' in data &&
    (!Array.isArray(data.images) ||
      !data.images.every(
        (image) => typeof image === 'string' && image.trim(),
      ))
  ) {
    return 'images must be an array of non-empty strings';
  }

  return null;
}

// ============================================
// ADMIN AUTHENTICATION
// ============================================

function requireAdmin(req, res, next) {
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({
      success: false,
      message: 'Admin authentication is not configured',
    });
  }

  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      success: false,
      message: 'Admin authentication required',
    });
  }

  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, {
      issuer: 'velshe-api',
      audience: 'velshe-admin',
    });

    if (payload.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    return next();
  } catch (_error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired admin session',
    });
  }
}

// Limit repeated login attempts per IP.
// A shared rate-limit store is needed for multiple production instances.
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message:
      'Too many login attempts. Please wait 15 minutes before trying again.',
  },
});

// POST /api/admin/login
router.post('/login', adminLoginLimiter, async (req, res) => {
  const { username, password } = req.body || {};

  if (
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD_HASH ||
    !process.env.JWT_SECRET
  ) {
    return res.status(503).json({
      success: false,
      message: 'Admin authentication is not configured',
    });
  }

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username !== process.env.ADMIN_USERNAME
  ) {
    return res.status(401).json({
      success: false,
      message: 'Invalid username or password',
    });
  }

  try {
    const matches = await bcrypt.compare(
      password,
      process.env.ADMIN_PASSWORD_HASH,
    );

    if (!matches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
      });
    }

    const token = jwt.sign(
      { role: 'admin' },
      process.env.JWT_SECRET,
      {
        expiresIn: '2h',
        issuer: 'velshe-api',
        audience: 'velshe-admin',
      },
    );

    return res.json({
      success: true,
      token,
      expiresIn: 7200,
    });
  } catch (error) {
    console.error('Admin login error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Unable to sign in',
    });
  }
});

// ============================================
// AUTHENTICATED IMAGE UPLOAD
// ============================================

// POST /api/admin/upload
router.post('/upload', requireAdmin, (req, res, next) => {
      if (process.env.VERCEL === '1') {
    return res.status(503).json({
      success: false,
      message:
        'Image uploads are temporarily unavailable until persistent image storage is configured.',
    });
  }
  imageUpload.single('image')(req, res, (error) => {
    if (error) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be 5 MB or smaller'
          : error.message;

      return res.status(400).json({
        success: false,
        message,
      });
    }

    return next();
  });
}, (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'Select an image to upload',
    });
  }

  return res.status(201).json({
    success: true,
    url: `/uploads/${req.file.filename}`,
    filename: req.file.filename,
  });
});

// ============================================
// PRODUCT MANAGEMENT
// All /api/admin/products routes require admin authentication.
// ============================================

router.use('/products', requireAdmin);

// GET /api/admin/products
router.get('/products', async (req, res, next) => {
  try {
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/admin/products
router.post('/products', async (req, res, next) => {
  try {
    const data = pickProductFields(req.body || {});
    const validationError = validateProduct(data, true);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    if (!('images' in data)) {
      data.images = [data.image];
    }

    const product = await Product.create(data);

    return res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A product with that slug already exists',
      });
    }

    return next(error);
  }
});

// PATCH /api/admin/products/:id
router.patch('/products/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID',
      });
    }

    const updates = pickProductFields(req.body || {});

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No editable product fields provided',
      });
    }

    const validationError = validateProduct(updates);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true },
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    return res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A product with that slug already exists',
      });
    }

    return next(error);
  }
});

// DELETE /api/admin/products/:id
// Deactivate rather than permanently deleting a product.
router.delete('/products/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID',
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true, runValidators: true },
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    return res.json({
      success: true,
      message: 'Product deactivated',
      data: product,
    });
  } catch (error) {
    return next(error);
  }
});

// ============================================
// ORDER MANAGEMENT
// ============================================

const allowedOrderTransitions = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
};

// GET /api/admin/orders
router.get('/orders', requireAdmin, async (req, res, next) => {
  try {
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      count: orders.length,
      data: orders,
    });
  } catch (error) {
    return next(error);
  }
});

// PATCH /api/admin/orders/:id
router.patch('/orders/:id', requireAdmin, async (req, res, next) => {
  const { id } = req.params;
  const body = req.body || {};

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid order ID.',
    });
  }

  const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
  const hasPaymentStatus = Object.prototype.hasOwnProperty.call(
    body,
    'paymentStatus',
  );

  if (!hasStatus && !hasPaymentStatus) {
    return res.status(400).json({
      success: false,
      message: 'Provide a status or paymentStatus to update.',
    });
  }

  const allowedStatuses = [
    'pending',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'cancelled',
  ];

  if (hasStatus && !allowedStatuses.includes(body.status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid order status.',
    });
  }

  const allowedPaymentStatuses = [
    'pending',
    'paid',
    'failed',
    'refunded',
  ];

  if (
    hasPaymentStatus &&
    !allowedPaymentStatuses.includes(body.paymentStatus)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid payment status.',
    });
  }

  let updatedOrder;
  let previousStatus;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(id).session(session);

      if (!order) {
        const error = new Error('Order not found.');
        error.statusCode = 404;
        throw error;
      }

      previousStatus = order.status;

      if (hasStatus && body.status !== order.status) {
        const permittedTransitions =
          allowedOrderTransitions[order.status] || [];

        if (!permittedTransitions.includes(body.status)) {
          const error = new Error(
            `Cannot change order status from ${order.status} to ${body.status}.`,
          );
          error.statusCode = 400;
          throw error;
        }

        // Restore stock when an order is cancelled.
        // Restore stock only if inventory was deducted previously.
// COD deducts stock when the order is created.
// Razorpay deducts stock after payment is verified.
const shouldRestoreStock =
  order.paymentMethod === 'COD' ||
  (order.paymentMethod === 'RAZORPAY' &&
    ['paid', 'refunded'].includes(order.paymentStatus));

if (body.status === 'cancelled' && shouldRestoreStock) {
  for (const item of order.items || []) {
    const productId =
      item.productId || item.product?._id || item.product;

    const quantity = Number(item.quantity) || 0;

    if (productId && quantity > 0) {
      await Product.updateOne(
        { _id: productId },
        { $inc: { stock: quantity } },
        { session },
      );
    }
  }
}
        order.status = body.status;
      }

      if (hasPaymentStatus) {
        order.paymentStatus = body.paymentStatus;
      }

      await order.save({ session });
      updatedOrder = order;
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  } finally {
    await session.endSession();
  }

  // Email failure must not undo a saved order-status change.
  if (hasStatus && updatedOrder.status !== previousStatus) {
    try {
      await sendOrderStatusEmail(updatedOrder, previousStatus);
    } catch (emailError) {
      console.error(
        `Order ${updatedOrder.orderNumber} was updated, but the status email failed:`,
        emailError.message,
      );
    }
  }

  return res.json({
    success: true,
    message: 'Order updated successfully.',
    data: updatedOrder,
  });
});

module.exports = router;
