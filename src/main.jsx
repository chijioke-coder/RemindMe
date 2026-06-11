// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Global error handler to show errors on screen (temporary)
window.addEventListener('error', (event) => {
  const div = document.createElement('div')
  div.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:red;color:white;padding:10px;z-index:9999;font-size:12px;'
  div.innerText = `Error: ${event.message} at ${event.filename}:${event.lineno}`
  document.body.appendChild(div)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)