<p align="center">
  <img src="site/assets/icone.png" alt="Halo" width="128">
</p>

<h1 align="center">Halo — Spatial OS</h1>

<p align="center"><b>English</b> · <a href="README.pt-BR.md">Português (Brasil)</a></p>

<p align="center">
  <b>Glass panels floating over your desktop, and a dynamic island at the top of the screen.</b><br>
  For Linux with KDE Plasma 6.
</p>

<p align="center">
  <a href="https://github.com/jrcn1991/halo-spatial-os/releases/latest"><img src="https://img.shields.io/badge/Download-.deb%20for%20Ubuntu-E95420?style=for-the-badge&logo=ubuntu&logoColor=white" alt="Download the .deb"></a>
  <a href="https://jrcn1991.github.io/halo-spatial-os/"><img src="https://img.shields.io/badge/Visit-the%20website-7C5CFF?style=for-the-badge&logo=githubpages&logoColor=white" alt="Project website"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/KDE%20Plasma-6-1D99F3?logo=kde&logoColor=white" alt="KDE Plasma 6">
  <img src="https://img.shields.io/badge/Ubuntu-26.04-E95420?logo=ubuntu&logoColor=white" alt="Ubuntu 26.04">
  <img src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white" alt="Electron 44">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue" alt="GPL-3.0 license"></a>
</p>

Say hello to **Halo**: a way to make the Linux desktop feel like a spatial
operating system. The window is **transparent** — there is no background at
all, only glass panels tilted in 3D that float over your wallpaper and never
cover your other windows. At the top of the screen lives a **dynamic island**,
in the spirit of the Mac notch: music, timers, clipboard, notifications and a
launcher one shortcut away. And each **environment** switches the app's theme
and your session wallpaper in one go.

> [!NOTE]
> The interface speaks **Brazilian Portuguese** by default and **English** as
> an option: Configurações → Idioma (Settings → Language). The switch applies
> right away, in every window.

<p align="center">
  <a href="https://jrcn1991.github.io/halo-spatial-os/#passeio"><img src="site/assets/ambientes.gif" alt="Halo's four environments" width="860"></a>
  <br>
  <sub>▶ <a href="https://jrcn1991.github.io/halo-spatial-os/#passeio">Watch the full tour, through every screen</a></sub>
</p>

---

## Highlights

- **Eight screens of glass panels** — Home, Social, Claude, Files, Lab, Media,
  Music and Settings, each with three panels and a dock.
- **Dynamic island** at the top of the screen: now playing, timers, recent
  copies, Wi-Fi, Bluetooth, screenshots, on-screen text (OCR), caffeine, and a
  field that opens apps, runs commands and asks Claude.
- **Four environments** — Floresta, City Pop, Cyberpunk and Shock — that switch
  the interface theme **and** the Plasma session wallpaper (image or video).
- **Real data from your machine**: CPU, memory, GPU and temperature, your git
  repositories, Docker containers, disks, what's playing (MPRIS) and your
  accounts.
- **Claude Code agents** per project, with conversation history and an optional
  Microsoft Agent mascot (Genie, Merlin, Clippit).
- **Media library** from your own M3U list, with synopsis and cast from TMDB,
  and a player that can stay on top of everything.
- **Spotify** with playlists, albums, artists and playback control.

## Other features

- **Launcher on Meta+V** — the same engine as the island's field, in a window
  dressed by the environment.
- **Themed notification bubbles** — Plasma stays the notification server; Halo
  only redraws the bubble (off until you turn it on).
- **Lives in the system tray**: the window sits on the wallpaper layer, out of
  the taskbar, and comes back with a click on the tray icon or with Meta+Space.
- **Social Arte** — a personal, read-only aggregator of references from
  DeviantArt, ArtStation, Behance, Pinterest and Thingiverse.
- **Nothing made up without saying so**: without an account, a key or a
  program, the screen tells you what's missing and where to set it up.

<p align="center">
  <img src="site/assets/home-cyberpunk.jpg" alt="Home in the Cyberpunk environment" width="920">
</p>

## Environments

| Floresta | City Pop |
|:---:|:---:|
| <img src="site/assets/home-floresta.jpg" alt="Floresta" width="440"> | <img src="site/assets/home-citypop.jpg" alt="City Pop" width="440"> |
| **Cyberpunk** | **Shock** |
| <img src="site/assets/home-cyberpunk.jpg" alt="Cyberpunk" width="440"> | <img src="site/assets/home-bioshock.jpg" alt="Shock" width="440"> |

