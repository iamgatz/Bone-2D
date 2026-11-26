/**
 * OpenRaster files (.ora), the layered format Krita, GIMP and MyPaint save: a ZIP with `stack.xml` and a PNG per layer. It is read into
 * the same shape a Photoshop file is (`psd.ts`), so the import and "update from file" treat both alike: groups are folders, hidden
 * layers are left out, opacity and the blend modes Spine has are kept. The PNG of a layer is used as it is, not drawn again.
 */
import { pictureName } from './psd';
import type { PsdFile, PsdLayer } from './psd';
import type { BlendMode } from '../model';
import { readZip } from './zipRead';

export interface PngPicture {
  width: number;
  height: number;
  png: Uint8Array;
}

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) =>
  s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (all, e: string) => {
    if (e[0] !== '#') return ENTITIES[e] ?? all;
    const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });

/** The elements and attributes of an XML text (all `stack.xml` is made of); texts, comments and declarations are passed over. */
export function parseXml(text: string): XmlNode {
  const root: XmlNode = { tag: '', attrs: {}, children: [] };
  const open: XmlNode[] = [root];
  const tags = /<!--[\s\S]*?-->|<[?!][^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  for (const m of text.matchAll(tags)) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (closing) {
      if (open.length > 1) open.pop();
      continue;
    }
    if (!tag) continue;
    const node: XmlNode = { tag, attrs: {}, children: [] };
    for (const a of attrs.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) node.attrs[a[1]] = unescapeXml(a[2] ?? a[3]);
    open[open.length - 1].children.push(node);
    if (!selfClosing) open.push(node);
  }
  return root;
}

function blendOfOra(op: string | undefined): BlendMode {
  switch (op) {
    case 'svg:multiply':
      return 'multiply';
    case 'svg:screen':
      return 'screen';
    case 'svg:plus':
      return 'additive';
    default:
      return 'normal';
  }
}

/** Width and height from the header of a PNG, null when the bytes are not one. */
export function pngSize(data: Uint8Array): [number, number] | null {
  if (data.length < 24 || data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4e || data[3] !== 0x47) return null;
  const view = new DataView(data.buffer, data.byteOffset);
  return [view.getUint32(16), view.getUint32(20)];
}

const number = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v === undefined || !Number.isFinite(n) ? fallback : n;
};

export async function readOraFile(buffer: ArrayBuffer): Promise<PsdFile<PngPicture>> {
  const zip = readZip(buffer);
  const stack = zip.get('stack.xml');
  if (!stack) throw new Error('no stack.xml: not an OpenRaster file');
  const image = parseXml(new TextDecoder().decode(await stack())).children.find((n) => n.tag === 'image');
  if (!image) throw new Error('stack.xml has no image');
  const layers: PsdLayer<PngPicture>[] = [];
  const skipped = { hidden: 0, empty: 0 };
  let unnamed = 0;
  const walk = async (node: XmlNode, path: string[], hidden: boolean, opacity: number, dx: number, dy: number) => {
    // the file lists the top layer first; the pictures are wanted back to front
    for (const child of [...node.children].reverse()) {
      if (child.tag !== 'stack' && child.tag !== 'layer') continue;
      const a = child.attrs;
      const isHidden = hidden || a.visibility === 'hidden';
      const alpha = opacity * Math.min(1, Math.max(0, number(a.opacity, 1)));
      const x = dx + number(a.x, 0);
      const y = dy + number(a.y, 0);
      if (child.tag === 'stack') {
        const folder = a.name === undefined ? path : [...path, pictureName(a.name, `group ${++unnamed}`)];
        await walk(child, folder, isHidden, alpha, x, y);
        continue;
      }
      const name = [...path, pictureName(a.name, `layer ${++unnamed}`)].join('/');
      if (isHidden) {
        skipped.hidden++;
        continue;
      }
      const entry = zip.get(a.src ?? '');
      const png = entry ? await entry() : null;
      const size = png && pngSize(png);
      // programs write a layer with nothing on it as a single clear pixel
      if (!png || !size || size[0] * size[1] <= 1) {
        skipped.empty++;
        continue;
      }
      layers.push({
        name,
        left: x,
        top: y,
        width: size[0],
        height: size[1],
        opacity: alpha,
        blend: blendOfOra(a['composite-op']),
        pixels: { width: size[0], height: size[1], png },
      });
    }
  };
  for (const root of image.children.filter((n) => n.tag === 'stack')) await walk(root, [], false, 1, 0, 0);
  // two layers of one name would give one picture: the later ones get a number
  const taken = new Set<string>();
  for (const layer of layers) {
    let name = layer.name;
    for (let i = 2; taken.has(name); i++) name = `${layer.name} ${i}`;
    taken.add(name);
    layer.name = name;
  }
  return { width: number(image.attrs.w, 0), height: number(image.attrs.h, 0), layers, skipped };
}

export function isOra(file: { name: string; type?: string }): boolean {
  return /\.ora$/i.test(file.name) || file.type === 'image/openraster';
}
