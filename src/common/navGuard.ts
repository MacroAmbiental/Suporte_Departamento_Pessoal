// Guard leve de navegação entre páginas da aplicação (rotas da sidebar).
// Uma página registra uma função que retorna `true` se a navegação pode prosseguir.
type GuardFn = () => boolean;

let guard: GuardFn | null = null;

export function setNavGuard(fn: GuardFn | null) {
  guard = fn;
}

export function canNavigateAway(): boolean {
  return guard ? guard() : true;
}
