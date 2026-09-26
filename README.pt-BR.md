<p align="center">
  <img src="site/assets/icone.png" alt="Halo" width="112">
</p>

<h1 align="center">Halo — Spatial OS</h1>

<p align="center"><a href="README.md">English</a> · <b>Português (Brasil)</b></p>

<p align="center">
  <b>Painéis de vidro flutuando sobre a sua área de trabalho, uma ilha dinâmica no topo da tela<br>
  e ambientes que trocam o tema e o papel de parede de uma vez.</b><br>
  Para Linux com KDE Plasma 6.
</p>

<p align="center">
  <a href="https://github.com/jrcn1991/app_halo-spatial-os/releases/latest"><img src="https://img.shields.io/badge/Baixar-.deb%20para%20Ubuntu-E95420?style=for-the-badge&logo=ubuntu&logoColor=white" alt="Baixar o .deb"></a>
  <a href="https://jrcn1991.github.io/app_halo-spatial-os/"><img src="https://img.shields.io/badge/Conhe%C3%A7a-a%20p%C3%A1gina-7C5CFF?style=for-the-badge&logo=githubpages&logoColor=white" alt="Página do projeto"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/vers%C3%A3o-0.2.2-61d19a" alt="Versão 0.2.2">
  <img src="https://img.shields.io/badge/KDE%20Plasma-6-1D99F3?logo=kde&logoColor=white" alt="KDE Plasma 6">
  <img src="https://img.shields.io/badge/Ubuntu-26.04-E95420?logo=ubuntu&logoColor=white" alt="Ubuntu 26.04">
  <img src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white" alt="Electron 44">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-GPL--3.0-blue" alt="Licença GPL-3.0"></a>
</p>

<p align="center">
  <a href="https://jrcn1991.github.io/app_halo-spatial-os/#passeio"><img src="site/assets/ambientes.gif" alt="O Halo trocando entre os quatro ambientes: Cyberpunk, City Pop, Shock e Floresta" width="880"></a>
  <br>
  <sub>▶ <a href="https://jrcn1991.github.io/app_halo-spatial-os/#passeio">Assista ao passeio completo</a> — ambientes, ilha, lançador, notificações e todas as telas · <a href="https://jrcn1991.github.io/app_halo-spatial-os/#demo">Experimente a demo interativa</a> no navegador</sub>
</p>

<p align="center">
  <a href="#a-ilha-dinâmica">Ilha</a> ·
  <a href="#o-lançador-metav">Lançador</a> ·
  <a href="#quatro-ambientes">Ambientes</a> ·
  <a href="#notificações-vestidas-pelo-tema">Notificações</a> ·
  <a href="#oito-telas">Telas</a> ·
  <a href="#instalação">Instalar</a> ·
  <a href="#privacidade">Privacidade</a>
</p>

---

Diga olá ao **Halo**: um jeito de fazer a área de trabalho do Linux parecer um
sistema espacial. A janela é **transparente** — não há fundo nenhum, só painéis
de vidro inclinados em 3D que flutuam sobre o seu papel de parede e nunca cobrem
as outras janelas. No topo da tela mora uma **ilha dinâmica**, à moda do notch
do Mac: música, temporizadores, cópias, notificações e um lançador que responde
a um atalho. E cada **ambiente** troca o tema do app e o papel de parede da
sessão de uma vez.

> [!NOTE]
> A interface fala **português** por padrão e **inglês** como opção:
> Configurações → Idioma. A troca vale na hora, em todas as janelas.

## Destaques

