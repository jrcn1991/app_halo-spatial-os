import { ENVIRONMENTS, type EnvironmentId, environmentLabel } from '@shared/environments'
import { t } from '@shared/i18n'
import { useState } from 'react'
import { aplicarWallpaper } from '@/app/environment'
import { useWallpaperActions, useWallpaperStatus } from '@/hooks/useWallpaper'
import { useHalo } from '@/store/useHalo'
import { Toggle } from '@/ui/Toggle'
import styles from '../SettingsScreen.module.css'

/**
 * Ambiente — o tema do app e o papel de parede que vai com ele.
 *
 * A escolha do ambiente mora no painel da Home (é onde ela sempre esteve); aqui
 * ficam as duas decisões que não são um clique de tema: se a troca alcança a
 * máquina, e qual imagem cada ambiente usa.
 *
 * O papel de parede é a ÚNICA coisa que o ambiente muda fora do app, e por isso
 * a tela diz isso com todas as letras: quem desliga o interruptor fica só com o
 * tema, e nada é escrito na configuração do sistema.
 *
 * A imagem se escolhe AQUI, num seletor de arquivo. Antes esta seção mandava
 * editar `settings.json` à mão — era o único ponto do app que pedia isso, e o
 * que mais atrapalhava numa máquina nova, onde os caminhos padrão não existem.
 */
