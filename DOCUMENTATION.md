# Halo Documentation

> 🇧🇷 Leia em português: [DOCUMENTACAO.md](DOCUMENTACAO.md)

How Halo works on the inside, and how to change it without breaking what has
already been measured. The [README](README.md) is for people who use it; this
file is for people who read or change the code. Third-party material, with its
licences, is listed in [THIRD-PARTY.md](THIRD-PARTY.md).

## Contents

1. [The project rules](#the-project-rules)
2. [Creating a new environment](#creating-a-new-environment)
3. [Development](#development) — running, verifying, packaging and each integration

Some code comments cite internal development notebooks (`DINAMICA.md`,
`MOCKS.md`, `CLAUDE.md` and others). They are not part of the public
repository; whatever in them matters to someone reading the code is here.

## The project rules

Each rule comes with its reason, because a rule without a reason is the first
one to be broken by mistake.

### Data: real first, examples declared

- **If the machine has the data, use the data.** Docker, the file system, git,
  `/proc`, MPRIS and `.desktop` files are already wired up. Before inventing
  anything, look for the real source.
- **No invented data without a notice on screen.** If a panel shows example
  content, it says so.
- **A piece of data always travels the same path:**

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

  (`<assunto>` is the subject; in order: the real fetch in the main process,
  the type shared between processes, the typed IPC channel, the async
  contracts, the example values, the real implementation that talks to main,
  the factory — the ONLY place that chooses — and the hooks.)

- **Contracts are always asynchronous**, even when the answer is immediate: a
  synchronous contract today is a rewrite tomorrow.
- **Components never import `data/`**, only `hooks/`. Swapping examples for
  real data must not touch a component.
- **The factory chooses by environment**: inside Electron it hands out the real
  services; outside it (browser, tests) it hands out the examples. That is what
  makes the tests deterministic — and it is what `npm run vitrine` uses to
  generate the README images, and `npm run demo-web` for the website's
  interactive demo (`site/demo/`, made-up data, no network).
- **Periodic readings live in main, on a single clock.** The meters' history
  is collected by ONE sampler in `services/host.ts`: the screen remounts on
  every tab switch and would lose whatever it kept, and CPU usage is the
  difference between two readings — a second reader right after the first
  would measure an interval of milliseconds.
- **An external process is the cost you can see.** Each `execFile` is a new
  process (4–36 ms of wall time each). A reading that goes out to an external
  program has an expiry time proportional to what it measures (`memo`, in
  `island/snapshot.ts`), longer while the island is collapsed, and it is
  forgotten when the user acts.
- **A new external program goes into the dependency list**
  (`src/shared/dependencias.ts`), which is read in three places: `npm run
  doctor`, Configurações (Settings) → Sistema (System) and the `.deb`. Without
  that, its absence turns into silence.
- **Network and disk only in the main process.** The renderer's CSP allows
  `connect-src 'self'` and nothing else; the only gap is `img-src`, host by
  host, for public cover art.
- **Files are read-only.** There is no write, delete, rename or execute
  operation — not in the service, not in the IPC contract. The guarantee is the
  ABSENCE of those operations, and `test:live` enforces it.

### Secrets

- **API keys belong to the user**, entered in Configurações (Settings) and
  stored in `~/.config/halo-spatial-os/settings.json`. The app bundles no key
  at all; without one, the screen says where to configure it.
- **Secrets don't travel as command-line arguments** (argv is readable in
  `/proc/<pid>/cmdline`): `paraRenderer`, in `src/main/window.ts`, strips the
  Spotify and Seafile tokens and the TMDB key before the window receives them.
  When the screen needs to know a key exists, it gets a marker
  (`TMDB_GUARDADA`), which `saveSettings` swaps back for the key on disk.
- **Third-party logins open in the system browser**, via OAuth with PKCE — an
  app window asking for a password would be indistinguishable from phishing.
  Two exceptions, with constraints written in the code: the Seafile on the
  local network (the password becomes a token immediately and is never stored)
  and the Social Arte sources (the one asking for the password is the
  platform's real page, in a window with the URL stamped in its title).
- **Terms of use count as requirements**: the TMDB attribution never leaves the
  screen.

### What comes from the screen is not trusted

The renderer shows outside text (Social Arte pages, model replies, media
metadata). If it is ever tricked, the main process is what stands between
that and the machine. So every IPC channel treats its input as foreign:

- **Every app window stays on its own origin.** `travarNavegacao`
  (`src/main/navegacao.ts`) refuses `will-navigate` and `will-redirect` to
  anything outside the app and denies new windows — otherwise dropping a link
  on a window would take it to another page, and that page would inherit the
  preload with all of the IPC. New windows go through it. The Social Arte
  ones are left out on purpose: they navigate, so they have no preload.
- **Opening an app or a path only with what main recognises.** `gio launch`
  only takes a `.desktop` from the folders the app list reads
  (`desktopConhecido`, in `services/apps.ts`); `gio open` only takes a
  folder, an `http(s)` URL, a `mailto:` without attachments or a shelf item
  (`abrirDoRenderer`, in `island/actions.ts`). Opening a FILE with its default
  program is running it, and the app doesn't do that. Both put `--` before
  the argument so it can never become an option.
- **Paths from the screen are resolved before use.** Claude attachments,
  uploads to Seafile and to the phone, and OCR go through `arquivoSolto`
  (`services/arquivo-solto.ts`): absolute path, `realpath`, regular file,
  outside `/proc`, `/sys` and `/dev`, with a size cap. The shelf only deletes
  what is INSIDE it, comparing the folder of the resolved path — `startsWith`
  let `..` through. The mascot is only read from the library.
- **Outside URLs only through the network guard.** Everything main fetches
  from an address it didn't choose (a pasted link, an MPRIS cover,
  redirects) goes through `creative/rede.ts`: one list of forbidden ranges,
  which also catches IPv4 hidden inside IPv6 (`::ffff:`, NAT64, 6to4), and
  the checked IP is the connected IP — the `lookup` checks at connect time,
  so the name can't switch addresses between the check and the fetch.
- **The local socket is born closed.** The island API creates its socket
  under `umask` 0177: it exists as 0600 from the start, with no window in
  which another user could open it.
- **A repository found by the scan doesn't control git.** The project scan
  runs `git` in folders nobody chose to trust, and a `.git/config` can make
  git run programs (`core.fsmonitor`, `clean` filters, `log.showSignature`,
  external diff). `services/projects.ts` turns each one off with `-c` on
  every call — a command-line option beats the repository's config.
- **What grants power doesn't come from the screen.** The `claude` program is
  only changed through the native file picker, and raising the permission
  mode asks for a system confirmation; `saveSettings` ignores both in the
  renderer's copy. `--resume` only takes a session id, glued to the option.
  The drawer only keeps files that arrived in a real drag (the preload tells
  the main process, checking `isTrusted`), and attachments coming from the
  screen can't read the app's config folder or credential folders.
- **Outside pages get no permissions.** The Social Arte browser denies every
  permission request and every sensitive permission check (camera,
  microphone, location, notifications, clipboard), and the hidden window
  opens no windows.
- **Seafile must be on the local network.** The token only goes to a server
  whose name resolves to a private address; changing the address clears the
  token, and the upload link must point to the same server.
- **Settings don't travel in argv.** The main window gets a marker and asks
  for its settings over synchronous IPC: in `/proc/<pid>/cmdline` they were
  readable by other users on the machine.
- **The binary doesn't turn into Node.** Electron fuses
  (`electron-builder.yml`) turn off `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`
  and `--inspect`.

### CSS: three traps that have already cost dearly

1. **No literal colour outside `styles/tokens.css`.** `npm run lint:style`
   fails if it happens.
2. **No `animation` inside `.module.css`.** CSS Modules renames the
   `animation-name`, the keyframe ceases to exist and the animation doesn't
   run — with no error at all. Declare it in `styles/animations.css`, bound to
   a `data-…` attribute.
3. **There is no global `box-sizing: border-box`.** The design measurements are
   `content-box`; with `border-box` the same numbers produce smaller panels.

And two decisions: panels get `min-width: 0`, and `-webkit-app-region: drag`
exists only on the dock's handle stroke (Chromium doesn't register dragging
under `transform`, `mask-image` or `backdrop-filter`). Any overlay (modal) goes
OUTSIDE the panel row: the row has `perspective`, and there the paint order
comes from depth, not from `z-index`.

### Language

Portuguese is the default and the **language of the code**: text is written in
Portuguese in the component itself, and that text is the translation key —
`t('Configurações')`, from `@shared/i18n`. English lives in
`src/shared/i18n/en/`, one file per area. Rules:

- **Every string someone reads goes through `t()`** — labels, notices, empty
  states, `aria-label`, errors that reach the screen, main-process text (tray,
  island readings). `npm run i18n`, part of `check`, fails if a marked string
  has no English — and also if a translation is left over that no string uses.
  Ternary plurals (`t(n === 1 ? 'a' : 'b')`) are read on both branches.
- **What varies goes in via `{name}`**: `t('{n} títulos', { n })`. No `${…}`
  inside the key: word order changes between languages.
- **Call `t()` at render time, never at module top level** — otherwise the
  startup language freezes. Data tables use `marcar('…')` and are translated
  with `t(label)` where shown.
- **Values are not text.** Whatever is compared, stored or used as an id stays
  in Portuguese (and, if shown, is translated only on display).
- **Dates and numbers** follow the language: `localeDoIdioma()`.
- Switching applies at once in every window: main notifies all of them
  (`IPC.idiomaMudou`), and each remounts through `ComIdioma`.

### Settings

Every preference follows the same path: field and validation in
`src/shared/settings.ts` (field by field — the file is hand-editable and has to
survive garbage), state in `src/renderer/store/useHalo.ts`, one section per
file in `src/renderer/screens/settings/`, and consumers read from the store.
The file is written by **main**, batched over 400 ms and atomically.

- **Settings must not lock the user out.** Home and Configurações (Settings)
  never leave the dock, and the app only starts collapsed if there is a way
  back (the island or the tray).
- **Fields that main writes on its own** (window position, player progress,
  tokens) are preserved by `saveSettings` — the copy coming back from the
  renderer is the one from startup, and would erase whatever changed since.
- **A preference that a theme suggests is stored PER ENVIRONMENT**
  (`environment.ajustes`), and absence means "I didn't choose": the
  environment's preset applies and, failing that, the design value. Everything
  there tests `??`, never `||` — `0` is a valid transparency.

### Window and layer

The app window is frameless, transparent and shadowless, and **goes down to the
wallpaper layer** (`_NET_WM_STATE_BELOW`, in `services/desktop-layer.ts`): it
never covers another window. The player's window rises above everything. The
app lives in the **tray**, published over D-Bus in `src/main/tray.ts`, and
leaves the taskbar through EWMH. That is why **X11 is a requirement**: layer,
position and "keep on top" only exist there, and the app always opens in X11
(Xwayland in a Wayland session).

**What Halo writes outside itself** — four things, each with a switch and a way
to undo it: the session wallpaper (with the original saved before the first
change), the KWin effect package, the shortcut lines in `kglobalshortcutsrc`
and Meta+V taken from Klipper. Any new system effect that requires touching the
user's configuration needs a switch and a way back.

### Before saying it's done

```bash
npm run check          # typecheck + biome + build + lint de estilo + telas + layout
npm run test:live      # os serviços do main respondem nesta máquina
```

(`check` runs typecheck, Biome, build, the style lint, the screens and the
layout; `test:live` checks that main's services respond on this machine.)

No "it should work": run the app and look. If a guard fails, understand it
before silencing it. An intentional layout change updates the baseline with
`npm run layout -- --update` in the same change.

## Creating a new environment

An environment is an **interface theme + a wallpaper**. A theme edits no screen
at all: it only redefines tokens in `src/renderer/styles/env-<id>.css`, under
`:root[data-env="<id>"]`, and reads attributes the app already writes. The
path:

1. register the environment in `src/shared/environments.ts` (id, name, default
   wallpaper, `ready: true`);
2. create `styles/env-<id>.css` and import it in the THREE `main.tsx` files the
   theme dresses: the app's, the launcher's (`src/renderer/launcher/`) and the
   notification bubbles' (`src/renderer/notificacoes/`);
3. design the theme's notification bubble (`[data-halo-in="aviso"]`) — without
   its own rule it comes out in the default glass with the theme's colours;
4. if the theme suggests its own glass, entrance or charts, add it to
   `PRESETS_DO_AMBIENTE` (`src/renderer/app/environment.ts`);
5. a wallpaper of its own goes in `src/renderer/assets/env/<id>/fundo.jpg`, in
   `EMBUTIDOS` (`services/wallpaper.ts`) and in `extraResources`;
6. run `npm run check`, `npm run vitrine` and `npm run demo-web`, and look at the result.

Third-party art doesn't get in: the existing environments use original art,
generated for the project, and the provenance of each piece is in
[THIRD-PARTY.md](THIRD-PARTY.md).

## Development

### Running

```bash
npm install
npm run dev        # Electron + HMR (em X11 — ver "Janela e camada")
npm run build      # typecheck + bundle em out/
npm run check      # typecheck + biome + build + style-lint
npm run dist       # AppImage + .deb
```

(`dev` runs in X11 — see [Window and layer](#window-and-layer-1); `build`
writes the bundle to `out/`.)

### Packaging and installing

`npm run dist` produces the AppImage and the `.deb` in `dist/`. Four things
measured when packaging for the first time (05–06/09/2026), all with the reason
written where they live:

- **The machine's `umask` leaks into the package.** With a restrictive `umask`
  (`0007`, for example), everything the build generated came out `rw-rw----`,
  and `dpkg` preserves the mode: the app installed and ended up **unreadable to
  the user themselves**, `.desktop`, icons and `app.asar` included. That's why
  the `dist` script sets `umask 022` and runs a `chmod -R a+rX` over `build`
  and `out` before calling the packager: the package must not depend on how the
  machine that built it is configured.
- **`StartupWMClass` must be the EXECUTABLE's name.** Electron takes the
  `WM_CLASS` from it (`halo-spatial-os`), not from `productName` (`Halo`). With
  the wrong name the package installs just the same and the window is orphaned:
  a generic icon in the taskbar and the switcher. Checked with `xprop` on the
  installed window.
- **One main category, not two.** `Utility;System` made the app show up
  **twice** in the menu. `desktop-file-validate` warns about it — it's worth
  running on `/usr/share/applications/halo-spatial-os.desktop` after
  installing.
- **`suggests` doesn't exist** in the electron-builder 26 schema (only
  `depends` and `recommends`), and the whole configuration is rejected if it is
  there.

The AppImage needs `libfuse2t64` (the `libfuse2` of Ubuntu 24.04 onwards),
which not every machine has; the `.deb` needs nothing beyond what it declares.

Development shortcuts (only in `npm run dev`): `1`–`8` switch screens,
`Ctrl+Shift+E` cycles through the 13 entrance variations, `Ctrl+Shift+R`
replays the current screen's animation. The variations are also in
**Configurações** (Settings; the gear in the dock), which is where they become
the user's choice.

### Stack

| Layer | Choice |
|---|---|
| Shell | Electron 44, transparent frameless window (pinned Chromium — on Linux the system WebView varies by distro) |
| Build | electron-vite 5 · **Vite 7.3.6** (electron-vite doesn't accept Vite 8 yet) |
| UI | React 19 · TypeScript strict |
| Styling | CSS Modules + `styles/tokens.css` |
| State | Zustand 5 |
| Icons | `@phosphor-icons/react` |
| Fonts | `@fontsource/dm-sans` + `@fontsource/dm-mono`, bundled (no CDN) |

### Verification

Six commands, each answering a different question:

```bash
npm run check          # compila, está formatado, segue as regras de estilo — e roda os dois abaixo
npm run test:screens   # cada tela renderiza e mostra o que promete (115 verificações)
npm run layout         # os painéis não mudaram de forma sem alguém decidir
npm run test:live      # os serviços reais desta máquina respondem
npm run island         # as integrações da ilha dinâmica
npm run doctor         # os programas de sistema que o app chama estão aqui
```

In order: `check` — it compiles, it's formatted, it follows the style rules —
and runs the next two; `test:screens` — each screen renders and shows what it
promises (115 checks); `layout` — the panels haven't changed shape without
someone deciding so; `test:live` — this machine's real services respond;
`island` — the dynamic island's integrations; `doctor` — the system programs
the app calls are present.

`test:screens` and `layout` run against the built app served over HTTP. There
`window.halo` doesn't exist, so the data factory falls back to the mocks —
that's what makes these tests deterministic: they don't depend on the network,
on Docker or on whatever is playing.

`test:live` is the opposite: it talks to the **running** app and checks the
main process's services (`HALO_CDP=http://127.0.0.1:9333 npm run test:live`
points it at another instance, when more than one is open). It doesn't require
a specific result (there is no fixed container and no guaranteed music) — it
checks shape and sanity, and includes a security check: the file surface must
stay read-only, with no write operation exposed anywhere in the contract. Two
other checks guard decisions that have already cost debugging: that the app and
the player stay on opposite layers, and that the cover art of whatever is
playing arrives in a format the screen can open.

`layout` compares against its own baseline in `tools/baseline/layout.json`, no
longer against the prototype. An intentional layout change is accepted with
`npm run layout -- --update`, in the same change, so the diff shows what
moved.

`doctor` is the only one that doesn't look at the code: it checks the **26
system programs** the app calls out to (none of them ships in the package) and
exits with an error if any of the essential ones is missing. The same list —
`src/shared/dependencias.ts` — is what the `.deb` declares in
`depends`/`recommends` and what **Configurações → Sistema** (Settings → System)
shows inside the app, for people who don't open a terminal. The full table,
with each one's apt package, is in the [README](README.md#system-programs).

The rules that guide the work are at the start of this file, in
[The project rules](#the-project-rules).

### Decisions that look like mistakes and aren't

- **`overrides` in `package.json`, for packages the app never calls.**
  `dbus-next` stopped at 0.10.2 and pins `xml2js` to a version with prototype
  pollution — and it parses the XML that other processes on the D-Bus session
  send. The override moves it to 0.6, same API. The `usocket` one (an optional
  dependency of `dbus-next` that doesn't even get installed) removes an old
  `node-gyp` tree from `npm audit`. When updating `dbus-next`, check whether
  both are still needed.
- **No global `box-sizing: border-box`.** The prototype runs on `content-box`:
  "panel 270×600 with padding 18px 16px" renders 304px wide, and the flex row
  still shrinks the three panels. Measured on the prototype: 297 / 733 / 278px
  on the home screen. With `border-box`, the same handoff numbers give smaller,
  misaligned panels. Keeping `content-box`, every handoff value is transcribed
  literally. See `styles/global.css`.
- **`--ozone-platform=x11` in the scripts and the package.** It isn't a
  preference: window layer, position and "keep on top" only exist in X11. And
  **only the command-line argument changes the platform** —
  `app.commandLine.appendSwitch('ozone-platform', …)` changes nothing,
  measured.
- **Each title stores the whole URL, with its beginning repeated on every
  line.** It looks wasteful, and splitting it into prefix + suffix looks
  obvious. Measured: it costs more memory, not less, because the per-item
  object weighs more than the repeated text. The simple version stayed.
- **The window-move event is `move`, not `moved`.** `moved` only exists on
  macOS and Windows; on Linux it never fires, and the position simply wasn't
  saved — with no error at all.
- **The player page declares its media through the Media Session.** Without
  it, Chromium publishes the *page title* to MPRIS, and the home screen's "now
  playing" showed "Halo · Player" instead of the film. As a bonus, it's what
  provides the media keys and the KDE applet.
- **`--no-sandbox` in the dev scripts.** Ubuntu blocks unprivileged user
  namespaces (`kernel.apparmor_restrict_unprivileged_userns=1`) and the
  `chrome-sandbox` in `node_modules` isn't setuid root. It applies **only** in
  dev: the package installs the helper correctly.
- **Animations are declared in `styles/animations.css`, not in the modules.**
  CSS Modules renames `animation-name` to the module's scope: an
  `animation: halo-side` inside a `.module.css` becomes `_halo-side_ab12_1`,
  which doesn't exist — and the animation doesn't run, with no error at all.
  That's how the whole entrance was dead in F1 until someone noticed the panels
  appeared already in place. `:global(halo-side)` in the shorthand doesn't
  solve it either (tested: it stays hashed). That's why motion lives in global
  CSS, applied through `data-halo-in`, and `npm run lint:style` fails if any
  `animation` points to a nonexistent keyframe.
- **No blur in overlay mode, and that's a choice.** With the window
  transparent, `backdrop-filter` has nothing to blur: CSS only sees what the
  page itself painted, and behind the panels there is nothing. We tried the
  compositor's blur (KWin, `_KDE_NET_WM_BLUR_BEHIND_REGION`) and it works — we
  measured a 26% drop in the detail behind the panel —, but the region is a
  list of rectangles and it's binary: it doesn't follow rounded corners, nor
  the 3D tilt, nor the opacity rising during the entrance. The result had steps
  in the corners and flickered on every screen change, far from the prototype.
  Removed. The panels keep tint + border + shadow over the live screen.
  The `backdrop-filter` declaration remains in the CSS because in comparison
  mode (`?bg=wallpaper`) the background is opaque and it is real. That mode's
  image is ours, generated by `tools/fundo-de-comparacao.mjs`: the photo from
  the handoff bundle that used to be there was third-party material inside the
  package.
- **The Aparência (Appearance) adjustments compose the glass in the component,
  not in `tokens.css`.** A custom property declared on `:root` resolves the
  `var()`s it uses **on `:root` itself**, and descendants inherit the
  already-resolved value — so overriding `--glass-center-alpha` on the stage
  would change nothing if the background were composed there. That's why
  `Panel.module.css` builds
  `rgb(from color-mix(…) r g b / var(--glass-…-alpha))`, and `tokens.css` keeps
  only the pieces (base, alpha, clarity). At the defaults (transparency 50,
  clarity 50) the result is exactly the handoff.
- **There is no blur, and the alternative is colour.** `backdrop-filter` only
  sees what the page itself painted, and in a transparent window there is
  nothing. Two approaches were tested and both discarded: the compositor's blur
  (KWin) really blurs — we measured a 26% drop in the detail behind the panel —
  but the region is a list of rectangles and it's binary, so it staircases at
  the rounded corners and flickers on every screen change; and painting the
  user's wallpaper cropped to the window's position gives perfect glass, but
  it's a static snapshot that misaligns as soon as the window leaves the centre
  (on Wayland the app doesn't even know where it is). Instead, **Cor do vidro**
  (Glass colour): a gradient of the chosen colour runs through the glass, live
  and with no trickery. Turned off, the glass is the handoff's.
- **The dock position recalculates the reserved axis on each screen.** The
  handoff writes the panel row's `padding` with the dock at the bottom
  (`130px`); `PanelRow` moves that reserve to the chosen side. Horizontally the
  reserve is different (the width of the upright dock, 76+82+12), and the
  Música (Music) screen reports its own share (`dockReserve={96}`) because
  there the transport bar also occupies the bottom — and it moves down to the
  dock's margin when the dock leaves it.
- **Enlarging the window changes no geometry at all.** The stage stays
  1440×900 and `Stage` scales the whole thing; it's the window that grows. The
  steps the screen can't fit are disabled instead of lying — on a 1920×1080
  screen the maximum is +20% (1728×1080), because the stage is 16:10 and the
  height overflows first, and without that +25%, +50% and +75% would give
  exactly the same size.
- **The window-move handle has separate drawing and surface.** The stroke
  appears at the end of the dock, after the gear, at icon height (and lying
  down when the dock is upright); what drags is an invisible area mounted over
  it, **outside the stage**, measured on every change of dock position. The
  reason is hard: `-webkit-app-region: drag` isn't registered by Chromium
  inside a subtree with `transform`, `mask-image` or `backdrop-filter` — and
  the stage has the first two. The symptom is deceptive: the DOM is identical
  (same box, same `app-region`, same element at the point) and the window
  simply doesn't move. It's also the **only** place in the app with a drag
  region: when it covered the whole stage, it swallowed every click, including
  the dock's.
- **The stage edges are dissolved by a mask.** The panels' shadows reach 130px
  of blur; over an opaque background they fade out, but in a transparent
  window they hit the window's edge and stop dead, drawing a dark rectangle
  around everything. Measured at the left edge: 14% black ending all at once.
  The 20px mask makes the shadow end like a shadow (0% at the edge, rising to
  22% over 20px). It sits on the stage, not on the root, precisely so as not to
  swallow the drag area.
- **There is no home indicator any more.** In the handoff it's a 230x5 bar at
  `bottom: 34px`, pure decoration; it became noise once the window-move
  function went to the dock.
- **The dock has a gear in place of the avatar**, opening an 8th screen,
  Configurações (Settings), which doesn't exist in the handoff. It uses the
  geometry of the three-panel screens (Claude, Lab, Media) — same perspective,
  same resting angles — to stay within the language instead of looking grafted
  on. Cost: with the handle, the dock became 25px wider than the handoff's.
- **The dock doesn't re-animate when switching screens** — a deliberate
  divergence from the prototype. There each screen repeats the whole dock
  (`sc-if`), so it replays its entrance on every click on it. Here it's the
  fixed point the screens come out of: it lives outside the `key` that remounts
  the panels and animates once, at startup.
- **The font is static DM Sans.** The prototype loads from Google Fonts the
  version with an optical axis (`opsz,wght@9..40`), which Fontsource doesn't
  package — the variable one from there only brings the weight axis, and when
  measured it came out worse. Checked on the 62px clock: same position, same
  size, same weight, same `letter-spacing`; only the glyphs come from different
  sources.
- **The animated weather icon is optional and not the default.** Ported from
  the CodePen "Animated Weather Icons" (based on kylor's Dribbble) —
  third-party material, licence to be checked before distributing, like the
  handoff images. It's drawn by cut-out (the core in the background colour, the
  outline in a light shadow), which on a translucent card turns into a dark
  core instead of a hollow one; and in the space the handoff gives the icon
  (42–52px) the drawing collapses — the cloud ends up ~16px and the outline
  1.6px. It only breathes from ~108px up, which would require redoing the card
  (measured: 232x128 instead of 232x80, with the text line wrapping). That's
  why the default remains the handoff's Phosphor.
- **Icons imported one by one** (`@phosphor-icons/react/dist/icons/House`).
  Through the barrel, the bundle loads the entire package.
- **The harness pages are served over HTTP.** The CSP `default-src 'self'`
  blocks the page's own assets when the origin is `null` (file://). In
  Electron it doesn't happen, but relying on that would leave the diff blank
  without warning.

### Structure

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

What the tree says, in English:

- `src/main/` is the main process: the window, IPC and ALL real integration.
  `services/` holds the data services (`media` reads the M3U list, `player`
  talks MPRIS, `spotify-auth` does OAuth PKCE); `creative/` is Social Arte;
  `island/` is the dynamic island, 27 files; `launcher/` is the Meta+V window
  and the Meta+V freed from Klipper; `notificacoes/` is the system bubbles,
  dressed by the theme; `mascot/` is the decoder for Microsoft Agent `.acs`
  characters; `tray.ts` is the tray icon (StatusNotifierItem + dbusmenu).
- `src/preload/` is the typed bridge (contextIsolation on, nodeIntegration
  off); `src/shared/` is the main <-> renderer contract.
- `src/renderer/`: `app/` holds App, Stage (the 1440x900 scaled stage), the
  environment and persistence; `styles/` holds `tokens.css`, `animations.css`,
  `entrances.ts` (the 13 variations) and the theme files (Floresta is
  `tokens.css` itself); `store/` is `useHalo.ts` (the handoff's single store);
  `ui/` the primitives; `hooks/` the `use…()` hooks; `assets/` the
  environments' art, images and weather icons; `island/` the island's
  renderer, with its own palette and CSP; `launcher/` the Meta+V launcher
  (`motor.ts` is the same as the island's); `notificacoes/` the bubbles window;
  `player/` the player window, its own page with its own CSP; `screens/` the 7
  handoff screens + Configurações (outside the handoff), with `settings/`
  holding one section per file: Animação (Animation) · Aparência (Appearance) ·
  Ambiente (Environment) · Janela (Window) · Widgets · Mídia (Media) · Claude ·
  Ilha (Island) · Lançador (Launcher) · Notificações (Notifications) · Seafile ·
  Música (Music) · Notícias (News) · Sistema (System) · Sobre (About);
  `domain/` the contracts; `data/` the mocks, IPC implementations and factory.
- `tools/` holds the checks and helper scripts.

The stage is fixed at 1440×900 and scaled by `min(w/1440, h/900)`; the window
keeps the proportion via `setAspectRatio`. That way no absolute coordinate from
the handoff (dock at `bottom: 76`, panel ceiling at `y = 741`) needs to change.

### Data: how screens receive content

No screen knows where its data comes from. The path is always the same:

```
domain/repositories.ts   contratos, todos assíncronos
data/mock/               valores do handoff + latência falsa
data/ipc/                serviços reais, buscados pelo processo main
data/index.ts            fábrica — o ÚNICO ponto que escolhe entre os dois
hooks/                   useWeather() → { data, loading, error }
```

(Contracts, all asynchronous; handoff values + fake latency; real services,
fetched by the main process; the factory — the ONLY place that chooses between
the two; and the hooks.)

Contracts are asynchronous even when the answer is immediate, and the hooks
already expose the three states. **The promise was called in and it held**:
wiring up the real weather cost one file in `data/ipc/` and one line in the
factory — no component changed.

The factory chooses by environment: inside Electron it hands out the real
services; outside it, the mocks. That's how the fidelity guards run in the
browser comparing against the prototype, without depending on the network or
on whatever the weather is doing outside.

**Weather:** Open-Meteo, with no key and no sign-up — no credential to store.
The fetch happens in the **main** process, not in the renderer: the page's CSP
allows `connect-src 'self'` and nothing else, on purpose. Two calls (name →
coordinates → current weather), a 10-minute cache and WMO codes mapped to the
conditions the app draws.

The home clock is a deliberate exception: it shows the **real system time**,
which makes no sense to mock in a desktop app. That's why the tests freeze the
clock (`2025-08-28T07:24:00+01:00`, pt-BR locale, Lisbon time zone) — without
that, each run would measure a different app.

### Settings on disk

`~/.config/halo-spatial-os/settings.json` — a readable, hand-editable JSON
file. It isn't `localStorage`, and the reason is concrete: **main** needs the
preferences before the window exists, because it's main that opens the window
already at the saved size. With `localStorage` the window would open at the
default and visibly jump. As a bonus, the file is inspectable, versionable and
survives clearing the embedded browser's data.

How the path works:

- Main reads it at startup and hands it to the renderer through
  `additionalArguments`, so `window.halo.settings.initial` is available
  **synchronously** — the app mounts already in the saved state, without
  flashing the default.
- The renderer subscribes to the store outside React (`app/persist.ts`) and
  sends what changed; main batches writes over 400ms (dragging a slider fires
  dozens) and writes atomically (temporary file + `rename`), and it also
  flushes anything pending on `before-quit`.
- `shared/settings.ts` holds the type, the defaults and the validation —
  **field by field**. An unreadable file, a missing field, a wrong type or an
  out-of-range value falls back to the default instead of breaking startup.
  Tested with broken JSON and with valid JSON full of nonsense
  (`dock: "diagonal"`, `clarity: -80`, `transparency: "muito"`): the app opens
  at the handoff defaults and warns in the console.

### Window and layer

The app **always opens in X11**, and that isn't a preference: choosing the
window's layer, knowing where it is and keeping the player on top only exist
there. On Wayland, Electron accepts all three requests and the compositor
ignores them, silently. The flag comes in the scripts and in
`linux.executableArgs`; `ensureX11` in main relaunches itself as a safety net
when it doesn't, and without `DISPLAY` the app carries on in Wayland — better
to run with less than not to open.

The app's layer is an EWMH `_NET_WM_STATE_BELOW` ClientMessage, which **writes
nothing to the user's configuration** (`services/desktop-layer.ts` explains the
alternatives that were measured and discarded). The player's is
`setAlwaysOnTop`.

### The Claude screen's mascot

The handoff's orb can be swapped for a **Microsoft Agent** character (`.acs`)
— Genie, Clippy, Merlin. The app decodes the binary format directly: images,
palette, transparency and Microsoft's own LZ compression. The character reacts
to what the agents are doing.

There is no ACS decoder in JavaScript; this one was written and validated using
the file's own clipping regions as an oracle — 590 of the Genie's 591 images
match byte for byte. Genie, Merlin and Clippit decode correctly;
`tools/acs-extract.mjs` converts a character into PNGs so a new one can be
inspected before trusting it.

The choice is visual, in **Configurações → Claude** (Settings → Claude): each
character appears with its own little face, because a file name doesn't tell
you whether it's a wizard, a paper clip or a genie.

### Media

The library comes from an M3U list on disk, pointed to in **Configurações →
Mídia** (Settings → Media). The app neither bundles nor downloads any list, and
reading is read-only.

In a large list, most lines tend to be individual episodes — listing them would
make a useless wall. Main groups them into titles (a fraction of the number of
lines), as series → season → episode, and indexes in about 1 s, on demand.

Search ignores **accents, spaces and punctuation**, and accepts words out of
order: "cacador" finds "Caçador", "killbill" and "bill kill" find "Kill Bill".
Results come out by relevance — whatever starts with the term comes before
whatever merely contains it, otherwise "matrix" would bring "Animatrix" first,
in alphabetical order. It responds in ~10 ms over the whole catalogue. A
title's id is a stable key (type, category, name), never its position in the
index: favourites and history stay saved, and the list changes.

Synopsis, rating, genres, runtime and cast come from **TMDB**, with the user's
key (free, entered in Configurações). Without a key, the screen shows only what
the list provides and says where to configure it — it never makes things up.

Favourites can be organised: the user creates lists with whatever name they
like ("Assistidos" (Watched), "Talvez assistir" (Maybe watch)) and reorders
them by dragging the covers. Putting a title in a list has two paths, and both
matter: the tag in the details panel (works from any tab, and is the only way
when the lists aren't even visible) and dragging the cover onto the list in the
left panel. A list is always a **subset of the favourites** — putting a title
in a list favourites it, and unfavouriting it removes it from all of them.
That's what keeps a single model: a title in a list that didn't appear in
Favourites would be a trap.

**Media lists don't go into the repository** (`.gitignore`): besides the
catalogue, each URL carries the user's provider credentials. API keys don't
either: they stay in `~/.config`.

### Music

The Música (Music) screen is the user's **Spotify** account: playlists, saved
albums, artists, recently played, the tracks of each item, and the transport.

**Audio doesn't play inside Halo — and that was measured, not assumed.** The
only way would be the Web Playback SDK, which delivers media protected by
Widevine, and Electron doesn't distribute that module. In this project's
Electron 44:

```
navigator.requestMediaKeySystemAccess('com.widevine.alpha', …)
  → NotSupportedError: Unsupported keySystem or supportedConfigurations.
navigator.requestMediaKeySystemAccess('org.w3.clearkey', …)       → OK
```

The DRM API exists; it's Widevine that doesn't. So Halo **commands whoever
knows how to play**, and prefers the shortest path:

1. **MPRIS (D-Bus)**, when the Spotify app is open on this machine. It works
   with no credential at all, responds in milliseconds, uses no quota and hits
   the device that's in front of the user. It covers play, pause, skip,
   shuffle, bringing the Spotify window to the front (`Raise`) and **telling
   it to play a playlist** (`OpenUri`).
2. **Spotify Connect (Web API)** as a fallback, for when the local app is
   closed and the music plays on a phone or a speaker. It requires Premium and
   an active device — when there isn't one, the screen says so instead of the
   button looking dead.

A measured limitation: the Spotify Linux client publishes `Volume: 0` on MPRIS
all the time, so volume only exists through Connect — the service returns
`null` instead of propagating a "mute" that isn't true.

**The credential belongs to the user**, like TMDB's. They create a free app in
the Spotify dashboard and paste the **Client ID** into Configurações → Música
(Settings → Music); Halo bundles none (in an open repository it would be handed
to anyone who cloned it), and apps in development mode accept at most 25 users
registered by hand.

Authorisation is **Authorization Code + PKCE**, with no client secret — in an
open-source desktop app the secret would be distributed along with the binary.
The consent page opens in the **system browser**, never inside Halo: asking for
the Spotify password in a window of ours is exactly what a phishing screen
would do. The redirect lands on a loopback server that only exists during
consent.

The redirect address is **configurable** (Configurações → Música), because it
has to match, character for character, what's in *Redirect URIs* in the user's
dashboard. The default is `http://127.0.0.1:8898/callback`. Two rules come from
the Spotify documentation and the app enforces them:

- **HTTP only on loopback, and explicit loopback.** "Use HTTPS for your
  redirect URI, unless you are using a loopback address, when HTTP is
  permitted"; "`localhost` is not allowed as redirect URI". An
  `https://127.0.0.1` would be impossible to serve without inventing a
  certificate — and a self-signed one would only teach the user to click
  "proceed anyway". An address that fails this rule is discarded during
  validation and the default applies again.
- **Loopback can be registered without a port**, and the port goes in the
  authorisation request. When the configured address has no port, the app
  starts on a free port and appends it — it's the collision-proof way, and
  worth it when the fixed port already belongs to another program.

### Scopes

The app asks for exactly what it uses, and nothing more:

```
user-read-private
playlist-read-private  playlist-read-collaborative   → playlists
user-library-read                                     → álbuns salvos
user-follow-read  user-top-read                       → artistas
user-read-recently-played                             → ouvidos recentemente
user-read-playback-state  user-modify-playback-state  → transporte e Connect
```

(Playlists; saved albums; artists; recently played; transport and Connect.)

Authorising less doesn't break the screen: each collection is fetched
separately and a scope 403 becomes a **notice on screen** saying what was
missing, not an empty list. An empty column with no explanation would say "you
have no playlists" — a lie, and the kind the user has no way to suspect.

The **refresh token** is written by main, not by the renderer — the same
protection as `desktop.position` and `media.recent` in `saveSettings`. And it
does **not** travel to the renderer: the settings reach the window as a
command-line argument, visible in `/proc/<pid>/cmdline` to any process, so
`paraRenderer` (`src/main/window.ts`) removes it first. `test:live` enforces
this.

Without a Client ID, the screen says so and leads to Configurações — it never
makes up a playlist.

### Known gaps

- **The open screen isn't remembered** — only the preferences and the window
  position. Every launch starts on Home.
- **Series without episode runtime** on TMDB appear without the time; the list
  doesn't carry that data and not every series publishes it.
- **Music: volume isn't adjustable through the local path.** The Spotify Linux
  client doesn't publish volume on MPRIS (it always publishes 0), and a control
  that lied would be worse than having none.
- **Music: search in the Spotify catalogue doesn't exist yet** — the screen
  shows what's already yours (playlists, saved albums, artists, recents).

### Next phases

- **Finishing** — going screen by screen comparing against the prototype by
  eye; it remains the design reference.
- **Wiring up what's missing** — RSS, Claude agents and Social are already
  real; what's left of the prototype is the orb without a mascot and the
  examples outside Electron.
