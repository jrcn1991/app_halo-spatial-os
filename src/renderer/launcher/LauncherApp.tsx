import type { DesktopApp } from '@shared/apps'
import { marcar, t } from '@shared/i18n'
import type { IslandClip, IslandWindow } from '@shared/island'
import type { RecenteDoLancador } from '@shared/settings'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Glifo } from '../island/Glifo'
import type { Achado } from '../island/lancador'
import { type Comando, chaveDeUso, recentesParaMostrar, resolver } from './motor'

/**
 * A carcaça de Meta+V.
 *
 * Mesmo motor do lançador da ilha (`motor.ts`), outra roupa: a janela veste o
 * tema do app — vidro, fonte e cores vêm dos tokens, e `data-env` chega do
 * main. O desenho é o do Raycast: campo grande no topo, uma lista em seções,
 * e um rodapé que diz o que Enter faz.
 *
 * Tudo por teclado: ↑↓ andam, Enter executa o selecionado, Esc limpa e, se já
 * está limpo, esconde. Perder o foco também esconde (é o main quem faz, no
 * `blur` da janela). Cada execução esconde a janela — quem abre um app não
 * quer o lançador na frente dele.
 */

/** Uma linha da lista, de qualquer seção, para o teclado andar por todas. */
type Linha =
  | { tipo: 'resposta'; item: Achado }
  | { tipo: 'comando'; item: Comando }
  | { tipo: 'app'; item: DesktopApp }
  | { tipo: 'clip'; item: IslandClip }
  | { tipo: 'janela'; item: IslandWindow }
  /** Com o campo vazio: o que foi mais usado, para repetir sem digitar. */
  | { tipo: 'recente'; item: RecenteDoLancador }

const SECOES: { tipo: Linha['tipo']; titulo: string }[] = [
  { tipo: 'recente', titulo: marcar('Recentes') },
  { tipo: 'resposta', titulo: marcar('Respostas') },
  { tipo: 'comando', titulo: marcar('Comandos') },
  { tipo: 'app', titulo: marcar('Aplicativos') },
  { tipo: 'clip', titulo: marcar('Cópias') },
  { tipo: 'janela', titulo: marcar('Janelas') },
]

