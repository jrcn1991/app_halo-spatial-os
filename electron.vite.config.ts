import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const alias = {
  '@': resolve('src/renderer'),
  '@shared': resolve('src/shared'),
}

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      // Preload em CJS: preload com `sandbox: true` não aceita ESM.
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    // Caminhos relativos: o app é carregado por file:// em produção.
    base: './',
    resolve: { alias },
    plugins: [react()],
    build: {
      // Cinco páginas, uma por janela: o app, o player, a ilha, o lançador de
      // Meta+V e os balões de notificação. Cada uma tem CSP própria (o player
      // precisa aceitar mídia de fora, o app não) — `tools/style-lint.mjs`
      // confere as cinco.
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          player: resolve('src/renderer/player.html'),
          island: resolve('src/renderer/island.html'),
          launcher: resolve('src/renderer/launcher.html'),
          notificacoes: resolve('src/renderer/notificacoes.html'),
        },
      },
      // electron-vite não minifica por padrão; num app empacotado não há motivo.
      minify: 'esbuild',
      // O wallpaper é o fundo de todas as telas: nunca inline em base64.
      assetsInlineLimit: 0,
    },
  },
})
