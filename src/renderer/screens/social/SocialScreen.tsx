import type { CreativeItem, CreativeKind, CreativeProviderId, CreativeSort } from '@shared/creative'
import { useState } from 'react'
import {
  useCreativeConnections,
  useCreativeLibrary,
  useLiberarNavegadores,
} from '@/hooks/useCreative'
import { Panel } from '@/ui/Panel'
import { PanelRow } from '@/ui/PanelRow'
import { Biblioteca } from './Biblioteca'
import { Descobrir } from './Descobrir'
import { Detalhe } from './Detalhe'
import { Fontes } from './Fontes'
import { PorLink } from './PorLink'

/**
 * Social Arte — a área criativa.
 *
 * Um agregador PESSOAL de referências: procurar, ver, guardar e voltar ao
 * original. Não é rede social, e a ausência é deliberada — não há seguidores,
 * comentários, curtidas públicas, chat nem publicação.
 *
 * A tela mantém a linha de três painéis do handoff (300 / 470 / 320 × 620) — e
 * os MESMOS paddings de antes, ao pixel: a baseline de `npm run layout` grava
 * a caixa renderizada, e ela não muda porque o conteúdo mudou. O que mudou
 * foram os PAPÉIS — de onde vem, o que se acha, o que se guarda. Por isso os
 * dois primeiros painéis não têm respiro lateral próprio: quem o dá é a coluna
 * dentro deles.
 *
 * O id da tela continua `social`. Trocá-lo invalidaria o `hiddenScreens` de
 * quem já escondeu ou mostrou esta tela, a baseline do layout e quatro
 * ferramentas. O que virou "Social Arte" é o RÓTULO.
 *
 * Os dois modais nascem FORA do `PanelRow`: ele tem `perspective`, e ali a
 * ordem de pintura sai da profundidade e não do `z-index` (CLAUDE.md § Modal).
 *
 * O que cada plataforma permite — e por que só o DeviantArt e "qualquer
 * endereço" estão integrados — está em SOCIAL-ARTE.md. Não é detalhe de
 * implementação: é o que decide o desenho.
 */
