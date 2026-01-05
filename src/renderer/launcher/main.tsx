import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
// As fontes que os temas trocam: sem elas o token do tema apontaria para uma
// fonte que esta página não carregou, e o lançador sairia em DM Sans no BioShock.
import '@fontsource/rajdhani/latin-500.css'
import '@fontsource/rajdhani/latin-600.css'
import '@fontsource/share-tech-mono/latin-400.css'
import '@fontsource/josefin-sans/latin-400.css'
import '@fontsource/josefin-sans/latin-600.css'
import '@fontsource/playfair-display/latin-500.css'

// Os MESMOS tokens e temas da home: é isso que faz esta carcaça vestir o tema.
import '../styles/tokens.css'
import '../styles/env-citypop.css'
import '../styles/env-cyberpunk.css'
import '../styles/env-bioshock.css'
import './launcher.css'

import { LauncherApp } from './LauncherApp'

const raiz = document.getElementById('lancador')
if (!raiz) throw new Error('#lancador não encontrado')

/**
 * O ambiente chega pela consulta (`?env=citypop`) e, depois, por IPC quando o
 * usuário troca de tema — a janela fica viva e escondida entre uma abertura e
 * outra, e recarregá-la a cada troca seria desperdício.
 */
const env = new URLSearchParams(window.location.search).get('env')
if (env) document.documentElement.dataset.env = env
window.halo?.launcher.onEnv((novo) => {
  document.documentElement.dataset.env = novo
})

createRoot(raiz).render(
  <StrictMode>
    <LauncherApp />
  </StrictMode>,
)
