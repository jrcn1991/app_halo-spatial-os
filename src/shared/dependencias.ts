/**
 * Os programas de fora que o Halo chama, e o que se perde sem cada um.
 *
 * O app conversa com o sistema por linha de comando e por D-Bus: 26 programas
 * externos, nenhum embutido no pacote. Quase todos degradam bem — a leitura
 * some, a lista fica vazia — mas ATÉ AQUI eles sumiam **em silêncio**, e o
 * usuário não tinha como distinguir "está desligado" de "falta o programa".
 * Pior: uma leitura de áudio ausente dizia "ligue em Configurações → Ilha"
 * quando o que faltava era o `pactl`.
 *
 * Esta lista é a fonte única disso. Ela é lida por três lugares:
 *
 * - `tools/doctor.mjs`, que roda antes de instalar ou de cortar uma versão;
 * - `Configurações → Sistema`, dentro do app, que mostra o mesmo diagnóstico
 *   para quem não abre terminal;
 * - o `depends`/`recommends` do `.deb` em `electron-builder.yml` — este à mão,
 *   então programa novo aqui pede uma olhada lá.
 *
 * O `nivel` não é gravidade abstrata, é o que acontece na tela:
 *
 * - `essencial` — uma função central do app para de funcionar;
 * - `kde` — vem com o KDE Plasma, que é o ambiente-alvo do app (ver
 *   `docs/DEPENDENCIAS.md`); fora dele estas simplesmente não existem;
 * - `opcional` — uma leitura ou uma ação a menos, e o resto segue igual.
 */
export type NivelDeDependencia = 'essencial' | 'kde' | 'opcional'

export type Dependencia = {
  /** O nome do programa, como ele é chamado. */
  id: string
  /** O pacote que o entrega no Debian/Ubuntu. */
  pacote: string
  /** Para que o app o usa. */
  para: string
  nivel: NivelDeDependencia
  /** O que deixa de funcionar sem ele, em uma frase. */
  perde: string
}

/**
 * `marcar()` local, idêntico ao de `./i18n`, e não importado dele: esta lista é
 * lida também por `tools/doctor.mjs` direto no Node, que não resolve import
 * relativo sem extensão. Só marca o texto para o `npm run i18n` cobrar o
 * inglês; quem traduz é a tela (`t(dep.perde)`). O doctor continua em
 * português — o terminal não tem idioma escolhido.
 */
const marcar = (texto: string): string => texto

