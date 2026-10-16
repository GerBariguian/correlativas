import React from 'react'
import {createRoot} from 'react-dom/client'
import App from '../integration-final/App'
import '../responsive-parity/responsive.css'
import '../career-onboarding/onboarding.css'
import './polish.css'
import {observeNavigation} from '../responsive-parity/viewport'
createRoot(document.getElementById('root')).render(<App careerOnboarding />)
observeNavigation()
