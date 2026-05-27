import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
// Socket is NOT imported here globally — it initializes lazily after login
// See src/utils/socket.js → initSocket() called in Auth.jsx after successful login

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
