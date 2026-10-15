
import { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import './Admin.css'

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || 'https://velshe-api.vercel.app'
).replace(/\/+$/, '')

const MAX_IMAGE_SIZE = 5 * 1024 * 1024

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
])

const emptyProduct = {
  name: '',
  slug: '',
  shortDescription: '',
  description: '',
  price: '499',
  stock: '0',
  image: '',
}

const ORDER_STATUS_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

function formatStatus(status) {
  return String(status || 'pending')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`
}

function formatDate(date) {
  if (!date) return 'Date unavailable'

  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) {
    return 'Date unavailable'
  }

  return parsed.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function resolveImageUrl(image) {
  if (!image) return ''

  if (/^https?:\/\//i.test(image)) {
    return image
  }

  if (image.startsWith('/uploads/')) {
    return `${API_BASE}${image}`
  }

  return image
}

async function adminRequest(path, token, options = {}) {
  const headers = { ...(options.headers || {}) }

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    })
  } catch {
    throw new Error(
      'Could not connect to the VELSHE API. Check that the backend is running.',
    )
  }

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(
      result.message || `Request failed (${response.status})`,
    )

    error.status = response.status
    throw error
  }

  return result
}

function validateImageFile(file) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Choose a JPG, PNG, WEBP or AVIF image.')
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('Image must be 5 MB or smaller.')
  }
}

async function uploadAdminImage(file, token) {
  validateImageFile(file)

  const formData = new FormData()
  formData.append('image', file)

  let response

  try {
    response = await fetch(`${API_BASE}/api/admin/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    })
  } catch {
    throw new Error(
      'Image upload failed because the backend could not be reached.',
    )
  }

  const result = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(result.message || 'Image upload failed.')
  }

  if (!result.url) {
    throw new Error('The server did not return an image URL.')
  }

  return result.url
}

