import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-mono/500.css'

import '../styles/tokens.css'
import './player.css'

import { ComIdioma, idiomaDaConsulta } from '@/app/idioma'
import { PlayerApp } from './PlayerApp'

const root = document.getElementById('player')
if (!root) throw new Error('#player não encontrado')

createRoot(root).render(
  <StrictMode>
    <ComIdioma inicial={idiomaDaConsulta()}>
      <PlayerApp />
    </ComIdioma>
  </StrictMode>,
)
