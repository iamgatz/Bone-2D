/** OpenRaster (.ora) from Krita, GIMP and MyPaint: the ZIP reader and the layers that come out of it. */
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { createZip, crc32 } from '../src/core/export/zip';
import { isOra, parseXml, pngSize, readOraFile } from '../src/core/import/ora';
import { readZip } from '../src/core/import/zipRead';

const enc = new TextEncoder();
/** Only the header of a PNG is read here: the signature and the size. */
function png(w: number, h: number, mark = 0): Uint8Array {
  const d = new Uint8Array(33);
  d.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(d.buffer).setUint32(16, w);
  new DataView(d.buffer).setUint32(20, h);
  d[32] = mark;
  return d;
}
const buffer = (u: Uint8Array) => u.slice().buffer;

/** A ZIP with one deflated entry, the way other programs write theirs. */
function deflatedZip(name: string, data: Uint8Array, claimed = data.length): Uint8Array {
  const packed = deflateRawSync(data);
  const n = enc.encode(name);
  const local = new DataView(new ArrayBuffer(30));
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(8, 8, true);
  local.setUint16(26, n.length, true);
  const central = new DataView(new ArrayBuffer(46));
  central.setUint32(0, 0x02014b50, true);
  central.setUint16(10, 8, true);
  central.setUint32(16, crc32(data), true);
  central.setUint32(20, packed.length, true);
  central.setUint32(24, claimed, true);
  central.setUint16(28, n.length, true);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, 1, true);
  end.setUint32(16, 30 + n.length + packed.length, true);
  const parts = [new Uint8Array(local.buffer), n, packed, new Uint8Array(central.buffer), n, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('the ZIP reader', () => {
  it('reads stored and deflated entries', async () => {
    const stored = readZip(
      buffer(
        createZip([
          { name: 'a.txt', data: enc.encode('hello') },
          { name: 'dir/ü.bin', data: new Uint8Array([1, 2, 3]) },
        ]),
      ),
    );
    expect([...stored.keys()]).toEqual(['a.txt', 'dir/ü.bin']);
    expect(new TextDecoder().decode(await stored.get('a.txt')!())).toBe('hello');
    expect([...(await stored.get('dir/ü.bin')!())]).toEqual([1, 2, 3]);
    const long = enc.encode('layer '.repeat(5000));
    expect(await readZip(buffer(deflatedZip('x', long))).get('x')!()).toEqual(long);
  });

  it('refuses what is not a ZIP and an entry that lies about its size', async () => {
    expect(() => readZip(buffer(enc.encode('not an archive at all, just text')))).toThrow('not a ZIP');
    expect(() => readZip(new ArrayBuffer(3))).toThrow('not a ZIP');
    const long = enc.encode('a'.repeat(100));
    await expect(readZip(buffer(deflatedZip('x', long, 10))).get('x')!()).rejects.toThrow('longer');
    await expect(readZip(buffer(deflatedZip('x', long, 200))).get('x')!()).rejects.toThrow('shorter');
  });
});

const STACK = `<?xml version='1.0' encoding='UTF-8'?>
<image version="0.0.3" w="200" h="100">
 <stack>
  <layer name="eye &amp; brow" src="data/eye.png" x="120" y="10" opacity="0.5" composite-op="svg:multiply"/>
  <stack name="arm" x="0" y="0" opacity="0.8">
   <layer name="upper" src="data/upper.png" x="20" y="30" composite-op="svg:plus" />
   <layer name="upper" src="data/upper2.png" x="25" y="35"/>
   <layer name="sketch" src="data/upper.png" visibility="hidden"/>
  </stack>
  <!-- a layer nothing is painted on -->
  <layer name="empty" src="data/empty.png"/>
  <layer src='data/body.png'/>
 </stack>
</image>`;

const file = () =>
  buffer(
    createZip([
      { name: 'mimetype', data: enc.encode('image/openraster') },
      { name: 'stack.xml', data: enc.encode(STACK) },
      { name: 'data/eye.png', data: png(10, 8, 1) },
      { name: 'data/upper.png', data: png(40, 20, 2) },
      { name: 'data/upper2.png', data: png(30, 10, 3) },
      { name: 'data/empty.png', data: png(1, 1) },
      { name: 'data/body.png', data: png(60, 90, 4) },
    ]),
  );

describe('reading an OpenRaster file', () => {
  it('gives the layers back to front, with folders, places, opacity and blend modes', async () => {
    const ora = await readOraFile(file());
    expect([ora.width, ora.height]).toEqual([200, 100]);
    expect(ora.layers.map((l) => l.name)).toEqual(['layer 1', 'arm/upper', 'arm/upper 2', 'eye & brow']);
    const [body, second, first, eye] = ora.layers;
    expect(body).toMatchObject({ left: 0, top: 0, width: 60, height: 90, opacity: 1, blend: 'normal' });
    expect(second).toMatchObject({ left: 25, top: 35, width: 30, height: 10, opacity: 0.8 });
    expect(first).toMatchObject({ left: 20, top: 30, blend: 'additive' });
    expect(eye).toMatchObject({ left: 120, top: 10, opacity: 0.5, blend: 'multiply' });
    expect(eye.pixels.png[32]).toBe(1);
    expect(ora.skipped).toEqual({ hidden: 1, empty: 1 });
    // the hidden layer is there with its picture, under a name of its own
    expect(ora.hidden.map((l) => [l.name, l.left, l.top, l.width])).toEqual([['arm/sketch', 0, 0, 40]]);
  });

  it('says what is wrong with a file that is not one', async () => {
    await expect(readOraFile(buffer(createZip([{ name: 'a', data: png(2, 2) }])))).rejects.toThrow('stack.xml');
    await expect(readOraFile(buffer(createZip([{ name: 'stack.xml', data: enc.encode('<oops/>') }])))).rejects.toThrow('no image');
  });

  it('knows its files, the size of a PNG and the shapes of XML', () => {
    expect(isOra({ name: 'hero.ORA' })).toBe(true);
    expect(isOra({ name: 'hero.psd' })).toBe(false);
    expect(pngSize(png(7, 9))).toEqual([7, 9]);
    expect(pngSize(enc.encode('GIF89a, not this one at all'))).toBeNull();
    const x = parseXml('<a b="1 > 0" c=\'&#65;&#x42;&unknown;\'><d/>text<e></e></a></a><f/>');
    expect(x.children.map((n) => n.tag)).toEqual(['a', 'f']);
    expect(x.children[0].attrs).toEqual({ b: '1 > 0', c: 'AB&unknown;' });
    expect(x.children[0].children.map((n) => n.tag)).toEqual(['d', 'e']);
  });
});
