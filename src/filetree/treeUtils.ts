/** Utility per l'albero file. */
import type { FileNode } from '../utils/ipc';
import { extOf } from '../utils/paths';

export function parentDirOf(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i < 0 ? '' : rel.slice(0, i);
}

export function findNode(tree: FileNode | null, rel: string): FileNode | null {
  if (!tree) return null;
  if (tree.path === rel) return tree;
  for (const child of tree.children ?? []) {
    const hit = findNode(child, rel);
    if (hit) return hit;
  }
  return null;
}

export function isEditableFile(rel: string): boolean {
  return ['tex', 'bib', 'sty', 'cls', 'txt', 'md'].includes(extOf(rel));
}

export function isTexFile(rel: string): boolean {
  return extOf(rel) === 'tex';
}
