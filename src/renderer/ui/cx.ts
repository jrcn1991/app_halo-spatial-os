/**
 * Junta classes ignorando o que for falso.
 *
 * Existe porque `noUncheckedIndexedAccess` faz `styles.algo` ser
 * `string | undefined`: sem isto, cada classe de CSS Module precisaria de um
 * `?? ''` no meio do JSX.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