export function EnvironmentSection() {
  const ambiente = useHalo((s) => s.environment)
  const setWallpaper = useHalo((s) => s.setEnvironmentWallpaper)
  const setImagem = useHalo((s) => s.setEnvironmentImage)
  const setVideo = useHalo((s) => s.setEnvironmentVideo)
  /**
   * Se o plugin de vídeo está instalado, e se há o fundo de antes da primeira
   * troca guardado. `null` = não se sabe (fora do Electron, ou ainda
   * perguntando).
   */
  const { plugin, original } = useWallpaperStatus()
  const papel = useWallpaperActions()
  const [erroDoVideo, setErroDoVideo] = useState('')
  const [restauro, setRestauro] = useState('')

  const restaurar = async () => {
    const r = await papel.restaurar()
    if (!r) return
    // Voltar ao fundo de antes só dura se o próximo ambiente não o trocar de
    // novo — por isso o interruptor é desligado junto.
    if (r.ok) setWallpaper(false)
    setRestauro(
      r.ok
        ? t('Pronto: o papel de parede de antes voltou, e trocar de ambiente não o muda mais.')
        : r.error,
    )
  }

  const escolher = async (id: EnvironmentId) => {
    const caminho = await papel.choose()
    if (caminho) setImagem(id, caminho)
  }

  const trocarVideo = (id: EnvironmentId, caminho: string) => {
    setVideo(id, caminho)
    setErroDoVideo('')
    // No ambiente em uso a troca é na hora: senão o único jeito de saber se o
    // vídeo toca seria trocar de ambiente e voltar. O store já mandou as
    // configurações ao main (mesmo canal, na ordem) quando o pedido chega lá.
    if (id === ambiente.id && ambiente.wallpaper) void aplicarWallpaper(id).then(setErroDoVideo)
  }

  const escolherVideo = async (id: EnvironmentId) => {
    const caminho = await papel.chooseVideo()
    if (caminho) trocarVideo(id, caminho)
  }

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>{t('Ambiente')}</span>
        <span className={styles.title}>{t('Tema e papel de parede')}</span>
        <span className={styles.subtitle}>
          {t(
            'Cada ambiente é um tema da interface do Halo mais uma imagem de fundo. O ambiente se escolhe no painel direito da Home; aqui fica o resto.',
          )}
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Área de trabalho')}</span>
        <Toggle
          label={t('Trocar o papel de parede do sistema')}
          checked={ambiente.wallpaper}
          onChange={setWallpaper}
        />
        <span className={styles.note}>
          {t(
            'Desligado, trocar de ambiente muda só as cores do Halo e nada é escrito fora dele. Ligado, o app usa o',
          )}{' '}
          <code>plasma-apply-wallpaperimage</code>
          {t(
            ', o utilitário do KDE, e, para vídeo, o próprio plasmashell — o papel de parede é a única coisa que um ambiente muda na sua máquina. Antes da primeira troca, o Halo guarda o papel de parede que você tinha.',
          )}
        </span>
        {original ? (
          <button
            type="button"
            className={styles.acao}
            onClick={() => void restaurar()}
            aria-label={t('Restaurar o meu papel de parede')}
          >
            {t('Restaurar o meu papel de parede')}
          </button>
        ) : null}
        {restauro ? <span className={styles.note}>{restauro}</span> : null}
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Imagem de cada ambiente')}</span>
        <div className={styles.lista}>
          {ENVIRONMENTS.filter((e) => e.ready).map((e) => {
            const escolhida = ambiente.wallpapers[e.id]
            // A que vem com o app contra a que o usuário aponta: a linha mostra
            // a escolhida quando existe, e o caminho de fábrica quando não —
            // nunca um caminho que talvez não exista nesta máquina.
            const embutida = e.wallpaper ? `~/${e.wallpaper}` : ''
            return (
              <div key={e.id} className={styles.linha}>
                <span className={styles.linhaTexto}>
                  {/* Aqui há largura: o nome vem por extenso, com a segunda
                      linha que o cartão de 246px da Home não comporta. */}
                  <span className={styles.linhaTitulo}>
                    {environmentLabel(e)}
                    {e.id === ambiente.id ? ` · ${t('em uso')}` : ''}
                  </span>
                  <span className={styles.linhaDetalhe}>
                    {escolhida || embutida || t('sem imagem — escolha uma')}
                  </span>
                </span>
                <button
                  type="button"
                  className={styles.acao}
                  onClick={() => void escolher(e.id)}
                  aria-label={t('Escolher a imagem de {nome}', { nome: environmentLabel(e) })}
                >
                  {t('Escolher')}
                </button>
                {escolhida ? (
                  <button
                    type="button"
                    className={styles.acao}
                    onClick={() => setImagem(e.id, '')}
                    aria-label={t('Voltar à imagem padrão de {nome}', {
                      nome: environmentLabel(e),
                    })}
                  >
                    {t('Padrão')}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
        <span className={styles.note}>
          {t(
            'Os quatro ambientes prontos já vêm com a imagem deles — arte deste projeto, que o app copia para a sua pasta pessoal na primeira vez que você usa cada um. Apontar outra troca só aquele ambiente, e "Padrão" devolve a que veio.',
          )}
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>{t('Vídeo de cada ambiente')}</span>
        <div className={styles.lista}>
          {ENVIRONMENTS.filter((e) => e.ready).map((e) => {
            const video = ambiente.videos[e.id]
            return (
              <div key={e.id} className={styles.linha}>
                <span className={styles.linhaTexto}>
                  <span className={styles.linhaTitulo}>{environmentLabel(e)}</span>
                  <span className={styles.linhaDetalhe}>
                    {video || t('sem vídeo — fica a imagem')}
                  </span>
                </span>
                <button
                  type="button"
                  className={styles.acao}
                  onClick={() => void escolherVideo(e.id)}
                  aria-label={t('Escolher o vídeo de {nome}', { nome: environmentLabel(e) })}
                >
                  {t('Escolher')}
                </button>
                {video ? (
                  <button
                    type="button"
                    className={styles.acao}
                    onClick={() => trocarVideo(e.id, '')}
                    aria-label={t('Tirar o vídeo de {nome}', { nome: environmentLabel(e) })}
                  >
                    {t('Tirar')}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
        {erroDoVideo ? (
          <span className={styles.note} role="alert">
            {erroDoVideo}
          </span>
        ) : null}
        <span className={styles.note}>
          {plugin === false ? (
            <>
              {t('O plugin de vídeo do Plasma')} (<code>org.local.videowallpaper</code>){' '}
              {t(
                'não está instalado nesta máquina: o vídeo fica guardado, mas quem aparece é a imagem.',
              )}
            </>
          ) : (
            <>
              {t(
                'Com um vídeo, o ambiente o toca em loop e sem som, pelo plugin "Vídeo" do Plasma',
              )}{' '}
              (<code>org.local.videowallpaper</code>).{' '}
              {t(
                'A imagem continua sendo a capa: é ela que aparece na Home, e ela fica no lugar se o vídeo não tocar. Vale só com o interruptor de cima ligado.',
              )}
            </>
          )}
        </span>
      </div>
    </>
  )
}
