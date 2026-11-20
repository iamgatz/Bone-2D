/** The layers of the code stay in one direction: core knows nothing of the rest, the store knows nothing of the editor, and nothing imports in a circle. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const rel = (p: string) => relative(ROOT, p).split('\\').join('/');
const known = new Set(files.map(rel));

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (known.has(rel(c))) return rel(c);
  return null;
}

/** [from, to, isTypeOnly] for every import between our own files. */
const edges: [string, string, boolean][] = [];
for (const p of files) {
  const src = readFileSync(p, 'utf8');
  for (const m of src.matchAll(/^(?:import|export) (type )?[^;]*?from '([^']+)';/gms)) {
    const to = resolveImport(p, m[2]);
    if (to) edges.push([rel(p), to, !!m[1]]);
  }
}

describe('architecture', () => {
  it('core imports nothing from the store, the editor, the renderer or the player', () => {
    const bad = edges.filter(([from, to]) => from.startsWith('src/core/') && /^src\/(store|editor|render|player)\//.test(to));
    expect(bad.map((e) => `${e[0]} -> ${e[1]}`)).toEqual([]);
  });

  it('the store imports nothing from the editor or the player', () => {
    const bad = edges.filter(([from, to]) => from.startsWith('src/store/') && /^src\/(editor|player)\//.test(to));
    expect(bad.map((e) => `${e[0]} -> ${e[1]}`)).toEqual([]);
  });

  it('there are no circular imports', () => {
    const graph = new Map<string, string[]>();
    for (const [from, to, typeOnly] of edges) if (!typeOnly) (graph.get(from) ?? graph.set(from, []).get(from)!).push(to);
    const state = new Map<string, 1 | 2>();
    const stack: string[] = [];
    const cycles: string[] = [];
    const visit = (n: string) => {
      state.set(n, 1);
      stack.push(n);
      for (const d of graph.get(n) ?? []) {
        if (state.get(d) === 1) cycles.push([...stack.slice(stack.indexOf(d)), d].join(' -> '));
        else if (!state.get(d)) visit(d);
      }
      stack.pop();
      state.set(n, 2);
    };
    for (const n of graph.keys()) if (!state.get(n)) visit(n);
    expect(cycles).toEqual([]);
  });
});