function downloadInvoice(order) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 16
  const right = pageWidth - margin
  const contentWidth = pageWidth - margin * 2

  const navy = [7, 19, 33]
  const gold = [212, 180, 127]
  const ink = [41, 37, 31]
  const muted = [110, 100, 85]
  const pale = [243, 235, 221]

  const safe = (value) =>
    String(value ?? '').trim() || '-'

  const currency = (amount) =>
    `INR ${Number(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  const customer = order.customer || {}
  const address = order.shippingAddress || {}
  const items = Array.isArray(order.items) ? order.items : []

  const orderNumber = String(
    order.orderNumber || order._id || 'ORDER',
  )

  const orderDate = order.createdAt
    ? formatDate(order.createdAt)
    : new Date().toLocaleDateString('en-IN')

  const deliveryAddress = [
    address.addressLine1,
    address.addressLine2,
    address.landmark,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(', ')

  const drawWrapped = (
    value,
    x,
    y,
    maxWidth,
    {
      size = 9,
      style = 'normal',
      color = ink,
      lineHeight = 4.5,
    } = {},
  ) => {
    pdf.setFont('helvetica', style)
    pdf.setFontSize(size)
    pdf.setTextColor(...color)

    const lines = pdf.splitTextToSize(safe(value), maxWidth)
    pdf.text(lines, x, y)

    return y + lines.length * lineHeight
  }

  const drawTableHeader = (y) => {
    pdf.setFillColor(...pale)
    pdf.rect(margin, y, contentWidth, 10, 'F')

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(...ink)

    pdf.text('ITEM', margin + 4, y + 6.5)
    pdf.text('QTY', 124, y + 6.5, { align: 'center' })
    pdf.text('UNIT PRICE', 158, y + 6.5, { align: 'right' })
    pdf.text('AMOUNT', right - 3, y + 6.5, {
      align: 'right',
    })
  }

  // Branded invoice header.
  pdf.setFillColor(...navy)
  pdf.rect(0, 0, pageWidth, 38, 'F')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(24)
  pdf.setTextColor(...gold)
  pdf.text('VELSHE', margin, 18)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.text('FRAGRANCE, REIMAGINED.', margin, 25)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.setTextColor(255, 250, 241)
  pdf.text('ORDER INVOICE', right, 19, {
    align: 'right',
  })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(...gold)
  pdf.text('CUSTOMER ORDER RECORD', right, 26, {
    align: 'right',
  })

  // Order details.
  let y = 51

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(...ink)
  pdf.text(`Order No: ${orderNumber}`, margin, y)

  pdf.setFont('helvetica', 'normal')
  pdf.text(`Date: ${orderDate}`, right, y, {
    align: 'right',
  })

  y += 7

  pdf.text(
    `Order status: ${formatStatus(order.status)}`,
    margin,
    y,
  )

  pdf.text(
    `Payment: ${formatStatus(order.paymentMethod)}`,
    right,
    y,
    { align: 'right' },
  )

  y += 8

  pdf.setDrawColor(...gold)
  pdf.setLineWidth(0.4)
  pdf.line(margin, y, right, y)

  // Customer and delivery information.
  y += 12

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...gold)
  pdf.text('CUSTOMER', margin, y)
  pdf.text('DELIVERY ADDRESS', 112, y)

  let customerY = y + 8
  let addressY = y + 8

  customerY = drawWrapped(
    customer.name || 'Customer not provided',
    margin,
    customerY,
    78,
    { style: 'bold' },
  )

  customerY += 2

  customerY = drawWrapped(
    customer.phone || 'Phone not provided',
    margin,
    customerY,
    78,
    { color: muted },
  )

  if (customer.email) {
    customerY += 1
    customerY = drawWrapped(
      customer.email,
      margin,
      customerY,
      78,
      { color: muted },
    )
  }

  addressY = drawWrapped(
    deliveryAddress || 'No delivery address recorded',
    112,
    addressY,
    right - 112,
    { color: muted },
  )

  y = Math.max(customerY, addressY) + 8

  // Product table.
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...ink)
  pdf.text('ORDER ITEMS', margin, y)

  y += 5
  drawTableHeader(y)
  y += 14

  const calculatedTotal = items.reduce(
    (sum, item) =>
      sum +
      Number(item.price || 0) *
        Number(item.quantity || 1),
    0,
  )

  items.forEach((item) => {
    const name =
      item.name ||
      item.productName ||
      item.product?.name ||
      'Fragrance'

    const quantity = Number(item.quantity || 1)
    const unitPrice = Number(item.price || 0)
    const amount = unitPrice * quantity

    const nameLines = pdf.splitTextToSize(
      safe(name),
      94,
    )

    const rowHeight = Math.max(
      10,
      nameLines.length * 4.5 + 4,
    )

    // Start a new page for long orders.
    if (y + rowHeight > 250) {
      pdf.addPage()

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(11)
      pdf.setTextColor(...navy)
      pdf.text(
        `VELSHE | INVOICE ${orderNumber}`,
        margin,
        16,
      )

      y = 22
      drawTableHeader(y)
      y += 14
    }

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(...ink)
    pdf.text(nameLines, margin + 4, y + 4.5)

    pdf.text(String(quantity), 124, y + 4.5, {
      align: 'center',
    })

    pdf.text(currency(unitPrice), 158, y + 4.5, {
      align: 'right',
    })

    pdf.text(currency(amount), right - 3, y + 4.5, {
      align: 'right',
    })

    y += rowHeight

    pdf.setDrawColor(226, 216, 201)
    pdf.setLineWidth(0.2)
    pdf.line(margin, y, right, y)

    y += 2
  })

  if (items.length === 0) {
    y = drawWrapped(
      'No item details available for this order.',
      margin + 4,
      y,
      contentWidth - 8,
      { color: muted },
    )
    y += 4
  }

  // Keep the total and payment details together.
  if (y + 55 > 270) {
    pdf.addPage()
    y = 24
  }

  y += 7

  const orderTotal =
    order.total == null
      ? calculatedTotal
      : Number(order.total)

  pdf.setFillColor(...navy)
  pdf.rect(margin, y, contentWidth, 19, 'F')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(...gold)
  pdf.text('ORDER TOTAL', margin + 5, y + 8)

  pdf.setFontSize(12)
  pdf.setTextColor(255, 250, 241)
  pdf.text(currency(orderTotal), right - 5, y + 8, {
    align: 'right',
  })

  y += 27

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...muted)

  pdf.text(
    `Payment status: ${formatStatus(order.paymentStatus)}`,
    margin,
    y,
  )

  y += 6

  pdf.text(
    'Thank you for choosing VELSHE.',
    margin,
    y,
  )

  // Customer care details at the bottom of the final page.
  const footerY = 278

  pdf.setDrawColor(...gold)
  pdf.line(margin, footerY - 6, right, footerY - 6)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(...muted)

  pdf.text(
    'Customer care: velshe7@gmail.com',
    margin,
    footerY,
  )

  pdf.text(
    '8090544819  |  8858702593',
    right,
    footerY,
    { align: 'right' },
  )

  const safeOrderNumber = orderNumber.replace(
    /[^a-z0-9_-]/gi,
    '-',
  )

  pdf.save(`VELSHE-Invoice-${safeOrderNumber}.pdf`)
}

function Admin() {
  const [token, setToken] = useState(
    () => sessionStorage.getItem('velshe_admin_token') || '',
  )

  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')

  const [products, setProducts] = useState([])
  const [newProduct, setNewProduct] = useState({ ...emptyProduct })

  const [orders, setOrders] = useState([])
  const [ordersRefresh, setOrdersRefresh] = useState(0)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [orderSaving, setOrderSaving] = useState('')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState('')
  const [uploadingImage, setUploadingImage] = useState('')

  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Load products when an admin session is available.
  useEffect(() => {
    if (!token) {
      setProducts([])
      setLoading(false)
      return
    }

    const controller = new AbortController()

    async function loadProducts() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(
          `${API_BASE}/api/admin/products`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          },
        )

        const result = await response.json().catch(() => ({}))

        if (response.status === 401) {
          sessionStorage.removeItem('velshe_admin_token')
          setError('Your session expired. Please sign in again.')
          setToken('')
          return
        }

        if (!response.ok) {
          throw new Error(
            result.message || 'Could not load products.',
          )
        }

        setProducts(
          Array.isArray(result.data) ? result.data : [],
        )
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError(
            requestError.message || 'Could not load products.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    loadProducts()

    return () => controller.abort()
  }, [token])

  // Load customer orders from the protected admin endpoint.
  useEffect(() => {
    if (!token) {
      setOrders([])
      setOrdersLoading(false)
      return
    }

    const controller = new AbortController()

    async function loadOrders() {
      setOrdersLoading(true)
      setOrdersError('')

      try {
        const response = await fetch(
          `${API_BASE}/api/admin/orders`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: controller.signal,
          },
        )

        const result = await response.json().catch(() => ({}))

        if (response.status === 401) {
          sessionStorage.removeItem('velshe_admin_token')
          setError('Your session expired. Please sign in again.')
          setToken('')
          return
        }

        if (!response.ok) {
          throw new Error(
            result.message || 'Could not load customer orders.',
          )
        }

        // Accept the standard { success, data } response and
        // the common direct-array response format.
        const orderData = Array.isArray(result.data)
          ? result.data
          : Array.isArray(result.orders)
            ? result.orders
            : Array.isArray(result)
              ? result
              : null

        if (!orderData) {
          throw new Error(
            result.message ||
              'Unexpected orders API response. Check the backend route.',
          )
        }

        setOrders(orderData)
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setOrdersError(
            requestError.message || 'Could not load customer orders.',
          )
        }
      } finally {
        if (!controller.signal.aborted) {
          setOrdersLoading(false)
        }
      }
    }

    loadOrders()

    return () => controller.abort()
  }, [token, ordersRefresh])

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving('login')

    try {
      const result = await adminRequest('/api/admin/login', null, {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })

      if (!result.token) {
        throw new Error('The server did not return a login token.')
      }

      sessionStorage.setItem('velshe_admin_token', result.token)
      setToken(result.token)
      setPassword('')
      setMessage('Signed in successfully.')
    } catch (requestError) {
      setError(requestError.message || 'Sign-in failed.')
    } finally {
      setSaving('')
    }
  }

  function logout() {
    sessionStorage.removeItem('velshe_admin_token')
    setToken('')
    setProducts([])
    setOrders([])
    setMessage('')
    setError('')
    setOrdersError('')
  }

  function updateLocalProduct(id, field, value) {
    setProducts((current) =>
      current.map((product) =>
        product._id === id
          ? { ...product, [field]: value }
          : product,
      ),
    )
  }

  function updateNewProduct(field, value) {
    setNewProduct((current) => ({
      ...current,
      [field]: value,
    }))
  }

  // Upload an image for a new product.
  async function handleNewProductImageChange(event) {
    const input = event.currentTarget
    const file = input.files?.[0]

    if (!file) return

    setError('')
    setMessage('')
    setUploadingImage('new-product')

    try {
      const imagePath = await uploadAdminImage(file, token)

      setNewProduct((current) => ({
        ...current,
        image: imagePath,
      }))

      setMessage(
        'Image uploaded. Click SAVE NEW PRODUCT to add the product.',
      )
    } catch (requestError) {
      setError(requestError.message || 'Image upload failed.')
    } finally {
      setUploadingImage('')
      input.value = ''
    }
  }

  // Upload a replacement image for an existing product.
  async function handleExistingProductImageChange(product, event) {
    const input = event.currentTarget
    const file = input.files?.[0]

    if (!file) return

    setError('')
    setMessage('')
    setUploadingImage(product._id)

    try {
      const imagePath = await uploadAdminImage(file, token)

      updateLocalProduct(product._id, 'image', imagePath)

      setMessage(
        `${product.name}: image uploaded. Click SAVE CHANGES to keep it.`,
      )
    } catch (requestError) {
      setError(requestError.message || 'Image upload failed.')
    } finally {
      setUploadingImage('')
      input.value = ''
    }
  }

  // Save product edits to MongoDB.
  async function saveProduct(product) {
    setError('')
    setMessage('')

    const name = String(product.name || '').trim()
    const slug = String(product.slug || '').trim().toLowerCase()
    const image = String(product.image || '').trim()
    const price = Number(product.price)
    const stock = Number(product.stock)

    if (!name || !slug || !image) {
      setError('Name, slug and image path are required.')
      return
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError(
        'Use a lowercase URL slug with letters, numbers and single hyphens.',
      )
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setError(`Enter a valid price for ${name}.`)
      return
    }

    if (!Number.isInteger(stock) || stock < 0) {
      setError(
        `Stock for ${name} must be a non-negative whole number.`,
      )
      return
    }

    const shortDescription = String(
      product.shortDescription || '',
    ).trim()

    const description = String(
      product.description || '',
    ).trim()

    const payload = {
      name,
      slug,
      price,
      stock,
      image,
      images: [image],
      isActive: Boolean(product.isActive),
    }

    // Skip blank descriptions to remain compatible with the
    // product validation in the current backend.
    if (shortDescription) {
      payload.shortDescription = shortDescription
    }

    if (description) {
      payload.description = description
    }

    setSaving(product._id)

    try {
      const result = await adminRequest(
        `/api/admin/products/${product._id}`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      )

      if (!result.data) {
        throw new Error('The API did not return the saved product.')
      }

      setProducts((current) =>
        current.map((item) =>
          item._id === product._id ? result.data : item,
        ),
      )

      setMessage(`${result.data.name} saved successfully.`)
    } catch (requestError) {
      setError(requestError.message || 'Could not save product.')
    } finally {
      setSaving('')
    }
  }

  // Create a new product in MongoDB.
  async function createProduct(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    const name = newProduct.name.trim()
    const slug = newProduct.slug.trim().toLowerCase()
    const image = newProduct.image.trim()
    const price = Number(newProduct.price)
    const stock = Number(newProduct.stock)

    if (!name || !slug || !image) {
      setError('Name, slug and image path are required.')
      return
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError(
        'Use a lowercase URL slug with letters, numbers and single hyphens.',
      )
      return
    }

    if (!Number.isFinite(price) || price < 0) {
      setError('Price must be a non-negative number.')
      return
    }

    if (!Number.isInteger(stock) || stock < 0) {
      setError('Stock must be a non-negative whole number.')
      return
    }

    const payload = {
      name,
      slug,
      price,
      stock,
      image,
      images: [image],
      isActive: true,
    }

    const shortDescription = newProduct.shortDescription.trim()
    const description = newProduct.description.trim()

    if (shortDescription) {
      payload.shortDescription = shortDescription
    }

    if (description) {
      payload.description = description
    }

    setSaving('create')

    try {
      const result = await adminRequest(
        '/api/admin/products',
        token,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      )

      if (!result.data) {
        throw new Error('The API did not return the created product.')
      }

      setProducts((current) => [result.data, ...current])
      setNewProduct({ ...emptyProduct })
      setShowCreateForm(false)
      setMessage(`${result.data.name} was added successfully.`)
    } catch (requestError) {
      setError(requestError.message || 'Could not create product.')
    } finally {
      setSaving('')
    }
  }

  // Deactivate instead of permanently deleting a product.
  async function deactivateProduct(product) {
    const confirmed = window.confirm(
      `Deactivate ${product.name}? It will be hidden from the storefront.`,
    )

    if (!confirmed) return

    setError('')
    setMessage('')
    setSaving(product._id)

    try {
      const result = await adminRequest(
        `/api/admin/products/${product._id}`,
        token,
        { method: 'DELETE' },
      )

      if (!result.data) {
        throw new Error('The API did not return the updated product.')
      }

      setProducts((current) =>
        current.map((item) =>
          item._id === product._id ? result.data : item,
        ),
      )

      setMessage(`${product.name} is now inactive.`)
    } catch (requestError) {
      setError(
        requestError.message || 'Could not deactivate product.',
      )
    } finally {
      setSaving('')
    }
  }

  // Update an order through the authenticated backend endpoint.
  async function updateOrder(order, nextStatus) {
    const currentStatus = String(order.status || 'pending').toLowerCase()
    const allowedNextStatuses =
      ORDER_STATUS_TRANSITIONS[currentStatus] || []

    if (!allowedNextStatuses.includes(nextStatus)) {
      setOrdersError(
        `The status change from ${formatStatus(currentStatus)} to ${formatStatus(nextStatus)} is not allowed.`,
      )
      return
    }

    if (
      nextStatus === 'cancelled' &&
      !window.confirm(
        `Cancel order ${order.orderNumber}? Check that the backend restores inventory correctly.`,
      )
    ) {
      return
    }

    setOrdersError('')
    setError('')
    setMessage('')
    setOrderSaving(order._id)

    try {
      const result = await adminRequest(
        `/api/admin/orders/${order._id}`,
        token,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      )

      const updatedOrder = result.data || result.order

      if (!updatedOrder) {
        throw new Error(
          'The backend did not return the updated order. Check the PATCH API response.',
        )
      }

      setOrders((current) =>
        current.map((item) =>
          item._id === order._id ? updatedOrder : item,
        ),
      )

      setMessage(
        `Order ${order.orderNumber} updated to ${formatStatus(nextStatus)}.`,
      )
    } catch (requestError) {
      if (requestError.status === 401) {
        sessionStorage.removeItem('velshe_admin_token')
        setToken('')
        setError('Your session expired. Please sign in again.')
        return
      }

      setOrdersError(
        requestError.message || 'Could not update the order.',
      )
    } finally {
      setOrderSaving('')
    }
  }

  if (!token) {
    return (
      <main className="admin-page admin-login-page">
        <a className="admin-brand" href="/">
          VELSHE<span>®</span>
        </a>

        <form className="admin-login-card" onSubmit={handleLogin}>
          <p className="admin-kicker">PRIVATE ACCESS</p>
          <h1>Welcome back.</h1>
          <p className="admin-muted">
            Sign in to manage your VELSHE store.
          </p>

          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error && (
            <p className="admin-alert admin-alert-error" role="alert">
              {error}
            </p>
          )}

          {message && (
            <p
              className="admin-alert admin-alert-success"
              role="status"
            >
              {message}
            </p>
          )}

          <button
            className="admin-button admin-button-primary"
            type="submit"
            disabled={saving === 'login'}
          >
            {saving === 'login' ? 'SIGNING IN…' : 'SIGN IN'}
          </button>

          <a className="admin-back-link" href="/">
            ← Return to storefront
          </a>
        </form>
      </main>
    )
  }

  const totalStock = products.reduce(
    (sum, product) => sum + Number(product.stock || 0),
    0,
  )

  const activeProducts = products.filter(
    (product) => product.isActive,
  ).length

  const pendingOrders = orders.filter(
    (order) => String(order.status || '').toLowerCase() === 'pending',
  ).length

  const revenueTotal = orders.reduce((sum, order) => {
    const status = String(order.status || '').toLowerCase()

    if (status === 'cancelled') return sum

    return sum + Number(order.total || 0)
  }, 0)

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <a className="admin-brand" href="/">
          VELSHE<span>®</span>
        </a>

        <div className="admin-topbar-actions">
          <span className="admin-session-label">
            STORE MANAGEMENT
          </span>

          <button
            className="admin-button admin-button-outline"
            type="button"
            onClick={logout}
          >
            SIGN OUT
          </button>
        </div>
      </header>

      <section className="admin-main">
        <div className="admin-heading-row">
          <div>
            <p className="admin-kicker">THE VELSHE HOUSE</p>
            <h1>Store management</h1>
            <p className="admin-muted">
              Manage fragrances, images, prices, inventory and customer orders.
            </p>
          </div>

          <button
            className="admin-button admin-button-primary"
            type="button"
            onClick={() => setShowCreateForm((value) => !value)}
          >
            {showCreateForm ? 'CANCEL' : '+ ADD PRODUCT'}
          </button>
        </div>

        {error && (
          <p className="admin-alert admin-alert-error" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p
            className="admin-alert admin-alert-success"
            role="status"
          >
            {message}
          </p>
        )}

        {showCreateForm && (
          <form
            className="admin-panel admin-create-form"
            onSubmit={createProduct}
          >
            <h2>Add a fragrance</h2>

            <div className="admin-form-grid">
              <label>
                Product name
                <input
                  required
                  value={newProduct.name}
                  onChange={(event) =>
                    updateNewProduct('name', event.target.value)
                  }
                  placeholder="e.g. Velvet Noir"
                />
              </label>

              <label>
                URL slug
                <input
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  value={newProduct.slug}
                  onChange={(event) =>
                    updateNewProduct(
                      'slug',
                      event.target.value.toLowerCase(),
                    )
                  }
                  placeholder="e.g. velvet-noir"
                />
              </label>

              <label>
                Price (₹)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={newProduct.price}
                  onChange={(event) =>
                    updateNewProduct('price', event.target.value)
                  }
                />
              </label>

              <label>
                Stock quantity
                <input
                  required
                  type="number"
                  min="0"
                  step="1"
                  value={newProduct.stock}
                  onChange={(event) =>
                    updateNewProduct('stock', event.target.value)
                  }
                />
              </label>

              <label className="admin-form-wide">
                Image path
                <input
                  required
                  value={newProduct.image}
                  onChange={(event) =>
                    updateNewProduct('image', event.target.value)
                  }
                  placeholder="/products/your-image.png"
                />
              </label>

              <label className="admin-form-wide">
                Upload product image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  disabled={uploadingImage === 'new-product'}
                  onChange={handleNewProductImageChange}
                />
                <span className="admin-muted">
                  {uploadingImage === 'new-product'
                    ? 'Uploading image…'
                    : 'JPG, PNG, WEBP or AVIF · Maximum 5 MB'}
                </span>
              </label>

              {newProduct.image && (
                <div className="admin-form-wide admin-upload-preview">
                  <span className="admin-muted">Image preview</span>
                  <img
                    src={resolveImageUrl(newProduct.image)}
                    alt="New product preview"
                  />
                </div>
              )}

              <label className="admin-form-wide">
                Short description
                <input
                  value={newProduct.shortDescription}
                  onChange={(event) =>
                    updateNewProduct(
                      'shortDescription',
                      event.target.value,
                    )
                  }
                  placeholder="A short product tagline"
                />
              </label>

              <label className="admin-form-wide">
                Full description
                <textarea
                  rows="3"
                  value={newProduct.description}
                  onChange={(event) =>
                    updateNewProduct('description', event.target.value)
                  }
                />
              </label>
            </div>

            <button
              className="admin-button admin-button-primary"
              type="submit"
              disabled={saving === 'create' || Boolean(uploadingImage)}
            >
              {saving === 'create' ? 'ADDING…' : 'SAVE NEW PRODUCT'}
            </button>
          </form>
        )}

        {/* Store statistics */}
        <div className="admin-stats">
          <article className="admin-stat">
            <span>PRODUCTS</span>
            <strong>{products.length}</strong>
          </article>

          <article className="admin-stat">
            <span>ACTIVE</span>
            <strong>{activeProducts}</strong>
          </article>

          <article className="admin-stat">
            <span>TOTAL STOCK</span>
            <strong>{totalStock}</strong>
          </article>

          <article className="admin-stat">
            <span>ORDERS</span>
            <strong>{orders.length}</strong>
          </article>

          <article className="admin-stat">
            <span>PENDING ORDERS</span>
            <strong>{pendingOrders}</strong>
          </article>

          <article className="admin-stat">
            <span>ORDER VALUE</span>
            <strong>{formatCurrency(revenueTotal)}</strong>
          </article>
        </div>

        {/* Product management */}
        <div className="admin-products-heading">
          <div>
            <h2>Your fragrances</h2>
            <p className="admin-muted">
              Edit prices, stock, descriptions and product images.
            </p>
          </div>

          <button
            className="admin-button admin-button-outline"
            type="button"
            disabled={loading}
            onClick={() => window.location.reload()}
          >
            REFRESH
          </button>
        </div>

        {loading ? (
          <p className="admin-muted">Loading products…</p>
        ) : products.length === 0 ? (
          <p className="admin-muted">
            No products were returned by the API.
          </p>
        ) : (
          <div className="admin-product-list">
            {products.map((product) => (
              <article
                className="admin-product-card"
                key={product._id}
              >
                <div className="admin-product-preview">
                  <img
                    src={resolveImageUrl(product.image)}
                    alt={product.name}
                  />

                  <span
                    className={
                      product.isActive
                        ? 'admin-status active'
                        : 'admin-status inactive'
                    }
                  >
                    {product.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>

                <div className="admin-product-fields">
                  <div className="admin-form-grid">
                    <label>
                      Product name
                      <input
                        value={product.name}
                        onChange={(event) =>
                          updateLocalProduct(
                            product._id,
                            'name',
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label>
                      URL slug
                      <input
                        value={product.slug}
                        onChange={(event) =>
                          updateLocalProduct(
                            product._id,
                            'slug',
                            event.target.value.toLowerCase(),
                          )
                        }
                      />
                    </label>

                    <label>
                      Price (₹)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={product.price}
                        onChange={(event) =>
                          updateLocalProduct(
                            product._id,
                            'price',
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label>
                      Stock quantity
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={product.stock}
                        onChange={(event) =>
                          updateLocalProduct(
                            product._id,
                            'stock',
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label className="admin-form-wide">
                      Image path
                      <input
                        value={product.image || ''}
                        onChange={(event) =>
                          updateLocalProduct(
                            product._id,
                            'image',
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label className="admin-form-wide">
                      Replace product image
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif"
                        disabled={uploadingImage === product._id}
                        onChange={(event) =>
                          handleExistingProductImageChange(
                            product,
                            event,
                          )
                        }
                      />
                      <span className="admin-muted">
                        {uploadingImage === product._id
                          ? 'Uploading image…'
                          : 'Choose an image, then click SAVE CHANGES.'}
                      </span>
                    </label>

                    {product.image && (
                      <div className="admin-form-wide admin-upload-preview">
                        <span className="admin-muted">
                          Current image preview
                        </span>
                        <img
                          src={resolveImageUrl(product.image)}
                          alt={`${product.name} preview`}
                        />
                      </div>
                    )}

                    <label className="admin-form-wide">
                      Short description
                      <input
                        value={product.shortDescription || ''}
                        onChange={(event) =>
                          updateLocalProduct(
                            product._id,
                            'shortDescription',
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label className="admin-form-wide">
                      Full description
                      <textarea
                        rows="3"
                        value={product.description || ''}
                        onChange={(event) =>
                          updateLocalProduct(
                            product._id,
                            'description',
                            event.target.value,
                          )
                        }
                      />
                    </label>

                    <label className="admin-checkbox">
                      <input
                        type="checkbox"
                        checked={Boolean(product.isActive)}
                        onChange={(event) =>
                          updateLocalProduct(
                            product._id,
                            'isActive',
                            event.target.checked,
                          )
                        }
                      />
                      Visible in storefront
                    </label>
                  </div>

                  <div className="admin-product-actions">
                    <button
                      className="admin-button admin-button-primary"
                      type="button"
                      disabled={
                        saving === product._id ||
                        Boolean(uploadingImage)
                      }
                      onClick={() => saveProduct(product)}
                    >
                      {saving === product._id
                        ? 'SAVING…'
                        : 'SAVE CHANGES'}
                    </button>

                    {product.isActive && (
                      <button
                        className="admin-button admin-button-danger"
                        type="button"
                        disabled={
                          saving === product._id ||
                          Boolean(uploadingImage)
                        }
                        onClick={() => deactivateProduct(product)}
                      >
                        DEACTIVATE
                      </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Customer orders */}
        <section className="admin-orders-section admin-panel">
          <div className="admin-orders-heading">
            <div>
              <p className="admin-kicker">ORDER MANAGEMENT</p>
              <h2>Customer orders</h2>
              <p className="admin-muted">
                Review orders, delivery addresses, totals and status.
              </p>
            </div>

            <button
              className="admin-button admin-button-outline"
              type="button"
              disabled={ordersLoading}
              onClick={() => setOrdersRefresh((value) => value + 1)}
            >
              {ordersLoading ? 'LOADING…' : 'REFRESH ORDERS'}
            </button>
          </div>

          {ordersError && (
            <p
              className="admin-alert admin-alert-error"
              role="alert"
            >
              {ordersError}
            </p>
          )}

          {ordersLoading ? (
            <p className="admin-muted">Loading customer orders…</p>
          ) : orders.length === 0 ? (
            <p className="admin-muted">
              No orders found, or the orders API returned an empty list.
            </p>
          ) : (
            <div className="admin-orders-list">
              {orders.map((order) => {
                const status = String(
                  order.status || 'pending',
                ).toLowerCase()

                const allowedStatuses =
                  ORDER_STATUS_TRANSITIONS[status] || []

                const addressFields = [
                  order.shippingAddress?.addressLine1,
                  order.shippingAddress?.addressLine2,
                  order.shippingAddress?.landmark,
                  order.shippingAddress?.city,
                  order.shippingAddress?.state,
                  order.shippingAddress?.postalCode,
                  order.shippingAddress?.country,
                ].filter(Boolean)

                const address = addressFields.join(', ')

                const items = Array.isArray(order.items)
                  ? order.items
                  : []

                return (
                  <article
                    className="admin-order-card"
                    key={order._id}
                  >
                    <div className="admin-order-top">
                      <div>
                        <p className="admin-kicker">ORDER NUMBER</p>
                        <h3>{order.orderNumber || order._id}</h3>
                        <p className="admin-muted">
                          {formatDate(order.createdAt)}
                        </p>
                      </div>

                      <span
                        className={`admin-order-status status-${status}`}
                      >
                        {formatStatus(status)}
                      </span>
                    </div>

                    <div className="admin-order-columns">
                      <div className="admin-order-detail">
                        <h4>Customer</h4>
                        <p>
                          <strong>
                            {order.customer?.name || 'Not provided'}
                          </strong>
                        </p>
                        <p>
                          {order.customer?.phone || 'No phone provided'}
                        </p>
                        {order.customer?.email && (
                          <p>{order.customer.email}</p>
                        )}
                      </div>

                      <div className="admin-order-detail">
                        <h4>Delivery address</h4>
                        <p>{address || 'No address recorded'}</p>
                      </div>
                    </div>

                    <div className="admin-order-items">
                      <h4>Items ordered</h4>

                      {items.length > 0 ? (
                        items.map((item, index) => (
                          <div
                            className="admin-order-item"
                            key={`${item.product || item.name || 'item'}-${index}`}
                          >
                            <span>
                              {item.name || 'Fragrance'} ×{' '}
                              {Number(item.quantity || 0)}
                            </span>

                            <strong>
                              {formatCurrency(
                                Number(item.price || 0) *
                                  Number(item.quantity || 0),
                              )}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="admin-muted">
                          No item details available.
                        </p>
                      )}
                    </div>

                    <div className="admin-order-bottom">
                      <div>
                        <p className="admin-muted">Order total</p>
                        <strong className="admin-order-total">
                          {formatCurrency(order.total)}
                        </strong>
                        <p className="admin-muted">
                          Payment method:{' '}
                          {formatStatus(order.paymentMethod)}
                        </p>
                        <p className="admin-muted">
                          Payment status:{' '}
                          {formatStatus(order.paymentStatus)}
                        </p>
                      </div>

                      <div className="admin-order-controls">
                        <label>
                          <button
  className="admin-button admin-button-outline admin-invoice-download"
  type="button"
  onClick={() => downloadInvoice(order)}
>
  ↓ DOWNLOAD INVOICE PDF
</button>
                          Update status
                          <select
                            value={status}
                            disabled={
                              Boolean(orderSaving) ||
                              allowedStatuses.length === 0
                            }
                            onChange={(event) =>
                              updateOrder(order, event.target.value)
                            }
                          >
                            <option value={status}>
                              {formatStatus(status)}
                            </option>

                            {allowedStatuses.map((nextStatus) => (
                              <option
                                key={nextStatus}
                                value={nextStatus}
                              >
                                {formatStatus(nextStatus)}
                              </option>
                            ))}
                          </select>
                        </label>

                        {orderSaving === order._id && (
                          <span className="admin-muted">
                            Saving order…
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </section>

      <footer className="admin-footer">
        VELSHE® · PRIVATE STORE ADMINISTRATION
      </footer>
    </main>
  )
}

export default Admin
