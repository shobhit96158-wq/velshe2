import { useEffect, useRef, useState } from 'react'
import './App.css'

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'https://velshe-api.vercel.app'
).replace(/\/+$/, '')

const PRODUCT_PRESENTATION = {
  forbidden: {
    number: '01',
    description: 'Bold. Magnetic. Unforgettable.',
  },
  'frozen-rose': {
    number: '02',
    description: 'A softer side of statement.',
  },
}

function Arrow() {
  return <span className="arrow" aria-hidden="true">↗</span>
}

function BrandMonogram() {
  return (
    <span
      className="wordmark-monogram"
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        flex: '0 0 auto',
        alignItems: 'center',
        justifyContent: 'center',
        width: '0.78em',
        height: '0.78em',
        marginTop: '-0.06em',
        marginLeft: '0.02em',
        color: '#d4b47f',
        lineHeight: 1,
      }}
    >
      <svg viewBox="0 0 64 64" focusable="false">
        <path
          d="M7 8 L32 55 L57 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <path
          d="M16 8 L32 38 L48 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
        <path
          d="M25 8 L32 21 L39 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.5"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </svg>
    </span>
  )
}

function getImageUrl(image) {
  if (!image) return ''

  if (image.startsWith('/uploads/')) {
    return `${API_BASE}${image}`
  }

  return image
}

