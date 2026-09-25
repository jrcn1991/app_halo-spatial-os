import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { qdbus } from './kwin'

/**
 * O efeito do KWin que faz a JANELA DE VERDADE voar para a pílula — e voltar.
 *
 * No Wayland nenhum app captura os pixels da janela de outro, então a camada
 * do fantasma só consegue desenhar um cartão preto (`Voo.tsx`). Quem enxerga
 * o conteúdo é o compositor, e o KWin aceita efeitos em JavaScript — é assim
 * que o Squash e o Magic Lamp são feitos. Este aqui anima tamanho, posição e
 * opacidade da janela guardada até a boca da ilha (a janela `Halo · Ilha`
 * que ele mesmo acha na pilha) e de volta.
 *
 * É a única coisa que o app escreve fora da pasta dele, além do atalho:
 * `~/.local/share/kwin-wayland/effects/halo-gaveta/` (o diretório de
 * pacotes do usuário; o Plasma 6.6 separa `kwin-wayland` de `kwin`), e o
 * efeito é carregado no compositor por D-Bus (`loadEffect`), sem tocar em
 * `kwinrc`. É exceção documentada (CLAUDE.md § Janela e camada); a opção
 * `island.kwinEffect` desliga e REMOVE o pacote.
 *
 * Como o efeito sabe quais janelas são nossas: a guardada recebe
 * `skipTaskbar` e `skipSwitcher` antes de minimizar, e é o **`skipSwitcher`**
 * que ele testa — na API dos efeitos do Plasma 6.6 a `EffectWindow` NÃO tem
 * `skipTaskbar` (vem `undefined`; medido em 02/09/2026 enumerando as
 * propriedades pelo journal), e com o teste errado o efeito desistia antes
 * de animar e o Squash levava a janela para a barra. O Squash e o Magic
 * Lamp ignoram janelas sem ícone na barra, então não brigam. O
 * YetAnotherMagicLamp segura a janela por 900ms esperando um ícone e só
 * então desiste (medido no journal): por isso a guardada fica com opacidade
 * zero PERSISTENTE (`set`) depois do voo — senão piscaria ao ser solta.
 *
 * A VOLTA não é disparada pelo desminimizar. O YAML guarda a geometria do
 * ícone antigo e, ao desminimizar, anima a janela "abrindo" em direção a
 * ele por cima do nosso voo — era a janela vista saindo da posição dela,
 * não da ilha (medido em quadros do Spectacle, 02/09/2026). Então o app desminimiza a
 * janela INVISÍVEL (opacidade 0), deixa o YAML terminar no escuro, e só
 * então põe a opacidade em 1: é o `windowOpacityChanged` de uma janela
 * marcada como guardada que dispara o voo de volta.
 */
const ID = 'halo-gaveta'

const METADATA = `{
  "KPackageStructure": "KWin/Effect",
  "KPlugin": {
    "Id": "${ID}",
    "Name": "Halo · Gaveta",
    "Description": "A janela guardada na ilha do Halo voa para a pílula, e volta dela",
    "Category": "Appearance",
    "EnabledByDefault": false,
    "License": "MIT",
    "Authors": [{ "Name": "Halo" }]
  },
  "X-KDE-Ordering": 61,
  "X-Plasma-API": "javascript"
}
`

/**
 * A TRAJETÓRIA, cravada no pacote na hora de escrevê-lo.
 *
 * O efeito roda dentro do compositor e não alcança as configurações do app —
 * e a `EffectWindow` que ele recebe não é a mesma `Window` que os scripts do
 * KWin manipulam, então nem uma propriedade posta de fora chegaria até aqui.
 * Como `instalarEfeito` já reescreve e recarrega o pacote a cada mudança de
 * configuração da ilha, o caminho mais curto é gerar o código com a curva
 * escolhida dentro.
 *
 * São TRÊS, e não sete como as de cartão, porque o compositor anima tamanho,
 * posição e opacidade e nada além: a dobra, o giro e o gargalo do gênio não
 * têm como ser pedidos aqui.
 *
 * Cada uma diz três curvas — a do tamanho, a do deslocamento e a da opacidade
 * —, na ida e na volta:
 *
 * - **sugado**: o voo original. Tamanho e deslocamento juntos em InOutCubic,
 *   e a opacidade só cede no fim (InQuint).
 * - **foguete**: o deslocamento em `OutBack`, que PASSA do alvo e volta — como
 *   a boca fica acima, passar do alvo é subir mais alto que a pílula e cair
 *   dentro dela. O tamanho segue em OutCubic, senão ele também passaria do
 *   ponto e a janela ficaria menor que a boca antes de chegar.
 * - **desmanchar**: mesma rota do sugado, com a opacidade em `Linear` — ela
 *   cede desde o primeiro quadro, e a janela chega quase apagada.
 */
