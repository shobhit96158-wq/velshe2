
import { useState } from 'react'
import './MyOrders.css'

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
).replace(/\/+$/, '')

const TRACKING_STEPS = [
  {
    key: 'pending',
    title: 'Order received',
    description: 'Your order request has been recorded.',
  },
  {
    key: 'confirmed',
    title: 'Order confirmed',
    description: 'The store has confirmed your order.',
  },
  {
    key: 'processing',
    title: 'Preparing your fragrance',
    description: 'Your order is being prepared.',
  },
  {
    key: 'shipped',
    title: 'On its way',
    description: 'Your order has been marked as shipped.',
  },
  {
    key: 'delivered',
    title: 'Delivered',
    description: 'Your order has been marked as delivered.',
  },
]

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`
}

function formatStatus(value) {
  return String(value || 'pending')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatDate(value) {
  if (!value) return 'Date unavailable'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable'
  }

  return date.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function MyOrders() {
  const [orderNumber, setOrderNumber] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('order') || ''
  })

  const [phone, setPhone] = useState('')
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLookup(event) {
    event.preventDefault()

    setError('')
    setOrder(null)
    setLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/orders/lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderNumber: orderNumber.trim().toUpperCase(),
          phone: phone.trim(),
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success || !result.data) {
        throw new Error(
          result.message || 'We could not look up that order.',
        )
      }

      setOrder(result.data)
    } catch (requestError) {
      setError(
        requestError.message ||
          'Could not connect to the order service. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  const status = String(order?.status || 'pending').toLowerCase()
  const currentStep = TRACKING_STEPS.findIndex(
    (step) => step.key === status,
  )

  return (
    <main className="my-orders-page">
      <header className="my-orders-header">
        <a className="my-orders-brand" href="/">
          VELSHE<span>®</span>
        </a>

        <a className="my-orders-back" href="/">
          Back to store <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className="my-orders-hero">
        <p className="my-orders-eyebrow">
          <span />
          THE VELSHE ORDER DESK
        </p>

        <h1>
          Your order,
          <br />
          <em>beautifully tracked.</em>
        </h1>

        <p className="my-orders-intro">
          Follow your fragrance from order confirmation to delivery.
          Enter the order number and the phone number used at checkout.
        </p>
      </section>

      <section className="my-orders-lookup">
        <div className="my-orders-lookup-heading">
          <span className="my-orders-number">01</span>
          <div>
            <h2>Find your order</h2>
            <p>Your order details are verified by our server.</p>
          </div>
        </div>

        <form onSubmit={handleLookup}>
          <label>
            Order number
            <input
              required
              maxLength={40}
              autoComplete="off"
              placeholder="e.g. VLS-XXXXXXXX-ABC123"
              value={orderNumber}
              onChange={(event) => setOrderNumber(event.target.value)}
            />
          </label>

          <label>
            Phone number used at checkout
            <input
              required
              type="tel"
              maxLength={25}
              autoComplete="tel"
              placeholder="Enter your checkout phone number"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>

          {error && (
            <p className="my-orders-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="my-orders-submit"
            type="submit"
            disabled={loading}
          >
            {loading ? 'VERIFYING ORDER…' : 'FIND MY ORDER'}
            <span aria-hidden="true">↗</span>
          </button>

          <p className="my-orders-privacy">
            We show only order tracking information here, not your full
            delivery address or contact details.
          </p>
        </form>
      </section>

      {order && (
        <section
          className="my-orders-result"
          aria-live="polite"
          aria-label="Order details"
        >
          <div className="my-orders-result-header">
            <div>
              <p className="my-orders-eyebrow">VERIFIED ORDER</p>
              <h2>{order.orderNumber}</h2>
              <p className="my-orders-date">
                Placed {formatDate(order.createdAt)}
              </p>
            </div>

            <span
              className={`my-orders-status status-${status}`}
            >
              {formatStatus(status)}
            </span>
          </div>

          {status === 'cancelled' ? (
            <div className="my-orders-cancelled">
              <span aria-hidden="true">!</span>
              <div>
                <h3>This order was cancelled</h3>
                <p>
                  Please contact the store if you need help with this order.
                </p>
              </div>
            </div>
          ) : (
            <div className="my-orders-timeline">
              {TRACKING_STEPS.map((step, index) => {
                const complete =
                  currentStep >= 0 && index < currentStep
                const active = index === currentStep

                return (
                  <div
                    className={[
                      'my-orders-step',
                      complete ? 'is-complete' : '',
                      active ? 'is-active' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={step.key}
                  >
                    <div className="my-orders-step-marker">
                      {complete ? '✓' : String(index + 1).padStart(2, '0')}
                    </div>

                    <div className="my-orders-step-copy">
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                      {active && (
                        <span className="my-orders-current">
                          CURRENT STATUS
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              {currentStep === -1 && (
                <p className="my-orders-note">
                  Current status: {formatStatus(status)}. Contact the store
                  if you need more information.
                </p>
              )}
            </div>
          )}

          <div className="my-orders-items">
            <div className="my-orders-section-heading">
              <h3>Order summary</h3>
              <span>{order.items?.length || 0} line items</span>
            </div>

            {(order.items || []).map((item, index) => (
              <div
                className="my-orders-item"
                key={`${item.name || 'item'}-${index}`}
              >
                <div>
                  <h4>{item.name || 'VELSHE fragrance'}</h4>
                  <p>Quantity: {item.quantity}</p>
                </div>

                <strong>
                  {formatCurrency(
                    Number(item.price || 0) * Number(item.quantity || 0),
                  )}
                </strong>
              </div>
            ))}

            <div className="my-orders-total-row">
              <span>Subtotal</span>
              <strong>{formatCurrency(order.subtotal)}</strong>
            </div>

            <div className="my-orders-total-row">
              <span>Shipping</span>
              <strong>{formatCurrency(order.shippingFee)}</strong>
            </div>

            <div className="my-orders-total-row is-total">
              <span>Total</span>
              <strong>{formatCurrency(order.total)}</strong>
            </div>

            <div className="my-orders-payment">
              <div>
                <span>Payment method</span>
                <strong>{formatStatus(order.paymentMethod)}</strong>
              </div>

              <div>
                <span>Payment status</span>
                <strong>{formatStatus(order.paymentStatus)}</strong>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="my-orders-another"
            onClick={() => {
              setOrder(null)
              setError('')
            }}
          >
            LOOK UP ANOTHER ORDER
          </button>
        </section>
      )}

      <footer className="my-orders-footer">
        VELSHE® · FRAGRANCE, REIMAGINED.
      </footer>
    </main>
  )
}

export default MyOrders
