const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');

const Product = require('../models/Product');
const Order = require('../models/Order');
const sendOrderConfirmationEmail = require('../services/sendOrderConfirmationEmail');
const router = express.Router();

const SHIPPING_FEE = 0;

function orderError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Customer order lookup rate limiting.
// For production, use a shared rate limiter and preferably OTP verification.
const orderLookupAttempts = new Map();
const ORDER_LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_ORDER_LOOKUPS = 8;

function normalizeOrderPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');

  // Accept Indian numbers with +91 or a leading zero.
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  return digits;
}

function allowOrderLookup(ip) {
  const now = Date.now();

  // Remove expired entries.
  for (const [storedIp, entry] of orderLookupAttempts.entries()) {
    if (entry.expiresAt <= now) {
      orderLookupAttempts.delete(storedIp);
    }
  }

  let entry = orderLookupAttempts.get(ip);

  if (!entry || entry.expiresAt <= now) {
    entry = {
      count: 0,
      expiresAt: now + ORDER_LOOKUP_WINDOW_MS,
    };
  }

  if (entry.count >= MAX_ORDER_LOOKUPS) {
    orderLookupAttempts.set(ip, entry);
    return false;
  }

  entry.count += 1;
  orderLookupAttempts.set(ip, entry);

  return true;
}

// POST /api/orders/lookup
// Verify an order number and checkout phone number.
router.post('/lookup', async (req, res, next) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    if (!allowOrderLookup(ip)) {
      return res.status(429).json({
        success: false,
        message: 'Too many lookup attempts. Please try again in 15 minutes.',
      });
    }

    const orderNumber = text(req.body?.orderNumber).toUpperCase();
    const suppliedPhone = normalizeOrderPhone(req.body?.phone);

    if (
      !orderNumber ||
      orderNumber.length > 40 ||
      !/^[A-Z0-9-]+$/.test(orderNumber) ||
      suppliedPhone.length !== 10
    ) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid order number and 10-digit phone number.',
      });
    }

    const order = await Order.findOne({ orderNumber })
      .select(
        'orderNumber createdAt status paymentStatus paymentMethod subtotal shippingFee total items customer.phone'
      )
      .lean();

    const savedPhone = normalizeOrderPhone(order?.customer?.phone);

    // Never reveal whether an order number exists on its own.
    if (!order || !savedPhone || savedPhone !== suppliedPhone) {
      return res.status(404).json({
        success: false,
        message: 'Order not found. Check your details and try again.',
      });
    }

    return res.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        status: order.status || 'pending',
        paymentMethod: order.paymentMethod || 'COD',
        paymentStatus: order.paymentStatus || 'pending',
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        total: order.total,
        items: (order.items || []).map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
});

