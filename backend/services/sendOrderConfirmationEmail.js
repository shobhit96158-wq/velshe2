const { Resend } = require('resend');

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

const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

async function sendOrderConfirmationEmail(order) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ORDER_EMAIL_FROM;
  const to = order?.customer?.email?.trim();

  if (!apiKey || !from) {
    console.warn(
      'Order saved, but email skipped: Resend configuration is missing.',
    );
    return false;
  }

  if (!to) {
    console.warn(
      `Order ${order.orderNumber} has no customer email address.`,
    );
    return false;
  }

  const resend = new Resend(apiKey);
  const items = Array.isArray(order.items) ? order.items : [];

  const rowsHtml = items.map((item) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #e8dece;">
        ${escapeHtml(item.name)} × ${Number(item.quantity) || 0}
      </td>
      <td style="padding:12px 0;border-bottom:1px solid #e8dece;text-align:right;">
        ${money((Number(item.price) || 0) * (Number(item.quantity) || 0))}
      </td>
    </tr>
  `).join('');

  const customerName = escapeHtml(order.customer?.name || 'there');
  const orderNumber = escapeHtml(order.orderNumber);
  const subtotal = money(order.subtotal);
  const shipping = money(order.shippingFee);
  const total = money(order.total);

  const text = `
Hi ${order.customer?.name || 'there'},

Thank you for choosing VELSHE. We've received your Cash on Delivery order.

Order number: ${order.orderNumber}

${items.map((item) =>
  `${item.name} × ${item.quantity} — ${money(
    (Number(item.price) || 0) * (Number(item.quantity) || 0),
  )}`
).join('\n')}

Subtotal: ${subtotal}
Shipping: ${shipping}
Total: ${total}

Payment method: Cash on Delivery
Payment status: Pending

Please keep your order number for tracking.

VELSHE — Fragrance, reimagined.
`.trim();

  const html = `
    <div style="margin:0;padding:32px 12px;background:#f1eadf;font-family:Arial,sans-serif;color:#302920;">
      <div style="max-width:560px;margin:auto;background:#fffdf8;border:1px solid #ded0ba;">
        <div style="padding:30px 26px;text-align:center;background:#111d22;color:#f5eee2;">
          <div style="font-size:25px;letter-spacing:5px;">VELSHE</div>
          <div style="margin-top:9px;font-size:9px;letter-spacing:3px;color:#d2b17c;">
            FRAGRANCE, REIMAGINED.
          </div>
        </div>

        <div style="padding:30px 26px;">
          <p style="font-size:10px;letter-spacing:2px;color:#997344;">
            ORDER CONFIRMATION
          </p>

          <h1 style="font-family:Georgia,serif;font-size:30px;font-weight:400;">
            Your order is in, ${customerName}.
          </h1>

          <p style="color:#74695c;font-size:14px;line-height:1.8;">
            Thank you for choosing VELSHE. We've received your order request.
          </p>

          <div style="margin:24px 0;padding:18px;background:#f3ecdf;border:1px solid #e1d1b7;">
            <div style="font-size:9px;letter-spacing:2px;color:#8e7048;">
              YOUR ORDER NUMBER
            </div>
            <div style="margin-top:10px;font-family:Georgia,serif;font-size:22px;overflow-wrap:anywhere;">
              ${orderNumber}
            </div>
          </div>

          <h2 style="font-family:Georgia,serif;font-weight:400;">
            Your fragrance selection
          </h2>

          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tbody>${rowsHtml}</tbody>
          </table>

          <table style="width:100%;margin-top:16px;border-collapse:collapse;font-size:13px;">
            <tr>
              <td style="padding:6px 0;color:#74695c;">Subtotal</td>
              <td style="padding:6px 0;text-align:right;">${subtotal}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#74695c;">Shipping</td>
              <td style="padding:6px 0;text-align:right;">${shipping}</td>
            </tr>
            <tr>
              <td style="padding:14px 0;border-top:1px solid #d8c4a3;font-weight:bold;color:#82613b;">TOTAL</td>
              <td style="padding:14px 0;border-top:1px solid #d8c4a3;text-align:right;font-weight:bold;color:#82613b;">${total}</td>
            </tr>
          </table>

          <div style="margin-top:24px;padding:16px;border:1px solid #e1d1b7;font-size:12px;">
            <p><strong>Payment:</strong> Cash on Delivery</p>
            <p><strong>Payment status:</strong> Pending</p>
          </div>

          <p style="margin-top:22px;font-size:12px;line-height:1.8;color:#74695c;">
            Keep your order number to look up your order on the VELSHE website.
          </p>
        </div>

        <div style="padding:18px;text-align:center;background:#f3ecdf;color:#8b7659;font-size:9px;letter-spacing:2px;">
          VELSHE · FRAGRANCE, REIMAGINED.
        </div>
      </div>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: `VELSHE order received — ${order.orderNumber}`,
    html,
    text,
  });

  if (error) {
    throw new Error(error.message || 'Resend could not accept the email.');
  }

  console.log(
    `Resend accepted confirmation for ${order.orderNumber}. Email ID: ${data?.id || 'not returned'}`,
  );

  return true;
}

module.exports = sendOrderConfirmationEmail;