export function LauncherApp() {
  const [busca, setBusca] = useState('')
  const [apps, setApps] = useState<DesktopApp[] | null>(null)
  const [clips, setClips] = useState<IslandClip[]>([])
  const [janelas, setJanelas] = useState<IslandWindow[]>([])
  const [recentes, setRecentes] = useState<RecenteDoLancador[]>([])
  const [indice, setIndice] = useState(0)
  const campo = useRef<HTMLInputElement>(null)

  /** Cada abertura recomeça limpa e recarrega o que muda rápido (cópias, janelas, recentes). */
  const recarregar = useCallback(() => {
    setBusca('')
    setIndice(0)
    campo.current?.focus()
    const halo = window.halo
    if (!halo) return
    if (apps === null)
      void halo.apps
        .list()
        .then(setApps)
        .catch(() => setApps([]))
    void halo.island
      .snapshot()
      .then((s) => setClips(s.clips))
      .catch(() => setClips([]))
    void halo.island
      .janelas()
      .then(setJanelas)
      .catch(() => setJanelas([]))
    void halo.launcher
      .recentes()
      .then(setRecentes)
      .catch(() => setRecentes([]))
  }, [apps])

  useEffect(() => {
    recarregar()
    // O main manda o ambiente a cada abertura: é o sinal de "apareci".
    const cancelar = window.halo?.launcher.onEnv(() => recarregar())
    const aoFocar = () => campo.current?.focus()
    window.addEventListener('focus', aoFocar)
    return () => {
      cancelar?.()
      window.removeEventListener('focus', aoFocar)
    }
  }, [recarregar])

  const resultado = useMemo(
    () => resolver(busca, { apps, clips, janelas, recentes }),
    [busca, apps, clips, janelas, recentes],
  )

  const linhas = useMemo<Linha[]>(
    () => [
      ...(resultado.chave === ''
        ? recentesParaMostrar(recentes).map((item): Linha => ({ tipo: 'recente', item }))
        : []),
      ...resultado.respostas.map((item): Linha => ({ tipo: 'resposta', item })),
      ...resultado.comandos.map((item): Linha => ({ tipo: 'comando', item })),
      ...resultado.apps.map((item): Linha => ({ tipo: 'app', item })),
      ...resultado.clips.map((item): Linha => ({ tipo: 'clip', item })),
      ...resultado.janelas.map((item): Linha => ({ tipo: 'janela', item })),
    ],
    [resultado, recentes],
  )

  // A seleção não pode apontar para fora da lista quando ela encurta.
  useEffect(() => {
    if (indice >= linhas.length) setIndice(Math.max(0, linhas.length - 1))
  }, [linhas.length, indice])

  const esconder = () => window.halo?.launcher.hide()

  /**
   * Executar passa pela ilha: são as ações que ela já tem (`island.run`), e
   * nada novo entra no main por causa desta carcaça. Copiar reusa
   * `clip-escrever`; abrir URL reusa `abrir-caminho`; a cópia do histórico
   * volta para a área de transferência por `clip-copiar`; a janela vem para
   * frente por `janela-focar`. App e comando registram o uso — é o que
   * alimenta os recentes das duas carcaças.
   */
  const executar = (linha: Linha) => {
    const halo = window.halo
    const rodar = (id: string, arg?: string) => void halo?.island.run(id, arg).catch(() => {})
    const uso = (
      tipo: RecenteDoLancador['tipo'],
      id: string,
      titulo: string,
      icone: string,
      arg?: string,
    ) =>
      halo?.launcher.uso({
        chave: chaveDeUso(tipo, id, arg),
        tipo,
        id,
        ...(arg ? { arg } : {}),
        titulo,
        icone,
      })
    switch (linha.tipo) {
      case 'resposta':
        if (linha.item.abrir) rodar('abrir-caminho', linha.item.abrir)
        else if (linha.item.copiar) rodar('clip-escrever', linha.item.copiar)
        break
      case 'comando':
        rodar(linha.item.id, linha.item.arg)
        uso('comando', linha.item.id, linha.item.nome, linha.item.icone, linha.item.arg)
        break
      case 'app':
        rodar('apps-abrir', linha.item.id)
        uso('app', linha.item.id, linha.item.name, 'AppWindow')
        break
      case 'clip':
        rodar('clip-copiar', String(linha.item.id))
        break
      case 'janela':
        rodar('janela-focar', linha.item.id)
        break
      case 'recente': {
        // Repetir: um app abre pela ação da ilha; um comando roda com o arg guardado.
        const r = linha.item
        if (r.tipo === 'app') rodar('apps-abrir', r.id)
        else rodar(r.id, r.arg)
        uso(r.tipo, r.id, r.titulo, r.icone, r.arg)
        break
      }
    }
    esconder()
  }

  const aoTeclar = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndice((i) => Math.min(linhas.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndice((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      const linha = linhas[indice]
      if (linha) executar(linha)
    } else if (e.key === 'Escape') {
      if (busca) {
        setBusca('')
        setIndice(0)
      } else esconder()
    }
  }

  const selecionada = linhas[indice]
  const acao = selecionada ? rotuloDaAcao(selecionada) : ''

  /*
   * Arrastar a janela pela barra do campo (fora do input) e pelo rodapé.
   *
   * Não é `-webkit-app-region: drag`: o Chromium não registra região de
   * arraste dentro de subtree com `backdrop-filter`, e o vidro tem (ver
   * CLAUDE.md, "CSS"). O gesto é feito à mão: o renderer manda ao main o
   * deslocamento em coordenadas de TELA desde o último evento, e o main move
   * a janela. `screenX/Y` e não `clientX/Y` de propósito — a janela se move
   * sob o cursor, e as coordenadas de cliente moveriam junto.
   */
  const arrastar = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('input, kbd')) return
    e.preventDefault()
    let ultimoX = e.screenX
    let ultimoY = e.screenY
    const mover = (m: MouseEvent) => {
      window.halo?.launcher.arrastar(m.screenX - ultimoX, m.screenY - ultimoY)
      ultimoX = m.screenX
      ultimoY = m.screenY
    }
    const soltar = () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
      window.halo?.launcher.arrastou()
      campo.current?.focus()
    }
    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
  }

  return (
    <div className="lancador" data-halo-in="center">
      <label className="campo" onMouseDown={arrastar}>
        <Glifo nome="MagnifyingGlass" tamanho={18} />
        <input
          ref={campo}
          type="search"
          // biome-ignore lint/a11y/noAutofocus: a janela só existe para receber este texto
          autoFocus
          placeholder={t(
            'App, comando, cópia, janela, conta, g busca, :emoji — ou ? pergunta ao Claude',
          )}
          aria-label={t('Buscar no lançador')}
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setIndice(0)
          }}
          onKeyDown={aoTeclar}
        />
        <kbd className="tecla">Esc</kbd>
      </label>

      <div className="lista" role="listbox" aria-label={t('Resultados')}>
        {linhas.length === 0 ? (
          <p className="vazio">
            {resultado.chave === '' ? t('Digite para procurar.') : t('Nada com esse nome.')}
            {resultado.chave === '' ? (
              <span className="dica">
                {t('2+2 · 10 km em mi · g halo · :fogo · cafeina 30 · ? pergunta')}
              </span>
            ) : null}
          </p>
        ) : (
          SECOES.map(({ tipo, titulo }) => {
            const doTipo = linhas.filter((l) => l.tipo === tipo)
            if (doTipo.length === 0) return null
            return (
              <section key={tipo} className="secao">
                <h2 className="secaoTitulo">{t(titulo)}</h2>
                {doTipo.map((linha) => {
                  const posicao = linhas.indexOf(linha)
                  return (
                    <div
                      key={chaveDe(linha)}
                      role="option"
                      aria-selected={posicao === indice}
                      tabIndex={-1}
                      className="linha"
                      data-selecionada={posicao === indice ? 'sim' : 'nao'}
                      onMouseEnter={() => setIndice(posicao)}
                      onClick={() => executar(linha)}
                      onKeyDown={(e) => e.key === 'Enter' && executar(linha)}
                    >
                      <span className="linhaGlifo">
                        <Glifo nome={glifoDe(linha)} tamanho={16} />
                      </span>
                      <span className="linhaTexto">
                        <span className="linhaTitulo">{tituloDe(linha)}</span>
                        {detalheDe(linha) ? (
                          <span className="linhaDetalhe">{detalheDe(linha)}</span>
                        ) : null}
                      </span>
                      <span className="linhaTipo">{rotuloDaAcao(linha)}</span>
                    </div>
                  )
                })}
              </section>
            )
          })
        )}
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: idem — o rodapé é alça de arrasto */}
      <footer className="rodape" onMouseDown={arrastar}>
        <span className="rodapeMarca">Halo</span>
        <span className="rodapeAcoes">
          {acao ? (
            <>
              <span>{acao}</span>
              <kbd className="tecla">↵</kbd>
            </>
          ) : null}
          <span>{t('Navegar')}</span>
          <kbd className="tecla">↑↓</kbd>
        </span>
      </footer>
    </div>
  )
}

