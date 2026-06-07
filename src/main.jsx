// src/main.jsx
// Application entry point - renders the app

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
// Add this to src/main.jsx before ReactDOM.render

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('Service worker registered:', reg)
    }).catch(err => {
      console.log('Service worker failed:', err)
    })
  })
}
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)