|  |  |
|---|---|
| 🏝️ **Ilha dinâmica** | Uma pílula no topo da tela que abre ao passar o mouse: o que está tocando com o espectro do som de verdade, temporizadores, cópias, janelas, uma gaveta de arquivos, notificações, uma nota e o Claude. **Ligada por padrão.** |
| ⌨️ **Lançador no Meta+V** | Um campo para apps, comandos, contas, conversões, emoji, busca na web e janelas — o mesmo motor da ilha, vestido pelo ambiente. |
| 🎨 **Quatro ambientes** | Floresta, City Pop, Cyberpunk e Shock trocam o tema da interface **e** o papel de parede do Plasma (imagem ou vídeo). |
| 💬 **Notificações do tema** | O Plasma continua servidor de notificações; o Halo redesenha os balões no estilo do ambiente. |
| 🪟 **Oito telas** | Início, Social, Claude, Arquivos, Lab, Mídia, Música e Configurações — três painéis de vidro cada, e um dock. |
| 📈 **Dados de verdade** | CPU, memória, GPU e temperatura, repositórios git, Docker, discos, o que está tocando (MPRIS) — lidos da sua máquina, nunca inventados. |
| ✳️ **Claude Code** | Um agente por projeto, com histórico de conversas e um mascote do Microsoft Agent opcional. |
| 🎬 **Mídia e música** | Sua biblioteca M3U com sinopse do TMDB, um player que fica por cima, e o Spotify. |

## A ilha dinâmica

<p align="center">
  <img src="site/assets/ilha.gif" alt="A ilha: um anúncio e o HUD de volume na pílula fechada, depois ela abre e passa pelas oito abas" width="720">
</p>

Uma pílula preta mora **sobre o painel do Plasma**, como o notch na barra de
menus. Fechada, ela mostra o que importa agora — a capa e a onda do que está
tocando, um temporizador correndo, um anúncio que alarga e recolhe (um download
que terminou, o HUD de volume). Passe o mouse (ou clique, se preferir) e ela
abre em oito abas:

| Aba | O que tem |
|---|---|
| **Início** | O player com capa, progresso e volume; Halo, Wi-Fi, Bluetooth e Não perturbe; mudo, microfone, cafeína, mostrar a área de trabalho, captura e bloqueio; temporizadores e cronômetro; e o campo do lançador. Sem nada tocando, um panorama com hora, clima e medidores vivos toma o lugar do player. |
| **Painéis** | Cada módulo em detalhe: sistema, GPU, saídas de áudio, rede, Bluetooth, discos e pendrives, celular (KDE Connect), a semana de foco, portas, serviços. |
| **Claude** | Pergunte com `?` no campo da ilha; resposta e pedidos de permissão (✓ / ✗) na própria pílula. |
| **Gaveta** | Solte arquivos, links ou texto na pílula para tê-los à mão, e arraste de volta para fora. |
| **Janelas** | Guarde uma janela na gaveta — o efeito do KWin faz a janela de verdade voar para a pílula — e traga de volta. |
| **Avisos** | As últimas notificações do sistema. |
| **Cópias** | O histórico da área de transferência, com ações para links, cores e e-mails. |
| **Nota** | Uma nota rápida que sobrevive ao reinício. |

O **Meta+Espaço** recolhe o app inteiro para a ilha e o traz de volta. A ilha
nasce **ligada** numa instalação nova — é a porta de entrada do app, já que a
janela principal nasce recolhida. Tudo fica em **Configurações → Ilha**.

## O lançador (Meta+V)

<p align="center">
  <img src="site/assets/lancador.gif" alt="O lançador do Meta+V: os recentes, depois um app, uma porcentagem, uma conversão, um emoji e um comando" width="640">
</p>

O **Meta+V** abre uma janela de lançador na tela onde você está trabalhando,
vestida pelo ambiente do momento. O campo entende:

| Tipo | Exemplo | Faz |
|---|---|---|
| App ou comando | `fire`, `cafe` | abre o Firefox; liga a cafeína |
| Conta | `2+2`, `15% de 240` | mostra o resultado; Enter copia |
| Conversão | `30c em f`, `2 gb em mb` | temperatura, tamanho, distância… |
| Emoji | `:coracao` | copia o símbolo |
| Busca na web | `g kde plasma` | abre a busca no navegador |
| Claude | `? como eu…` | pergunta ao Claude da ilha |

Com o campo vazio, ele lista o que você mais usa (frequência com recência). O
campo da ilha é o **mesmo motor**: o que um aprende, o outro sabe. O Meta+V é
do Klipper por padrão: ligar o lançador em **Configurações → Lançador** pega a
tecla emprestada, e desligar a devolve.

## Quatro ambientes

