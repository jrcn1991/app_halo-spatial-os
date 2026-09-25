import type { SeafileState } from '@shared/seafile'
import { useCallback, useEffect, useState } from 'react'
import { repositories } from '@/data'

/**
 * A conta do Seafile e a biblioteca que recebe.
 *
 * O estado é empurrado pelo main a cada mudança (entrou, saiu, envio andou);
 * `null` até a primeira resposta — e para sempre fora do Electron.
 */
export function useSeafile(): {
  estado: SeafileState | null
  /** Troca a senha por um token. A senha não fica guardada em lugar nenhum. */
  login: (user: string, password: string) => Promise<void>
  logout: () => void
  setLibrary: (id: string) => void
} {
  const [estado, setEstado] = useState<SeafileState | null>(null)

  useEffect(() => {
    let vivo = true
    void repositories.seafile.state().then((e) => vivo && setEstado(e))
    const cancelar = repositories.seafile.onChanged(setEstado)
    return () => {
      vivo = false
      cancelar()
    }
  }, [])

  const login = useCallback(async (user: string, password: string) => {
    await repositories.seafile.login(user, password)
    setEstado(await repositories.seafile.state())
  }, [])

  return {
    estado,
    login,
    logout: useCallback(() => void repositories.seafile.logout(), []),
    setLibrary: useCallback((id: string) => void repositories.seafile.setLibrary(id), []),
  }
}
