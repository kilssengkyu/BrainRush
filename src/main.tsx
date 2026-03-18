import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './lib/i18n'; // Import i18n configuration
import 'flag-icons/css/flag-icons.min.css'; // Import flag-icons
import App from './App.tsx'

if (import.meta.env.PROD) {
  console.log = () => undefined
  console.info = () => undefined
  console.debug = () => undefined
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
