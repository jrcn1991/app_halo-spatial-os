/**
 * Seafile — envio de arquivos para o servidor do usuário.
 *
 * O servidor está em OUTRA máquina da rede dele. O app não descobre o endereço
 * sozinho (procurei na rede: nenhum host respondeu ao `/api2/ping/`), então ele
 * é configurado — como a chave do TMDB e o Client ID do Spotify.
 */

/** Como está a ligação com o servidor. */
export type SeafileAuth =
  | { state: 'sem-config' }
  | { state: 'sem-credencial'; server: string }
  | { state: 'erro'; server: string; message: string }
  | { state: 'ok'; server: string; user: string }

export type SeafileLibrary = {
  id: string
  name: string
  /** Tamanho em bytes, quando o servidor informa. */
  size: number
  modified: string
  /** `true` quando é somente leitura para este usuário. */
  readOnly: boolean
}

/** O andamento de um envio, item a item. */
export type SeafileUpload = {
  id: string
  name: string
  bytes: number
  /** Quantos bytes já foram, para a barra e o "1,2 MB de 4 MB". */
  sent: number
  /** 0–1. */
  progress: number
  /**
   * `existe`: um arquivo com o mesmo nome já está na biblioteca, e o envio
   * espera o usuário decidir (ver `SeafileResolution`) — o Seafile aceitaria
   * calado, e ou sobrescreveria ou criaria um "nome (1)" sem avisar.
   */
  state: 'esperando' | 'enviando' | 'existe' | 'pronto' | 'erro'
  error: string | null
  /** O que já está no servidor com esse nome, quando `state` é `existe`. */
  remote: { size: number; modified: string } | null
}

/** A decisão sobre um envio parado em `existe`. */
export type SeafileResolution = 'substituir' | 'copia' | 'cancelar'

export type SeafileState = {
  auth: SeafileAuth
  /** Biblioteca escolhida para receber os arquivos. */
  library: string
  libraries: SeafileLibrary[]
  uploads: SeafileUpload[]
}

/**
 * Reduz o endereço à raiz do servidor.
 *
 * O que se cola é o que está na barra do navegador — e no Seafile isso costuma
 * ser `http://host:8087/accounts/login/?next=/`. Guardar o caminho junto faria
 * a API virar `…/accounts/login/?next=//api2/ping/`, que devolve a página de
 * login em HTML e não um erro claro: o app pareceria quebrado sem dizer por
 * quê. Ficar só com protocolo, host e porta resolve, e não custa nada a quem
 * digitou certo.
 */
export function normalizarServidor(url: string): string {
  const bruto = url.trim()
  if (!bruto) return ''
  // Sem esquema, `new URL` recusa; supor http é o que o usuário quis dizer.
  const comEsquema = /^https?:\/\//i.test(bruto) ? bruto : `http://${bruto}`
  try {
    return new URL(comEsquema).origin
  } catch {
    return ''
  }
}

/** O endereço serve quando dá para reduzi-lo a uma raiz http(s). */
export function servidorValido(url: string): boolean {
  return normalizarServidor(url) !== ''
}
