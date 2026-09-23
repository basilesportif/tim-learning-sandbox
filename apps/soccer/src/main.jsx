import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import WatchPage from './WatchPage.jsx'

// /soccer/watch/<token> is the public share view; everything else is the
// password-gated app (the server decides who can load which).
const watchMatch = new RegExp(`^${import.meta.env.BASE_URL}watch/([A-Za-z0-9_-]+)/?$`).exec(window.location.pathname)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {watchMatch ? <WatchPage token={watchMatch[1]} /> : <App />}
  </StrictMode>,
)
