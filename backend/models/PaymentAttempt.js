
const mongoose = require('mongoose');

const paymentItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    image: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const paymentAttemptSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    customer: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true },
    },

    shippingAddress: {
      addressLine1: { type: String, required: true },
      addressLine2: { type: String, default: '' },
      landmark: { type: String, default: '' },
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
      country: { type: String, default: 'India' },
    },

    items: {
      type: [paymentItemSchema],
      required: true,
    },

    subtotal: { type: Number, required: true, min: 0 },
    shippingFee: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, min: 0 },

    razorpayOrderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    razorpayPaymentId: { type: String, default: '' },

    status: {
      type: String,
      enum: ['created', 'paid', 'stock_issue'],
      default: 'created',
      index: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  'PaymentAttempt',
  paymentAttemptSchema,
);

const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const Product = require('../models/Product');
const Order = require('../models/Order');
const sendOrderConfirmationEmail = require('../services/sendOrderConfirmationEmail');

const router = express.Router();
const SHIPPING_FEE = 0;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw httpError(503, 'Razorpay is not configured on the server.');
  }

  return {
    keyId,
    client: new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    }),
  };
}

// POST /api/payments/create-order
router.post('/create-order', async (req, res, next) => {
  try {
    const { keyId, client } = getRazorpay();
    const body = req.body || {};
    const customer = body.customer || {};
    const address = body.shippingAddress || {};
    const rawItems = body.items;

    const name = text(customer.name);
    const phone = text(customer.phone);
    const email = text(customer.email);

    if (!name || name.length > 120) {
      throw httpError(400, 'Enter a valid customer name.');
    }

    if (!/^[0-9+()\s-]{7,25}$/.test(phone)) {
      throw httpError(400, 'Enter a valid phone number.');
    }

    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw httpError(400, 'Enter a valid email address.');
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
      throw httpError(400, 'Complete the required delivery address fields.');
    }

    if (
      !Array.isArray(rawItems) ||
      rawItems.length === 0 ||
      rawItems.length > 20
    ) {
      throw httpError(400, 'Your bag must contain between 1 and 20 items.');
    }

    const quantities = new Map();

    for (const item of rawItems) {
      const productId = String(item?.productId || '');
      const quantity = item?.quantity;

      if (!mongoose.isValidObjectId(productId)) {
        throw httpError(400, 'An item has an invalid product ID.');
      }

      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw httpError(400, 'Item quantities must be whole numbers from 1 to 20.');
      }

      const combined = (quantities.get(productId) || 0) + quantity;

      if (combined > 20) {
        throw httpError(400, 'Maximum quantity per product is 20.');
      }

      quantities.set(productId, combined);
    }

    const orderItems = [];
    let subtotal = 0;

    // Prices are read from MongoDB, never trusted from the browser.
    for (const [productId, quantity] of quantities.entries()) {
      const product = await Product.findOne({
        _id: productId,
        isActive: true,
      });

      if (!product) {
        throw httpError(404, 'A product is no longer available.');
      }

      if (product.stock < quantity) {
        throw httpError(409, `${product.name} does not have enough stock.`);
      }

      const price = Number(product.price);

      if (!Number.isFinite(price) || price < 0) {
        throw httpError(400, 'A product has an invalid price.');
      }

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
    const amountPaise = Math.round(total * 100);

    if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) {
      throw httpError(400, 'The order total must be at least ₹1.');
    }

    const orderNumber =
      `VLS-${Date.now().toString(36).toUpperCase()}-` +
      crypto.randomBytes(3).toString('hex').toUpperCase();

    // Create a Razorpay order on the server.
    const gatewayOrder = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: orderNumber,
    });

    // Save the internal order for tracking. Stock is not deducted here;
    // it is checked and deducted in the verified-payment transaction.
    await Order.create({
      orderNumber,
      customer: { name, phone, email },
      shippingAddress,
      items: orderItems,
      subtotal,
      shippingFee: SHIPPING_FEE,
      total,
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'pending',
      status: 'pending',
      razorpayOrderId: gatewayOrder.id,
    });

    return res.status(201).json({
      success: true,
      data: {
        keyId,
        orderNumber,
        razorpayOrderId: gatewayOrder.id,
        amount: gatewayOrder.amount,
        currency: gatewayOrder.currency,
        customer: { name, email, phone },
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
});

// POST /api/payments/verify
router.post('/verify', async (req, res, next) => {
  let session;

  try {
    const { client } = getRazorpay();

    const orderNumber = text(req.body?.orderNumber);
    const razorpayOrderId = text(req.body?.razorpay_order_id);
    const razorpayPaymentId = text(req.body?.razorpay_payment_id);
    const razorpaySignature = text(req.body?.razorpay_signature);

    if (
      !orderNumber ||
      !razorpayOrderId ||
      !razorpayPaymentId ||
      !/^[a-f0-9]{64}$/i.test(razorpaySignature)
    ) {
      throw httpError(400, 'Missing or invalid payment verification details.');
    }

    const order = await Order.findOne({
      orderNumber,
      paymentMethod: 'RAZORPAY',
      razorpayOrderId,
    });

    if (!order) {
      throw httpError(404, 'The matching payment order was not found.');
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest();

    const suppliedSignature = Buffer.from(razorpaySignature, 'hex');

    if (
      suppliedSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(suppliedSignature, expectedSignature)
    ) {
      throw httpError(400, 'Payment signature verification failed.');
    }

    // Repeated verification of the same successful payment is safe.
    if (order.paymentStatus === 'paid') {
      if (order.razorpayPaymentId !== razorpayPaymentId) {
        throw httpError(409, 'This order has already been paid.');
      }

      return res.json({
        success: true,
        message: 'Payment already verified.',
        data: {
          orderNumber: order.orderNumber,
          paymentStatus: order.paymentStatus,
          status: order.status,
        },
      });
    }

    if (order.paymentStatus !== 'pending') {
      throw httpError(409, 'This order is no longer awaiting payment.');
    }

    const expectedAmount = Math.round(order.total * 100);
    let payment = await client.payments.fetch(razorpayPaymentId);

    if (
      payment.order_id !== razorpayOrderId ||
      payment.amount !== expectedAmount ||
      payment.currency !== 'INR'
    ) {
      throw httpError(400, 'The payment details do not match this order.');
    }

    // Capture an authorized payment if automatic capture did not occur.
    if (payment.status === 'authorized') {
      payment = await client.payments.capture(
        razorpayPaymentId,
        expectedAmount,
        'INR',
      );
    }

    if (payment.status !== 'captured') {
      throw httpError(
        409,
        'Payment is not captured yet. Do not place another order; contact customer care if this persists.',
      );
    }

    let completedOrder;
    session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const currentOrder = await Order.findById(order._id).session(session);

        if (!currentOrder) {
          throw httpError(404, 'Order not found.');
        }

        if (currentOrder.paymentStatus === 'paid') {
          if (currentOrder.razorpayPaymentId !== razorpayPaymentId) {
            throw httpError(409, 'This order has already been paid.');
          }

          completedOrder = currentOrder;
          return;
        }

        if (currentOrder.paymentStatus !== 'pending') {
          throw httpError(409, 'This order is no longer awaiting payment.');
        }

        // Deduct stock only after the payment is verified and captured.
        for (const item of currentOrder.items) {
          const result = await Product.updateOne(
            {
              _id: item.product,
              stock: { $gte: item.quantity },
            },
            {
              $inc: { stock: -item.quantity },
            },
            { session },
          );

          if (result.modifiedCount !== 1) {
            const error = new Error(
              `Insufficient stock for ${item.name}.`,
            );
            error.stockUnavailable = true;
            throw error;
          }
        }

        currentOrder.paymentStatus = 'paid';
        currentOrder.razorpayPaymentId = razorpayPaymentId;
        currentOrder.status = 'confirmed';

        await currentOrder.save({ session });
        completedOrder = currentOrder;
      });
    } catch (error) {
      if (!error.stockUnavailable) {
        throw error;
      }

      // If stock changed while checkout was open, request a full refund.
      try {
        const refund = await client.payments.refund(razorpayPaymentId, {
          amount: expectedAmount,
        });

        await Order.updateOne(
          { _id: order._id, paymentStatus: 'pending' },
          {
            $set: {
              razorpayPaymentId,
              paymentStatus:
                refund.status === 'processed' ? 'refunded' : 'paid',
              status: 'cancelled',
            },
          },
        );

        return res.status(409).json({
          success: false,
          message:
            refund.status === 'processed'
              ? 'Stock changed during checkout. The payment was refunded.'
              : 'Stock changed during checkout. A refund was requested; contact customer care if it does not appear.',
        });
      } catch (refundError) {
        console.error('VELSHE refund request failed:', refundError.message);

        await Order.updateOne(
          { _id: order._id, paymentStatus: 'pending' },
          {
            $set: {
              razorpayPaymentId,
              paymentStatus: 'paid',
              status: 'cancelled',
            },
          },
        );

        return res.status(502).json({
          success: false,
          message:
            'Payment was captured but stock could not be reserved. Contact VELSHE customer care with your order number.',
        });
      }
    } finally {
      await session.endSession();
      session = null;
    }

    // Email is sent only after verified payment and stock updates succeed.
    try {
      await sendOrderConfirmationEmail(completedOrder);
    } catch (emailError) {
      console.error(
        'Payment succeeded, but confirmation email failed:',
        emailError.message,
      );
    }

    return res.json({
      success: true,
      message: 'Payment verified and order confirmed.',
      data: {
        orderNumber: completedOrder.orderNumber,
        paymentMethod: completedOrder.paymentMethod,
        paymentStatus: completedOrder.paymentStatus,
        status: completedOrder.status,
        total: completedOrder.total,
      },
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
    if (session) {
      await session.endSession();
    }
  }
});

module.exports = router;

