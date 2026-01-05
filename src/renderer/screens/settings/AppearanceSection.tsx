import { hexToRgb, hueToRgb, rgbToHex, rgbToHue } from '@shared/color'
import { useEffect, useState } from 'react'
import { PRESETS_DO_AMBIENTE, useValoresDoAmbiente } from '@/app/environment'
import {
  type ContentEntrance,
  type DockPosition,
  type NavigationMode,
  useHalo,
} from '@/store/useHalo'
import { Slider } from '@/ui/Slider'
import hueStyles from '@/ui/Slider.module.css'
import { Tabs } from '@/ui/Tabs'
import { Toggle } from '@/ui/Toggle'
import styles from '../SettingsScreen.module.css'

export const DOCK: readonly { value: DockPosition; label: string }[] = [
  { value: 'top', label: 'Topo' },
  { value: 'bottom', label: 'Base' },
  { value: 'left', label: 'Esquerda' },
  { value: 'right', label: 'Direita' },
]

/** `short` é o que cabe na linha de resumo do painel direito. */
export const NAVIGATION: readonly { value: NavigationMode; label: string; short: string }[] = [
  { value: 'floating', label: 'Flutuante', short: 'Flutuante' },
  { value: 'embedded', label: 'Embutida na janela', short: 'Embutida' },
]

/**
 * Transição do conteúdo do painel central, só na navegação embutida. `hint`
 * é lido dos próprios keyframes (`styles/animations.css`) — nada inventado.
 */
export const CONTENT_ENTRANCE: readonly { value: ContentEntrance; label: string; hint: string }[] =
  [
    { value: 'surgir', label: 'Surgir', hint: 'esmaece e sobe, sem passar do ponto' },
    { value: 'elastico', label: 'Elástico', hint: 'sobe e passa um pouco do ponto' },
    { value: 'recarregar', label: 'Recarregar', hint: 'clarão curto, como um refresh' },
    { value: 'materializar', label: 'Materializar', hint: 'aparece no lugar, saindo do desfoque' },
    { value: 'deslize', label: 'Deslize lateral', hint: 'vem do lado da coluna' },
    { value: 'dobra', label: 'Dobra', hint: 'tomba para trás e se endireita' },
    { value: 'implodir', label: 'Implodir', hint: 'vem grande demais e encolhe até encaixar' },
    {
      value: 'datamosh',
      label: 'Datamosh',
      hint: 'faixas escorregam com franja vermelha e ciano, como quadro perdido',
    },
    { value: 'nenhuma', label: 'Nenhuma', hint: 'troca seca' },
  ]

