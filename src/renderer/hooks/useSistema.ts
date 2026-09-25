import type { DiagnosticoDoSistema } from '@shared/dependencias'
import type { AppInfo } from '@shared/ipc-contract'
import { repositories } from '@/data'
import type { WindowRepository } from '@/domain/repositories'
import { type Async, useAsync } from './useAsync'

/** Versão do app, do Electron e do Chromium. `null` fora do Electron. */
export function useAppInfo(): Async<AppInfo | null> {
  return useAsync(() => repositories.system.appInfo(), [])
}

/** Os programas de fora que o app chama, e quais existem aqui. */
export function useDependencies(): Async<DiagnosticoDoSistema | null> {
  return useAsync(() => repositories.system.dependencies(), [])
}

/**
 * Os comandos da janela do app.
 *
 * Não é leitura, é comando — e passa por aqui assim mesmo, para que nenhuma
 * tela fale com o `window.halo` e o navegador dos testes caia num mock inerte.
 */
export function useWindowControl(): WindowRepository {
  return repositories.window
}
