import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LayoutProbe } from './components/LayoutProbe'
import { applySafariFrame } from './game/safariFrame'
import './index.css'

applySafariFrame()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <LayoutProbe />
  </StrictMode>,
)
