/**
 * O app é um overlay: os painéis flutuam sobre a tela real, não sobre uma
 * imagem dentro do app. O wallpaper do handoff continua disponível num modo
 * de comparação, usado pelos guarda-fidelidade (`?bg=wallpaper`) — sem ele,
 * o diff contra o protótipo perderia o sentido.
 */
export type Backdrop = 'transparent' | 'wallpaper'

export function currentBackdrop(): Backdrop {
  return new URLSearchParams(location.search).get('bg') === 'wallpaper'
    ? 'wallpaper'
    : 'transparent'
}
