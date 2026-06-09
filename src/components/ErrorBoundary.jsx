// src/components/ErrorBoundary.jsx
import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error: error.toString() }
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    this.setState({ errorInfo: errorInfo.componentStack })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white p-8">
          <h1 className="text-red-500 text-2xl font-bold mb-4">Something went wrong</h1>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
            <p className="text-red-400 font-mono text-sm">{this.state.error}</p>
          </div>
          {this.state.errorInfo && (
            <details className="text-zinc-400 text-xs mt-4">
              <summary>Component stack</summary>
              <pre className="mt-2 whitespace-pre-wrap">{this.state.errorInfo}</pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            className="mt-6 bg-neonBlue text-black px-4 py-2 rounded-lg font-bold"
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}