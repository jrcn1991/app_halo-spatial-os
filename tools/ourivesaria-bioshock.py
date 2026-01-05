"""
Ourivesaria do ambiente BioShock: prepara as peças de bronze do tema.

PROVENIÊNCIA. As peças (crista do topo, crista da base, glifos da navegação)
nascem de `image_gen` do GPT-5, com prompts escritos
neste projeto que descrevem ART DÉCO DOS ANOS 1920/30 SUBMERSO — nunca o jogo,
nunca "BioShock". É a mesma regra de `CRIACAO-DE-TEMAS.md` §13 que vale para a
cor e para a fonte: o tema é interpretação nossa do déco, e nenhum recurso de
terceiro entra. Os prompts estão em `MOCKS.md`, para a peça poder ser refeita.

O QUE ESTE ARQUIVO FAZ, e por que ele existe em vez de a imagem crua ser
commitada como veio:

1. **Recorta o chroma.** O `image_gen` promete alfa e às vezes entrega um
   xadrez DESENHADO nos pixels — medido: das três conchas geradas com
   `transparent: true`, as três vieram RGB com o xadrez pintado. O caminho que
   funciona é o mesmo de outros geradores: pedir fundo magenta chapado e cortar
   aqui. Magenta porque nenhum bronze tem R e B acima do G ao mesmo tempo, então
   `min(R,B) - G` separa metal de fundo sem tocar na peça.

2. **Tira o derrame.** Onde a peça encosta no fundo, o magenta sangra na borda.
   A correção é subtrair a própria medida `min(R,B) - G` de R e de B: no bronze
   ela já é zero, então a peça não sente.

3. **Retinge para os tokens do tema.** É o passo que importa. O bronze que o
   gerador entrega é dourado saturado (~#cd9439), e o tema decidiu o contrário:
   "dourado brilhante e saturação alta ficam de fora de propósito — a cena é
   água profunda, e metal polido nela seria de outro lugar". Então a peça é
   reduzida a LUMINÂNCIA e reconstruída na rampa dos cinco bronzes de
   `env-bioshock.css`. O modelado (bisel, cume, canal, oclusão) é do gerador; a
   COR é do tema, e trocar `--bs-bronze` e refazer as peças as troca junto.

   A pátina não sai da rampa: ela é o verde do cobre oxidado, e some se virar
   luminância. Por isso o verde do original vira uma máscara própria, misturada
   por cima em `--bs-patina`.

Uso:

    python3 tools/ourivesaria-bioshock.py crista   <entrada.png> <saída.png> [largura]
    python3 tools/ourivesaria-bioshock.py fundo    <entrada.png> <saída.jpg> [larg] [alt]
    python3 tools/ourivesaria-bioshock.py mascaras <entrada.png> <pasta/> <cols> <linhas> <nome1,nome2,...> [lado]

O segundo modo fatia uma FOLHA de glifos (uma imagem com a grade inteira) em um
PNG por célula: um pedido ao gerador em vez de um por ícone, e a grade sai com a
mesma mão desenhando todos — que é o que faz oito ícones parecerem um conjunto.

Refazer UM glifo é refazer a folha inteira e aproveitar só a célula que
interessa. Não há atalho: pedir um ícone sozinho ao gerador devolve um desenho
de outra mão, e ele destoa dos sete vizinhos. Foi assim que o `home` ganhou os
degraus da base e o `files` voltou a ter duas pastas — as outras seis células
daquela folha foram descartadas.

E ele NÃO retinge: um glifo do dock sai daqui como MÁSCARA (RGB preto, o desenho
no alfa), não como peça colorida. O motivo é o estado: no dock, inativo é bronze
e ativo é turquesa, e uma peça com a cor dentro não trocaria de estado. Como
máscara, a cor vem de `currentColor` — e são os mesmos tokens do tema que já
pintam o dock hoje. É também por isso que a folha é pedida CHAPADA em preto: um
glifo modelado em 3D não tem silhueta, e silhueta é tudo o que uma máscara usa.
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter

# ——— Os cinco bronzes, e a pátina, copiados de `styles/env-bioshock.css` ———
# Se um deles mudar lá, mude aqui e refaça as peças: é essa duplicação que
# mantém a peça e o token na mesma cor, e ela é deliberada (um PNG não lê CSS).
SULCO = (0x10, 0x0B, 0x05)
COBRE = (0x5D, 0x46, 0x29)
BRONZE = (0xA2, 0x8C, 0x65)
BRONZE_LUZ = (0xD3, 0xBB, 0x87)
BRONZE_BRILHO = (0xF2, 0xE6, 0xC4)
PATINA = (0x2F, 0x5F, 0x52)

# A rampa: luminância normalizada -> cor. Os pontos não são igualmente
# espaçados de propósito. A massa de um metal fotografado vive na metade de
# baixo do histograma, e o cume é uma fração pequena da área; espaçar por igual
# jogaria a peça inteira para o claro e devolveria o dourado que o tema recusa.
RAMPA = [(0, SULCO), (70, COBRE), (150, BRONZE), (212, BRONZE_LUZ), (255, BRONZE_BRILHO)]


def mistura(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))


def tabela_rampa():
    """Três LUTs de 256 entradas (uma por canal), lidas da RAMPA."""
    saida = [[], [], []]
    for v in range(256):
        for i in range(len(RAMPA) - 1):
            x0, c0 = RAMPA[i]
            x1, c1 = RAMPA[i + 1]
            if x0 <= v <= x1:
                cor = mistura(c0, c1, (v - x0) / (x1 - x0))
                break
        else:
            cor = RAMPA[-1][1]
        for canal in range(3):
            saida[canal].append(cor[canal])
    return saida


def corta_chroma(im, lo=18, hi=70):
    """Magenta chapado -> alfa. Devolve RGBA já sem derrame.

    `lo`/`hi` são a faixa de transição da borda: abaixo de `lo` é metal, acima
    de `hi` é fundo, e no meio a borda ganha alfa parcial — sem isso a peça sai
    recortada a serra, e a serrilha aparece inteira quando o CSS a reduz.
    """
    im = im.convert("RGB")
    r, g, b = im.split()
    # `min(R,B) - G`: quanto aquele pixel é magenta. Zero em todo bronze.
    magenta = ImageChops.subtract(ImageChops.darker(r, b), g)

    alfa = magenta.point(lambda v: 255 if v <= lo else (0 if v >= hi else round(255 * (hi - v) / (hi - lo))))

    # Derrame: onde há magenta, tire-o de R e de B. No metal a conta é 0.
    r = ImageChops.subtract(r, magenta)
    b = ImageChops.subtract(b, magenta)
    return Image.merge("RGBA", (r, g, b, alfa))


def retinge(im):
    """Luminância -> rampa de bronze do tema, com a pátina remisturada."""
    rgb = im.convert("RGB")
    alfa = im.getchannel("A")
    opaco = alfa.point(lambda v: 255 if v > 200 else 0)

    luz = rgb.convert("L")

    # Normaliza SÓ pelo que é peça: a margem transparente é preta e puxaria
    # todo o alongamento para baixo.
    hist = luz.histogram(mask=opaco)
    total = sum(hist) or 1

    def percentil(p):
        alvo, soma = total * p, 0
        for v, n in enumerate(hist):
            soma += n
            if soma >= alvo:
                return v
        return 255

    p_baixo, p_alto = percentil(0.02), percentil(0.985)
    if p_alto - p_baixo < 24:  # peça chapada: não estique ruído
        p_baixo, p_alto = 0, 255
    luz = luz.point(lambda v: max(0, min(255, round(255 * (v - p_baixo) / (p_alto - p_baixo)))))

    lut_r, lut_g, lut_b = tabela_rampa()
    bronze = Image.merge("RGB", (luz.point(lut_r), luz.point(lut_g), luz.point(lut_b)))

    # ——— Pátina ———
    # O verde do original: G acima de R. No bronze do gerador isso só acontece
    # nas frestas oxidadas, que é exatamente onde a pátina deve ficar. O desfoque
    # de 1px tira o sal do ruído do gerador sem apagar a fresta.
    r, g, _ = rgb.split()
    verde = ImageChops.subtract(g, r).point(lambda v: min(255, round(v * 3.2))).filter(ImageFilter.GaussianBlur(1))
    bronze = Image.composite(Image.new("RGB", im.size, PATINA), bronze, verde)

    bronze.putalpha(alfa)
    return bronze


def recorta(im, folga=2):
    caixa = im.getchannel("A").getbbox()
    if not caixa:
        raise SystemExit("imagem vazia: o corte do chroma não deixou peça nenhuma")
    e, t, d, b = caixa
    return im.crop((max(0, e - folga), max(0, t - folga), min(im.width, d + folga), min(im.height, b + folga)))


def prepara(entrada, largura):
    im = Image.open(entrada)
    # Quem já veio com alfa de verdade não passa pelo chroma; quem veio RGB, sim.
    im = im.convert("RGBA") if im.mode == "RGBA" and im.getchannel("A").getextrema()[0] < 250 else corta_chroma(im)
    im = recorta(retinge(im))
    if largura and im.width != largura:
        im = im.resize((largura, round(im.height * largura / im.width)), Image.LANCZOS)
    return im


def fundo(entrada, saida, larg=3840, alt=2160):
    """Papel de parede: leva a cena gerada ao tamanho de tela, sem faixa.

    O gerador entrega ~1672×941, e a tela quer 3840×2160 — uma ampliação de
    2,3×. Ela é aceitável AQUI e não seria em outra imagem: a cena é névoa e
    penumbra, sem aresta dura para o LANCZOS borrar. O que ela custa é uma
    máscara de desfoque discreta, que devolve a definição das estrias verticais
    das torres — é o que faz a cidade ser déco e não um borrão. Discreta de
    propósito: forte, ela desenharia halo em volta dos feixes de luz.

    MEDIDO, e por isso NÃO tem grão: a suspeita era bandeamento, porque metade
    da imagem é um gradiente de verde quase preto e JPEG em gradiente escuro
    costuma fazer degrau. Clareando 4,2× a mesma região com e sem ruído de ±2
    níveis, não há degrau em nenhuma das duas — a cena pintada já traz textura
    de sobra (névoa, neve marinha, marca de pincel), e é ela que quebra o
    degrau. O ruído só somava 135 KB. Se um dia o fundo virar arte chapada, o
    grão volta a ser necessário; nesta, não é.

    `subsampling=0` fica, e esse sim é necessário: com croma reduzido o
    turquesa dos feixes ganha bloco contra o verde escuro.

    O recorte é de COBRIR: a razão do gerador (1,7768) e a da tela (1,7778) só
    diferem no terceiro decimal, mas esticar em vez de recortar deformaria a
    cidade — e deformação em prédio é visível mesmo quando é de 0,05%.
    """
    im = Image.open(entrada).convert("RGB")
    escala = max(larg / im.width, alt / im.height)
    im = im.resize((round(im.width * escala), round(im.height * escala)), Image.LANCZOS)
    e, t = (im.width - larg) // 2, (im.height - alt) // 2
    im = im.crop((e, t, e + larg, t + alt))
    im = im.filter(ImageFilter.UnsharpMask(radius=2, percent=55, threshold=3))

    Path(saida).parent.mkdir(parents=True, exist_ok=True)
    im.save(saida, quality=86, subsampling=0, optimize=True)
    return im


def main(argv):
    if len(argv) < 4:
        raise SystemExit(__doc__)
    modo, entrada, saida = argv[1], argv[2], argv[3]

    if modo == "crista":
        largura = int(argv[4]) if len(argv) > 4 else 480
        peca = prepara(entrada, largura)
        Path(saida).parent.mkdir(parents=True, exist_ok=True)
        peca.save(saida)
        print(f"{saida} — {peca.width}×{peca.height}")
        return

    if modo == "fundo":
        larg = int(argv[4]) if len(argv) > 4 else 3840
        alt = int(argv[5]) if len(argv) > 5 else 2160
        im = fundo(entrada, saida, larg, alt)
        print(f"{saida} — {im.width}×{im.height}, {Path(saida).stat().st_size // 1024} KB")
        return

    if modo == "mascaras":
        cols, linhas, nomes = int(argv[4]), int(argv[5]), argv[6].split(",")
        lado_final = int(argv[7]) if len(argv) > 7 else 128
        im = Image.open(entrada)
        im = im.convert("RGBA") if im.mode == "RGBA" and im.getchannel("A").getextrema()[0] < 250 else corta_chroma(im)
        cl, ca = im.width // cols, im.height // linhas
        destino = Path(saida)
        destino.mkdir(parents=True, exist_ok=True)

        celulas = [
            recorta(im.crop(((i % cols) * cl, (i // cols) * ca, (i % cols + 1) * cl, (i // cols + 1) * ca)), 0)
            for i in range(len(nomes))
        ]

        # ——— Peso ótico, igualado por MEDIDA ———
        # O gerador promete traço uniforme e não entrega: MEDIDO na folha
        # vazada deste tema, a cobertura de tinta ia de 0,207 (o pulso, uma
        # linha atravessando uma caixa larga) e 0,227 (o leque de raios) a 0,343
        # (a engrenagem), com mediana 0,294. Na coluna isso se vê como dois
        # ícones apagados no meio de seis acesos — e é o tipo de desigualdade
        # que um conjunto de ícones não pode ter.
        #
        # A correção é ENGROSSAR o traço de quem ficou abaixo, não aumentar a
        # peça: aumentar mudaria o tamanho aparente do glifo dentro do octógono,
        # que é justamente o que está certo. `MaxFilter` dilata a silhueta em
        # todas as direções por igual, que é o que um traço mais grosso é.
        cobertura = [
            sum(v * n for v, n in enumerate(c.getchannel("A").histogram())) / 255 / (c.width * c.height)
            for c in celulas
        ]
        alvo = sorted(cobertura)[len(cobertura) // 2]
        for i, c in enumerate(celulas):
            if cobertura[i] >= alvo * 0.8:
                continue
            # O raio sai da falta: cada passo de dilatação engrossa o traço em
            # 2px na resolução da folha (~400px de célula), e mais de 2 passos
            # começaria a fechar os vãos internos do desenho.
            passos = 2 if cobertura[i] < alvo * 0.55 else 1
            alfa = c.getchannel("A")
            for _ in range(passos):
                alfa = alfa.filter(ImageFilter.MaxFilter(9))
            celulas[i] = Image.merge("RGBA", (*c.split()[:3], alfa))

        for i, nome in enumerate(nomes):
            celula = recorta(celulas[i], 0)

            # Glifo entra em CAIXA QUADRADA, e não recortado justo: o dock
            # alinha os ícones pelo centro da caixa, e peças de larguras
            # diferentes ficariam com pesos diferentes dentro do octógono. A
            # folga de 6% é o ar que o octógono precisa em volta do desenho.
            lado = round(max(celula.size) * 1.12)
            quadro = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
            quadro.paste(celula, ((lado - celula.width) // 2, (lado - celula.height) // 2))
            quadro = quadro.resize((lado_final, lado_final), Image.LANCZOS)

            # Máscara: o desenho vive no ALFA, e o RGB vai preto. Um PNG usado em
            # `mask-image` é lido pelo alfa (`mask-mode: match-source`), então o
            # RGB não é visto — mas deixá-lo preto evita franja clara se um dia
            # a mesma peça for usada como imagem.
            alfa = quadro.getchannel("A")
            quadro = Image.merge("RGBA", (Image.new("L", quadro.size, 0),) * 3 + (alfa,))
            quadro.save(destino / f"{nome}.png")
            print(f"{destino / nome}.png — {lado_final}×{lado_final}")
        return

    raise SystemExit(f"modo desconhecido: {modo}")


if __name__ == "__main__":
    main(sys.argv)
