import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ExternalApp from '../../generador_de_puntos_v4.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ExternalApp />
  </StrictMode>,
)