/** Aparência. Os quatro ajustes valem na hora. */
export function AppearanceSection() {
  const appearance = useHalo((s) => s.appearance)
  const setAppearance = useHalo((s) => s.setAppearance)
  const setAjuste = useHalo((s) => s.setAjuste)
  const embedded = appearance.navigation === 'embedded'
  const ambiente = useHalo((s) => s.environment.id)
  // Os três são ajuste POR AMBIENTE, e o resolvedor já devolve o que vale aqui.
  const { transicao, transparencia, claridade } = useValoresDoAmbiente()
  const presetTransicao = PRESETS_DO_AMBIENTE[ambiente]?.transicao
  const presetVidro = PRESETS_DO_AMBIENTE[ambiente]

  return (
    <>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Aparência · Vidro e janela</span>
        <span className={styles.title}>Aparência</span>
        <span className={styles.subtitle}>
          O padrão reproduz o protótipo do handoff. Cada ajuste vale na hora.
        </span>
      </div>
      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Vidro</span>
        {presetVidro?.transparencia === undefined && presetVidro?.claridade === undefined ? null : (
          <span className={styles.note}>
            Este ambiente pede{' '}
            {[
              presetVidro.transparencia === undefined
                ? ''
                : `transparência ${presetVidro.transparencia}%`,
              presetVidro.claridade === undefined ? '' : `claridade ${presetVidro.claridade}%`,
            ]
              .filter(Boolean)
              .join(' e ')}
            . Arrastar aqui vale por cima do preset, e "Restaurar padrão" devolve ele.
          </span>
        )}
        <div className={styles.stack}>
          <Slider
            // O slider mostra o que VALE: nulo é "automático", e um slider sem
            // número não teria onde parar.
            label="Transparência"
            value={transparencia}
            onChange={(transparency) => setAjuste({ transparency })}
          />
          <Slider
            label="Claridade"
            value={claridade}
            onChange={(clarity) => setAjuste({ clarity })}
          />
        </div>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Cor do vidro</span>
        <TintPicker />
        <span className={styles.note}>
          Uma gradação da cor escolhida atravessa o vidro, do canto superior para o centro.
          Desligada, o vidro fica exatamente como no handoff.
        </span>
      </div>

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Posição da navegação</span>
        <Tabs
          label="Posição da navegação"
          options={NAVIGATION}
          value={appearance.navigation}
          onChange={(navigation) => setAppearance({ navigation })}
        />
        <span className={styles.note}>
          Flutuante é o dock do handoff, sobre a tela. Embutida, a navegação vira uma coluna dentro
          do painel central: recolhida mostra só os ícones, e a seta no rodapé abre os nomes.
        </span>
      </div>

      {/* Só existe embutida: no modo flutuante cada tela entra inteira, com a
          variação da seção Animação — não há "miolo" para transicionar. */}
      {embedded ? (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Transição do conteúdo</span>
          <Tabs
            label="Transição do conteúdo"
            options={CONTENT_ENTRANCE}
            // O que fica ACESO é a transição que vale, e não a escolha crua:
            // vazia, quem manda é o preset do ambiente.
            value={transicao}
            onChange={(contentEntrance) => setAjuste({ contentEntrance })}
            wrap
          />
          <span className={styles.note}>
            Como o conteúdo do painel central entra a cada tela clicada — a moldura e a coluna ficam
            paradas.{' '}
            {presetTransicao
              ? `Este ambiente traz a ${CONTENT_ENTRANCE.find((o) => o.value === presetTransicao)?.label}; escolher aqui vale por cima dela, e "Restaurar padrão" devolve o preset. `
              : ''}
            {CONTENT_ENTRANCE.map((o) => `${o.label}: ${o.hint}`).join('. ')}.
          </span>
        </div>
      ) : null}

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Posição do dock</span>
        <Tabs
          label="Posição do dock"
          // A posição é do dock flutuante; embutida, a coluna tem lado fixo. A
          // escolha fica guardada e volta a valer ao voltar para Flutuante.
          options={DOCK.map((o) => ({ ...o, disabled: embedded }))}
          value={appearance.dock}
          onChange={(dock) => setAppearance({ dock })}
        />
        {embedded ? <span className={styles.note}>Vale para a navegação flutuante.</span> : null}
      </div>
    </>
  )
}

/**
 * Escolha da cor: liga/desliga, barra de matiz e hex digitável.
 *
 * Só a Floresta aceita a cor — um ambiente com atmosfera própria já pinta o
 * vidro, e somar o matiz por cima dava um verde barrento sobre o neon do
 * Cyberpunk (ver `app/appearance.ts`). Fora dela os controles ficavam ATIVOS
 * e não faziam nada: o usuário arrastava o matiz e a tela não mudava. Agora a
 * seção diz onde a escolha vale, como o dock já fazia com a navegação
 * embutida.
 */
function TintPicker() {
  const tint = useHalo((s) => s.appearance.tint)
  const setAppearance = useHalo((s) => s.setAppearance)
  const ambiente = useHalo((s) => s.environment.id)
  const vale = ambiente === 'floresta'
  const hex = rgbToHex(tint.rgb)
  const [draft, setDraft] = useState(hex)

  // O campo segue a barra, mas não atropela o que está sendo digitado.
  useEffect(() => setDraft(hex), [hex])

  const commit = (text: string) => {
    const rgb = hexToRgb(text)
    if (rgb) setAppearance({ tint: { on: true, rgb } })
    else setDraft(hex)
  }

  if (!vale) {
    return (
      <div className={styles.stack}>
        <Toggle
          label="Aplicar cor no vidro"
          checked={tint.on}
          disabled
          onChange={(on) => setAppearance({ tint: { ...tint, on } })}
        />
        <span className={styles.note}>
          A cor do vidro é da Floresta. Os outros ambientes trazem a atmosfera deles no próprio
          vidro, e somar um matiz por cima suja o tema. Sua cor continua guardada — ela volta a
          valer ao voltar para a Floresta.
        </span>
      </div>
    )
  }

  return (
    <div className={styles.stack}>
      <Toggle
        label="Aplicar cor no vidro"
        checked={tint.on}
        onChange={(on) => setAppearance({ tint: { ...tint, on } })}
      />
      <Slider
        label="Matiz"
        value={rgbToHue(tint.rgb)}
        max={360}
        format={(v) => `${Math.round(v)}°`}
        trackClassName={hueStyles.hue}
        onChange={(hue) => setAppearance({ tint: { on: true, rgb: hueToRgb(hue) } })}
      />
      <div className={styles.hexRow}>
        <span className={styles.swatch} />
        <input
          className={styles.hexInput}
          value={draft}
          spellCheck={false}
          aria-label="Cor em hexadecimal"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget.value)}
        />
      </div>
    </div>
  )
}