export const DEPENDENCIAS: readonly Dependencia[] = [
  {
    id: 'gio',
    pacote: 'libglib2.0-bin',
    para: marcar('abrir aplicativos, arquivos e endereços'),
    nivel: 'essencial',
    perde: marcar('abrir aplicativo pelo lançador ou pela ilha para de funcionar'),
  },
  {
    id: 'busctl',
    pacote: 'systemd',
    para: marcar('falar D-Bus com os players (MPRIS), o KDE Connect e o Bluetooth'),
    nivel: 'essencial',
    perde: marcar('"tocando agora", teclas de mídia, celular e Bluetooth'),
  },
  {
    id: 'pactl',
    pacote: 'pulseaudio-utils',
    para: marcar('volume, mudo, saída de áudio e o vigia que avisa quando mudam'),
    nivel: 'essencial',
    perde: marcar('todo o módulo de áudio da ilha, e o HUD de volume'),
  },
  {
    id: 'qdbus6',
    pacote: 'qdbus-qt6',
    para: marcar(
      'falar com o KWin (janelas, áreas de trabalho, efeito da gaveta) e com o plasmashell (vídeo de fundo)',
    ),
    nivel: 'kde',
    perde: marcar(
      'a ilha perde janelas, foco e o voo; o lançador não é ativado; o vídeo de fundo não entra',
    ),
  },
  {
    id: 'kwriteconfig6',
    pacote: 'libkf6config-bin',
    para: marcar('apagar os atalhos globais que o app criou'),
    nivel: 'kde',
    perde: marcar('desligar a ilha deixa o atalho gravado no KDE'),
  },
  {
    id: 'plasma-apply-wallpaperimage',
    pacote: 'plasma-workspace',
    para: marcar('trocar o papel de parede da sessão junto com o ambiente'),
    nivel: 'kde',
    perde: marcar('trocar de ambiente muda só o tema do Halo'),
  },
  {
    id: 'spectacle',
    pacote: 'kde-spectacle',
    para: marcar('capturar a tela e selecionar região para o OCR'),
    nivel: 'kde',
    perde: marcar('captura e "texto da tela"'),
  },
  {
    id: 'parec',
    pacote: 'pulseaudio-utils',
    para: marcar('ler o som que está tocando para desenhar o espectro'),
    nivel: 'opcional',
    perde: marcar('as ondas viram animação, em vez de seguir o som'),
  },
  {
    id: 'dbus-monitor',
    pacote: 'dbus-bin',
    para: marcar('ouvir as notificações do sistema'),
    nivel: 'opcional',
    perde: marcar('a ilha não recebe notificações'),
  },
  {
    id: 'nmcli',
    pacote: 'network-manager',
    para: marcar('estado da rede e do Wi-Fi'),
    nivel: 'opcional',
    perde: marcar('o módulo de rede da ilha'),
  },
  {
    id: 'bluetoothctl',
    pacote: 'bluez',
    para: marcar('estado do Bluetooth e dos aparelhos pareados'),
    nivel: 'opcional',
    perde: marcar('o módulo de Bluetooth da ilha'),
  },
  {
    id: 'udisksctl',
    pacote: 'udisks2',
    para: marcar('montar e ejetar mídia removível'),
    nivel: 'opcional',
    perde: marcar('montar e ejetar pendrive pela ilha'),
  },
  {
    id: 'tesseract',
    pacote: 'tesseract-ocr tesseract-ocr-por tesseract-ocr-eng',
    para: marcar('ler o texto de um pedaço da tela'),
    nivel: 'opcional',
    perde: marcar('"texto da tela" (OCR)'),
  },
  {
    id: 'notify-send',
    pacote: 'libnotify-bin',
    para: marcar('avisar quando um temporizador termina'),
    nivel: 'opcional',
    perde: marcar('o aviso de fim de temporizador'),
  },
  {
    id: 'nvidia-smi',
    pacote: marcar('driver NVIDIA proprietário'),
    para: marcar('uso e temperatura da GPU'),
    nivel: 'opcional',
    perde: marcar('o medidor de GPU na Home diz "sem leitura"'),
  },
  {
    id: 'sensors',
    pacote: 'lm-sensors',
    para: marcar('temperatura da CPU'),
    nivel: 'opcional',
    perde: marcar('a temperatura na Home e na ilha'),
  },
  {
    id: 'docker',
    pacote: 'docker.io',
    para: marcar('listar containers na tela Lab'),
    nivel: 'opcional',
    perde: marcar('a tela Lab fica sem containers (e diz isso)'),
  },
  {
    id: 'git',
    pacote: 'git',
    para: marcar('descrever os projetos locais na Home'),
    nivel: 'opcional',
    perde: marcar('o cartão de projetos da Home'),
  },
  {
    id: 'lsblk',
    pacote: 'util-linux',
    para: marcar('discos e mídia removível'),
    nivel: 'opcional',
    perde: marcar('a lista de discos em Arquivos e na ilha'),
  },
  {
    id: 'df',
    pacote: 'coreutils',
    para: marcar('espaço livre nos discos'),
    nivel: 'opcional',
    perde: marcar('o uso de disco em Arquivos e na ilha'),
  },
  {
    id: 'ps',
    pacote: 'procps',
    para: marcar('qual processo está consumindo mais'),
    nivel: 'opcional',
    perde: marcar('o módulo "quem está pesando" da ilha'),
  },
  {
    id: 'systemctl',
    pacote: 'systemd',
    para: marcar('serviços do sistema com falha'),
    nivel: 'opcional',
    perde: marcar('o módulo de serviços da ilha'),
  },
  {
    id: 'ss',
    pacote: 'iproute2',
    para: marcar('portas em escuta'),
    nivel: 'opcional',
    perde: marcar('o módulo de portas da ilha'),
  },
  {
    id: 'hostname',
    pacote: 'hostname',
    para: marcar('o endereço da máquina na rede'),
    nivel: 'opcional',
    perde: marcar('o IP local na ilha'),
  },
  {
    id: 'xdg-user-dir',
    pacote: 'xdg-user-dirs',
    para: marcar('achar as pastas do usuário no idioma dele'),
    nivel: 'opcional',
    perde: marcar('a pasta de capturas cai no palpite `~/Pictures`'),
  },
  {
    id: 'claude',
    pacote: marcar('Claude Code (instalado à parte)'),
    para: marcar('os agentes da tela do Claude e o Claude da ilha'),
    nivel: 'opcional',
    perde: marcar('a tela do Claude não abre agente nenhum'),
  },
] as const

/**
 * O que esta máquina tem, respondido pelo main.
 *
 * A lista acima é estática — ela vem no pacote e é a mesma em todo lugar. O
 * que muda de máquina para máquina é isto, e por isso é o único pedaço que
 * atravessa o IPC.
 */
export type DiagnosticoDoSistema = {
  /** Presença de cada `DEPENDENCIAS[].id`. Chave ausente = não verificada. */
  presentes: Record<string, boolean>
  /**
   * A sessão gráfica. Não é um programa que se instale, mas é o requisito que
   * mais muda o que o app consegue fazer: camada da janela, posição e "manter
   * por cima" só existem no X11 (CLAUDE.md § Janela e camada).
   */
  sessao: {
    /** `XDG_SESSION_TYPE`: `x11`, `wayland`, ou o que o sistema disser. */
    tipo: string
    /** Há um servidor X alcançável (`DISPLAY`) — XWayland conta. */
    x11: boolean
  }
}