## The screens

| Music | Lab |
|:---:|:---:|
| <img src="site/assets/tela-music.jpg" alt="Music" width="440"> | <img src="site/assets/tela-lab.jpg" alt="Lab" width="440"> |
| **Claude** | **Files** |
| <img src="site/assets/tela-claude.jpg" alt="Claude" width="440"> | <img src="site/assets/tela-files.jpg" alt="Files" width="440"> |
| **Social** | **Media** |
| <img src="site/assets/tela-social.jpg" alt="Social" width="440"> | <img src="site/assets/tela-media.jpg" alt="Media" width="440"> |

## The island

<p align="center">
  <img src="site/assets/ilha-fechada.jpg" alt="The island, closed" width="600">
  <br><br>
  <img src="site/assets/ilha-aberta.jpg" alt="The island, open" width="600">
</p>

Hover (or click, if you prefer) the pill to open it. The island is off by
default: turn it on in **Configurações (Settings) → Ilha (Island)**.

> [!NOTE]
> The images on this page were generated from the app's **demo data**
> (`node tools/vitrine.mjs`), over the environments' own wallpapers. On your
> machine, the screens show your data.

## Requirements

Halo is built for **one** environment and doesn't try to be compatible with
everything. It was developed and tested on a single machine; that is what's
guaranteed, and the rest is "should work" without anyone having checked.

