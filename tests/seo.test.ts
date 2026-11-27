/** What search engines and link previews read from the page: it has to be there, agree with itself and point at files that exist. */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SITE = 'https://iamgatz.github.io/Bone-2D/';
const html = readFileSync('index.html', 'utf8');
const meta = (key: string): string | undefined => new RegExp(`<meta\\s+(?:name|property)="${key}"\\s+content="([^"]*)"`).exec(html)?.[1];

describe('the page describes itself', () => {
  it('has a title and a description of a length search results show', () => {
    const title = /<title>([^<]+)<\/title>/.exec(html)![1];
    expect(title.length).toBeLessThanOrEqual(70);
    const description = meta('description')!;
    expect(description.length).toBeGreaterThan(70);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(html).toContain(`<link rel="canonical" href="${SITE}" />`);
  });

  it('keeps the tag Google Search Console verifies the site by', () => {
    expect(meta('google-site-verification')).toBeTruthy();
  });

  it('keeps the same English title once the app has started', () => {
    const title = /<title>([^<]+)<\/title>/.exec(html)![1];
    expect(readFileSync('src/i18n/index.ts', 'utf8')).toContain(`en: '${title}'`);
  });

  it('has a link card whose picture is published with the site', () => {
    for (const key of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:card']) expect(meta(key), key).toBeTruthy();
    const image = meta('og:image')!;
    expect(image.startsWith(SITE)).toBe(true);
    const file = `public/${image.slice(SITE.length)}`;
    expect(existsSync(file)).toBe(true);
    const bytes = readFileSync(file);
    expect(bytes.length).toBeLessThan(300_000); // some messengers drop heavier pictures
    // the size in the start-of-frame marker of the JPEG
    let at = 2;
    while (bytes[at + 1] < 0xc0 || bytes[at + 1] > 0xc2) at += 2 + bytes.readUInt16BE(at + 2);
    expect([bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)]).toEqual([
      Number(meta('og:image:width')),
      Number(meta('og:image:height')),
    ]);
  });

  it('has structured data that parses', () => {
    const json = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1];
    const data = JSON.parse(json) as { '@type': string; url: string; offers: { price: string } };
    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.url).toBe(SITE);
    expect(data.offers.price).toBe('0');
  });
});
