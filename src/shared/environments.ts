/**
 * Ambientes: o tema da interface e o papel de parede que vai com ele.
 *
 * Um ambiente é uma coisa só, em duas metades:
 *
 * - **dentro do app**, um conjunto de tokens de cor (ver
 *   `src/renderer/styles/env-<id>.css`); `floresta` não tem arquivo nenhum
 *   porque ele É o `:root` de hoje — o handoff, intacto;
 * - **fora do app**, o papel de parede da sessão do Plasma (ver
 *   `src/main/services/wallpaper.ts`). É a ÚNICA coisa que o ambiente muda na
 *   máquina: o tema é da nossa aplicação.
 *
 * A lista mora em `shared/` porque os dois processos precisam dela: o renderer
 * para desenhar o painel e escolher o tema, o main para saber qual imagem
 * aplicar.
 *
 * Os três ambientes sem tema continuam listados de propósito — eles existem no
 * handoff, e sumir com eles seria perder algo que já estava na tela. A tela os
 * mostra marcados como "em breve", sem clique que mude nada.
 */

export type EnvironmentId =
  | 'floresta'
  | 'citypop'
  | 'cyberpunk'
  | 'bioshock'
  | 'estudio'
  | 'espaco'
  | 'costa'

export type Environment = {
  id: EnvironmentId
  name: string
  /**
   * Segunda linha do nome, quando o nome inteiro não cabe.
   *
   * O cartão do painel de Ambientes tem 246px de largura e mostra o nome numa
   * linha só; "Shock — Art Déco Subaquático" seria cortado ali. O nome curto
   * vai no cartão e o resto vem por aqui — no `title` do cartão e na seção de
   * Configurações, onde há largura.
   *
   * OPCIONAL de propósito: é campo aditivo. Os ambientes que já existiam não o
   * têm, e nada muda para eles.
   */
  description?: string
  /**
   * Papel de parede padrão, RELATIVO à pasta do usuário.
   *
   * Relativo, e não absoluto, porque `/home/<alguém>/…` cravado aqui só
   * funcionaria nesta máquina — quem resolve contra o `homedir()` é o main.
   * Vazio = ambiente sem tema, que não aplica papel de parede nenhum.
   *
   * O usuário troca a imagem em `~/.config/halo-spatial-os/settings.json`
   * (`environment.wallpapers`), sem mexer no código.
   */
  wallpaper: string
  /** Tem tema pronto? Só estes podem ser escolhidos. */
  ready: boolean
}

export const ENVIRONMENTS = [
  // Floresta é o app de hoje, pixel a pixel: o `:root` de `tokens.css`.
  //
  // A imagem apontava para um arquivo na pasta pessoal que só
  // existia na máquina de quem desenhou o handoff — e como a Floresta é o
  // ambiente PADRÃO, numa instalação nova a primeira troca de ambiente dava
  // "imagem não encontrada". Hoje ela vem com o app, como as outras três: arte
  // nossa, gerada por IA e preparada por `tools/fundo-de-ambiente.mjs`, com a
  // proveniência e o prompt em `docs/MOCKS.md`.
  {
    id: 'floresta',
    name: 'Floresta',
    wallpaper: '.local/share/halo-spatial-os/wallpapers/floresta.jpg',
    ready: true,
  },
  // O papel de parede vem com o app: a ilustração é arte gerada por IA para
  // este tema. Mesmo caminho do Shock.
  {
    id: 'citypop',
    name: 'City Pop',
    description: 'Noite Elétrica de Verão',
    wallpaper: '.local/share/halo-spatial-os/wallpapers/citypop.jpg',
    ready: true,
  },
  // Mesma história da Floresta: a imagem apontava para `~/Downloads/`, a pasta
  // de quem montou o tema, e não a de quem instala o app. Hoje ela vem junto.
  {
    id: 'cyberpunk',
    // "Cyberpunk", sem o "2077": cyberpunk é nome de gênero, e "Cyberpunk
    // 2077" é o título registrado do jogo (24/09/2026, pedido do usuário).
    name: 'Cyberpunk',
    wallpaper: '.local/share/halo-spatial-os/wallpapers/cyberpunk.jpg',
    ready: true,
  },
  // O ÚNICO ambiente cujo papel de parede é do app, e não do usuário: a imagem
  // é arte original nossa (gerada por IA, preparada por
  // `tools/ourivesaria-bioshock.py`), vem empacotada e o main
  // a materializa em `~/.local/share/…/wallpapers` na primeira vez — o Plasma
  // precisa de um arquivo real no disco, e dentro do pacote ela estaria em
  // asar. Ver `bundledWallpaper` em `src/main/services/wallpaper.ts`.
  {
    id: 'bioshock',
    // "Shock", e não "BioShock": BioShock é marca da 2K, e o ambiente é só
    // inspirado no art déco subaquático do jogo (24/09/2026, pedido do usuário).
    // O id continua `bioshock` — é ele que está gravado nas configurações de
    // quem já usa, e trocá-lo apagaria os ajustes deste ambiente.
    name: 'Shock',
    description: 'Art Déco Subaquático',
    wallpaper: '.local/share/halo-spatial-os/wallpapers/bioshock.jpg',
    ready: true,
  },
  { id: 'estudio', name: 'Estúdio', wallpaper: '', ready: false },
  { id: 'espaco', name: 'Espaço', wallpaper: '', ready: false },
  { id: 'costa', name: 'Costa', wallpaper: '', ready: false },
] as const satisfies readonly Environment[]

/** O padrão reproduz o handoff — ver "Padrões reproduzem o handoff" no CLAUDE.md. */
export const DEFAULT_ENVIRONMENT: EnvironmentId = 'floresta'

export const ENVIRONMENT_IDS: readonly EnvironmentId[] = ENVIRONMENTS.map((e) => e.id)

/**
 * O nome do ambiente por extenso.
 *
 * O cartão do painel da Home mostra só `name` — é o que cabe nele. Onde há
 * largura (o tooltip do cartão, a seção de Configurações) vale este, que junta
 * a segunda linha quando ela existe. Ambiente sem `description` devolve o nome
 * e nada muda para ele.
 */
export function environmentLabel(ambiente: Environment): string {
  return ambiente.description ? `${ambiente.name} — ${ambiente.description}` : ambiente.name
}

export function environmentById(id: string): Environment | undefined {
  return ENVIRONMENTS.find((e) => e.id === id)
}

/** Só ambiente com tema pronto pode ser escolhido (ou lido do arquivo). */
export function isEnvironmentId(id: unknown): id is EnvironmentId {
  return typeof id === 'string' && ENVIRONMENTS.some((e) => e.id === id && e.ready)
}