type Trajetoria = { tamanho: string; passeio: string; opacidade: string }

const TRAJETORIAS: Record<string, { ida: Trajetoria; volta: Trajetoria }> = {
  real: {
    ida: {
      tamanho: 'InOutCubic',
      passeio: 'InOutCubic',
      opacidade: 'InQuint',
    },
    volta: { tamanho: 'OutCubic', passeio: 'OutCubic', opacidade: 'OutQuint' },
  },
  'real-foguete': {
    ida: { tamanho: 'OutCubic', passeio: 'OutBack', opacidade: 'InQuint' },
    volta: { tamanho: 'OutCubic', passeio: 'InBack', opacidade: 'OutQuint' },
  },
  'real-desmanchar': {
    ida: { tamanho: 'OutCubic', passeio: 'InOutCubic', opacidade: 'Linear' },
    volta: { tamanho: 'InOutCubic', passeio: 'InOutCubic', opacidade: 'Linear' },
  },
}

/**
 * O código do efeito, com a trajetória escolhida.
 *
 * Tamanho e deslocamento saem em chamadas SEPARADAS de `animate` (e não em
 * duas entradas da mesma), porque é assim que cada um recebe a sua curva — o
 * `curve` do `animate` vale para a chamada inteira. O foguete depende disso:
 * é o deslocamento que passa do alvo, e o tamanho não pode passar junto.
 */
function codigo(estilo: string, altura: number): string {
  const t = TRAJETORIAS[estilo] ?? TRAJETORIAS.real
  if (!t) throw new Error('trajetória sem curvas')
  const curva = (nome: string) => `QEasingCurve.${nome}`
  return `"use strict";
/* Halo · Gaveta — escrito pelo Halo; a opção "efeito do KWin" em
   Configurações → Ilha remove este pacote. Trajetória: ${estilo}. */
var haloGaveta = {
  duration: animationTime(520),
  ilha: function (window) {
    var lista = effects.stackingOrder, melhor = null;
    for (var i = 0; i < lista.length; i++) {
      var w = lista[i];
      if (w.caption === "Halo · Ilha" && w.width < 1000) {
        if (!melhor || w.screen === window.screen) melhor = w;
      }
    }
    return melhor;
  },
  boca: function (ilha) {
    var g = ilha.geometry;
    /* 6px acima da barriga da pílula, cuja altura o usuário escolhe
       (island.pillHeight = ${altura}): a janela da ilha é sempre a aberta, e
       dela sozinha não se deduz onde a pílula fechada termina. */
    return { x: g.x + g.width / 2 - 22, y: g.y + ${Math.max(6, altura - 6)}, width: 44, height: 10 };
  },
  voar: function (window, sentido) {
    if (!window.skipSwitcher || effects.hasActiveFullScreenEffect) return;
    var ilha = this.ilha(window);
    if (!ilha) return;
    var b = this.boca(ilha), r = window.geometry;
    var dx = b.x - r.x - (r.width - b.width) / 2;
    var dy = b.y - r.y - (r.height - b.height) / 2;
    var ida = sentido === "ida";
    if (window.haloSumida) { cancel(window.haloSumida); delete window.haloSumida; }
    window.setData(Effect.WindowForceBlurRole, true);
    animate({
      window: window,
      curve: ida ? ${curva(t.ida.tamanho)} : ${curva(t.volta.tamanho)},
      duration: this.duration,
      keepAlive: false,
      animations: [
        { type: Effect.Size,
          from: { value1: ida ? r.width : b.width, value2: ida ? r.height : b.height },
          to: { value1: ida ? b.width : r.width, value2: ida ? b.height : r.height } }
      ]
    });
    animate({
      window: window,
      curve: ida ? ${curva(t.ida.passeio)} : ${curva(t.volta.passeio)},
      duration: this.duration,
      keepAlive: false,
      animations: [
        { type: Effect.Translation,
          from: { value1: ida ? 0 : dx, value2: ida ? 0 : dy },
          to: { value1: ida ? dx : 0, value2: ida ? dy : 0 } }
      ]
    });
    animate({
      window: window,
      curve: ida ? ${curva(t.ida.opacidade)} : ${curva(t.volta.opacidade)},
      duration: this.duration,
      keepAlive: false,
      animations: [{ type: Effect.Opacity, from: ida ? 1 : 0, to: ida ? 0 : 1 }]
    });
    if (ida) {
      window.haloGuardada = true;
      // Guardada, fica invisível enquanto outro efeito a segurar.
      window.haloSumida = set({
        window: window,
        duration: this.duration,
        animations: [{ type: Effect.Opacity, from: 1, to: 0 }]
      });
    } else {
      delete window.haloGuardada;
    }
  },
  janelaNova: function (window) {
    window.minimizedChanged.connect(function () {
      if (window.minimized) haloGaveta.voar(window, "ida");
    });
    // A volta: a janela guardada, já desminimizada, ganha opacidade 1.
    window.windowOpacityChanged.connect(function () {
      if (window.haloGuardada && !window.minimized && window.opacity >= 1) {
        haloGaveta.voar(window, "volta");
      }
    });
  },
  init: function () {
    effects.windowAdded.connect(haloGaveta.janelaNova);
    for (const w of effects.stackingOrder) haloGaveta.janelaNova(w);
  }
};
haloGaveta.init();
`
}