function App() {
  const [products, setProducts] = useState([])
  const [productsLoading, setProductsLoading] = useState(true)
  const [productsError, setProductsError] = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [cart, setCart] = useState([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [orderSubmitting, setOrderSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [orderConfirmation, setOrderConfirmation] = useState(null)

  // Customer order tracking inside the shopping bag.
  const [trackOrderFormOpen, setTrackOrderFormOpen] = useState(false)
  const [trackOrderNumber, setTrackOrderNumber] = useState('')
  const [trackOrderPhone, setTrackOrderPhone] = useState('')
  const [trackOrderLoading, setTrackOrderLoading] = useState(false)
  const [trackOrderError, setTrackOrderError] = useState('')
  const [trackedOrder, setTrackedOrder] = useState(null)

  // Side search for the fragrance catalogue.
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const [customer, setCustomer] = useState({
    name: '',
    phone: '',
    email: '',
  })

  const [shippingAddress, setShippingAddress] = useState({
    addressLine1: '',
    addressLine2: '',
    landmark: '',
    city: '',
    state: '',
    postalCode: '',
  })

  const closeButtonRef = useRef(null)
  const sideSearchInputRef = useRef(null)
  const cartCloseButtonRef = useRef(null)

  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0,
  )

  const cartSubtotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  )

  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const filteredProducts = products.filter((product) =>
    `${product.name} ${product.description}`
      .toLowerCase()
      .includes(normalizedSearchQuery),
  )

  // Focus the search input when the panel opens.
  useEffect(() => {
    if (isSearchOpen) {
      sideSearchInputRef.current?.focus()
    }
  }, [isSearchOpen])

  // Fetch the current product catalogue from the backend.
  useEffect(() => {
    const controller = new AbortController()

    async function loadProducts() {
      try {
        setProductsLoading(true)
        setProductsError('')

        const response = await fetch(`${API_BASE}/api/products`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Product request failed (${response.status})`)
        }

        const result = await response.json()

        if (!result.success || !Array.isArray(result.data)) {
          throw new Error('Unexpected product API response')
        }

        const fetchedProducts = result.data
          .map((item, index) => {
            const slug = String(item.slug || '').toLowerCase()
            const presentation = PRODUCT_PRESENTATION[slug] || {}
            const image = item.image || item.images?.[0] || ''

            return {
              id: item._id,
              slug,
              number:
                presentation.number ||
                String(index + 1).padStart(2, '0'),
              name: String(item.name || '').toUpperCase(),
              description:
                item.shortDescription ||
                presentation.description ||
                item.description ||
                '',
              image: getImageUrl(image),
              price: Number(item.price ?? 0),
              stock: Number(item.stock ?? 0),
            }
          })
          .sort((a, b) => a.number.localeCompare(b.number))

        setProducts(fetchedProducts)
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Failed to load VELSHE products:', error)
          setProductsError(
            'Our fragrances could not load. Please try again shortly.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setProductsLoading(false)
        }
      }
    }

    loadProducts()

    return () => controller.abort()
  }, [])

  // Reveal editorial and product content as it enters the viewport.
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (reducedMotion || !('IntersectionObserver' in window)) {
      document
        .querySelectorAll('.reveal-on-scroll')
        .forEach((element) => element.classList.add('is-visible'))

      return
    }

    const elements = document.querySelectorAll('.reveal-on-scroll')
    if (!elements.length) return

    const root = document.documentElement
    root.classList.add('reveal-enabled')

    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            currentObserver.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -35px 0px',
      },
    )

    elements.forEach((element) => observer.observe(element))

    return () => {
      observer.disconnect()
      root.classList.remove('reveal-enabled')
    }
  }, [products, productsLoading])

  // Manage overlays, Escape key, and body scrolling.
  useEffect(() => {
    if (!selectedProduct && !isCartOpen) return

    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement

    document.body.style.overflow = 'hidden'

    if (isCartOpen) {
      cartCloseButtonRef.current?.focus()
    } else {
      closeButtonRef.current?.focus()
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !orderSubmitting) {
        setSelectedProduct(null)
        setIsCartOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow

      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus()
      }
    }
  }, [selectedProduct, isCartOpen, orderSubmitting])

  // Cinematic desktop pointer lighting.
  function handleHeroPointerMove(event) {
    if (event.pointerType !== 'mouse') return

    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }

    const hero = event.currentTarget
    const bounds = hero.getBoundingClientRect()

    if (!bounds.width || !bounds.height) return

    const x = event.clientX - bounds.left
    const y = event.clientY - bounds.top

    hero.style.setProperty('--pointer-x', `${x}px`)
    hero.style.setProperty('--pointer-y', `${y}px`)

    const normalizedX = (x / bounds.width - 0.5) * 2
    const normalizedY = (y / bounds.height - 0.5) * 2

    hero.style.setProperty(
      '--pointer-rotate-x',
      `${(normalizedY * -3).toFixed(2)}deg`,
    )

    hero.style.setProperty(
      '--pointer-rotate-y',
      `${(normalizedX * 4).toFixed(2)}deg`,
    )
  }

  function resetHeroPointer(event) {
    const hero = event.currentTarget

    hero.style.removeProperty('--pointer-x')
    hero.style.removeProperty('--pointer-y')
    hero.style.removeProperty('--pointer-rotate-x')
    hero.style.removeProperty('--pointer-rotate-y')
  }

  function addToCart(product) {
    setOrderConfirmation(null)
    setCheckoutError('')
    setCheckoutOpen(false)

    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => item.id === product.id,
      )

      if (existing) {
        return currentCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }

      return [...currentCart, { ...product, quantity: 1 }]
    })

    setSelectedProduct(null)
    setIsCartOpen(true)
  }

  function updateQuantity(productId, amount) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.id === productId
            ? { ...item, quantity: item.quantity + amount }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  function removeFromCart(productId) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.id !== productId),
    )
  }

  function exploreOtherProduct() {
    if (!selectedProduct) return

    const otherProduct = products.find(
      (product) => product.id !== selectedProduct.id,
    )

    if (otherProduct) {
      setSelectedProduct(otherProduct)
    }
  }

  // Verify an order using its order number and checkout phone number.
  async function handleTrackOrder(event) {
    event.preventDefault()
    setTrackOrderError('')
    setTrackedOrder(null)
    setTrackOrderLoading(true)

    try {
      const response = await fetch(`${API_BASE}/api/orders/lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderNumber: trackOrderNumber.trim(),
          phone: trackOrderPhone.trim(),
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success || !result.data) {
        throw new Error(
          result.message || 'We could not verify your order.',
        )
      }

      setTrackedOrder(result.data)
    } catch (error) {
      setTrackOrderError(
        error.message || 'Unable to look up your order. Please try again.',
      )
    } finally {
      setTrackOrderLoading(false)
    }
  }

  // Submit a COD order. The backend verifies price and available stock.
  async function submitOrder(event) {
    event.preventDefault()
    setCheckoutError('')

    if (cart.length === 0) {
      setCheckoutError('Your bag is empty.')
      return
    }

    setOrderSubmitting(true)

    try {
      const response = await fetch(`${API_BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer: {
            name: customer.name.trim(),
            phone: customer.phone.trim(),
            email: customer.email.trim(),
          },
          shippingAddress: {
            addressLine1: shippingAddress.addressLine1.trim(),
            addressLine2: shippingAddress.addressLine2.trim(),
            landmark: shippingAddress.landmark.trim(),
            city: shippingAddress.city.trim(),
            state: shippingAddress.state.trim(),
            postalCode: shippingAddress.postalCode.trim(),
            country: 'India',
          },
          paymentMethod: 'COD',
          items: cart.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || 'We could not place your order.',
        )
      }

      setOrderConfirmation(result.data)

      // Prefill tracking after a successful order.
      setTrackOrderNumber(result.data.orderNumber || '')
      setTrackOrderPhone(customer.phone.trim())
      setTrackOrderFormOpen(true)
      setTrackedOrder(null)
      setTrackOrderError('')

      setCart([])
      setCheckoutOpen(false)
      setCheckoutError('')
      setIsCartOpen(true)
    } catch (error) {
      console.error('VELSHE order submission failed:', error)

      setCheckoutError(
        error.message || 'Unable to submit the order. Please try again.',
      )
    } finally {
      setOrderSubmitting(false)
    }
  }

  return (
    <main className="site-shell" id="top">
      {/* Brand opening */}
      <div className="brand-intro" aria-hidden="true">
        <div className="brand-intro-content">
          <span className="brand-intro-name">VELSHE</span>
          <span className="brand-intro-line" />
          <span className="brand-intro-tagline">
            FRAGRANCE, REIMAGINED.
          </span>
        </div>
      </div>

      {/* Navigation */}
   
<header className="site-header">
  <a
    className="wordmark wordmark-image"
    href="#top"
    aria-label="VELSHE home"
  >
    <img src="/velshe-logo.jpeg" alt="VELSHE Perfume" />
  </a>
        <nav className="navigation" aria-label="Main navigation">
          <a href="#story">Our Story</a>
          <a href="#collection">Fragrances</a>
          <a href="#experience">The Experience</a>
        </nav>

        <div className="header-actions">
          <button
            className="header-cart"
            type="button"
            onClick={() => {
              setSelectedProduct(null)
              setIsCartOpen(true)
            }}
            aria-label={`Open shopping bag, ${cartCount} items`}
          >
            BAG <span>{cartCount}</span>
          </button>

          <a className="header-cta" href="#collection">
            Discover <Arrow />
          </a>
        </div>
      </header>

      {/* Side search and Instagram shortcuts */}
      <aside className="side-utility" aria-label="Store shortcuts">
        <div
          className="side-search-panel"
          id="side-search-panel"
          hidden={!isSearchOpen}
        >
          <div className="side-search-panel-heading">
            <div>
              <p className="side-search-eyebrow">THE VELSHE EDIT</p>
              <h2>Find your signature.</h2>
            </div>

            <button
              className="side-search-close"
              type="button"
              onClick={() => setIsSearchOpen(false)}
              aria-label="Close search"
            >
              ×
            </button>
          </div>

          <form
            className="side-search-form"
            role="search"
            onSubmit={(event) => {
              event.preventDefault()
              setIsSearchOpen(false)

              document.getElementById('collection')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
              })
            }}
          >
            <label htmlFor="side-search-input">
              SEARCH FRAGRANCES
            </label>

            <div className="side-search-input-wrap">
              <svg
                className="side-search-input-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="10.8" cy="10.8" r="6.3" />
                <path d="m15.5 15.5 4.2 4.2" />
              </svg>

              <input
                ref={sideSearchInputRef}
                id="side-search-input"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Try Forbidden..."
                autoComplete="off"
              />

              {searchQuery && (
                <button
                  className="side-search-clear"
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <p className="side-search-status" aria-live="polite">
              {searchQuery.trim()
                ? `${filteredProducts.length} ${
                    filteredProducts.length === 1
                      ? 'fragrance'
                      : 'fragrances'
                  } found`
                : 'Search by fragrance name or description'}
            </p>

            <button className="side-search-submit" type="submit">
              VIEW RESULTS <Arrow />
            </button>
          </form>
        </div>

        <div className="side-utility-rail">
          <button
            className="side-utility-control side-search-toggle"
            type="button"
            aria-expanded={isSearchOpen}
            aria-controls="side-search-panel"
            onClick={() => setIsSearchOpen((open) => !open)}
            aria-label={
              isSearchOpen
                ? 'Close fragrance search'
                : 'Open fragrance search'
            }
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.3" />
              <path d="m15.5 15.5 4.2 4.2" />
            </svg>
            <span>SEARCH</span>
          </button>

          <a
            className="side-utility-control side-instagram-link"
            href="https://www.instagram.com/velsheperfume/"
            target="_blank"
            rel="noreferrer"
            aria-label="Visit VELSHE on Instagram, @velsheperfume"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect
                x="3.3"
                y="3.3"
                width="17.4"
                height="17.4"
                rx="5.1"
              />
              <circle cx="12" cy="12" r="4.1" />
              <circle
                className="side-instagram-dot"
                cx="17.6"
                cy="6.7"
                r="1"
              />
            </svg>
            <span>@velsheperfume</span>
          </a>
        </div>
      </aside>

      {/* Cinematic hero */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-line" aria-hidden="true" />
            THE ART OF PRESENCE
          </p>

          <h1 id="hero-title">
            Luxury
            <br />
            in every
            <br />
            <em>spray.</em>
          </h1>

          <p className="hero-description">
            Fragrance is more than what you wear.
            It&apos;s the memory you leave behind.
            Discover your signature with VELSHE.
          </p>

          <a className="hero-link" href="#collection">
            EXPLORE THE COLLECTION <Arrow />
          </a>

          <div className="hero-edition">
            <span className="edition-line" aria-hidden="true" />
            THE SIGNATURE COLLECTION
          </div>
        </div>

        <div
          className="hero-art"
          onPointerMove={handleHeroPointerMove}
          onPointerLeave={resetHeroPointer}
          onPointerCancel={resetHeroPointer}
        >
          <div className="hero-atmosphere" aria-hidden="true" />
          <div className="hero-cursor-glow" aria-hidden="true" />
          <div className="scent-particles" aria-hidden="true" />
          <div className="hero-light-sweep" aria-hidden="true" />
          <div className="light-ring light-ring-one" aria-hidden="true" />
          <div className="light-ring light-ring-two" aria-hidden="true" />
          <div className="water-wave wave-one" aria-hidden="true" />
          <div className="water-wave wave-two" aria-hidden="true" />

          <img
            className="hero-product"
            src="/products/forbidden-transparent.png"
            alt="VELSHE FORBIDDEN black perfume bottle with gold cap"
            fetchPriority="high"
          />

          <div className="hero-product-caption">
            <span>01 / 02</span>
            <span className="caption-divider" aria-hidden="true" />
            FORBIDDEN · EAU DE PARFUM
          </div>
        </div>

        <span className="hero-index">
          VELSHE — EST. IN THE MOMENT
        </span>
      </section>

      {/* Brand story */}
      <section className="story" id="story">
        <div className="story-image reveal-on-scroll">
          <img
            src="/products/frozen-rose-transparent.png"
            alt="VELSHE FROZEN ROSE pink perfume bottle"
            loading="lazy"
          />
          <span className="story-image-label">
            A STUDY IN CONTRAST
          </span>
        </div>

        <div className="story-copy reveal-on-scroll">
          <p className="eyebrow eyebrow-dark">
            <span className="eyebrow-line" aria-hidden="true" />
            THE HOUSE OF VELSHE
          </p>

          <h2>
            Identity,
            <br />
            bottled.
          </h2>

          <p className="story-lead">
            Not made to follow the room.
            Made to change how it feels.
          </p>

          <p className="story-description">
            VELSHE explores presence, character, and the
            details that make an impression last. Each
            fragrance expresses a different side of you.
          </p>

          <a className="story-link" href="#collection">
            DISCOVER THE COLLECTION <Arrow />
          </a>
        </div>
      </section>

      {/* Product collection */}
      <section className="collection" id="collection">
        <div className="collection-heading reveal-on-scroll">
          <div>
            <p className="eyebrow eyebrow-dark">
              <span className="eyebrow-line" aria-hidden="true" />
              FIND YOUR SIGNATURE
            </p>

            <h2>
              Distinct fragrances.
              <br />
              <em>Lasting impressions.</em>
            </h2>
          </div>

          <p className="collection-intro">
            Different moods. Distinct identities.
            Find the fragrance that feels like yours.
          </p>
        </div>

        <div className="product-grid">
          {productsLoading ? (
            <p role="status">Loading VELSHE fragrances…</p>
          ) : productsError ? (
            <div role="alert">
              <p>{productsError}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
              >
                TRY AGAIN
              </button>
            </div>
          ) : products.length === 0 ? (
            <p>No fragrances are available right now.</p>
          ) : filteredProducts.length === 0 ? (
            <p className="search-empty-state" role="status">
              No fragrances match “{searchQuery}”. Try another search.
            </p>
          ) : (
            filteredProducts.map((product) => (
              <article
                className="product-card reveal-on-scroll"
                key={product.id}
              >
                <button
                  className="product-image-wrap"
                  type="button"
                  onClick={() => setSelectedProduct(product)}
                  aria-label={`Discover ${product.name}`}
                  aria-haspopup="dialog"
                >
                  <span className="product-number">
                    {product.number}
                  </span>

                  <img
                    className="product-image"
                    src={product.image}
                    alt={`VELSHE ${product.name} perfume`}
                    loading="lazy"
                  />

                  <span className="product-image-action">
                    DISCOVER <Arrow />
                  </span>
                </button>

                <div className="product-details">
                  <div>
                    <h3>{product.name}</h3>
                    <p>{product.description}</p>
                    <p className="product-price">
                      ₹{product.price.toLocaleString('en-IN')}
                    </p>
                  </div>

                  <span className="product-count">
                    {product.number} / 02
                  </span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {/* Closing statement */}
      <section
        className="experience reveal-on-scroll"
        id="experience"
      >
        <div className="experience-glow" aria-hidden="true" />

        <p className="eyebrow">
          <span className="eyebrow-line" aria-hidden="true" />
          BE MORE THAN REMEMBERED
        </p>

        <h2>
          Leave something
          <br />
          <em>behind.</em>
        </h2>

        <p className="experience-description">
          The right fragrance doesn&apos;t announce itself.
          It stays with you.
        </p>

        <a className="experience-button" href="#collection">
          FIND YOUR FRAGRANCE <Arrow />
        </a>
      </section>

      {/* Footer */}
      <footer className="site-footer">
        <a className="wordmark" href="#top">
          VELSHE<BrandMonogram />
        </a>

        <span className="footer-tagline">
          FRAGRANCE, REIMAGINED.
        </span>

       
<div className="footer-links">
  <a href="#story">Our Story</a>
  <a href="#collection">Collection</a>
  <a href="#top">Back to top ↑</a>
</div>

<section className="footer-contact" aria-labelledby="footer-contact-title">
  <p className="footer-contact-eyebrow">WE'RE HERE FOR YOU</p>

  <h3 id="footer-contact-title">Customer Care</h3>

  <a className="footer-contact-email" href="mailto:velshe7@gmail.com">
    velshe7@gmail.com
  </a>

  <div className="footer-contact-phones">
    <a href="tel:8090544819">8090544819</a>
    <span aria-hidden="true">·</span>
    <a href="tel:8858702593">8858702593</a>
  </div>
</section>

<span className="copyright">
  © 2026 VELSHE. ALL RIGHTS RESERVED.
</span>

      </footer>

      {/* Fragrance detail modal */}
      {selectedProduct && (
        <div
          className="fragrance-dialog-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedProduct(null)
            }
          }}
        >
          <section
            className="fragrance-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fragrance-dialog-title"
            aria-describedby="fragrance-dialog-description"
          >
            <button
              ref={closeButtonRef}
              className="fragrance-dialog-close"
              type="button"
              aria-label="Close fragrance details"
              onClick={() => setSelectedProduct(null)}
            >
              ×
            </button>

            <div className="fragrance-dialog-visual">
              <div
                className="fragrance-dialog-halo"
                aria-hidden="true"
              />

              <img
                src={selectedProduct.image}
                alt={`VELSHE ${selectedProduct.name} perfume bottle`}
              />

              <span className="fragrance-dialog-visual-label">
                VELSHE · {selectedProduct.number} / 02
              </span>
            </div>

            <div className="fragrance-dialog-details">
              <p className="fragrance-dialog-eyebrow">
                <span className="eyebrow-line" aria-hidden="true" />
                THE SIGNATURE COLLECTION
              </p>

              <span className="fragrance-dialog-number">
                FRAGRANCE Nº {selectedProduct.number}
              </span>

              <h2 id="fragrance-dialog-title">
                {selectedProduct.name}
              </h2>

              <p className="fragrance-dialog-subtitle">
                {selectedProduct.description}
              </p>

              <p className="fragrance-dialog-price">
                ₹{selectedProduct.price.toLocaleString('en-IN')}
              </p>

              <div className="fragrance-dialog-divider" />

              <p
                className="fragrance-dialog-description"
                id="fragrance-dialog-description"
              >
                A VELSHE expression of presence, character,
                and individuality. Discover the fragrance
                that feels like your own signature.
              </p>

              <button
                className="fragrance-dialog-primary"
                type="button"
                onClick={() => addToCart(selectedProduct)}
              >
                ADD TO BAG · ₹
                {selectedProduct.price.toLocaleString('en-IN')}
                <Arrow />
              </button>

              <button
                className="fragrance-dialog-secondary"
                type="button"
                onClick={exploreOtherProduct}
              >
                EXPLORE THE OTHER FRAGRANCE
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Shopping bag and checkout */}
      {isCartOpen && (
        <div
          className="cart-overlay"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !orderSubmitting
            ) {
              setIsCartOpen(false)
            }
          }}
        >
          <aside
            className="cart-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cart-title"
          >
            <div className="cart-header">
              <div>
                <p className="cart-eyebrow">THE VELSHE EDIT</p>
                <h2 id="cart-title">Your bag</h2>
                <p className="cart-item-count">
                  {cartCount} {cartCount === 1 ? 'item' : 'items'}
                </p>
              </div>

              <button
                ref={cartCloseButtonRef}
                className="cart-close"
                type="button"
                aria-label="Close shopping bag"
                disabled={orderSubmitting}
                onClick={() => setIsCartOpen(false)}
              >
                ×
              </button>
            </div>

            {/* Order tracking inside the bag drawer */}
            <section className="bag-order-tracking">
              <button
                type="button"
                className="bag-order-track-toggle"
                onClick={() => {
                  setTrackOrderFormOpen((open) => !open)
                  setTrackOrderError('')
                }}
                aria-expanded={trackOrderFormOpen}
              >
                {trackOrderFormOpen
                  ? 'CLOSE ORDER TRACKING −'
                  : 'TRACK AN EXISTING ORDER ＋'}
              </button>

              {trackOrderFormOpen && (
                <div className="bag-order-track-content">
                  <p className="bag-order-track-intro">
                    Already placed an order? Enter your order
                    number and checkout phone number to check
                    its current status.
                  </p>

                  <form onSubmit={handleTrackOrder}>
                    <label htmlFor="bag-track-order-number">
                      ORDER NUMBER
                    </label>
                    <input
                      id="bag-track-order-number"
                      type="text"
                      value={trackOrderNumber}
                      onChange={(event) =>
                        setTrackOrderNumber(event.target.value)
                      }
                      placeholder="VLS-XXXXXXXX-XXXXXX"
                      autoComplete="off"
                      maxLength={40}
                      required
                    />

                    <label htmlFor="bag-track-order-phone">
                      CHECKOUT PHONE NUMBER
                    </label>
                    <input
                      id="bag-track-order-phone"
                      type="tel"
                      value={trackOrderPhone}
                      onChange={(event) =>
                        setTrackOrderPhone(event.target.value)
                      }
                      placeholder="Phone number used at checkout"
                      autoComplete="tel"
                      required
                    />

                    {trackOrderError && (
                      <p
                        className="bag-order-track-error"
                        role="alert"
                      >
                        {trackOrderError}
                      </p>
                    )}

                    <button
                      className="bag-order-track-submit"
                      type="submit"
                      disabled={trackOrderLoading}
                    >
                      {trackOrderLoading
                        ? 'CHECKING ORDER...'
                        : 'CHECK ORDER STATUS'}
                    </button>
                  </form>

                  {trackedOrder && (
                    <div
                      className="bag-order-track-result"
                      aria-live="polite"
                    >
                      <p className="bag-order-track-result-label">
                        ORDER VERIFIED
                      </p>

                      <h3>{trackedOrder.orderNumber}</h3>

                      <p>
                        Status:{' '}
                        <strong>
                          {String(
                            trackedOrder.status || 'pending',
                          ).toUpperCase()}
                        </strong>
                      </p>

                      {(trackedOrder.items || []).map(
                        (item, index) => (
                          <div
                            className="bag-order-track-item"
                            key={`${item.name}-${index}`}
                          >
                            <span>
                              {item.name} × {item.quantity}
                            </span>

                            <span>
                              ₹
                              {(
                                Number(item.price || 0) *
                                Number(item.quantity || 0)
                              ).toLocaleString('en-IN')}
                            </span>
                          </div>
                        ),
                      )}

                      <div className="bag-order-track-total">
                        <span>ORDER TOTAL</span>
                        <strong>
                          ₹
                          {Number(
                            trackedOrder.total || 0,
                          ).toLocaleString('en-IN')}
                        </strong>
                      </div>

                      <p className="bag-order-track-payment">
                        Payment: {trackedOrder.paymentMethod || 'COD'} ·{' '}
                        {trackedOrder.paymentStatus || 'pending'}
                      </p>

                      <button
                        type="button"
                        className="bag-order-track-reset"
                        onClick={() => {
                          setTrackedOrder(null)
                          setTrackOrderNumber('')
                          setTrackOrderPhone('')
                          setTrackOrderError('')
                        }}
                      >
                        LOOK UP ANOTHER ORDER
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Order confirmation */}
            {orderConfirmation ? (
              <div className="cart-empty cart-order-success">
                <span
                  className="cart-empty-mark"
                  aria-hidden="true"
                >
                  ✓
                </span>

                <h3>Order request received.</h3>
                <p>Your order number is:</p>
                <strong>{orderConfirmation.orderNumber}</strong>

                <p>
                  Payment method: Cash on Delivery.
                  Payment status: pending.
                </p>

                <p>
                  Total: ₹
                  {Number(
                    orderConfirmation.total,
                  ).toLocaleString('en-IN')}
                </p>

                <button
                  type="button"
                  className="cart-continue"
                  onClick={() => {
                    setIsCartOpen(false)
                    setOrderConfirmation(null)
                  }}
                >
                  CONTINUE SHOPPING <Arrow />
                </button>
              </div>
            ) : cart.length === 0 ? (
              <div className="cart-empty">
                <span
                  className="cart-empty-mark"
                  aria-hidden="true"
                >
                  V.
                </span>

                <h3>Your bag is waiting.</h3>
                <p>
                  Find the fragrance that feels like your signature.
                </p>

                <button
                  type="button"
                  className="cart-continue"
                  onClick={() => setIsCartOpen(false)}
                >
                  EXPLORE FRAGRANCES <Arrow />
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map((item) => (
                    <article className="cart-item" key={item.id}>
                      <div className="cart-item-image">
                        <img
                          src={item.image}
                          alt={`VELSHE ${item.name}`}
                        />
                      </div>

                      <div className="cart-item-info">
                        <span className="cart-item-number">
                          FRAGRANCE Nº {item.number}
                        </span>

                        <h3>{item.name}</h3>

                        <p className="cart-item-price">
                          ₹{item.price.toLocaleString('en-IN')}
                        </p>

                        <div className="cart-quantity">
                          <button
                            type="button"
                            aria-label={`Decrease ${item.name} quantity`}
                            disabled={orderSubmitting}
                            onClick={() =>
                              updateQuantity(item.id, -1)
                            }
                          >
                            −
                          </button>

                          <span aria-live="polite">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            aria-label={`Increase ${item.name} quantity`}
                            disabled={orderSubmitting}
                            onClick={() =>
                              updateQuantity(item.id, 1)
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="cart-item-end">
                        <strong>
                          ₹
                          {(
                            item.price * item.quantity
                          ).toLocaleString('en-IN')}
                        </strong>

                        <button
                          className="cart-remove"
                          type="button"
                          disabled={orderSubmitting}
                          onClick={() =>
                            removeFromCart(item.id)
                          }
                          aria-label={`Remove ${item.name} from bag`}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="cart-summary">
                  <div className="cart-subtotal">
                    <span>Estimated subtotal</span>
                    <strong>
                      ₹{cartSubtotal.toLocaleString('en-IN')}
                    </strong>
                  </div>

                  <p className="cart-shipping-note">
                    The server verifies final prices and available stock
                    when you place an order. Shipping is currently set
                    to ₹0 for development.
                  </p>

                  <button
                    type="button"
                    className="cart-checkout"
                    disabled={orderSubmitting}
                    onClick={() => {
                      setCheckoutOpen((open) => !open)
                      setCheckoutError('')
                    }}
                  >
                    {checkoutOpen
                      ? 'CLOSE CHECKOUT'
                      : 'CHECKOUT · CASH ON DELIVERY'}
                  </button>

                  {checkoutOpen && (
                    <form
                      className="checkout-form"
                      onSubmit={submitOrder}
                    >
                      <h3>Delivery details</h3>
                      <p>
                        Enter your details to submit a Cash on Delivery
                        order request.
                      </p>

                      <label>
                        Full name *
                        <input
                          required
                          maxLength={120}
                          autoComplete="name"
                          value={customer.name}
                          disabled={orderSubmitting}
                          onChange={(event) =>
                            setCustomer((current) => ({
                              ...current,
                              name: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Phone number *
                        <input
                          required
                          type="tel"
                          maxLength={25}
                          autoComplete="tel"
                          value={customer.phone}
                          disabled={orderSubmitting}
                          onChange={(event) =>
                            setCustomer((current) => ({
                              ...current,
                              phone: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Email address *
                        <input
                          required
                          type="email"
                          maxLength={254}
                          autoComplete="email"
                          value={customer.email}
                          disabled={orderSubmitting}
                          onChange={(event) =>
                            setCustomer((current) => ({
                              ...current,
                              email: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Address line 1 *
                        <input
                          required
                          maxLength={200}
                          autoComplete="address-line1"
                          value={shippingAddress.addressLine1}
                          disabled={orderSubmitting}
                          onChange={(event) =>
                            setShippingAddress((current) => ({
                              ...current,
                              addressLine1: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Address line 2
                        <input
                          maxLength={200}
                          autoComplete="address-line2"
                          value={shippingAddress.addressLine2}
                          disabled={orderSubmitting}
                          onChange={(event) =>
                            setShippingAddress((current) => ({
                              ...current,
                              addressLine2: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        Landmark (optional)
                        <input
                          maxLength={120}
                          value={shippingAddress.landmark}
                          disabled={orderSubmitting}
                          onChange={(event) =>
                            setShippingAddress((current) => ({
                              ...current,
                              landmark: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        City *
                        <input
                          required
                          maxLength={100}
                          autoComplete="address-level2"
                          value={shippingAddress.city}
                          disabled={orderSubmitting}
                          onChange={(event) =>
                            setShippingAddress((current) => ({
                              ...current,
                              city: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        State *
                        <input
                          required
                          maxLength={100}
                          autoComplete="address-level1"
                          value={shippingAddress.state}
                          disabled={orderSubmitting}
                          onChange={(event) =>
                            setShippingAddress((current) => ({
                              ...current,
                              state: event.target.value,
                            }))
                          }
                        />
                      </label>

                      <label>
                        PIN code *
                        <input
                          required
                          maxLength={12}
                          autoComplete="postal-code"
                          value={shippingAddress.postalCode}
                          disabled={orderSubmitting}
                          onChange={(event) =>
                            setShippingAddress((current) => ({
                              ...current,
                              postalCode: event.target.value,
                            }))
                          }
                        />
                      </label>

                      {checkoutError && (
                        <p className="checkout-error" role="alert">
                          {checkoutError}
                        </p>
                      )}

                      <button
                        className="cart-checkout"
                        type="submit"
                        disabled={orderSubmitting}
                      >
                        {orderSubmitting
                          ? 'PLACING ORDER…'
                          : 'PLACE COD ORDER'}
                      </button>

                      <p className="cart-checkout-note">
                        This creates a Cash on Delivery order request.
                        No online payment is processed.
                      </p>
                    </form>
                  )}

                  <button
                    type="button"
                    className="cart-continue"
                    disabled={orderSubmitting}
                    onClick={() => setIsCartOpen(false)}
                  >
                    CONTINUE EXPLORING <Arrow />
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </main>
  )
}

export default App