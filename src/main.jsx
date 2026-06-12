// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Catch any rendering errors and display them on screen
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error)
  const errorDiv = document.createElement('div')
  errorDiv.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:red;color:white;padding:10px;z-index:9999;font-size:12px;word-break:break-all;'
  errorDiv.innerText = `Error: ${event.error?.message || event.message}`
  document.body.appendChild(errorDiv)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)