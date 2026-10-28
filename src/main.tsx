import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyFrameScale } from './game/frameScale'
import { applySafariFrame } from './game/safariFrame'
import './index.css'

applySafariFrame()
applyFrameScale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