function chaveDe(l: Linha): string {
  switch (l.tipo) {
    case 'recente':
      return `u:${l.item.chave}`
    case 'resposta':
      return `r:${l.item.titulo}`
    case 'comando':
      return `c:${l.item.id}:${l.item.arg ?? ''}`
    case 'app':
      return `a:${l.item.id}`
    case 'clip':
      return `k:${l.item.id}`
    case 'janela':
      return `j:${l.item.id}`
  }
}

function glifoDe(l: Linha): string {
  switch (l.tipo) {
    case 'recente':
      return l.item.icone
    case 'resposta':
      return l.item.icone
    case 'comando':
      return l.item.icone
    case 'app':
      return 'AppWindow'
    case 'clip':
      return 'Clipboard'
    case 'janela':
      return 'Desktop'
  }
}

function tituloDe(l: Linha): string {
  switch (l.tipo) {
    case 'recente':
      // Comando guardado com o nome em português volta traduzido; app fica como está.
      return l.item.tipo === 'comando' ? t(l.item.titulo) : l.item.titulo
    case 'resposta':
      return l.item.titulo
    case 'comando':
      return t(l.item.nome)
    case 'app':
      return l.item.name
    case 'clip':
      return l.item.preview.replace(/\s+/g, ' ').slice(0, 90)
    case 'janela':
      return l.item.title
  }
}

function detalheDe(l: Linha): string {
  switch (l.tipo) {
    case 'recente':
      return l.item.tipo === 'app'
        ? t('{n}× · aplicativo', { n: l.item.n })
        : t('{n}× · comando', { n: l.item.n })
    case 'resposta':
      return l.item.detalhe ?? ''
    case 'comando':
      return ''
    case 'app':
      return l.item.comment ?? ''
    case 'clip':
      if (l.item.kind === 'texto') return t('{n} caracteres', { n: l.item.length })
      return l.item.kind === 'cor' ? t('cor') : l.item.kind
    case 'janela':
      return l.item.appClass
  }
}

/** O que o Enter faz com esta linha — é o que o rodapé mostra. */
function rotuloDaAcao(l: Linha): string {
  switch (l.tipo) {
    case 'recente':
      return l.item.tipo === 'app' ? t('Abrir') : t('Executar')
    case 'resposta':
      return l.item.abrir ? t('Abrir') : t('Copiar')
    case 'comando':
      return t('Executar')
    case 'app':
      return t('Abrir')
    case 'clip':
      return t('Copiar')
    case 'janela':
      return t('Focar')
  }
}
