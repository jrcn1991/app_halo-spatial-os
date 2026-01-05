import type { SeafileState } from '@shared/seafile'
import { useEffect, useState } from 'react'
import { useHalo } from '@/store/useHalo'
import { Tabs } from '@/ui/Tabs'
import styles from '../SettingsScreen.module.css'

/**
 * Seafile — o servidor de arquivos do usuário, em outra máquina.
 *
 * É o que recebe o que for arrastado para a ilha dinâmica. A senha atravessa
 * uma vez, para virar token, e não fica guardada em lugar nenhum: quem fica é
 * o token, escrito pelo processo main e nunca visto pelo renderer.
 *
 * O endereço não é descoberto sozinho — procurei na rede desta máquina e
 * nenhum host respondeu ao `/api2/ping/` do Seafile.
 */
export function SeafileSection() {
  const server = useHalo((s) => s.seafileServer)
  const setServer = useHalo((s) => s.setSeafileServer)
  const setLibrary = useHalo((s) => s.setSeafileLibrary)
  const [estado, setEstado] = useState<SeafileState | null>(null)
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [entrando, setEntrando] = useState(false)

  useEffect(() => {
    void window.halo?.seafile.state().then(setEstado)
    return window.halo?.seafile.onChanged(setEstado)
  }, [])

  const entrar = async () => {
    setEntrando(true)
    await window.halo?.seafile.login(usuario, senha)
    // A senha some da tela assim que vira token: não há por que mantê-la.
    setSenha('')
    setEstado((await window.halo?.seafile.state()) ?? null)
    setEntrando(false)
  }

  const auth = estado?.auth
  const conectado = Boolean(estado) && auth?.state === 'ok'

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Seafile · Envio</span>
        <span className={styles.title}>Para onde vão os arquivos</span>
        <span className={styles.subtitle}>
          Arraste um arquivo para a ilha dinâmica e ele sobe para o seu servidor. A senha só passa
          uma vez, para virar token — ela não fica guardada.
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Servidor</span>
        <input
          className={styles.campo}
          value={server}
          placeholder="http://192.168.1.20:8000"
          aria-label="Endereço do servidor Seafile"
          spellCheck={false}
          onChange={(e) => setServer(e.target.value)}
        />
        <span className={styles.note}>
          {auth?.state === 'sem-config'
            ? 'Endereço vazio ou inválido. Precisa começar com http:// ou https://.'
            : auth?.state === 'erro'
              ? `Não consegui falar com ${auth.server}: ${auth.message}`
              : `Servidor: ${server || '—'}`}
        </span>
      </div>

      {conectado && estado && auth.state === 'ok' ? (
        <>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Conta</span>
            <span className={styles.note}>Conectado como {auth.user}.</span>
            <div className={styles.stack}>
              <button
                type="button"
                className={`${styles.replay} ${styles.secondary}`}
                onClick={() => window.halo?.seafile.logout()}
              >
                Sair
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Biblioteca que recebe</span>
            {estado.libraries.length > 0 ? (
              <Tabs
                label="Biblioteca do Seafile"
                options={estado.libraries
                  .filter((l) => !l.readOnly)
                  .slice(0, 6)
                  .map((l) => ({ value: l.id, label: l.name }))}
                value={estado.library}
                onChange={(id) => {
                  setLibrary(id)
                  window.halo?.seafile.setLibrary(id)
                }}
              />
            ) : (
              <span className={styles.note}>Nenhuma biblioteca com permissão de escrita.</span>
            )}
            <span className={styles.note}>
              Os arquivos vão para a raiz dela. Bibliotecas somente leitura não aparecem aqui.
            </span>
          </div>
        </>
      ) : (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Entrar</span>
          <input
            className={styles.campo}
            value={usuario}
            placeholder="E-mail da conta"
            aria-label="Usuário do Seafile"
            spellCheck={false}
            onChange={(e) => setUsuario(e.target.value)}
          />
          <input
            className={styles.campo}
            type="password"
            value={senha}
            placeholder="Senha"
            aria-label="Senha do Seafile"
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void entrar()
            }}
          />
          <div className={styles.stack}>
            <button
              type="button"
              className={`${styles.replay} ${styles.secondary}`}
              disabled={!server || !usuario || !senha || entrando}
              onClick={() => void entrar()}
            >
              {entrando ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
          <span className={styles.note}>
            A senha é trocada por um token e descartada. O token fica em ~/.config, nunca no
            repositório.
          </span>
        </div>
      )}
    </>
  )
}
