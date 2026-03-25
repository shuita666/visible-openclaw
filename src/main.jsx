import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import './styles/overlay.css'
import App from './App.jsx'

// Electron overlay mode: add class to body so CSS hides panels
const isOverlay = new URLSearchParams(window.location.search).get('overlay') === '1'
if (isOverlay) {
  document.body.classList.add('overlay-mode')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* To use a custom character component, import it and pass via prop:
        import MyCharacter from './components/MyCharacter'
        <App CharacterComponent={MyCharacter} /> */}
    <App />
  </StrictMode>,
)