| | Tested on | Requires |
|---|---|---|
| Distribution | Ubuntu 26.04.1 LTS, kernel 7.0 | a recent Ubuntu (or Debian derivative) |
| Desktop | KDE Plasma 6.6.6, KWin 6.6.6, Qt 6.10 | **KDE Plasma 6** |
| Session | Wayland, with the app on X11 through Xwayland 24.1 | X11, **or** Wayland with Xwayland (Plasma's default) |
| Graphics | NVIDIA, proprietary driver | any GPU — the GPU meter only reads NVIDIA |
| Monitors | more than one | one or more |
| To build | Node 22, Electron 44 | Node 22 or newer |

The app **always** runs as an X11 client (`--ozone-platform=x11`): only there
can it sink to the wallpaper layer, remember its position and keep the player
on top. On a Wayland session that goes through Xwayland, which Plasma already
ships. **Outside KDE** the app opens, but the island, the launcher, the tray,
the notification bubbles and the wallpaper switch don't work.

## Installation

1. Download the latest `.deb` from [Releases](https://github.com/jrcn1991/halo-spatial-os/releases/latest).
2. Install it:

   ```bash
   sudo apt install ./halo-spatial-os_0.1.0_amd64.deb
   ```

3. Open **Halo** from the application menu.

The `.deb` pulls in the essential programs and installs the AppArmor profile
Electron needs on Ubuntu. An AppImage is built too, but it needs `libfuse2t64`
and may hit Ubuntu's user-namespace restriction — prefer the `.deb`.

> [!TIP]
> After installing, open **Configurações (Settings) → Sistema (System)**: it
> lists every missing program, what you lose without it and the `apt` command
> to install it.

## Quick start

- **The first launch shows the window.** From the second one on, Halo starts
  collapsed: only the tray icon (near the clock) remains, and it brings the
  window back. To always open visible, turn this off in Configurações →
  Janela (Window).
- **Switch environments** in the right panel of Home. Before the first switch,
  Halo saves your wallpaper; **Configurações → Ambiente (Environment) →
  Restaurar o meu papel de parede** (restore my wallpaper) brings it back.
- **Turn the island on** in Configurações → Ilha. With it, **Meta+Space**
  collapses and restores the app, and the island's field opens apps and runs
  commands.
- **Turn the launcher on** in Configurações → Lançador (Launcher) to use
  **Meta+V**.
- **Pick the weather city** in Configurações → Widgets.
- **Switch the language** in Configurações → Idioma (Language): Portuguese
  (default) or English.

## Settings

Everything lives in **Configurações** (the gear in the dock), one section per
topic: animation, appearance (transparency, brightness, glass color),
environment, window, widgets, media, Claude, island, launcher, notifications,
Seafile, music, news and system. Glass preferences are **per environment** —
changing Floresta doesn't change Cyberpunk — and every section has its own
"Restaurar padrão" (restore default).

The file lives at `~/.config/halo-spatial-os/settings.json` and can be edited
by hand.

### System programs

The app calls 26 system programs and bundles none of them. There is a single
list (`src/shared/dependencias.ts`), read by `doctor`, Configurações → Sistema
and the `.deb`. Details in [DOCUMENTATION.md](DOCUMENTATION.md).

**Essential** — the `.deb` installs them:

| Program | Package | Without it |
|---|---|---|
| `gio` | `libglib2.0-bin` | opening apps from the launcher or the island |
| `busctl` | `systemd` | now playing, media keys, phone and Bluetooth |
| `pactl` | `pulseaudio-utils` | the island's audio and the volume HUD (works with PipeWire) |

**From KDE Plasma** — they come with it:

| Program | Package | Without it |
|---|---|---|
| `qdbus6` | `qdbus-qt6` | the island loses windows and focus; the launcher doesn't open |
| `kwriteconfig6` | `libkf6config-bin` | turning the island off leaves its shortcut in KDE |
| `plasma-apply-wallpaperimage` | `plasma-workspace` | switching environments only changes Halo's theme |
| `spectacle` | `kde-spectacle` | screenshots and on-screen text |

**Optional** — each one costs a single reading or action, and the screen says
when it's missing:

| Program | Package | Without it |
|---|---|---|
| `parec` | `pulseaudio-utils` | the spectrum becomes an animation instead of following the sound |
| `dbus-monitor` | `dbus-bin` | the island receives no notifications |
| `nmcli` | `network-manager` | the island's network module |
| `bluetoothctl` | `bluez` | the island's Bluetooth module |
| `udisksctl` | `udisks2` | mounting and ejecting USB drives from the island |
| `tesseract` | `tesseract-ocr tesseract-ocr-por tesseract-ocr-eng` | on-screen text (OCR) |
| `notify-send` | `libnotify-bin` | the end-of-timer alert |
| `sensors` | `lm-sensors` | temperature on Home and in the island |
| `nvidia-smi` | NVIDIA driver (`sudo ubuntu-drivers install`) | the GPU meter shows "no reading" |
| `docker` | `docker.io` (and your user in the `docker` group) | containers on the Lab screen |
| `git` | `git` | the projects card on Home |
| `lsblk`, `df` | `util-linux`, `coreutils` | disks in Files and in the island |
| `ps`, `systemctl`, `ss`, `hostname` | `procps`, `systemd`, `iproute2`, `hostname` | "who's heavy", services, ports and IP in the island |
| `xdg-user-dir` | `xdg-user-dirs` | the screenshots folder falls back to `~/Pictures` |
| `claude` | Claude Code, installed separately | the Claude screen and the island's Claude |

All at once, except the driver and Claude Code:

```bash
sudo apt install libglib2.0-bin systemd pulseaudio-utils dbus-bin \
  qdbus-qt6 libkf6config-bin plasma-workspace kde-spectacle \
  network-manager bluez udisks2 lm-sensors libnotify-bin \
  tesseract-ocr tesseract-ocr-por tesseract-ocr-eng git docker.io
```

### What's yours, and doesn't come with the app

Each screen tells you where to set it up while it's missing:

- **Media** — your own M3U list (Configurações → Mídia) and, for synopsis and
  cast, a free TMDB key.
- **Music** — a free app on the Spotify developer dashboard, with its Client ID
  in Configurações → Música.
- **Seafile** — only if you have a server on your local network.
- **Mascot** — Microsoft Agent `.acs` characters you already own.
- **Video wallpaper** — needs a separate Plasma video wallpaper plugin
  (`org.local.videowallpaper`); without it the environment keeps its image.

### What Halo changes outside itself

Settings live in `~/.config/halo-spatial-os/`, and wallpapers and mascots in
`~/.local/share/halo-spatial-os/`. Beyond that, four things, each with its own
switch:

| What | Where | Default | How to turn off |
|---|---|---|---|
| Session wallpaper | Plasma, through `plasma-apply-wallpaperimage` | **on** — acts when switching environments | Configurações → Ambiente |
| KWin "drawer" effect | `~/.local/share/kwin[-wayland]/effects/halo-gaveta/` | only with the island on | Configurações → Ilha (turning off removes it) |
| Global shortcuts (Meta+Space and others) | `~/.config/kglobalshortcutsrc` | only with the island on | Configurações → Ilha (turning off deletes them) |
| Meta+V taken from Klipper | kglobalaccel, over D-Bus | off | Configurações → Lançador (turning off gives it back) |

And one that writes nothing but changes what you see: **the notification
bubbles**. Off on a fresh install. Turned on in Configurações → Notificações,
Halo hides Plasma's bubbles and draws its own, dressed by the environment;
history and the bell stay with Plasma, and closing Halo gives the bubbles back
right away.

**Before uninstalling**, turn off the island and the launcher in Settings —
that deletes the shortcuts and the effect and gives Meta+V back to Klipper.
Uninstalling the package doesn't touch your home folder.

## Troubleshooting

- **I opened it and nothing showed up.** Halo is collapsed: click its tray
  icon. If even the icon doesn't show, the session may not be KDE — Halo needs
  Plasma 6.
- **Temperature, GPU or an island section is missing.** A system program is
  missing: see **Configurações → Sistema**.
- **The wallpaper doesn't change.** Check the switch in Configurações →
  Ambiente and whether `plasma-apply-wallpaperimage` is installed.
- **Meta+V still opens Klipper.** Turn the launcher on in Configurações →
  Lançador; turning it off gives the key back to Klipper.

## Building from source

```bash
npm install
npm run dev        # Electron with reload (on X11)
npm run check      # typecheck, lint, build, screen and layout tests
npm run dist       # builds the .deb and the AppImage in dist/
```

The rest — architecture decisions, how each integration works and how to verify
a change — is in **[DOCUMENTATION.md](DOCUMENTATION.md)**
([português](DOCUMENTACAO.md)).

## Roadmap

- [x] Eight screens of glass panels, with real data
- [x] Four environments, with wallpaper (image or video)
- [x] Dynamic island, Meta+V launcher and themed notification bubbles
- [x] Claude Code agents, Spotify, M3U library and Social Arte
- [x] English interface option (Portuguese stays the default)
- [ ] The Estúdio, Espaço and Costa environments
- [ ] Spotify catalog search
- [ ] GPU meter for AMD and Intel

## License

The code is **GPL-3.0-or-later** ([LICENSE](LICENSE)). What comes from third
parties — fonts, icons, libraries and data fetched at runtime — is listed in
**[THIRD-PARTY.md](THIRD-PARTY.md)**, with what each license requires.

> [!IMPORTANT]
> The two weather icon sets (`src/renderer/assets/weather/astro/` and
> `weathercast/`) are **not under the GPL**: they are **CC BY-NC-SA**
> (non-commercial), by their authors. Details in [THIRD-PARTY.md](THIRD-PARTY.md).

Halo is a personal, free project, **with no commercial purpose**. The
environments are inspirations with original art: **Shock** comes from the
underwater art deco of *BioShock* (a 2K trademark), and **Cyberpunk** from the
genre's aesthetic and *Cyberpunk 2077* (by CD Projekt Red). No affiliation with
the studios.

## Inspiration and thanks

Halo wouldn't exist without these projects and works, which showed the way:

**Dynamic island and notch**

- [**Boring Notch**](https://github.com/TheBoredTeam/boring.notch) — the Mac
  notch as a music center, shelf and HUD; the reference for how an island
  should behave, and for this README.
- [**Atoll**](https://github.com/Ebullioscopic/Atoll) — the island as a command
  surface, with live activities and system meters; this README's structure
  comes from it.
- [**Notchy**](https://notchy.dev/) — the island as a complete product; its
  website inspired [Halo's](https://jrcn1991.github.io/halo-spatial-os/).
- [**dynamic-island-projects**](https://github.com/aeusteixeira/dynamic-island-projects)
  — projects and Claude Code sessions in a notch-style drop on Windows: the idea
  of bringing Claude into the pill.

**Design**

- [**Vision Pro Application**](https://dribbble.com/shots/21707259-Vision-Pro-Application)
  (Dribbble) — glass panels tilted in space, Halo's visual grammar.
- [**Cyberpunk 2077 — UI/UX In-game Ads**](https://www.behance.net/gallery/131293967/Cyberpunk-2077-UIUX-In-game-Ads)
  (Behance) — the screen language of the Cyberpunk environment.

**Data and pieces**

- [Open-Meteo](https://open-meteo.com) — weather, no key needed.
- [TMDB](https://www.themoviedb.org) — synopsis, cast and posters for the
  library. *This product uses the TMDB API but is not endorsed or certified by
  TMDB.*
- The Rainmeter skins the weather icons came from, the DM font family and
  Phosphor icons — full credits in [THIRD-PARTY.md](THIRD-PARTY.md).
