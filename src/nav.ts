/** A screen draws itself into root and may return a cleanup function. */
export type Screen = (root: HTMLElement) => void | (() => void);

let root: HTMLElement;
let cleanup: (() => void) | void;

export function mount(el: HTMLElement) {
  root = el;
}

export function show(screen: Screen, hash = "#/") {
  cleanup?.();
  cleanup = undefined;
  if (location.hash !== hash) history.replaceState(null, "", hash);
  root.replaceChildren();
  window.scrollTo(0, 0);
  cleanup = screen(root);
}
