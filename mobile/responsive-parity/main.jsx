// One shared React application; no platform branches or native integrations.
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from '../integration-final/App'
import './responsive.css'
import { observeNavigation } from './viewport'
createRoot(document.getElementById('root')).render(<App />)
observeNavigation()
