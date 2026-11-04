/** Utility per percorsi: la radice arriva da Rust con separatori del sistema. */

export function joinPath(root: string, rel: string): string {
  if (!rel) return root;
  const sep = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return root.endsWith(sep) ? root + rel : root + sep + rel;
}

export function toRel(root: string, abs: string): string {
  if (abs.startsWith(root)) {
    return abs.slice(root.length).replace(/^[\\/]/, '');
  }
  return abs;
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function dirname(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join('/') || '';
}

export function extOf(path: string): string {
  const base = basename(path);
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i + 1).toLowerCase() : '';
}

export function isEditorFile(path: string): boolean {
  return ['tex', 'bib', 'sty', 'cls', 'txt', 'md'].includes(extOf(path));
}
