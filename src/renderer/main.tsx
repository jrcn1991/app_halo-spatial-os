import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// DM Sans estática, empacotada. O protótipo carrega do Google Fonts a versão
// com eixo óptico (`opsz,wght@9..40`), que não existe no Fontsource — o
// variável de lá só traz o eixo de peso, e medindo ficou PIOR que a estática
// (home 2,94% contra 2,83%). Daí o resto do diff em texto: mesmo tamanho,
// mesma posição, glifos de origens diferentes.
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'

// Rajdhani é a fonte do HUD do Cyberpunk 2077, e Share Tech Mono dá os
// numerais duros que ele usa. Empacotadas, e só o subconjunto latino: a CSP do
// renderer é `font-src 'self'`, o CDN do Google está bloqueado de propósito, e
// não se abre a CSP por causa de fonte. Elas só valem dentro do tema — quem as
// escolhe é `--font-sans`/`--font-mono` em `styles/env-cyberpunk.css`.
import '@fontsource/rajdhani/latin-400.css'
import '@fontsource/rajdhani/latin-500.css'
import '@fontsource/rajdhani/latin-600.css'
import '@fontsource/rajdhani/latin-700.css'
import '@fontsource/share-tech-mono/latin-400.css'

// As duas fontes do tema BioShock, empacotadas pelo mesmo motivo das de cima
// (`font-src 'self'` na CSP) e só no subconjunto latino. Elas têm papéis
// diferentes, e é a divisão que dá o ar art déco:
//
// - Josefin Sans é a geométrica dos anos 1920: rótulo em caixa alta, cabeçalho,
//   data, título curto. É `--font-label`.
// - Playfair Display é a serifa de alto contraste — haste fina contra haste
//   grossa, terminal em bola —, que é o que os numerais do relógio da
//   referência são e o que nenhuma sans faz. É `--font-display`, e vale só no
//   relógio, nos numerais grandes e no título de tela.
//
// O texto corrido continua em DM Sans nos dois casos. Quem escolhe é
// `styles/env-bioshock.css`.
import '@fontsource/josefin-sans/latin-400.css'
import '@fontsource/josefin-sans/latin-600.css'
import '@fontsource/josefin-sans/latin-700.css'
import '@fontsource/playfair-display/latin-400.css'
import '@fontsource/playfair-display/latin-500.css'

import './styles/tokens.css'
// Os temas entram DEPOIS dos tokens: eles só redefinem o que já existe lá, e
// `floresta` não tem arquivo nenhum — ela é o `:root` de `tokens.css`.
import './styles/env-citypop.css'
import './styles/env-cyberpunk.css'
import './styles/env-bioshock.css'
import './styles/animations.css'
import './styles/global.css'

import { App } from './app/App'
import { startPersistingSettings } from './app/persist'
import { startWatchingRecent } from './app/recent'

startPersistingSettings()
startWatchingRecent()

// Janela escondida ou minimizada: as animações pausam (ver `animations.css`,
// `data-halo-dormindo`). Fora do Electron não há janela para esconder.
window.halo?.window.onDormindo((dormindo) => {
  document.documentElement.dataset.haloDormindo = dormindo ? 'sim' : 'nao'
})

const root = document.getElementById('root')
if (!root) throw new Error('#root não encontrado')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
