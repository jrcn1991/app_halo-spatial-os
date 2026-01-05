import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-mono/400.css'

import './tokens.css'
import './island.css'

import { IslandApp } from './IslandApp'
import { VooApp } from './Voo'

const raiz = document.getElementById('ilha')
if (!raiz) throw new Error('#ilha não encontrado')

// A mesma página serve a ilha e a camada do fantasma (`?modo=voo`).
const modoVoo = new URLSearchParams(window.location.search).get('modo') === 'voo'

createRoot(raiz).render(<StrictMode>{modoVoo ? <VooApp /> : <IslandApp />}</StrictMode>)