export function SocialScreen() {
  useLiberarNavegadores()
  const [texto, setTexto] = useState('')
  const [tipos, setTipos] = useState<CreativeKind[]>([])
  const [ordem, setOrdem] = useState<CreativeSort>('relevancia')
  const [aberto, setAberto] = useState<CreativeItem | null>(null)
  /**
   * O grupo aberto na Biblioteca — e o DESTINO de quem for salvo no feed.
   *
   * Pedido do usuário: o que se salva vai para o grupo selecionado. O grupo
   * selecionado é este: salvar com "Inspirações" aberto guarda em Inspirações,
   * com "Favoritos" aberto guarda favoritado, e com "Tudo" aberto guarda solto.
   * Sem isto tudo caía solto e os grupos ficavam permanentemente vazios.
   */
  const [grupo, setGrupo] = useState('tudo')
  /**
   * Em quais fontes procurar. VAZIO significa "todas" — e não "nenhuma".
   *
   * É o mesmo acordo de `CreativeQuery.providers`, e é o que faz a busca
   * continuar funcionando para quem nunca abriu este seletor.
   */
  const [fontesDaBusca, setFontesDaBusca] = useState<CreativeProviderId[]>([])
  const [porLink, setPorLink] = useState(false)

  const { library, salvar, remover, favoritar, mover, criarColecao, apagarColecao } =
    useCreativeLibrary()
  // Uma chamada só: o painel de fontes e o seletor da busca leem a mesma lista.
  const { data: fontes, entrar, sair } = useCreativeConnections()

  const salvos = library?.items ?? []
  const colecoes = library?.collections ?? []
  const guardado = (id: string) => salvos.find((s) => s.item.id === id)

  /**
   * Favoritar um item que ainda não está na biblioteca SALVA primeiro.
   *
   * Favoritar é marcação rápida, mas ela precisa de onde morar: sem isto, o
   * coração de um resultado de busca não teria efeito nenhum, e a tela estaria
   * oferecendo um botão que não faz nada.
   */
  const aoFavoritar = (item: CreativeItem) => {
    const atual = guardado(item.id)
    if (!atual) {
      void salvar(item, { favorite: true })
      return
    }
    void favoritar(item.id, !atual.favorite)
  }

  /** Onde um item cai ao ser salvo, conforme o grupo aberto na Biblioteca. */
  const destino = () =>
    grupo === 'favoritos' ? { favorite: true } : grupo === 'tudo' ? {} : { collections: [grupo] }

  const aoSalvar = (item: CreativeItem) => {
    const atual = guardado(item.id)
    if (atual) void remover(item.id)
    else void salvar(item, destino())
  }

  /** O nome do destino, para o botão poder dizer para onde vai. */
  const nomeDoGrupo =
    grupo === 'tudo'
      ? ''
      : grupo === 'favoritos'
        ? 'Favoritos'
        : (colecoes.find((c) => c.id === grupo)?.name ?? '')

  return (
    <>
      <PanelRow gap={26} perspective={2200} padding="40px 46px 120px">
        <Panel
          variant="side"
          w={300}
          h={620}
          radius={28}
          padding="24px 0 12px"
          rest="rotateY(16deg) translateZ(-40px)"
          fromX={150}
        >
          <Fontes
            fontes={fontes}
            aoEntrar={entrar}
            aoSair={sair}
            termo={texto}
            tipos={tipos}
            aoTrocarTipos={setTipos}
            ordem={ordem}
            aoTrocarOrdem={setOrdem}
          />
        </Panel>

        <Panel variant="center" w={470} h={620} radius={30} overflow="hidden">
          <Descobrir
            texto={texto}
            aoDigitar={setTexto}
            fontes={fontes}
            fontesEscolhidas={fontesDaBusca}
            aoEscolherFontes={setFontesDaBusca}
            tipos={tipos}
            ordem={ordem}
            salvos={salvos}
            destino={nomeDoGrupo}
            aoAbrir={setAberto}
            aoFavoritar={aoFavoritar}
            aoSalvar={aoSalvar}
          />
        </Panel>

        <Panel
          variant="side"
          w={320}
          h={620}
          radius={28}
          padding="20px 18px"
          gap={14}
          rest="rotateY(-16deg) translateZ(-40px)"
          fromX={-150}
        >
          <Biblioteca
            colecoes={colecoes}
            salvos={salvos}
            filtro={grupo}
            aoFiltrar={setGrupo}
            aoAbrir={setAberto}
            aoFavoritar={aoFavoritar}
            aoRemover={(id) => void remover(id)}
            aoCriarColecao={(nome) =>
              void criarColecao({ name: nome, description: '', color: '', icon: '' })
            }
            aoApagarColecao={(id) => void apagarColecao(id)}
            aoSalvarPorLink={() => setPorLink(true)}
          />
        </Panel>
      </PanelRow>

      {aberto ? (
        <Detalhe
          item={aberto}
          salvo={Boolean(guardado(aberto.id))}
          favorito={guardado(aberto.id)?.favorite ?? false}
          aoFechar={() => setAberto(null)}
          aoFavoritar={() => aoFavoritar(aberto)}
          aoSalvar={() => aoSalvar(aberto)}
          colecoes={colecoes}
          emColecoes={guardado(aberto.id)?.collections ?? []}
          aoTrocarColecoes={(ids) => {
            // Organizar exige estar na biblioteca: marcar uma coleção guarda o
            // item se ele ainda não estava, em vez de não fazer nada.
            const atual = guardado(aberto.id)
            if (atual) void mover(aberto.id, ids)
            else void salvar(aberto, { collections: ids })
          }}
        />
      ) : null}

      {porLink ? (
        <PorLink
          colecoes={colecoes}
          // Coleção aberta vira o destino; "Tudo" e "Favoritos" não são
          // coleções, então ali não há o que pré-marcar.
          destino={colecoes.some((c) => c.id === grupo) ? grupo : ''}
          aoFechar={() => setPorLink(false)}
          aoSalvar={(item, onde) => void salvar(item, onde)}
        />
      ) : null}
    </>
  )
}
