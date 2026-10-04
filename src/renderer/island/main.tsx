import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-mono/400.css'

import './tokens.css'
import './island.css'

import { ComIdioma, idiomaDaConsulta } from '@/app/idioma'
import { IslandApp } from './IslandApp'
import { VooApp } from './Voo'

const raiz = document.getElementById('ilha')
if (!raiz) throw new Error('#ilha não encontrado')

// A mesma página serve a ilha e a camada do fantasma (`?modo=voo`).
const consulta = new URLSearchParams(window.location.search)
const modoVoo = consulta.get('modo') === 'voo'

// O KWin desfoca atrás da janela? O main pergunta e manda na consulta (ver
// `main/vidro.ts`); sem isso o vidro da ilha fica no véu quase sólido.
document.documentElement.dataset.desfoque = consulta.get('desfoque') === 'sim' ? 'sim' : 'nao'

createRoot(raiz).render(
  <StrictMode>
    <ComIdioma inicial={idiomaDaConsulta()}>{modoVoo ? <VooApp /> : <IslandApp />}</ComIdioma>
  </StrictMode>,
)
