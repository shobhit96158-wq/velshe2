
import { useEffect, useRef, useState } from 'react'
import './App.css'

const products = [
  {
    number: '01',
    name: 'FORBIDDEN',
    description: 'Bold. Magnetic. Unforgettable.',
    image: '/products/forbidden-transparent.png',
    price: 499,
  },
  {
    number: '02',
    name: 'FROZEN ROSE',
    description: 'A softer side of statement.',
    image: '/products/frozen-rose-transparent.png',
    price: 499,
  },
]

function Arrow() {
  return <span className="arrow" aria-hidden="true">↗</span>
}

function App() {
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [cart, setCart] = useState([])
  const [isCartOpen, setIsCartOpen] = useState(false)

  const closeButtonRef = useRef(null)
  const cartCloseButtonRef = useRef(null)

  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0,
  )

  const cartSubtotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0,
  )

  // Reveal editorial content when it enters the viewport.
  useEffect(() => {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    if (reducedMotion || !('IntersectionObserver' in window)) {
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
  }, [])

  // Handle Escape and focus when a product or cart panel is open.
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
      if (event.key === 'Escape') {
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
  }, [selectedProduct, isCartOpen])

  // Desktop lighting and subtle product tilt.
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
    setCart((currentCart) => {
      const existing = currentCart.find(
        (item) => item.number === product.number,
      )

      if (existing) {
        return currentCart.map((item) =>
          item.number === product.number
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }

      return [...currentCart, { ...product, quantity: 1 }]
    })

    setSelectedProduct(null)
    setIsCartOpen(true)
  }

  function updateQuantity(productNumber, amount) {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.number === productNumber
            ? { ...item, quantity: item.quantity + amount }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  function removeFromCart(productNumber) {
    setCart((currentCart) =>
      currentCart.filter((item) => item.number !== productNumber),
    )
  }

  function exploreOtherProduct() {
    if (!selectedProduct) return

    const otherProduct = products.find(
      (product) => product.number !== selectedProduct.number,
    )

    if (otherProduct) setSelectedProduct(otherProduct)
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
        <a className="wordmark" href="#top" aria-label="VELSHE home">
          VELSHE<span aria-hidden="true">®</span>
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
          {products.map((product) => (
            <article
              className="product-card reveal-on-scroll"
              key={product.number}
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
          ))}
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
          VELSHE<span aria-hidden="true">®</span>
        </a>

        <span className="footer-tagline">
          FRAGRANCE, REIMAGINED.
        </span>

        <div className="footer-links">
          <a href="#story">Our Story</a>
          <a href="#collection">Collection</a>
          <a href="#top">Back to top ↑</a>
        </div>

        <span className="copyright">
          © 2026 VELSHE. ALL RIGHTS RESERVED.
        </span>
      </footer>

      {/* Product discovery modal */}
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

      {/* Sliding shopping bag */}
      {isCartOpen && (
        <div
          className="cart-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
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
                onClick={() => setIsCartOpen(false)}
              >
                ×
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="cart-empty">
                <span className="cart-empty-mark" aria-hidden="true">
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
                    <article className="cart-item" key={item.number}>
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
                            onClick={() => updateQuantity(item.number, -1)}
                          >
                            −
                          </button>

                          <span aria-live="polite">
                            {item.quantity}
                          </span>

                          <button
                            type="button"
                            aria-label={`Increase ${item.name} quantity`}
                            onClick={() => updateQuantity(item.number, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="cart-item-end">
                        <strong>
                          ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                        </strong>

                        <button
                          className="cart-remove"
                          type="button"
                          onClick={() => removeFromCart(item.number)}
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
                    <span>Subtotal</span>
                    <strong>
                      ₹{cartSubtotal.toLocaleString('en-IN')}
                    </strong>
                  </div>

                  <p className="cart-shipping-note">
                    Shipping and any applicable taxes are calculated
                    during checkout.
                  </p>

                  <button
                    type="button"
                    className="cart-checkout"
                    disabled
                  >
                    CHECKOUT SETUP COMING NEXT
                  </button>

                  <p className="cart-checkout-note">
                    This demo bag does not place orders or process
                    payments yet.
                  </p>

                  <button
                    type="button"
                    className="cart-continue"
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
