# Documentação do Halo

> 🇬🇧 Read in English: [DOCUMENTATION.md](DOCUMENTATION.md)

Como o Halo funciona por dentro, e como mexer nele sem quebrar o que já foi
medido. O [README](README.md) é para quem usa; este arquivo é para quem lê ou
muda o código. O que vem de terceiros, com as licenças, está em
[THIRD-PARTY.md](THIRD-PARTY.md).

## Sumário

1. [As regras do projeto](#as-regras-do-projeto)
2. [Criar um ambiente novo](#criar-um-ambiente-novo)
3. [Desenvolvimento](#desenvolvimento) — rodar, verificar, empacotar e cada integração

Alguns comentários do código citam cadernos internos de desenvolvimento
(`DINAMICA.md`, `MOCKS.md`, `CLAUDE.md` e outros). Eles não fazem parte do
repositório público; o que importa deles para quem lê o código está aqui.

## As regras do projeto

Cada regra vem com o motivo, porque regra sem motivo é a primeira a ser
quebrada por engano.

### Dados: real primeiro, exemplo declarado

- **Se a máquina tem o dado, use o dado.** Docker, sistema de arquivos, git,
  `/proc`, MPRIS e arquivos `.desktop` já estão ligados. Antes de inventar
  qualquer coisa, procure a fonte real.
- **Nada de dado inventado sem aviso na tela.** Se um painel mostra conteúdo
  de exemplo, ele diz isso.
- **O caminho de um dado é sempre o mesmo:**

  ```
  src/main/services/<assunto>.ts   busca de verdade (Node, CLI, D-Bus, HTTP)
  src/shared/<assunto>.ts          o tipo, compartilhado entre os processos
  src/shared/ipc-contract.ts       o canal, tipado
  src/renderer/domain/             contratos (interfaces assíncronas)
  src/renderer/data/mock/          valores de exemplo
  src/renderer/data/ipc/           implementação real (fala com o main)
  src/renderer/data/index.ts       a fábrica — o ÚNICO ponto que escolhe
  src/renderer/hooks/              use…() → { data, loading, error }
  ```

- **Contratos sempre assíncronos**, mesmo quando a resposta é imediata: um
  contrato síncrono hoje é uma reescrita amanhã.
- **Componentes nunca importam `data/`**, só `hooks/`. Trocar exemplo por real
  não pode encostar em componente.
- **A fábrica escolhe pelo ambiente**: dentro do Electron vão os serviços
  reais; fora dele (navegador, testes) vão os exemplos. É isso que torna os
  testes determinísticos — e é o que `npm run vitrine` usa para gerar as
  imagens do README, e `npm run demo-web` para a demo interativa da página
  (`site/demo/`, dados inventados, sem rede).
- **Leitura periódica mora no main, num relógio só.** O histórico dos
  medidores é colhido por UM amostrador em `services/host.ts`: a tela remonta
  a cada troca de aba e perderia o que guardasse, e a CPU é diferença entre
  duas leituras — um segundo leitor logo depois do primeiro mediria um
  intervalo de milissegundos.
- **Processo externo é o custo que se vê.** Cada `execFile` é um processo
  novo (4–36 ms de parede cada). Leitura que sai para um programa de fora tem
  prazo de validade proporcional ao que mede (`memo`, em
  `island/snapshot.ts`), mais longo com a ilha recolhida, e é esquecida quando
  o usuário age.
- **Programa de fora novo entra na lista de dependências**
  (`src/shared/dependencias.ts`), lida por três lugares: `npm run doctor`,
  Configurações → Sistema e o `.deb`. Sem isso, a falta dele vira silêncio.
- **Rede e disco só no processo main.** A CSP do renderer permite
  `connect-src 'self'` e nada mais; a única fresta é `img-src`, host a host,
  para capas públicas.
- **Arquivos são somente leitura.** Não existe operação de escrita, remoção,
  renomeação ou execução — nem no serviço, nem no contrato de IPC. A garantia
  é a AUSÊNCIA dessas operações, e `test:live` cobra isso.

### Segredos

- **Chaves de API são do usuário**, informadas em Configurações e guardadas em
  `~/.config/halo-spatial-os/settings.json`. O app não embute chave nenhuma;
  sem ela, a tela diz onde configurar.
- **Segredo não viaja em argumento de linha de comando** (argv é legível em
  `/proc/<pid>/cmdline`): `paraRenderer`, em `src/main/window.ts`, tira os
  tokens do Spotify e do Seafile e a chave do TMDB antes de a janela
  recebê-los. Se a tela precisa saber que a chave existe, recebe uma marca
  (`TMDB_GUARDADA`), que `saveSettings` troca de volta pela chave do disco.
- **Login de terceiro abre no navegador do sistema**, por OAuth com PKCE —
  uma janela do app pedindo senha seria indistinguível de phishing. Duas
  exceções, com amarras escritas no código: o Seafile da rede local (a senha
  vira token na hora e nunca é guardada) e as fontes da Social Arte (quem pede
  a senha é a página de verdade da plataforma, numa janela com a URL carimbada
  no título).
- **Termos de uso valem como requisito**: a atribuição do TMDB não sai da tela.

### O que vem da tela não é de confiança

O renderer mostra texto de fora (páginas da Social Arte, respostas de modelo,
metadados de mídia). Se um dia ele for enganado, o main é o que separa esse
engano da máquina. Por isso todo canal de IPC trata o que recebe como vindo
de fora:

- **Toda janela do app fica na própria origem.** `travarNavegacao`
  (`src/main/navegacao.ts`) recusa `will-navigate` e `will-redirect` para
  fora do app e nega janela nova — sem isso, soltar um link na janela a
  levaria para outra página, e essa página herdaria o preload com todo o IPC.
  Janela nova passa por ela. As da Social Arte ficam de fora de propósito:
  elas navegam, e por isso não têm preload.
- **Abrir app ou caminho só com o que o main reconhece.** `gio launch` só
  recebe um `.desktop` que esteja nas pastas que a lista de aplicativos lê
  (`desktopConhecido`, em `services/apps.ts`); `gio open` só recebe pasta,
  URL `http(s)`, `mailto:` sem anexo ou item da gaveta
  (`abrirDoRenderer`, em `island/actions.ts`). Abrir um ARQUIVO com o
  programa padrão é executá-lo, e isso o app não faz. Os dois levam `--`
  antes do argumento, para ele nunca virar opção.
- **Caminho vindo da tela é resolvido antes de usado.** Anexo do Claude,
  envio ao Seafile, ao celular e OCR passam por `arquivoSolto`
  (`services/arquivo-solto.ts`): caminho absoluto, `realpath`, arquivo
  comum, fora de `/proc`, `/sys` e `/dev`, com teto de tamanho. A gaveta só
  apaga o que está DENTRO dela, comparando a pasta do caminho já resolvido —
  `startsWith` deixava `..` passar. O mascote só é lido da biblioteca.
- **URL de fora só pela trava de rede.** Tudo que o main busca num endereço
  que não escolheu (link colado, capa do MPRIS, redirecionamentos) passa por
  `creative/rede.ts`: uma lista só de faixas proibidas, que pega também o
  IPv4 escondido num IPv6 (`::ffff:`, NAT64, 6to4), e o IP conferido é o IP
  conectado — o `lookup` confere na hora da conexão, então o nome não pode
  trocar de endereço entre a conferência e a busca.
- **Socket local nasce fechado.** A API da ilha cria o socket com `umask`
  0177: ele já existe como 0600, sem intervalo em que outro usuário o abra.

### CSS: três armadilhas que já custaram caro

1. **Nenhuma cor literal fora de `styles/tokens.css`.** `npm run lint:style`
   falha se acontecer.
2. **Nenhuma `animation` dentro de `.module.css`.** O CSS Modules renomeia o
   `animation-name`, o keyframe deixa de existir e a animação não roda — sem
   erro nenhum. Declare em `styles/animations.css`, presa a um `data-…`.
3. **Não existe `box-sizing: border-box` global.** As medidas do design são
   `content-box`; com `border-box` os mesmos números dão painéis menores.

E duas decisões: painéis levam `min-width: 0`, e `-webkit-app-region: drag` só
existe no traço do dock (o Chromium não registra arraste sob `transform`,
`mask-image` ou `backdrop-filter`). Qualquer sobreposição (modal) vai FORA da
linha de painéis: ela tem `perspective`, e ali a ordem de pintura sai da
profundidade, não do `z-index`.

### Idioma

Português é o padrão e é a **língua do código**: o texto é escrito em
português no próprio componente, e ele é a chave da tradução —
`t('Configurações')`, de `@shared/i18n`. O inglês mora em
`src/shared/i18n/en/`, um arquivo por área. Regras:

- **Todo texto que alguém lê passa por `t()`** — rótulos, avisos, estados
  vazios, `aria-label`, erros que chegam à tela, textos do main (bandeja,
  leituras da ilha). `npm run i18n`, dentro do `check`, falha se um texto
  marcado não tiver inglês — e também se sobrar tradução que nenhum texto usa.
  Plural por ternário (`t(n === 1 ? 'a' : 'b')`) é lido nos dois braços.
- **O que varia entra por `{nome}`**: `t('{n} títulos', { n })`. Nada de
  `${…}` dentro da chave: a ordem das palavras muda de uma língua para a outra.
- **`t()` na hora de desenhar, nunca no topo do módulo** — senão a língua do
  arranque fica congelada. Tabela de dados usa `marcar('…')` e é traduzida
  com `t(rotulo)` onde aparece.
- **Valor não é texto.** O que é comparado, gravado ou usado como id fica em
  português (e, se aparece na tela, é traduzido só ao mostrar).
- **Datas e números** seguem a língua: `localeDoIdioma()`.
- A troca vale na hora em todas as janelas: o main avisa todas
  (`IPC.idiomaMudou`), e cada uma remonta pela `ComIdioma`.

### Configurações

Toda preferência segue o mesmo caminho: campo e validação em
`src/shared/settings.ts` (campo a campo — o arquivo é editável à mão e precisa
sobreviver a lixo), estado em `src/renderer/store/useHalo.ts`, uma seção por
arquivo em `src/renderer/screens/settings/`, e quem consome lê do store. O
arquivo é escrito pelo **main**, agrupado por 400 ms e atômico.

- **Configuração não pode trancar o usuário para fora.** Home e
  Configurações não saem do dock, e o app só nasce recolhido se houver caminho
  de volta (a ilha ou a bandeja).
- **Campos que o main escreve sozinho** (posição da janela, progresso do
  player, tokens) são preservados por `saveSettings` — a cópia que volta do
  renderer é a do arranque, e apagaria o que mudou depois.
- **Preferência que um tema sugere é guardada POR AMBIENTE**
  (`environment.ajustes`), e ausência quer dizer "não escolhi": vale o preset
  do ambiente e, na falta dele, o valor do design. Tudo ali testa `??`, nunca
  `||` — `0` é transparência válida.

### Janela e camada

A janela do app é sem moldura, transparente e sem sombra, e **desce para a
camada do papel de parede** (`_NET_WM_STATE_BELOW`, em
`services/desktop-layer.ts`): nunca cobre outra janela. A do player sobe acima
de tudo. O app vive na **bandeja**, publicada por D-Bus em `src/main/tray.ts`,
e sai da barra de tarefas por EWMH. Por isso **X11 é requisito**: camada,
posição e "manter por cima" só existem lá, e o app sempre abre em X11
(Xwayland numa sessão Wayland).

**O que o Halo escreve fora de si** — quatro coisas, cada uma com interruptor
e caminho de desfazer: o papel de parede da sessão (com o original guardado
antes da primeira troca), o pacote do efeito do KWin, as linhas de atalho no
`kglobalshortcutsrc` e o Meta+V tirado do Klipper. Efeito de sistema novo que
exija tocar na configuração do usuário precisa de interruptor e de caminho de
volta.

### Antes de dizer que terminou

```bash
npm run check          # typecheck + biome + build + lint de estilo + telas + layout
npm run test:live      # os serviços do main respondem nesta máquina
```

Nada de "deve funcionar": rode o app e olhe. Se um guarda falhar, entenda
antes de silenciar. Mudança de layout intencional atualiza a baseline com
`npm run layout -- --update` na mesma mudança.

## Criar um ambiente novo

Um ambiente é um **tema da interface + um papel de parede**. Um tema não edita
tela nenhuma: só redefine tokens em `src/renderer/styles/env-<id>.css`, sob
`:root[data-env="<id>"]`, e lê atributos que o app já escreve. O caminho:

1. registre o ambiente em `src/shared/environments.ts` (id, nome, papel de
   parede padrão, `ready: true`);
2. crie `styles/env-<id>.css` e importe-o nos TRÊS `main.tsx` que o tema veste:
   o do app, o do lançador (`src/renderer/launcher/`) e o dos balões de
   notificação (`src/renderer/notificacoes/`);
3. desenhe o balão de notificação do tema (`[data-halo-in="aviso"]`) — sem
   regra própria ele sai no vidro padrão com as cores do tema;
4. se o tema sugere vidro, entrada ou gráficos próprios, entre em
   `PRESETS_DO_AMBIENTE` (`src/renderer/app/environment.ts`);
5. papel de parede próprio vai em `src/renderer/assets/env/<id>/fundo.jpg`,
   em `EMBUTIDOS` (`services/wallpaper.ts`) e em `extraResources`;
6. rode `npm run check`, `npm run vitrine` e `npm run demo-web`, e olhe o resultado.

Arte de terceiro não entra: os ambientes que existem usam arte própria, gerada
para o projeto, e a proveniência de cada peça está em
[THIRD-PARTY.md](THIRD-PARTY.md).

## Desenvolvimento

### Rodar

```bash
npm install
npm run dev        # Electron + HMR (em X11 — ver "Janela e camada")
npm run build      # typecheck + bundle em out/
npm run check      # typecheck + biome + build + style-lint
npm run dist       # AppImage + .deb
```

### Empacotar e instalar

`npm run dist` produz o AppImage e o `.deb` em `dist/`. Quatro coisas medidas ao
empacotar pela primeira vez (05–06/09/2026), todas com o motivo escrito onde
elas moram:

- **O `umask` da máquina vaza para dentro do pacote.** Com um `umask` restritivo
  (`0007`, por exemplo), tudo que o build gerava saía `rw-rw----`, e o `dpkg` preserva o modo:
  o app instalava e ficava **ilegível para o próprio usuário**, `.desktop`,
  ícones e `app.asar` inclusive. Por isso o script `dist` fixa `umask 022` e
  passa um `chmod -R a+rX` em `build` e `out` antes de chamar o empacotador:
  o pacote não pode depender de como está configurada a máquina que o gerou.
- **`StartupWMClass` tem de ser o nome do EXECUTÁVEL.** O Electron tira a
  `WM_CLASS` dele (`halo-spatial-os`), não do `productName` (`Halo`). Com o
  nome errado o pacote instala igual e a janela fica órfã: ícone genérico na
  barra e no alternador. Conferido com `xprop` sobre a janela instalada.
- **Uma categoria principal, não duas.** `Utility;System` fazia o app aparecer
  **duas vezes** no menu. `desktop-file-validate` avisa — vale rodá-lo sobre
  `/usr/share/applications/halo-spatial-os.desktop` depois de instalar.
- **`suggests` não existe** no schema do electron-builder 26 (só `depends` e
  `recommends`), e a configuração inteira é recusada se ele estiver lá.

O AppImage precisa de `libfuse2t64` (o `libfuse2` do Ubuntu 24.04 em diante), que nem toda máquina tem; o `.deb` não
precisa de nada além do que ele declara.

Atalhos de desenvolvimento (só em `npm run dev`): `1`–`8` trocam de tela,
`Ctrl+Shift+E` percorre as 13 variações de entrada, `Ctrl+Shift+R` repete a
animação da tela atual. As variações também estão em **Configurações**
(engrenagem no dock), que é onde elas viram escolha do usuário.

### Stack

| Camada | Escolha |
|---|---|
| Shell | Electron 44, janela transparente sem moldura (Chromium pinado — no Linux o WebView do sistema varia por distro) |
| Build | electron-vite 5 · **Vite 7.3.6** (o electron-vite ainda não aceita Vite 8) |
| UI | React 19 · TypeScript strict |
| Estilo | CSS Modules + `styles/tokens.css` |
| Estado | Zustand 5 |
| Ícones | `@phosphor-icons/react` |
| Fontes | `@fontsource/dm-sans` + `@fontsource/dm-mono`, empacotadas (sem CDN) |

### Verificação

Seis comandos, cada um respondendo a uma pergunta diferente:

```bash
npm run check          # compila, está formatado, segue as regras de estilo — e roda os dois abaixo
npm run test:screens   # cada tela renderiza e mostra o que promete (115 verificações)
npm run layout         # os painéis não mudaram de forma sem alguém decidir
npm run test:live      # os serviços reais desta máquina respondem
npm run island         # as integrações da ilha dinâmica
npm run doctor         # os programas de sistema que o app chama estão aqui
```

`test:screens` e `layout` rodam contra o app construído servido por HTTP. Ali
`window.halo` não existe, então a fábrica de dados cai nos mocks — é o que torna
esses testes determinísticos: não dependem de rede, do Docker nem do que estiver
tocando.

`test:live` é o oposto: conversa com o app **rodando** e cobra os serviços do
processo principal (`HALO_CDP=http://127.0.0.1:9333 npm run test:live` aponta
para outra instância, quando há mais de uma aberta). Ele não exige um resultado específico (não há container fixo
nem música garantida) — cobra forma e sanidade, e inclui uma checagem de
segurança: a superfície de arquivos precisa continuar somente leitura, sem
nenhuma operação de escrita exposta em lugar nenhum do contrato. Duas outras
guardam decisões que já custaram depuração: que o app e o player continuem em
camadas opostas, e que a capa de quem está tocando chegue num formato que a
tela consiga abrir.

`layout` compara com uma baseline própria em `tools/baseline/layout.json`, não
mais com o protótipo. Mudança de layout intencional se aceita com
`npm run layout -- --update`, na mesma alteração, para o diff mostrar o que
mexeu.

`doctor` é o único que não olha para o código: ele confere os **26 programas
de sistema** que o app chama de fora (nenhum vem no pacote) e sai com erro se
faltar algum dos essenciais. A mesma lista — `src/shared/dependencias.ts` — é o
que o `.deb` declara em `depends`/`recommends` e o que **Configurações →
Sistema** mostra dentro do app, para quem não abre terminal. A tabela completa, com o
pacote apt de cada um, está no [README](README.md#programas-do-sistema).

As regras que guiam o trabalho estão no começo deste arquivo, em
[As regras do projeto](#as-regras-do-projeto).

### Decisões que parecem erro e não são

- **`overrides` no `package.json`, para pacotes que o app nem chama.** O
  `dbus-next` parou na 0.10.2 e prende o `xml2js` numa versão com
  *prototype pollution* — e ele lê o XML que outros processos da sessão D-Bus
  mandam. O override sobe para a 0.6, com a mesma API. O do `usocket` (um
  opcional do `dbus-next`, que nem chega a ser instalado) tira do
  `npm audit` uma árvore antiga de `node-gyp`. Ao atualizar o `dbus-next`,
  confira se os dois ainda são necessários.
- **Sem `box-sizing: border-box` global.** O protótipo roda em `content-box`:
  "painel 270×600 com padding 18px 16px" renderiza 304px de largura, e a linha
  flex ainda encolhe os três painéis. Medido no protótipo: 297 / 733 / 278px na
  home. Com `border-box`, os mesmos números do handoff dão painéis menores e
  desalinhados. Mantendo `content-box`, todo valor do handoff é transcrito
  literalmente. Ver `styles/global.css`.
- **`--ozone-platform=x11` nos scripts e no pacote.** Não é preferência: camada
  da janela, posição e "manter por cima" só existem no X11. E **só o argumento
  de linha de comando muda a plataforma** —
  `app.commandLine.appendSwitch('ozone-platform', …)` não muda nada, medido.
- **Cada título guarda a URL inteira, com o começo dela repetido em cada linha.**
  Parece desperdício, e partir em prefixo + sufixo parece óbvio. Medido: custa
  mais memória, não menos, porque o objeto por item pesa mais que o texto repetido.
  Ficou o simples.
- **O evento de mover janela é `move`, não `moved`.** `moved` só existe no
  macOS e no Windows; no Linux ele nunca dispara, e a posição simplesmente não
  era salva — sem erro nenhum.
- **A página do player declara sua mídia pela Media Session.** Sem isso o
  Chromium publica no MPRIS o *título da página*, e o "tocando agora" da home
  mostrava "Halo · Player" em vez do filme. De quebra, é o que dá as teclas de
  mídia e o applet do KDE.
- **`--no-sandbox` nos scripts de dev.** O Ubuntu bloqueia user namespaces sem
  privilégio (`kernel.apparmor_restrict_unprivileged_userns=1`) e o
  `chrome-sandbox` de `node_modules` não é setuid root. Vale **só** em dev: o
  pacote instala o helper corretamente.
- **As animações são declaradas em `styles/animations.css`, não nos módulos.**
  O CSS Modules renomeia `animation-name` para o escopo do módulo: um
  `animation: halo-side` dentro de um `.module.css` vira `_halo-side_ab12_1`,
  que não existe — e a animação não roda, sem erro nenhum. Foi assim que a
  entrada inteira ficou morta na F1 até alguém reparar que os painéis
  apareciam prontos. `:global(halo-side)` no shorthand também não resolve
  (testado: continua hasheado). Por isso o movimento mora no CSS global,
  aplicado por `data-halo-in`, e `npm run lint:style` falha se algum
  `animation` apontar para keyframe inexistente.
- **Sem blur no modo overlay, e isso é uma escolha.** Com a janela
  transparente, `backdrop-filter` não tem o que borrar: o CSS só enxerga o que
  a própria página pintou, e atrás dos painéis não há nada. Tentamos o blur do
  compositor (KWin, `_KDE_NET_WM_BLUR_BEHIND_REGION`) e ele funciona — medimos
  queda de 26% no detalhe atrás do painel —, mas a região é uma lista de
  retângulos e é binária: não acompanha canto arredondado, nem a inclinação 3D,
  nem a opacidade subindo durante a entrada. O resultado tinha degrau nos
  cantos e piscava a cada troca de tela, longe do protótipo. Removido. Os
  painéis ficam com tint + borda + sombra sobre a tela viva.
  A declaração `backdrop-filter` continua no CSS porque no modo de comparação
  (`?bg=wallpaper`) o fundo é opaco e ela é real. A imagem desse modo é nossa,
  gerada por `tools/fundo-de-comparacao.mjs`: a foto do bundle de handoff que
  estava ali era material de terceiro dentro do pacote.
- **Os ajustes de Aparência compõem o vidro no componente, não em
  `tokens.css`.** Uma custom property declarada no `:root` resolve os `var()`
  que usa **no próprio `:root`**, e descendentes herdam o valor já pronto —
  então sobrescrever `--glass-center-alpha` no palco não mudaria nada se o
  fundo estivesse composto lá. Por isso `Panel.module.css` monta
  `rgb(from color-mix(…) r g b / var(--glass-…-alpha))`, e `tokens.css` guarda
  só as peças (base, alpha, claridade). Nos padrões (transparência 50,
  claridade 50) o resultado é exatamente o handoff.
- **Não há desfoque, e a alternativa é cor.** `backdrop-filter` só enxerga o
  que a própria página pintou, e numa janela transparente não há nada. Foram
  testados dois caminhos e ambos descartados: o blur do compositor (KWin) borra
  de verdade — medimos queda de 26% no detalhe atrás do painel — mas a região é
  uma lista de retângulos e é binária, então escadeia nos cantos arredondados e
  pisca a cada troca de tela; e pintar o wallpaper do usuário recortado na
  posição da janela dá um vidro perfeito, mas é um retrato estático que
  desalinha assim que a janela sai do centro (no Wayland o app nem sabe onde
  está). No lugar disso, **Cor do vidro**: uma gradação da cor escolhida
  atravessa o vidro, ao vivo e sem truque. Desligada, o vidro é o do handoff.
- **A posição do dock recalcula o eixo reservado em cada tela.** O handoff
  escreve o `padding` da linha de painéis com o dock na base (`130px`);
  `PanelRow` move essa reserva para o lado escolhido. Na horizontal a reserva é
  outra (a largura do dock em pé, 76+82+12), e a tela de Música informa a sua
  parte (`dockReserve={96}`) porque lá a barra de transporte também ocupa a
  base — e desce para a margem do dock quando ele sai de lá.
- **Ampliar a janela não mexe em geometria nenhuma.** O palco continua 1440×900
  e o `Stage` escala o conjunto; a janela é que cresce. Os degraus que a tela
  não comporta ficam desabilitados em vez de mentir — numa tela de 1920×1080 o
  máximo é +20% (1728×1080), porque o palco é 16:10 e a altura estoura
  primeiro, e sem isso +25%, +50% e +75% dariam exatamente o mesmo tamanho.
- **A alça de mover a janela tem desenho e superfície separados.** O traço
  aparece no fim do dock, depois da engrenagem, na altura dos ícones (e deitado
  quando o dock está em pé); quem arrasta é uma área invisível montada por cima
  dele, **fora do palco**, medida a cada mudança de posição do dock. O motivo é
  duro: `-webkit-app-region: drag` não é registrado pelo Chromium dentro de um
  subtree com `transform`, `mask-image` ou `backdrop-filter` — e o palco tem os
  dois primeiros. O sintoma engana: o DOM fica idêntico (mesma caixa, mesmo
  `app-region`, mesmo elemento no ponto) e a janela simplesmente não anda.
  Também é o **único** ponto do app com região de arraste: quando isso cobria o
  palco inteiro, engolia todo clique, inclusive o do dock.
- **As bordas do palco são dissolvidas por máscara.** As sombras dos painéis
  chegam a 130px de blur; sobre fundo opaco elas se dissolvem, mas numa janela
  transparente batem no limite da janela e param em seco, desenhando um
  retângulo escuro em volta de tudo. Medido na borda esquerda: 14% de preto
  terminando de uma vez. A máscara de 20px faz a sombra acabar como sombra
  (0% na borda, subindo até 22% em 20px). Fica no palco, e não na raiz,
  justamente para não engolir a área de arraste.
- **Não há mais indicador de home.** No handoff é uma barra de 230x5 em
  `bottom: 34px`, puro desenho; virou ruído depois que a função de mover a
  janela foi para o dock.
- **O dock tem uma engrenagem no lugar do avatar**, abrindo uma 8ª tela de
  Configurações que não existe no handoff. Ela usa a geometria das telas de
  três painéis (Claude, Lab, Media) — mesma perspectiva, mesmos ângulos de
  repouso — para ficar dentro da linguagem em vez de parecer enxerto. Custo
  Com a alça, o dock ficou 25px mais largo que o do handoff.
- **O dock não reanima ao trocar de tela** — divergência deliberada do
  protótipo. Lá cada tela repete o dock inteiro (`sc-if`), então ele refaz a
  entrada a cada clique nele mesmo. Aqui ele é o ponto fixo de onde as telas
  saem: vive fora da `key` que remonta os painéis e anima uma vez, na abertura.
- **A fonte é a DM Sans estática.** O protótipo carrega do Google Fonts a
  versão com eixo óptico (`opsz,wght@9..40`), que o Fontsource não empacota — o
  variável de lá só traz o eixo de peso, e medindo ficou pior. Verificado no
  relógio de 62px: mesma posição, mesmo tamanho, mesmo peso, mesmo
  `letter-spacing`; só os glifos vêm de origens diferentes.
- **O ícone animado de clima é opcional e não é o padrão.** Portado do CodePen
  "Animated Weather Icons" (baseado no Dribbble de kylor) — material de
  terceiros, a conferir licença antes de distribuir, como as imagens do
  handoff. Ele é desenhado por recorte (miolo na cor do fundo, contorno em
  sombra clara), o que num card translúcido vira um miolo escuro em vez de
  vazado; e no espaço que o handoff dá ao ícone (42–52px) o desenho colapsa —
  a nuvem fica com ~16px e o contorno com 1,6px. Ele só respira a partir de
  ~108px, o que exigiria refazer o card (medido: 232x128 em vez de 232x80, com
  a linha de texto quebrando). Por isso o padrão continua o Phosphor do
  handoff.
- **Ícones importados um a um** (`@phosphor-icons/react/dist/icons/House`). Pelo
  barrel, o bundle carrega o pacote inteiro.
- **As páginas do harness são servidas por HTTP.** A CSP `default-src 'self'`
  bloqueia os próprios assets quando a origem é `null` (file://). No Electron
  não acontece, mas depender disso deixaria o diff em branco sem avisar.

### Estrutura

```
src/
  main/            processo main: janela, IPC e TODA integração real
    services/      agents · apps · dependencias · desktop-layer · docker ·
                   files · gpu · host · media (lista M3U) · monitors ·
                   player (MPRIS) · player-window · projects · rss · seafile ·
                   spotify + spotify-auth (OAuth PKCE) · tmdb · wallpaper
      creative/    Social Arte
    island/        a ilha dinâmica, 27 arquivos
    launcher/      a janela de Meta+V e o Meta+V liberado do Klipper
    notificacoes/  os balões do sistema, vestidos pelo tema
    mascot/        decodificador de personagens .acs do Microsoft Agent
    tray.ts        o ícone da bandeja (StatusNotifierItem + dbusmenu)
  preload/         ponte tipada (contextIsolation on, nodeIntegration off)
  shared/          contrato main <-> renderer
  renderer/
    app/           App, Stage (palco 1440x900 escalado), ambiente, persistência
    styles/        tokens.css · animations.css · entrances.ts (as 13 variações)
                   env-citypop.css · env-cyberpunk.css · env-bioshock.css
                   (os temas; a Floresta é o próprio tokens.css)
    store/         useHalo.ts (store único do handoff)
    ui/            Panel · PanelRow · CenterFrame · Dock ·
                   Toggle · Slider · Tabs · Sparkline
    hooks/         use…() → { data, loading, error }
    assets/        a arte dos ambientes, imagens e os ícones do clima
    island/        o renderer da ilha, com paleta e CSP próprias
    launcher/      o lançador de Meta+V (motor.ts é o mesmo da ilha)
    notificacoes/  a janela dos balões
    player/        a janela do player: página própria, com CSP própria
    screens/       as 7 telas do handoff + Configurações (fora do handoff)
      settings/    uma seção por arquivo: Animação · Aparência · Ambiente ·
                   Janela · Widgets · Mídia · Claude · Ilha · Lançador ·
                   Notificações · Seafile · Música · Notícias · Sistema · Sobre
    domain/        contratos
    data/          mock/ · ipc/ · fábrica
tools/             style-lint · layout-check · screens-check · live-check ·
                   island-check · doctor · acs-extract · icone ·
                   fundo-de-ambiente · fundo-de-comparacao ·
                   ourivesaria-bioshock · ilha-avisar.sh · ilha-shell.sh
```

O palco é fixo em 1440×900 e escalado por `min(w/1440, h/900)`; a janela mantém
a proporção via `setAspectRatio`. Assim nenhuma coordenada absoluta do handoff
(dock em `bottom: 76`, teto de painel em `y = 741`) precisa mudar.

### Dados: como as telas recebem conteúdo

Nenhuma tela sabe de onde o dado vem. O caminho é sempre o mesmo:

```
domain/repositories.ts   contratos, todos assíncronos
data/mock/               valores do handoff + latência falsa
data/ipc/                serviços reais, buscados pelo processo main
data/index.ts            fábrica — o ÚNICO ponto que escolhe entre os dois
hooks/                   useWeather() → { data, loading, error }
```

Os contratos são assíncronos mesmo quando a resposta é imediata, e os hooks já
expõem os três estados. **A promessa foi cobrada e cumpriu**: ligar o clima
real custou um arquivo em `data/ipc/` e uma linha na fábrica — nenhum
componente mudou.

A fábrica escolhe por ambiente: dentro do Electron vão os serviços reais; fora
dele, os mocks. É assim que os guarda-fidelidade rodam no navegador comparando
com o protótipo, sem depender de rede nem do tempo que estiver fazendo lá fora.

**Clima:** Open-Meteo, sem chave nem cadastro — nada de credencial para guardar.
A busca acontece no processo **main**, não no renderer: a CSP da página permite
`connect-src 'self'` e nada mais, de propósito. Duas chamadas (nome → coordenada
→ tempo atual), cache de 10 minutos e códigos WMO mapeados para as condições que
o app desenha.

O relógio da home é exceção proposital: mostra a **hora real do sistema**, que
não faz sentido mockar num app de desktop. Por isso os testes congelam o relógio
(`2025-08-28T07:24:00+01:00`, locale pt-BR, fuso de Lisboa) — sem isso cada
execução mediria um app diferente.

### Configurações em disco

`~/.config/halo-spatial-os/settings.json` — um JSON legível e editável à mão.
Não é `localStorage`, e a razão é concreta: o **main** precisa das preferências
antes de a janela existir, porque é ele quem abre a janela já no tamanho salvo.
Pelo `localStorage` a janela abriria no padrão e pularia à vista. De quebra, o
arquivo é inspecionável, versionável e sobrevive à limpeza de dados do
navegador embutido.

Como o caminho funciona:

- O main lê no arranque e entrega ao renderer por `additionalArguments`, então
  `window.halo.settings.initial` está disponível **de forma síncrona** — o app
  monta já no estado salvo, sem piscar no padrão.
- O renderer assina o store fora do React (`app/persist.ts`) e manda o que
  mudou; o main junta as escritas por 400ms (arrastar um slider dispara
  dezenas) e grava de forma atômica (arquivo temporário + `rename`), além de
  descarregar o pendente no `before-quit`.
- `shared/settings.ts` tem o tipo, os padrões e a validação — **campo a
  campo**. Arquivo ilegível, campo ausente, tipo errado ou valor fora de faixa
  caem no padrão em vez de quebrar a abertura. Testado com JSON quebrado e com
  JSON válido cheio de absurdo (`dock: "diagonal"`, `clarity: -80`,
  `transparency: "muito"`): o app abre no padrão do handoff e avisa no console.

### Janela e camada

O app **sempre abre em X11**, e isso não é preferência: escolher a camada da
janela, saber onde ela está e manter o player por cima só existem lá. No Wayland
o Electron aceita os três pedidos e o compositor ignora, em silêncio. A flag vem
nos scripts e em `linux.executableArgs`; `ensureX11` no main se relança como rede
de segurança quando ela não vem, e sem `DISPLAY` o app segue em Wayland — melhor
rodar com menos do que não abrir.

A camada do app é um ClientMessage `_NET_WM_STATE_BELOW` do EWMH, que **não
escreve nada na configuração do usuário** (`services/desktop-layer.ts` explica
as alternativas medidas e descartadas). A do player é `setAlwaysOnTop`.

### O mascote da tela do Claude

O orbe do handoff pode ser trocado por um personagem do **Microsoft Agent**
(`.acs`) — Genie, Clippy, Merlin. O app decodifica o formato binário direto:
imagens, paleta, transparência e a compressão LZ própria da Microsoft. O
personagem reage ao que os agentes estão fazendo.

Não existe decodificador de ACS em JavaScript; este foi escrito e validado
usando as regiões de recorte do próprio arquivo como oráculo — 590 das 591
imagens do Genie conferem byte a byte. Genie, Merlin e Clippit decodificam
corretamente; `tools/acs-extract.mjs` converte um personagem em PNGs para
inspecionar um novo antes de confiar nele.

A troca é visual, em **Configurações → Claude**: cada personagem aparece com a
própria carinha, porque nome de arquivo não diz se aquilo é um mago, um clipe de
papel ou um gênio.

### Mídia

A biblioteca sai de uma lista M3U do disco, apontada em **Configurações →
Mídia**. O app não embute nem baixa lista nenhuma, e a leitura é só leitura.

Numa lista grande, a maioria das linhas costuma ser episódios avulsos — listá-los daria uma parede inútil. O main agrupa em
títulos (uma fração do número de linhas), em série → temporada → episódio, e
indexa em cerca de 1 s, sob demanda.

A busca ignora **acento, espaço e pontuação**, e aceita palavras fora de ordem:
"cacador" acha "Caçador", "killbill" e "bill kill" acham "Kill Bill". O
resultado sai por relevância — quem começa com o termo vem antes de quem só o
contém, senão "matrix" traria "Animatrix" primeiro, por ordem alfabética.
Responde em ~10 ms sobre o catálogo inteiro. O id de um título é uma chave estável (tipo,
categoria, nome), nunca a posição no índice: favoritos e histórico ficam
salvos, e a lista muda.

Sinopse, nota, gêneros, duração e elenco vêm do **TMDB**, com chave do usuário
(gratuita, informada em Configurações). Sem chave, a tela mostra só o que a
lista traz e diz onde configurar — nunca inventa.

Favoritos são organizáveis: o usuário cria listas com o nome que quiser
("Assistidos", "Talvez assistir") e reordena arrastando as capas. Pôr um título
numa lista tem dois caminhos, e os dois importam: a etiqueta no painel de
detalhes (funciona de qualquer aba, e é a única saída quando as listas nem
estão à vista) e arrastar a capa até a lista no painel esquerdo. Uma lista é sempre um **subconjunto dos
favoritos** — pôr um título numa lista o favorita, e desfavoritar o tira de
todas. É o que mantém um modelo só: um título numa lista que não aparecesse em
Favoritos seria armadilha.

**Listas de mídia não entram no repositório** (`.gitignore`): além do catálogo,
cada URL carrega as credenciais do provedor do usuário. Chaves de API também
não: ficam em `~/.config`.

### Música

A tela de Música é a conta de **Spotify** do usuário: playlists, álbuns salvos,
artistas, ouvidos recentemente, as faixas de cada item e o transporte.

**O áudio não toca dentro do Halo — e isso foi medido, não suposto.** O único
caminho seria o Web Playback SDK, que entrega mídia protegida por Widevine, e o
Electron não distribui esse módulo. No Electron 44 deste projeto:

```
navigator.requestMediaKeySystemAccess('com.widevine.alpha', …)
  → NotSupportedError: Unsupported keySystem or supportedConfigurations.
navigator.requestMediaKeySystemAccess('org.w3.clearkey', …)       → OK
```

A API de DRM existe; o Widevine é que não. Então o Halo **comanda quem sabe
tocar**, e prefere o caminho mais curto:

1. **MPRIS (D-Bus)**, quando o aplicativo do Spotify está aberto nesta máquina.
   Funciona sem credencial nenhuma, responde em milissegundos, não gasta cota e
   acerta o aparelho que está na frente do usuário. Cobre tocar, pausar, pular,
   aleatório, trazer a janela do Spotify para a frente (`Raise`) e **mandar
   tocar uma playlist** (`OpenUri`).
2. **Spotify Connect (Web API)** como reserva, para quando o aplicativo local
   está fechado e a música toca no celular ou numa caixa de som. Exige Premium e
   um aparelho ativo — quando não há, a tela diz isso em vez de o botão parecer
   morto.

Uma limitação medida: o cliente Linux do Spotify publica `Volume: 0` no MPRIS o
tempo todo, então volume só existe pelo Connect — o serviço devolve `null` em
vez de propagar um "mudo" que não é verdade.

**A credencial é do usuário**, como a do TMDB. Ele cria um app gratuito no
painel do Spotify e cola o **Client ID** em Configurações → Música; o Halo não
embute nenhum (num repositório aberto ele seria entregue a quem clonasse) e
apps em modo de desenvolvimento aceitam no máximo 25 usuários cadastrados à
mão.

A autorização é **Authorization Code + PKCE**, sem client secret — num app
desktop de código aberto o secret seria distribuído junto do binário. A página
de consentimento abre no **navegador do sistema**, nunca dentro do Halo: pedir a
senha do Spotify numa janela nossa é exatamente o que uma tela de phishing
faria. O retorno cai num servidor de loopback que só existe durante o
consentimento.

O endereço de retorno é **configurável** (Configurações → Música), porque tem
de bater letra por letra com o que está em *Redirect URIs* no painel do
usuário. O padrão é `http://127.0.0.1:8898/callback`. Duas regras vêm da
documentação do Spotify e o app as impõe:

- **HTTP só em loopback, e loopback explícito.** "Use HTTPS for your redirect
  URI, unless you are using a loopback address, when HTTP is permitted";
  "`localhost` is not allowed as redirect URI". Um `https://127.0.0.1` seria
  impossível de servir sem inventar um certificado — e um autoassinado só
  ensinaria o usuário a clicar em "prosseguir mesmo assim". Endereço que não
  passa nessa regra é descartado na validação e o padrão volta a valer.
- **Loopback pode ser registrado sem porta**, e a porta vai no pedido de
  autorização. Quando o endereço configurado não traz porta, o app sobe numa
  porta livre e a acrescenta — é o jeito imune a colisão, e vale a pena quando
  a porta fixa já é de outro programa.

### Escopos

O app pede exatamente o que usa, e nada além:

```
user-read-private
playlist-read-private  playlist-read-collaborative   → playlists
user-library-read                                     → álbuns salvos
user-follow-read  user-top-read                       → artistas
user-read-recently-played                             → ouvidos recentemente
user-read-playback-state  user-modify-playback-state  → transporte e Connect
```

Autorizar menos não quebra a tela: cada coleção é buscada em separado e um 403
de escopo vira **aviso na tela** dizendo o que faltou, não lista vazia. Uma
coluna vazia sem explicação diria "você não tem playlists" — mentira, e do tipo
que o usuário não tem como desconfiar.

O **refresh token** é escrito pelo main, não pelo renderer — mesma proteção de
`desktop.position` e `media.recent` em `saveSettings`. E ele **não** viaja para
o renderer: as configurações chegam à janela como argumento de linha de comando,
visível em `/proc/<pid>/cmdline` para qualquer processo, então `paraRenderer`
(`src/main/window.ts`) o remove antes. `test:live` cobra isso.

Sem Client ID, a tela diz isso e leva às Configurações — nunca inventa playlist.

### Buracos conhecidos

- **A tela aberta não é lembrada** — só as preferências e a posição da janela.
  Toda abertura começa na Home.
- **Séries sem duração de episódio** no TMDB aparecem sem o tempo; a lista não
  traz esse dado e nem toda série o publica.
- **Música: o volume não é ajustável pelo caminho local.** O cliente Linux do
  Spotify não publica volume no MPRIS (publica sempre 0), e um controle que
  mentisse seria pior que não ter.
- **Música: busca no catálogo do Spotify ainda não existe** — a tela mostra o
  que já é seu (playlists, álbuns salvos, artistas, recentes).

### Próximas fases

- **Acabamento** — passar tela a tela comparando com o protótipo a olho; ele
  continua sendo a referência de design.
- **Ligar o que falta** — RSS, agentes do Claude e Social já são reais; o que
  sobra do protótipo é o orbe sem mascote e os exemplos fora do Electron.