| Floresta | City Pop |
|:---:|:---:|
| <img src="site/assets/home-floresta.jpg" alt="Ambiente Floresta" width="440"> | <img src="site/assets/home-citypop.jpg" alt="Ambiente City Pop" width="440"> |
| **Cyberpunk** | **Shock** |
| <img src="site/assets/home-cyberpunk.jpg" alt="Ambiente Cyberpunk" width="440"> | <img src="site/assets/home-bioshock.jpg" alt="Ambiente Shock" width="440"> |

Um ambiente é **o tema do app mais o papel de parede da sessão**. Escolha no
painel direito da Início: painéis, fontes, o dock, o lançador e os balões de
notificação mudam, e o Plasma ganha o papel de parede (ou o vídeo) do ambiente.
Antes da primeira troca o Halo guarda o seu papel de parede, e
**Configurações → Ambiente → Restaurar o meu papel de parede** o devolve. As
preferências do vidro — transparência, claridade, animação de entrada — são
**por ambiente**.

## Notificações vestidas pelo tema

<p align="center">
  <img src="site/assets/avisos.gif" alt="Balões de notificação chegando em cada um dos quatro temas" width="420">
</p>

<p align="center">
  <img src="site/assets/avisos.jpg" alt="Os mesmos balões na Floresta, no City Pop, no Cyberpunk e no Shock" width="880">
</p>

Ligue **Configurações → Notificações** e o Halo passa a ser *vigia* do servidor
de notificações do Plasma: os balões do Plasma se escondem e o Halo desenha os
dele, com o vidro, as fontes e a entrada do ambiente. Clicar numa ação volta ao
aplicativo que mandou. O histórico, o sino e as notificações críticas ficam com
o Plasma, e fechar o Halo devolve os balões na hora. Desligado até você ligar.

## Oito telas

<p align="center">
  <img src="site/assets/telas.gif" alt="Passando pelas telas: Social, Claude, Arquivos, Lab, Mídia, Música, Configurações e Início" width="880">
</p>

| Início | Social |
|:---:|:---:|
| <img src="site/assets/tela-home.jpg" alt="Tela Início" width="440"> | <img src="site/assets/tela-social.jpg" alt="Tela Social" width="440"> |
| Relógio, clima, o que está tocando, medidores vivos, projetos, notícias e notificações. | Social Arte: um mural pessoal de referências de arte, só leitura. |
| **Claude** | **Arquivos** |
| <img src="site/assets/tela-claude.jpg" alt="Tela do Claude" width="440"> | <img src="site/assets/tela-files.jpg" alt="Tela de Arquivos" width="440"> |
| Um agente do Claude Code por projeto, com histórico e anexos. | Discos e pastas, **somente leitura** de propósito. |
| **Lab** | **Mídia** |
| <img src="site/assets/tela-lab.jpg" alt="Tela Lab" width="440"> | <img src="site/assets/tela-media.jpg" alt="Tela de Mídia" width="440"> |
| Containers do Docker, serviços com latência e a saúde da máquina. | Sua biblioteca M3U, favoritos e "continuar assistindo". |
| **Música** | **Configurações** |
| <img src="site/assets/tela-music.jpg" alt="Tela de Música" width="440"> | <img src="site/assets/tela-settings.jpg" alt="Tela de Configurações" width="440"> |
| Playlists, álbuns e artistas do Spotify. | Uma seção por assunto, com "Restaurar padrão" em cada uma. |

**Música e Spotify.** Só com o **aplicativo do Spotify instalado** — sem
configurar nada — o Halo mostra o que está tocando (música, artista, capa e
progresso) na Início e na ilha e comanda tocar, pausar, pular, aleatório e
repetir, pelo MPRIS no D-Bus: sem conta e sem internet. A **API** só é
necessária para a tela de Música listar as suas playlists, álbuns salvos e
artistas, e para comandar o Spotify em outro aparelho (essa parte exige
Premium): crie um app gratuito no painel de desenvolvedor do Spotify, cole o
Client ID em Configurações → Música e clique em Conectar. O acesso abre no
navegador do sistema.

