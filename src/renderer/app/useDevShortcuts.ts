import { useEffect } from 'react'
import { valoresDoAmbiente } from '@/app/environment'
import { type Screen, useHalo } from '@/store/useHalo'
import { ENTRANCE_NAMES } from '@/styles/entrances'

const ORDER: Screen[] = ['home', 'social', 'claude', 'files', 'lab', 'media', 'music', 'settings']

/**
 * Atalhos só de desenvolvimento — não fazem parte do desenho.
 *   1..8            troca de tela
 *   Ctrl+Shift+E    percorre as 13 variações de entrada
 *   Ctrl+Shift+R    repete a animação de entrada da tela atual
 */
export function useDevShortcuts() {
  useEffect(() => {
    if (!import.meta.env.DEV) return

    const onKey = (e: KeyboardEvent) => {
      const { setScreen, setEntrance, environment, replay } = useHalo.getState()

      if (e.ctrlKey && e.shiftKey && e.code === 'KeyE') {
        // Cicla a partir do que está NA TELA, e não do que está guardado: com
        // a escolha vazia quem manda é o preset do ambiente, e ciclar do vazio
        // recomeçaria sempre da primeira variação.
        const atual = valoresDoAmbiente(environment.id, environment.ajustes[environment.id]).entrada
        const next = ENTRANCE_NAMES[(ENTRANCE_NAMES.indexOf(atual) + 1) % ENTRANCE_NAMES.length]
        if (next) {
          setEntrance(next)
          console.info(`[halo] entrada: ${next}`)
        }
        return
      }

      if (e.ctrlKey && e.shiftKey && e.code === 'KeyR') {
        replay()
        return
      }

      // Quem está digitando manda. O ouvinte é global e o bloco dos números não
      // tem modificador: qualquer dígito de 1 a 8 num campo trocava de tela —
      // a chave do TMDB, o hex da cor do vidro, o nome de uma lista. Os dois
      // atalhos acima não precisam disto porque exigem Ctrl+Shift.
      const alvo = e.target as HTMLElement | null
      if (alvo?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo?.tagName ?? '')) return

      // Os números seguem o dock: tela escondida não é alcançável por atalho.
      const visible = ORDER.filter((s) => !useHalo.getState().hiddenScreens.includes(s))
      const n = Number(e.key)
      if (!e.ctrlKey && !e.altKey && n >= 1 && n <= visible.length) {
        const target = visible[n - 1]
        if (target) setScreen(target)
      }
    }

    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
}
