import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Polyfill Buffer for browser compatibility
import { Buffer } from 'buffer'
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}
if (typeof globalThis !== 'undefined') {
  globalThis.Buffer = Buffer;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)