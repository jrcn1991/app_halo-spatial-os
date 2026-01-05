/**
 * As notificações do sistema desenhadas pelo Halo, no estilo do ambiente.
 *
 * O servidor continua sendo o do Plasma — histórico, "não perturbe", as
 * respostas aos aplicativos. O Halo só troca o BALÃO: registra-se como vigia
 * do servidor (`org.kde.NotificationManager.RegisterWatcher`, o mesmo que o
 * KDE Connect usa para espelhar no celular), esconde os balões do Plasma pelo
 * `Inhibit` da especificação e desenha os seus numa janela própria, vestida
 * pelos mesmos tokens e temas do app. Ver `src/main/notificacoes/`.
 *
 * O tipo mora em `shared/` porque os dois lados precisam dele: o main monta a
 * notificação a partir do D-Bus, a janela dos avisos a desenha.
 */

/** Onde a pilha mora na tela principal. O padrão é onde o Plasma já os punha. */
export type CantoDosAvisos = 'topo-direita' | 'topo-esquerda' | 'base-direita' | 'base-esquerda'
export const CANTOS_DOS_AVISOS: readonly CantoDosAvisos[] = [
  'topo-direita',
  'topo-esquerda',
  'base-direita',
  'base-esquerda',
]

export type NotificacoesSettings = {
  /**
   * O Halo desenha os balões. Desligado, o Plasma volta a desenhar os dele na
   * hora — o `Inhibit` só dura enquanto a conexão que o pediu estiver viva.
   */
  on: boolean
  canto: CantoDosAvisos
}

/** A urgência da especificação (dica `urgency`: 0, 1, 2), em palavras. */
export type UrgenciaDoAviso = 'baixa' | 'normal' | 'critica'

/** Um botão de ação que o aplicativo pediu (fora o `default`, que é o clique no corpo). */
export type AcaoDoAviso = { chave: string; rotulo: string }

export type Aviso = {
  /** O id do PLASMA: é com ele que `InvokeAction` e `CloseNotification` falam. */
  id: number
  app: string
  titulo: string
  /** Texto puro: a marcação da especificação (`<b>`, `<a>`) é tirada no main. */
  corpo: string
  /** Ícone do aplicativo, já em `data:` (o renderer não alcança disco). */
  icone: string | null
  /** A imagem da notificação (avatar de quem mandou a mensagem), em `data:`. */
  imagem: string | null
  urgencia: UrgenciaDoAviso
  acoes: AcaoDoAviso[]
  /** O aplicativo pediu a ação `default`: clicar no corpo a dispara. */
  temPadrao: boolean
  /** Quanto tempo o balão fica. `null` = fica até ser dispensado. */
  expiraMs: number | null
  /** Epoch ms da chegada (ou da última substituição). */
  at: number
}

/**
 * O que está valendo agora — é o que a tela de Configurações mostra, para ela
 * dizer a verdade em vez de repetir o interruptor.
 */
export type EstadoDosAvisos = {
  /** O usuário quer. */
  ligado: boolean
  /** O Halo está desenhando (vigia registrado, janela carregada, Plasma inibido). */
  ativo: boolean
  /** Quando não está ativo estando ligado: por quê, em uma frase. */
  motivo: string
  /** Silenciados pela ilha ("não perturbe" do Halo). */
  silencio: boolean
}
