const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const Product = require('../models/Product');
const Order = require('../models/Order');
const sendOrderConfirmationEmail =
  require('../services/sendOrderConfirmationEmail');

const router = express.Router();
const SHIPPING_FEE = 0;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    const error = new Error(
      'Razorpay environment variables are not configured.',
    );
    error.statusCode = 503;
    throw error;
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

function fail(statusCode, message, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function sendRouteError(res, next, error, fallback) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  console.error(fallback, error.message);
  return res.status(500).json({
    success: false,
    message: fallback,
  });
}

function verifySignature(orderId, paymentId, signature, secret) {
  if (
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest();

  const supplied = Buffer.from(signature, 'hex');

  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}

function publicOrder(order) {
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    subtotal: order.subtotal,
    shippingFee: order.shippingFee,
    total: order.total,
    items: order.items,
  };
}

// POST /api/payments/razorpay/create-order
// Calculate the amount from MongoDB product prices.
// Save a pending local order and create the Razorpay order.
router.post('/razorpay/create-order', async (req, res) => {
  try {
    const razorpay = getRazorpay();
    const body = req.body || {};
    const customer = body.customer || {};
    const address = body.shippingAddress || {};
    const rawItems = body.items;

    const customerName = text(customer.name);
    const phone = text(customer.phone);
    const email = text(customer.email);

    if (!customerName || customerName.length > 120) {
      throw fail(400, 'Enter a valid customer name.');
    }

    if (!/^[0-9+()\s-]{7,25}$/.test(phone)) {
      throw fail(400, 'Enter a valid phone number.');
    }

    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw fail(400, 'Enter a valid email address.');
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
      throw fail(
        400,
        'Complete the required shipping address fields.',
      );
    }

    if (
      !Array.isArray(rawItems) ||
      rawItems.length === 0 ||
      rawItems.length > 20
    ) {
      throw fail(
        400,
        'Your bag must contain between 1 and 20 line items.',
      );
    }

    const quantities = new Map();

    for (const item of rawItems) {
      const productId = String(item?.productId || '');
      const quantity = item?.quantity;

      if (!mongoose.isValidObjectId(productId)) {
        throw fail(400, 'An item has an invalid product ID.');
      }

      if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        throw fail(
          400,
          'Each item quantity must be a whole number from 1 to 20.',
        );
      }

      const combined =
        (quantities.get(productId) || 0) + quantity;

      if (combined > 20) {
        throw fail(400, 'Maximum quantity per product is 20.');
      }

      quantities.set(productId, combined);
    }

    const orderItems = [];
    let subtotal = 0;

    for (const [productId, quantity] of quantities.entries()) {
      const product = await Product.findOne({
        _id: productId,
        isActive: true,
      }).lean();

      if (!product) {
        throw fail(
          404,
          'A product in your bag is no longer available.',
        );
      }

      if (product.stock < quantity) {
        throw fail(
          409,
          `${product.name} does not have enough stock.`,
        );
      }

      const price = Number(product.price);

      if (!Number.isFinite(price) || price < 0) {
        throw fail(500, 'A product has an invalid price.');
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

    const total = Number(
      (subtotal + SHIPPING_FEE).toFixed(2),
    );

    const amountPaise = Math.round(total * 100);

    if (!Number.isSafeInteger(amountPaise) || amountPaise < 1) {
      throw fail(400, 'The order total is invalid.');
    }

    const orderNumber =
      `VLS-${Date.now().toString(36).toUpperCase()}-` +
      crypto.randomBytes(3).toString('hex').toUpperCase();

    // Create the payment order on Razorpay's server.
    const razorpayOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: orderNumber,
      notes: { orderNumber },
    });

    // No stock is deducted here. Inventory is checked and
    // deducted atomically after payment is verified.
    const localOrder = await Order.create({
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
      paymentMethod: 'RAZORPAY',
      paymentStatus: 'pending',
      status: 'pending',
      razorpayOrderId: razorpayOrder.id,
    });

    return res.status(201).json({
      success: true,
      data: {
        orderNumber: localOrder.orderNumber,
        razorpayOrderId: razorpayOrder.id,
        keyId: process.env.RAZORPAY_KEY_ID,
        amount: amountPaise,
        currency: 'INR',
        customer: localOrder.customer,
        total: localOrder.total,
      },
    });
  } catch (error) {
    return sendRouteError(
      res,
      null,
      error,
      'Unable to start online payment. Please retry or use COD.',
    );
  }
});

