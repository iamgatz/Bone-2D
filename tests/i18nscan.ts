/**
 * The English texts the sources build for the screen: messages, errors, undo labels, hints and the parts of attributes. A template
 * or a choice between two words gives every sentence it can say, with `7` where a name or a number goes in.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export interface Said {
  file: string;
  line: number;
  text: string;
}

function sources(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Messages only a developer sees: a broken document that the editor itself would have to have made, and errors that never show. */
const INTERNAL = [/^Binary export: /, /^(Shader|Program link) error/, /^IndexedDB request failed$/, /^Not a data URL$/];

/** How an argument of these calls reaches the screen: which arguments are shown. */
const CALLS: Record<string, number[]> = {
  toast: [0],
  askName: [0, 1, 3],
  update: [0],
  beginGesture: [0],
  warn: [0],
  pick: [2],
};
const ATTRIBUTES = ['title', 'label', 'placeholder', 'aria-label', 'alt', 'data-tip'];
const KEYS = ['title', 'label', 'hint', 'text'];

/** Every sentence an expression can give; a part that is not written in the source stands as `7`. */
function said(n: ts.Expression): string[] {
  if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return [n.text];
  if (ts.isParenthesizedExpression(n)) return said(n.expression);
  if (ts.isConditionalExpression(n)) return [...said(n.whenTrue), ...said(n.whenFalse)];
  if (ts.isTemplateExpression(n))
    return n.templateSpans.reduce(
      (all, span) => all.flatMap((start) => said(span.expression).map((mid) => start + mid + span.literal.text)),
      [n.head.text],
    );
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken)
    return said(n.left).flatMap((a) => said(n.right).map((b) => a + b));
  return ['7'];
}

/** A sentence or a word of the interface, not a class name, a colour, a font or a path. */
const isText = (t: string) => /[A-Za-z]{2,}/.test(t) && (/[A-Za-z]{2,}[,:]? [A-Za-z("“{]*[a-z]/.test(t) || /^[A-Z][a-z]{2,}[…:]?$/.test(t));

export function shownTexts(): Said[] {
  const out: Said[] = [];
  const seen = new Set<string>();
  for (const dir of ['src/editor', 'src/store', 'src/core', 'src/render']) {
    for (const f of sources(join(process.cwd(), dir))) {
      const file = f.replace(/\\/g, '/').replace(/^.*\/src\//, 'src/');
      // the changelog and the lessons carry their own languages
      if (/changelog|core\/lessons|playerText/.test(file)) continue;
      const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true);
      const take = (n: ts.Expression) => {
        for (const raw of said(n)) {
          const text = raw.replace(/\s+/g, ' ').trim();
          if (!isText(text) || seen.has(text) || INTERNAL.some((re) => re.test(text))) continue;
          seen.add(text);
          out.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, text });
        }
      };
      const visit = (n: ts.Node) => {
        // what goes to the browser console stays in English
        if (ts.isCallExpression(n) && !n.expression.getText().startsWith('console.')) {
          const callee = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : n.expression.getText();
          // the notes of the pose repair go to the console with the other repairs of a project
          const pushed = callee === 'push' && /(warnings|notes)\.push$/.test(n.expression.getText()) && file !== 'src/core/poses.ts';
          for (const i of pushed ? [0] : Object.hasOwn(CALLS, callee) ? CALLS[callee] : []) if (n.arguments[i]) take(n.arguments[i]);
        } else if (ts.isNewExpression(n) && n.expression.getText() === 'Error' && n.arguments?.[0]) {
          if (!/core\/export\/(spineBinary|apng)/.test(file)) take(n.arguments[0]);
        } else if (ts.isJsxAttribute(n) && ATTRIBUTES.includes(n.name.getText()) && n.initializer) {
          if (ts.isStringLiteral(n.initializer)) take(n.initializer);
          else if (ts.isJsxExpression(n.initializer) && n.initializer.expression) take(n.initializer.expression);
        } else if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
          take(n.expression);
        } else if (ts.isPropertyAssignment(n) && KEYS.includes(n.name.getText()) && !file.startsWith('src/core/')) {
          take(n.initializer);
        } else if (file === 'src/core/limits.ts' && ts.isReturnStatement(n) && n.expression) {
          take(n.expression);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
  }
  return out;
}
