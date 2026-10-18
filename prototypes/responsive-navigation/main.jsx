import React from 'react'
import {createRoot} from 'react-dom/client'
import App from '../../mobile/integration-final/App'
import '../../mobile/responsive-parity/responsive.css'
import '../../mobile/career-onboarding/onboarding.css'
import '../../mobile/polish-stability/polish.css'
import {observeInputModality} from '../../mobile/polish-stability/inputModality'
import {observeNavigation} from '../../mobile/responsive-parity/viewport'
import './prototype.css'
observeInputModality()
createRoot(document.getElementById('root')).render(<><div className="prototype-banner">DEMO · Datos ficticios · Solo memoria · Recargar reinicia los cambios</div><App careerOnboarding /></>)
observeNavigation()