// POST /api/payments/razorpay/verify
// Verify the checkout signature and payment with Razorpay.
// Deduct stock only after a captured payment is verified.
router.post('/razorpay/verify', async (req, res) => {
  let session;

  try {
    const razorpay = getRazorpay();

    const orderNumber = text(req.body?.orderNumber);
    const paymentId = text(req.body?.razorpay_payment_id);
    const signature = text(req.body?.razorpay_signature);

    if (!orderNumber || !paymentId || !signature) {
      throw fail(400, 'Missing payment verification details.');
    }

    const order = await Order.findOne({ orderNumber });

    if (!order) {
      throw fail(404, 'Order not found.');
    }

    if (order.paymentMethod !== 'RAZORPAY') {
      throw fail(400, 'This order does not use online payment.');
    }

    // Repeated verification must not deduct stock again.
    if (order.paymentStatus === 'paid') {
      if (
        order.razorpayPaymentId === paymentId &&
        order.status !== 'cancelled'
      ) {
        return res.json({
          success: true,
          message: 'Payment already verified.',
          data: publicOrder(order),
        });
      }

      throw fail(
        409,
        'This payment needs customer-support review.',
      );
    }

    if (order.paymentStatus !== 'pending') {
      throw fail(409, 'This order is no longer awaiting payment.');
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (
      !verifySignature(
        order.razorpayOrderId,
        paymentId,
        signature,
        secret,
      )
    ) {
      throw fail(400, 'Payment signature verification failed.');
    }

    const expectedAmount = Math.round(order.total * 100);

    // Check the actual payment details with Razorpay too.
    let payment = await razorpay.payments.fetch(paymentId);

    if (
      payment.order_id !== order.razorpayOrderId ||
      payment.amount !== expectedAmount ||
      payment.currency !== 'INR'
    ) {
      throw fail(400, 'Payment details do not match the order.');
    }

    // Capture an authorized payment if it has not yet been captured.
    if (payment.status === 'authorized') {
      payment = await razorpay.payments.capture(
        paymentId,
        expectedAmount,
      );
    }

    if (payment.status !== 'captured') {
      throw fail(
        409,
        'Payment has not been captured. You can retry checkout.',
      );
    }

    session = await mongoose.startSession();

    let paidOrder;

    try {
      await session.withTransaction(async () => {
        const currentOrder = await Order.findById(
          order._id,
        ).session(session);

        if (!currentOrder) {
          throw fail(404, 'Order not found.');
        }

        if (currentOrder.paymentStatus === 'paid') {
          if (
            currentOrder.razorpayPaymentId === paymentId &&
            currentOrder.status !== 'cancelled'
          ) {
            paidOrder = currentOrder;
            return;
          }

          throw fail(
            409,
            'This payment needs customer-support review.',
          );
        }

        if (currentOrder.paymentStatus !== 'pending') {
          throw fail(409, 'This order is no longer pending.');
        }

        for (const item of currentOrder.items) {
          const updateResult = await Product.updateOne(
            {
              _id: item.product,
              isActive: true,
              stock: { $gte: item.quantity },
            },
            {
              $inc: { stock: -item.quantity },
            },
            { session },
          );

          if (updateResult.modifiedCount !== 1) {
            throw fail(
              409,
              `${item.name} is no longer available in the required quantity.`,
              'OUT_OF_STOCK',
            );
          }
        }

        currentOrder.paymentStatus = 'paid';
        currentOrder.status = 'confirmed';
        currentOrder.razorpayPaymentId = paymentId;

        paidOrder = await currentOrder.save({ session });
      });
    } catch (inventoryError) {
      // The payment was captured, but the item sold out before
      // verification. Attempt a full refund instead of losing money.
      if (inventoryError.code === 'OUT_OF_STOCK') {
        try {
          await razorpay.payments.refund(paymentId, {
            amount: expectedAmount,
            notes: {
              orderNumber,
              reason: 'Stock unavailable',
            },
          });

          await Order.findByIdAndUpdate(order._id, {
            $set: {
              paymentStatus: 'refunded',
              status: 'cancelled',
              razorpayPaymentId: paymentId,
            },
          });

          return res.status(409).json({
            success: false,
            message:
              'An item sold out during checkout. A refund has been initiated.',
          });
        } catch (refundError) {
          console.error(
            'VELSHE refund needs manual review:',
            refundError.message,
          );

          // Do not hide the fact that the payment was captured.
          await Order.findByIdAndUpdate(order._id, {
            $set: {
              paymentStatus: 'paid',
              status: 'cancelled',
              razorpayPaymentId: paymentId,
            },
          });

          return res.status(500).json({
            success: false,
            message:
              'Payment was received, but the order needs support review. Contact VELSHE customer care.',
          });
        }
      }

      throw inventoryError;
    } finally {
      await session.endSession();
      session = null;
    }

    // Send confirmation only after payment and stock updates succeed.
    try {
      await sendOrderConfirmationEmail(paidOrder);
    } catch (emailError) {
      console.error(
        'Payment verified, but confirmation email failed:',
        emailError.message,
      );
    }

    return res.json({
      success: true,
      message: 'Payment verified and order confirmed.',
      data: publicOrder(paidOrder),
    });
  } catch (error) {
    return sendRouteError(
      res,
      null,
      error,
      'Unable to verify payment. Contact VELSHE customer care if money was deducted.',
    );
  } finally {
    if (session) {
      await session.endSession();
    }
  }
});

module.exports = router;