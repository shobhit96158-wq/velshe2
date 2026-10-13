import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './App.jsx'
import Admin from './Admin.jsx'
import MyOrders from './MyOrders.jsx'

const pathname =
  window.location.pathname.replace(/\/+$/, '') || '/'

let Page = App

if (pathname === '/admin') {
  Page = Admin
} else if (pathname === '/my-orders') {
  Page = MyOrders
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)