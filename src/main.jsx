// src/main.jsx - Diagnostic version
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Write to document body immediately (this will appear even if React fails)
const statusDiv = document.createElement('div')
statusDiv.id = 'react-status'
statusDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:black;color:#00E5FF;padding:8px;z-index:10000;font-size:12px;font-family:monospace;'
statusDiv.innerText = '🔍 React loading: Step 0 - script started'
document.body.appendChild(statusDiv)

// Update status function
function setStatus(step, error = null) {
  const div = document.getElementById('react-status')
  if (div) {
    div.innerText = `🔍 ${step}` + (error ? ` ❌ Error: ${error.message}` : '')
    if (error) {
      div.style.background = 'red'
      div.style.color = 'white'
    }
  }
}

setStatus('Step 1 - Starting React render')

// Try to render React
try {
  setStatus('Step 2 - Finding root element')
  const rootElement = document.getElementById('root')
  if (!rootElement) throw new Error('Root element #root not found')
  
  setStatus('Step 3 - Creating React root')
  const root = ReactDOM.createRoot(rootElement)
  
  setStatus('Step 4 - Rendering App')
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
  setStatus('Step 5 - Render called (check page content)')
} catch (err) {
  setStatus('React render crashed', err)
  console.error(err)
}