/** O diretório de pacotes do usuário: o mesmo nome que o sistema usa. */
function pasta(): string {
  const base = existsSync('/usr/share/kwin-wayland/effects') ? 'kwin-wayland' : 'kwin'
  return join(homedir(), '.local', 'share', base, 'effects', ID)
}

let carregado = false

/** Se o efeito está de pé no compositor: aí a janela de verdade voa, sem cartão. */
export const efeitoCarregado = (): boolean => carregado

/**
 * Escreve o pacote e o carrega.
 *
 * Sempre reescreve e recarrega: o código pode ter mudado entre versões do app,
 * e a TRAJETÓRIA escolhida em Configurações vive dentro dele. Como
 * `aplicarEfeito` roda a cada mudança de configuração da ilha, trocar a
 * variação já reinstala o efeito sozinha.
 */
export async function instalarEfeito(estilo: string, altura: number): Promise<boolean> {
  const dir = pasta()
  const arquivoCodigo = join(dir, 'contents', 'code', 'main.js')
  const novoCodigo = codigo(estilo, altura)
  // Igual ao que já está no disco e já carregado no compositor: nada a fazer.
  // Recarregar faz o KWin recompilar o efeito, e isso acontecia a CADA
  // arranque e a cada ajuste da ilha (DESEMPENHO.md, P3-13).
  const [atual, jaCarregado] = await Promise.all([
    readFile(arquivoCodigo, 'utf8').catch(() => ''),
    qdbus('org.kde.KWin', '/Effects', 'org.kde.kwin.Effects.isEffectLoaded', ID).catch(() => ''),
  ])
  if (atual === novoCodigo && jaCarregado.trim() === 'true') {
    carregado = true
    return true
  }
  await mkdir(join(dir, 'contents', 'code'), { recursive: true })
  await writeFile(join(dir, 'metadata.json'), METADATA, 'utf8')
  await writeFile(arquivoCodigo, novoCodigo, 'utf8')
  await qdbus('org.kde.KWin', '/Effects', 'org.kde.kwin.Effects.unloadEffect', ID).catch(() => {})
  const resposta = await qdbus('org.kde.KWin', '/Effects', 'org.kde.kwin.Effects.loadEffect', ID)
  carregado = resposta.trim() === 'true'
  return carregado
}

/** Descarrega do compositor e apaga o pacote — a opção desligada não deixa rastro. */
export async function removerEfeito(): Promise<void> {
  carregado = false
  await qdbus('org.kde.KWin', '/Effects', 'org.kde.kwin.Effects.unloadEffect', ID).catch(() => {})
  await rm(pasta(), { recursive: true, force: true })
}
