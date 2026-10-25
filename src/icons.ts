// A few 16 px stroke icons, drawn for Flinch (no icon font, no network).
const PATHS = {
  play: '<path d="M5 3.5v9l7.5-4.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M5 3.5v9M11 3.5v9" stroke-width="2.2"/>',
  stop: '<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" stroke="none"/>',
  flag: '<path d="M4 14V2.5M4 3h7.5l-1.8 3 1.8 3H4"/>',
  download: '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>',
  film: '<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M5.5 3v10M10.5 3v10M2.5 8h11"/>',
  notes: '<path d="M4 2.5h5.5L12 5v8.5H4z"/><path d="M6 8h4M6 10.5h4"/>',
  back: '<path d="M10 3.5 5.5 8l4.5 4.5"/>',
  prev: '<path d="M4 3.5v9M12 3.5 6.5 8l5.5 4.5z" fill="currentColor"/>',
  next: '<path d="M12 3.5v9M4 3.5 9.5 8 4 12.5z" fill="currentColor"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"/>',
  check: '<path d="M3.5 8.5 6.5 11.5 12.5 4.5"/>',
  alert: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.2v.3"/>',
  monitor: '<rect x="2" y="3" width="12" height="8" rx="1.2"/><path d="M6 13.5h4"/>',
  camera: '<rect x="2" y="4.5" width="9" height="7" rx="1.2"/><path d="M11 7l3-1.5v5L11 9"/>',
  face: '<circle cx="8" cy="8" r="5.5"/><path d="M6 6.8v.2M10 6.8v.2M5.8 9.8c1.2 1.2 3.2 1.2 4.4 0"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, cls = ""): SVGSVGElement {
  const wrap = document.createElement("span");
  wrap.innerHTML = `<svg class="icon ${cls}" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}
