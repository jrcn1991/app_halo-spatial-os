import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
// As fontes que os temas trocam — mesmo motivo do lançador: sem elas o token
// do tema apontaria para uma fonte que esta página não carregou.
import '@fontsource/rajdhani/latin-500.css'
import '@fontsource/rajdhani/latin-600.css'
import '@fontsource/share-tech-mono/latin-400.css'
import '@fontsource/josefin-sans/latin-400.css'
import '@fontsource/josefin-sans/latin-600.css'
import '@fontsource/playfair-display/latin-500.css'

// Os MESMOS tokens e temas da home. Tema novo entra aqui também (ver
// docs/CRIACAO-DE-TEMAS.md) — senão os avisos saem sem ele.
import '../styles/tokens.css'
import '../styles/env-citypop.css'
import '../styles/env-cyberpunk.css'
import '../styles/env-bioshock.css'
// O movimento dos balões mora com o resto do movimento do app: num `.module.css`
// o nome do keyframe seria trocado e a animação não rodaria.
import '../styles/animations.css'
import './notificacoes.css'

import { NotificacoesApp } from './NotificacoesApp'

const raiz = document.getElementById('avisos')
if (!raiz) throw new Error('#avisos não encontrado')

/**
 * O ambiente chega pela consulta e, depois, por IPC quando o usuário troca de
 * tema — a janela fica viva entre um aviso e outro, como a do lançador.
 */
const consulta = new URLSearchParams(window.location.search)
const env = consulta.get('env')
if (env) document.documentElement.dataset.env = env
// O KWin desfoca atrás da janela? É o que deixa o balão ser vidro aberto (ver
// `main/notificacoes/desfoque.ts`); sem isso ele fica no piso quase sólido.
document.documentElement.dataset.desfoque = consulta.get('desfoque') === 'sim' ? 'sim' : 'nao'
window.halo?.notificacoes.onEnv((novo) => {
  document.documentElement.dataset.env = novo
})

createRoot(raiz).render(
  <StrictMode>
    <NotificacoesApp canto={consulta.get('canto') ?? 'topo-direita'} />
  </StrictMode>,
)
