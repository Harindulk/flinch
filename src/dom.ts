type Kid = Node | string | number | null | undefined | false;
type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], "style" | "dataset">> & {
  class?: string;
  style?: string;
  dataset?: Record<string, string>;
};

/** Tiny element builder: h("button", { class: "big", onclick }, "Stop"). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props<K> = {}, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  const { class: cls, style, dataset, ...rest } = props;
  if (cls) el.className = cls;
  if (style) el.setAttribute("style", style);
  if (dataset) Object.assign(el.dataset, dataset);
  Object.assign(el, rest);
  for (const k of kids) if (k !== null && k !== undefined && k !== false) el.append(typeof k === "number" ? String(k) : k);
  return el;
}

export function download(blob: Blob, filename: string) {
  const a = h("a", { href: URL.createObjectURL(blob), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
