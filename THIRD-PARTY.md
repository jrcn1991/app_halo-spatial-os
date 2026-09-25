# O que vem de terceiros dentro do Halo

Este arquivo viaja **com o pacote** (`extraResources`), e não só com o
repositório: as obrigações abaixo valem para quem recebe o artefato, não só
para quem lê o código.

## Leia isto antes de distribuir comercialmente

**Os dois conjuntos de ícone do clima são NonCommercial.** `astro/` e
`weathercast/` (em `src/renderer/assets/weather/`) vieram de
skins do Rainmeter sob Creative Commons **BY-NC-SA**. Enquanto o Halo é
distribuído sem cobrança — o caso de hoje —, a cláusula é cumprida. Se um dia
ele for vendido, ou embutido em algo que se venda, **os dois precisam sair ou
ser relicenciados**. A tabela completa, com autor de cada um, está logo abaixo, em
"Ícones do clima".

## Arquivos que NÃO estão sob a GPL

O código do Halo é GPL-3.0-or-later. **Estes arquivos não são**, e seguem só a
licença deles:

- `src/renderer/assets/weather/astro/*.png` — CC BY-NC-SA 3.0 (xxenium);
- `src/renderer/assets/weather/weathercast/*.png` — CC BY-NC-SA 4.0 (Saber Akiyama).

A cláusula NonCommercial não é compatível com a GPL, que permite venda. Por
isso eles ficam fora dela: quem redistribuir o Halo sob a GPL pode fazê-lo sem
estes doze arquivos (o app continua funcionando, com os ícones do Phosphor e
os animados), ou levá-los junto respeitando a CC BY-NC-SA — sem uso comercial,
com atribuição, e sob a mesma licença.

## Ícones do clima

Os dois conjuntos vieram de skins do Rainmeter, da pasta `@Resources` de cada
uma. Só os seis ícones que o app usa foram copiados (códigos do weather.com,
variantes de dia: 32 limpo, 26 nublado, 20 neblina, 11 chuva, 16 neve, 4
tempestade), sem alteração.

Havia um terceiro, o do MiniWeather (ícones "Google Now" de Naman Rastogi), e
ele saiu antes da publicação: a licença de redistribuição dos ícones em si não
estava declarada.

| Pasta | Origem | Autor | Licença declarada no skin |
|---|---|---|---|
| `astro/` | ASTROWeather (`astro_weather.rmskin`) | xxenium | Creative Commons Attribution-NonCommercial-ShareAlike 3.0 |
| `weathercast/` | SA Weather Cast v1.1.2 (`SA.Weather.Cast.v1.1.2.rmskin`) | Saber Akiyama | Creative Commons BY-NC-SA 4.0 International |

O texto das licenças, que a própria CC pede que acompanhe a atribuição:

- CC BY-NC-SA 3.0 — <https://creativecommons.org/licenses/by-nc-sa/3.0/legalcode>
- CC BY-NC-SA 4.0 — <https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode>

O que as licenças exigem, e onde o app cumpre:

- **Atribuição**: a linha de crédito aparece em Configurações → Widgets →
  Clima, ao lado da escolha do conjunto, e aqui.
- **NonCommercial**: este app não é distribuído comercialmente. Se um dia for,
  estes dois conjuntos precisam sair ou ser relicenciados.
- **ShareAlike**: os ícones são redistribuídos como estão, sob as mesmas
  licenças, apontadas nesta tabela.

## Fontes

Seis famílias, todas sob a **SIL Open Font License 1.1** (OFL-1.1), embutidas
pelo `@fontsource`:

| Família | Pacote |
|---|---|
| DM Sans | `@fontsource/dm-sans` |
| DM Mono | `@fontsource/dm-mono` |
| Josefin Sans | `@fontsource/josefin-sans` |
| Playfair Display | `@fontsource/playfair-display` |
| Rajdhani | `@fontsource/rajdhani` |
| Share Tech Mono | `@fontsource/share-tech-mono` |

A OFL permite embutir a fonte num programa e distribuí-la junto, inclusive
comercialmente. Ela exige que o aviso de copyright e a própria licença
acompanhem os arquivos — é o que esta seção faz — e proíbe vender as fontes
isoladamente. O texto integral de cada uma está no pacote npm correspondente
(`node_modules/@fontsource/<família>/LICENSE`).

## Bibliotecas

| Biblioteca | Licença | Onde |
|---|---|---|
| Electron 44 | MIT | o app inteiro |
| Chromium | BSD-3-Clause | dentro do Electron |
| ffmpeg | LGPL-2.1+ | dentro do Electron |
| React, React DOM | MIT | interface |
| Zustand | MIT | estado |
| Phosphor Icons | MIT | ícones da interface |
| `dbus-next` | MIT | D-Bus (MPRIS, KWin, Klipper) |
| `x11` | MIT | camada da janela e região de entrada |
| `xml2js`, e o resto da árvore de produção | MIT / Apache-2.0 / BlueOak-1.0.0 | transitivas |

Os avisos do Chromium e do ffmpeg vêm dentro do próprio Electron
(`LICENSES.chromium.html`) e são copiados para o pacote automaticamente.

## Dados de fora, em tempo de execução

Não são arquivos embutidos, mas os termos deles valem igual:

- **TMDB** — metadados e capas de filmes e séries. O uso exige atribuição onde
  os dados aparecem: a linha de crédito no painel de detalhes da tela de Mídia
  é requisito, não enfeite. A chave de API é do usuário, informada em
  Configurações; o app não embute nenhuma.
- **Open-Meteo** — previsão do tempo, sem chave e sem cadastro.
- **Spotify** — a conta é do usuário, por OAuth com PKCE. O app não embute
  client secret.
- **Social Arte** — cada fonte foi ligada depois de lidos os termos da
  plataforma, e só do jeito que eles permitem. O app lê páginas públicas com a
  sessão do próprio usuário, somente leitura, e não guarda acervo — só o que o
  usuário manda salvar, como metadado e endereço original.

## Arte que é nossa

Os papéis de parede dos **quatro ambientes** (Floresta, City Pop, Cyberpunk e
Shock) e as peças de interface do Shock e do City Pop são arte original deste
projeto, gerada por IA (a geração de imagem do GPT-5 e, no Cyberpunk, o
Gemini) com prompts escritos para o projeto — que descrevem uma estética e
nunca pedem cena, personagem, logotipo ou texto de obra alheia — e preparada
por `tools/fundo-de-ambiente.mjs` e `tools/ourivesaria-bioshock.py`.

O **ícone do app** (`build/icone-fonte.png`) também é arte gerada por IA para
este projeto — pela API de imagem da OpenAI (gpt-image), em 03/09/2026, como
registram os metadados C2PA do próprio arquivo. `tools/icone.mjs` só o prepara
no tamanho que o empacotador pede. Não é material de terceiro, e não há
cláusula a cumprir por ele.