// POST /api/orders
// Create a Cash on Delivery order using server-side prices.
router.post('/', async (req, res, next) => {
  const body = req.body || {};
  const customer = body.customer || {};
  const address = body.shippingAddress || {};
  const rawItems = body.items;

  if (body.paymentMethod && body.paymentMethod !== 'COD') {
    return res.status(400).json({
      success: false,
      message: 'Cash on Delivery is the only payment method available right now.',
    });
  }

  const customerName = text(customer.name);
  const phone = text(customer.phone);
  const email = text(customer.email);

  if (!customerName || customerName.length > 120) {
    return res.status(400).json({
      success: false,
      message: 'Enter a valid customer name.',
    });
  }

  if (!/^[0-9+()\s-]{7,25}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Enter a valid phone number.',
    });
  }

  if (
  !email ||
  email.length > 254 ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
) {
  return res.status(400).json({
    success: false,
    message:
      'Enter a valid email address to receive your order confirmation.',
  });
}

  const shippingAddress = {
    addressLine1: text(address.addressLine1),
    addressLine2: text(address.addressLine2),
    landmark: text(address.landmark),
    city: text(address.city),
    state: text(address.state),
    postalCode: text(address.postalCode),
    country: text(address.country) || 'India',
  };

  if (
    !shippingAddress.addressLine1 ||
    !shippingAddress.city ||
    !shippingAddress.state ||
    !shippingAddress.postalCode ||
    shippingAddress.addressLine1.length > 200 ||
    shippingAddress.addressLine2.length > 200 ||
    shippingAddress.landmark.length > 120 ||
    shippingAddress.city.length > 100 ||
    shippingAddress.state.length > 100 ||
    shippingAddress.postalCode.length > 12
  ) {
    return res.status(400).json({
      success: false,
      message: 'Complete the required shipping address fields.',
    });
  }

  if (
    !Array.isArray(rawItems) ||
    rawItems.length === 0 ||
    rawItems.length > 20
  ) {
    return res.status(400).json({
      success: false,
      message: 'Your bag must contain between 1 and 20 line items.',
    });
  }

  // Combine duplicate product IDs before checking stock.
  const quantities = new Map();

  for (const item of rawItems) {
    const productId = String(item?.productId || '');
    const quantity = item?.quantity;

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: 'An item in your bag has an invalid product ID.',
      });
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      return res.status(400).json({
        success: false,
        message: 'Each item quantity must be a whole number from 1 to 20.',
      });
    }

    const combined = (quantities.get(productId) || 0) + quantity;

    if (combined > 20) {
      return res.status(400).json({
        success: false,
        message: 'Maximum quantity per product is 20.',
      });
    }

    quantities.set(productId, combined);
  }

  let session;

  try {
    session = await mongoose.startSession();

    let createdOrder;

    await session.withTransaction(async () => {
      const orderItems = [];
      let subtotal = 0;

      for (const [productId, quantity] of quantities.entries()) {
        const product = await Product.findOne({
          _id: productId,
          isActive: true,
        }).session(session);

        if (!product) {
          throw orderError(
            404,
            'A product in your bag is no longer available.'
          );
        }

        if (product.stock < quantity) {
          throw orderError(
            409,
            `${product.name} does not have enough stock.`
          );
        }

        // Decrement stock atomically without allowing negative stock.
        const updateResult = await Product.updateOne(
          {
            _id: product._id,
            isActive: true,
            stock: { $gte: quantity },
          },
          {
            $inc: { stock: -quantity },
          },
          { session }
        );

        if (updateResult.modifiedCount !== 1) {
          throw orderError(
            409,
            `${product.name} stock changed. Please try again.`
          );
        }

        // Always use the price stored in MongoDB.
        const price = product.price;
        subtotal += price * quantity;

        orderItems.push({
          product: product._id,
          name: product.name,
          slug: product.slug,
          image: product.image,
          price,
          quantity,
        });
      }

      subtotal = Number(subtotal.toFixed(2));
      const total = Number((subtotal + SHIPPING_FEE).toFixed(2));

      const orderNumber =
        `VLS-${Date.now().toString(36).toUpperCase()}-` +
        crypto.randomBytes(3).toString('hex').toUpperCase();

      const orders = await Order.create(
        [
          {
            orderNumber,
            customer: {
              name: customerName,
              phone,
              email,
            },
            shippingAddress,
            items: orderItems,
            subtotal,
            shippingFee: SHIPPING_FEE,
            total,
            paymentMethod: 'COD',
            paymentStatus: 'pending',
            status: 'pending',
          },
        ],
        { session }
      );

      createdOrder = orders[0];
    });
// Order is saved already. Email failure must not undo the order.
try {
  await sendOrderConfirmationEmail(createdOrder);
} catch (emailError) {
  console.error(
    `Order ${createdOrder?.orderNumber} saved, but confirmation email failed:`,
    emailError.message,
  );
}
    return res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      data: {
        orderNumber: createdOrder.orderNumber,
        status: createdOrder.status,
        paymentMethod: createdOrder.paymentMethod,
        paymentStatus: createdOrder.paymentStatus,
        subtotal: createdOrder.subtotal,
        shippingFee: createdOrder.shippingFee,
        total: createdOrder.total,
        items: createdOrder.items,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Please retry placing your order.',
      });
    }

    return next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

module.exports = router;