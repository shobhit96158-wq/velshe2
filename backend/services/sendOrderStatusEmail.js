const { Resend } = require('resend');

const STATUS_LABELS = {
  pending: 'Order received',
  confirmed: 'Order confirmed',
  processing: 'Being prepared',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[char];
  });
}

function money(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

async function sendOrderStatusEmail(order, previousStatus) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  const to = order?.customer?.email?.trim();

  if (!apiKey || !from) {
    console.warn(
      'Order status changed, but its email was skipped: Resend is not configured.',
    );
    return false;
  }

  if (!to) {
    console.warn(
      `Order ${order?.orderNumber} has no customer email for status notifications.`,
    );
    return false;
  }

  const status = order.status;
  const statusLabel = STATUS_LABELS[status] || status;
  const previousLabel = STATUS_LABELS[previousStatus] || previousStatus;
  const orderNumber = String(order.orderNumber || '');
  const customerName = escapeHtml(order.customer?.name || 'there');
  const safeOrderNumber = escapeHtml(orderNumber);

  const details = {
    confirmed: 'Your order has been confirmed by the VELSHE team.',
    processing: 'Your fragrance order is being prepared.',
    shipped: 'Your order has been marked as shipped.',
    delivered: 'Your order has been marked as delivered.',
    cancelled: 'Your order has been cancelled. Please contact us if you have questions.',
  };

  const message =
    details[status] ||
    `Your order status has been updated to ${statusLabel}.`;

  const subject = `VELSHE order update — ${statusLabel} (${orderNumber})`;

  const text = `
Hi ${order.customer?.name || 'there'},

There's an update to your VELSHE order.

Order number: ${orderNumber}
Previous status: ${previousLabel}
Current status: ${statusLabel}

${message}

Order total: ${money(order.total)}
Payment method: ${order.paymentMethod || 'COD'}
Payment status: ${order.paymentStatus || 'pending'}

VELSHE — Fragrance, reimagined.
`.trim();

  const html = `
    <div style="margin:0;padding:32px 12px;background:#f1eadf;font-family:Arial,Helvetica,sans-serif;color:#302920;">
      <div style="max-width:560px;margin:0 auto;background:#fffdf8;border:1px solid #ded0ba;">
        <div style="padding:30px 26px;text-align:center;background:#111d22;color:#f5eee2;">
          <div style="font-size:25px;letter-spacing:5px;">VELSHE</div>
          <div style="margin-top:9px;font-size:9px;letter-spacing:3px;color:#d2b17c;">
            FRAGRANCE, REIMAGINED.
          </div>
        </div>

        <div style="padding:30px 26px;">
          <p style="margin:0 0 10px;font-size:10px;letter-spacing:2px;color:#997344;">
            ORDER STATUS UPDATE
          </p>

          <h1 style="margin:0 0 15px;font-family:Georgia,serif;font-size:29px;font-weight:400;">
            ${escapeHtml(statusLabel)}.
          </h1>

          <p style="color:#74695c;font-size:14px;line-height:1.8;">
            Hi ${customerName}, ${escapeHtml(message)}
          </p>

          <div style="margin:24px 0;padding:18px;background:#f3ecdf;border:1px solid #e1d1b7;">
            <div style="font-size:9px;letter-spacing:2px;color:#8e7048;">
              YOUR ORDER NUMBER
            </div>
            <div style="margin-top:10px;font-family:Georgia,serif;font-size:22px;overflow-wrap:anywhere;">
              ${safeOrderNumber}
            </div>
            <div style="margin-top:18px;font-size:10px;letter-spacing:1.5px;color:#8e7048;">
              CURRENT STATUS
            </div>
            <div style="margin-top:7px;font-size:16px;font-weight:bold;">
              ${escapeHtml(statusLabel)}
            </div>
          </div>

          <p style="font-size:13px;color:#74695c;line-height:1.8;">
            Order total: <strong style="color:#302920;">${money(order.total)}</strong><br />
            Payment method: ${escapeHtml(order.paymentMethod || 'COD')}<br />
            Payment status: ${escapeHtml(order.paymentStatus || 'pending')}
          </p>

          <p style="margin-top:24px;font-size:12px;line-height:1.8;color:#74695c;">
            Keep your order number for reference when contacting VELSHE about your order.
          </p>
        </div>

        <div style="padding:18px;text-align:center;background:#f3ecdf;color:#8b7659;font-size:9px;letter-spacing:2px;">
          VELSHE · FRAGRANCE, REIMAGINED.
        </div>
      </div>
    </div>
  `;

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
    text,
    ...(process.env.ORDER_EMAIL_REPLY_TO
      ? { replyTo: process.env.ORDER_EMAIL_REPLY_TO }
      : {}),
  });

  if (error) {
    throw new Error(error.message || 'Resend could not accept the status email.');
  }

  console.log(
    `Resend accepted status email for ${orderNumber} (${status}). Email ID: ${data?.id || 'not returned'}`,
  );

  return true;
}

module.exports = sendOrderStatusEmail;