**Claude.** A tela do Claude e o Claude da ilha rodam o **Claude Code CLI**,
instalado à parte. Sem ele, a tela avisa e leva a Configurações → Claude. Os
agentes nascem no modo `plan` (só leitura) — deixar que editem arquivos é
escolha sua, explícita. O **mascote** opcional lê os personagens clássicos do
Microsoft Agent (`.acs`: Genie, Merlin, Clippit…); dá para encontrá-los em
[tmafe.com/classic-ms-agents](https://tmafe.com/classic-ms-agents/).

**Mídia.** Aponte o Halo para a sua lista M3U e ela vira uma biblioteca com
categorias, favoritos e "continuar assistindo"; com uma chave gratuita do TMDB,
cada título ganha sinopse, elenco e capa. O player pode ficar por cima de todas
as janelas.

> [!NOTE]
> **Tudo nesta página é dado de demonstração.** As imagens e os vídeos são
> gerados por `node tools/vitrine.mjs` a partir do app construído rodando fora
> do Electron, onde ele cai nos mocks — mais capas, cartazes e um instantâneo
> da ilha desenhados por `tools/vitrine-demo.mjs`. As músicas, os filmes, os
> projetos e as notificações são inventados, e nada vem de uma tela de verdade.
> Na sua máquina, as telas mostram os seus dados.

## Requisitos

O Halo é feito para **um** ambiente, e não tenta ser compatível com todos. Foi
desenvolvido e testado numa máquina só; é isso que está garantido, e o resto é
"deve funcionar" sem ninguém ter olhado.

| | Testado em | Precisa de |
|---|---|---|
| Distribuição | Ubuntu 26.04.1 LTS, kernel 7.0 | Ubuntu (ou derivado Debian) recente |
| Área de trabalho | KDE Plasma 6.6.6, KWin 6.6.6, Qt 6.10 | **KDE Plasma 6** |
| Sessão | Wayland, com o app em X11 pelo Xwayland 24.1 | X11, **ou** Wayland com Xwayland (o padrão do Plasma) |
| Vídeo | NVIDIA, driver proprietário | qualquer placa — o medidor de GPU só lê NVIDIA |
| Monitores | mais de um | um ou mais — em telas com menos de 1440 px a janela fica centralizada |
| Para compilar | Node 22, Electron 44 | Node 22 ou mais novo |

O app **sempre** abre como cliente X11 (`--ozone-platform=x11`): só ali ele
consegue descer para a camada do papel de parede, lembrar a posição e manter o
player por cima. Numa sessão Wayland isso passa pelo Xwayland, que o Plasma já
traz. **Fora do KDE** o app abre, mas a ilha, o lançador, a bandeja, os balões
de notificação e a troca de papel de parede não funcionam.

## Instalação

1. Baixe o `.deb` mais recente em [Releases](https://github.com/jrcn1991/app_halo-spatial-os/releases/latest).
2. Instale:

   ```bash
   sudo apt install ./halo-spatial-os_0.2.2_amd64.deb
   ```

3. Abra o **Halo** pelo menu de aplicativos.

O `.deb` puxa os programas essenciais e instala o perfil do AppArmor de que o
Electron precisa no Ubuntu. O AppImage também é gerado, mas exige
`libfuse2t64` e pode esbarrar no bloqueio de namespaces do Ubuntu — prefira o
`.deb`.

> [!TIP]
> Depois de instalar, abra **Configurações → Sistema**: a tela lista cada
> programa que falta, o que se perde sem ele e o comando `apt` para instalar.

## Início rápido

- **A primeira abertura mostra a janela.** Da segunda em diante o Halo nasce
  recolhido: ficam a **ilha** no topo da tela e o **ícone na bandeja**, e o
  **Meta+Espaço**, a linha Halo na ilha ou o ícone da bandeja trazem a janela.
  Para abrir sempre visível, desligue em Configurações → Janela.
- **Troque de ambiente** no painel direito da Início.
- **Ligue o lançador** em Configurações → Lançador para usar o **Meta+V**.
- **Escolha a cidade do clima** em Configurações → Widgets.
- **Troque o idioma** em Configurações → Idioma: português (padrão) ou inglês.

## Configurações

Tudo fica em **Configurações** (a engrenagem no dock). O menu começa pela cara
do app — **Idioma**, **Aparência** (transparência, claridade, cor do vidro),
**Ambiente**, **Animação** e **Janela** —, depois vem o grupo **Integrações**:
Widgets, Mídia, Claude, Ilha, Lançador, Notificações, Seafile, Música e
Notícias. **Sistema** e **Sobre** fecham a lista, separados. As preferências
do vidro são **por ambiente** — mexer na Floresta não muda o Cyberpunk — e cada
seção tem o seu "Restaurar padrão".

O arquivo vive em `~/.config/halo-spatial-os/settings.json`, editável à mão.

### Programas do sistema

O app chama 26 programas do sistema e não embute nenhum. A lista é uma só
(`src/shared/dependencias.ts`), e é ela que o `npm run doctor`, Configurações →
Sistema e o `.deb` leem. Detalhes em [DOCUMENTACAO.md](DOCUMENTACAO.md).

**Essenciais** — o `.deb` os instala:

| Programa | Pacote | Sem ele |
|---|---|---|
| `gio` | `libglib2.0-bin` | abrir aplicativo pelo lançador ou pela ilha |
| `busctl` | `systemd` | "tocando agora", teclas de mídia, celular e Bluetooth |
| `pactl` | `pulseaudio-utils` | o áudio da ilha e o HUD de volume (funciona com PipeWire) |

**Do KDE Plasma** — já vêm com ele:

| Programa | Pacote | Sem ele |
|---|---|---|
| `qdbus6` | `qdbus-qt6` | a ilha perde janelas e foco; o lançador não abre |
| `kwriteconfig6` | `libkf6config-bin` | desligar a ilha deixa o atalho gravado no KDE |
| `plasma-apply-wallpaperimage` | `plasma-workspace` | trocar de ambiente muda só o tema do Halo |
| `spectacle` | `kde-spectacle` | captura de tela e "texto da tela" |

**Opcionais** — cada um custa só uma leitura ou uma ação, e a tela diz quando
falta:

| Programa | Pacote | Sem ele |
|---|---|---|
| `parec` | `pulseaudio-utils` | o espectro vira animação, em vez de seguir o som |
| `dbus-monitor` | `dbus-bin` | a ilha não recebe notificações |
| `nmcli` | `network-manager` | o módulo de rede da ilha |
| `bluetoothctl` | `bluez` | o módulo de Bluetooth da ilha |
| `udisksctl` | `udisks2` | montar e ejetar pendrive pela ilha |
| `tesseract` | `tesseract-ocr tesseract-ocr-por tesseract-ocr-eng` | "texto da tela" (OCR) |
| `notify-send` | `libnotify-bin` | o aviso de fim de temporizador |
| `sensors` | `lm-sensors` | a temperatura na Início e na ilha |
| `nvidia-smi` | driver NVIDIA (`sudo ubuntu-drivers install`) | o medidor de GPU diz "sem leitura" |
| `docker` | `docker.io` (e o usuário no grupo `docker`) | containers na tela Lab |
| `git` | `git` | o cartão de projetos da Início |
| `lsblk`, `df` | `util-linux`, `coreutils` | discos em Arquivos e na ilha |
| `ps`, `systemctl`, `ss`, `hostname` | `procps`, `systemd`, `iproute2`, `hostname` | "quem pesa", serviços, portas e IP na ilha |
| `xdg-user-dir` | `xdg-user-dirs` | a pasta de capturas cai em `~/Pictures` |
| `claude` | Claude Code, instalado à parte | a tela do Claude e o Claude da ilha |

Tudo de uma vez, menos o driver e o Claude Code:

```bash
sudo apt install libglib2.0-bin systemd pulseaudio-utils dbus-bin \
  qdbus-qt6 libkf6config-bin plasma-workspace kde-spectacle \
  network-manager bluez udisks2 lm-sensors libnotify-bin \
  tesseract-ocr tesseract-ocr-por tesseract-ocr-eng git docker.io
```

### O que é seu, e não vem com o app

Cada tela diz onde configurar enquanto falta:

- **Mídia** — uma lista M3U sua (Configurações → Mídia) e, para sinopse e
  elenco, uma chave gratuita do TMDB.
- **Música** — nada, para o "tocando agora" e os comandos (basta o app do
  Spotify); para playlists, álbuns, artistas e outros aparelhos, um app
  gratuito no painel de desenvolvedor do Spotify, com o Client ID em
  Configurações → Música.
- **Claude** — o Claude Code CLI, instalado à parte.
- **Notícias** — a coluna de leitura da Início nasce com Tecnoblog, CNN Brasil
  e BBC World; troque em Configurações → Notícias.
- **Seafile** — só se houver um servidor na sua rede local.
- **Mascote** — personagens `.acs` do Microsoft Agent
  ([tmafe.com/classic-ms-agents](https://tmafe.com/classic-ms-agents/)).
- **Vídeo de fundo** — exige um plugin de vídeo do Plasma à parte
  (`org.local.videowallpaper`); sem ele o ambiente fica com a imagem.

### O que o Halo muda fora dele

As configurações ficam em `~/.config/halo-spatial-os/`, e papéis de parede e
mascotes em `~/.local/share/halo-spatial-os/`. Além disso, quatro coisas, cada
uma com interruptor:

| O quê | Onde | Padrão | Como desligar |
|---|---|---|---|
| Papel de parede da sessão | Plasma, pelo `plasma-apply-wallpaperimage` | **ligado** — age ao trocar de ambiente | Configurações → Ambiente |
| Efeito "gaveta" do KWin | `~/.local/share/kwin[-wayland]/effects/halo-gaveta/` | **ligado**, com a ilha | Configurações → Ilha (desligar remove) |
| Atalhos globais (Meta+Espaço e outros) | `~/.config/kglobalshortcutsrc` | **ligado**, com a ilha | Configurações → Ilha (desligar apaga) |
| Meta+V tirado do Klipper | kglobalaccel, por D-Bus | desligado | Configurações → Lançador (desligar devolve) |

E uma que não grava nada, mas muda o que se vê: **os balões de notificação**.
Desligados numa instalação nova. Ligados em Configurações → Notificações, o
Halo esconde os balões do Plasma e desenha os dele, vestidos pelo ambiente; o
histórico e o sino continuam com o Plasma, e fechar o Halo devolve os balões na
hora.

**Antes de desinstalar**, desligue a ilha e o lançador em Configurações — é o
que apaga os atalhos e o efeito e devolve o Meta+V ao Klipper. Desinstalar o
pacote não mexe na pasta pessoal.

## Privacidade

- **Sem telemetria e sem conta.** O Halo lê a sua máquina localmente e não
  manda nada sobre ela para lugar nenhum.
- **A rede é só o que você liga:** o clima (Open-Meteo), os feeds de notícias
  que você mantiver, as letras de música da ilha (LRCLIB), as fontes da Social
  Arte, o TMDB e o Spotify quando configurados. Rede e disco moram só no
  processo principal; a interface não carrega nada além de capas de uma lista
  curta e escrita de endereços.
- **As chaves ficam no seu computador**, em `settings.json`. Token nunca viaja
  em linha de comando, e a interface nunca o vê.
- **Login de terceiro abre no navegador do sistema** (o Spotify usa OAuth com
  PKCE), nunca num campo de senha desenhado pelo Halo. As duas exceções,
  documentadas, são o servidor Seafile da sua própria rede local e a página de
  login da própria plataforma na Social Arte.
- **Arquivos são somente leitura.** Não existe operação de escrita, remoção,
  renomeação ou execução — nem no serviço, nem no contrato de IPC.

## Solução de problemas

- **Abri e não apareceu nada.** O Halo nasce recolhido: passe o mouse na ilha
  no topo da tela, aperte **Meta+Espaço** ou clique no ícone da bandeja. Se
  nenhum deles aparecer, a sessão pode não ser KDE — o Halo precisa do Plasma 6.
- **A temperatura, a GPU ou uma seção da ilha não aparecem.** Falta um programa
  do sistema: veja **Configurações → Sistema**.
- **O papel de parede não troca.** Confira o interruptor em Configurações →
  Ambiente e se o `plasma-apply-wallpaperimage` está instalado.
- **O Meta+V ainda abre o Klipper.** Ligue o lançador em Configurações →
  Lançador; desligar devolve a tecla ao Klipper.
- **A tela do Claude pede o CLI.** Instale o Claude Code à parte; se o Halo não
  o encontrar, aponte o programa em Configurações → Claude.

## Compilar a partir do código

```bash
npm install
npm run dev        # Electron com recarga (em X11)
npm run check      # typecheck, lint, build, testes de tela e de layout
npm run dist       # gera o .deb e o AppImage em dist/
npm run build && node tools/vitrine.mjs   # refaz as imagens desta página
```

O resto — as decisões de arquitetura, como cada integração funciona e como
verificar uma mudança — está em **[DOCUMENTACAO.md](DOCUMENTACAO.md)**
([English](DOCUMENTATION.md)).

## Roadmap

- [x] Oito telas em painéis de vidro, com dados reais
- [x] Quatro ambientes, com papel de parede (imagem ou vídeo)
- [x] Ilha dinâmica, lançador no Meta+V e balões de notificação do tema
- [x] Agentes do Claude Code, Spotify, biblioteca M3U e Social Arte
- [x] Opção de interface em inglês (o português continua o padrão)
- [ ] Os ambientes Estúdio, Espaço e Costa
- [ ] Busca no catálogo do Spotify
- [ ] Medidor de GPU para AMD e Intel

## Licença

O código é **GPL-3.0-or-later** ([LICENSE](LICENSE)). O que vem de terceiros —
fontes, ícones, bibliotecas e os dados buscados em tempo de execução — está em
**[THIRD-PARTY.md](THIRD-PARTY.md)**, com o que cada licença exige.

> [!IMPORTANT]
> Os dois conjuntos de ícone do clima (`src/renderer/assets/weather/astro/` e
> `weathercast/`) **não estão sob a GPL**: são **CC BY-NC-SA** (não comercial),
> dos autores deles. Detalhes em [THIRD-PARTY.md](THIRD-PARTY.md).

O Halo é um projeto pessoal e gratuito, **sem fins comerciais**. Os ambientes
são inspirações, com arte própria: o **Shock** vem do art déco subaquático de
*BioShock* (marca da 2K), e o **Cyberpunk** da estética do gênero e de
*Cyberpunk 2077* (da CD Projekt Red). Nenhum vínculo com os estúdios. Os
personagens do Microsoft Agent não são distribuídos com o Halo.

Feito por [Rafael Neves](https://github.com/jrcn1991).

## Inspirações e agradecimentos

O Halo não existiria sem estes projetos e trabalhos, que mostraram o caminho:

**Ilha dinâmica e notch**

- [**Boring Notch**](https://github.com/TheBoredTeam/boring.notch) — o notch do
  Mac como centro de música, prateleira e HUD; a referência de como uma ilha
  deve se comportar, e deste README.
- [**Atoll**](https://github.com/Ebullioscopic/Atoll) — a ilha como superfície
  de comando, com atividades ao vivo e medidores do sistema; a organização
  deste README vem dele.
- [**Notchy**](https://notchy.dev/) — a ilha como produto completo, e a
  página dele inspirou a [página do Halo](https://jrcn1991.github.io/app_halo-spatial-os/).
- [**dynamic-island-projects**](https://github.com/aeusteixeira/dynamic-island-projects)
  — a ilha com os projetos e as sessões do Claude Code, no Windows: a ideia de
  levar o Claude para a pílula.

**Design**

- [**Vision Pro Application**](https://dribbble.com/shots/21707259-Vision-Pro-Application)
  (Dribbble) — os painéis de vidro inclinados no espaço, que são a gramática
  visual do Halo.
- [**Cyberpunk 2077 — UI/UX In-game Ads**](https://www.behance.net/gallery/131293967/Cyberpunk-2077-UIUX-In-game-Ads)
  (Behance) — a linguagem das telas do ambiente Cyberpunk.

**Dados e peças**

- [Open-Meteo](https://open-meteo.com) — o clima, sem chave.
- [TMDB](https://www.themoviedb.org) — sinopse, elenco e capas da biblioteca.
  *Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.*
- [LRCLIB](https://lrclib.net) — as letras sincronizadas da ilha.
- As skins do Rainmeter de onde vieram os ícones do clima, as fontes da família
  DM e os ícones do Phosphor — créditos completos em [THIRD-PARTY.md](THIRD-PARTY.md).
