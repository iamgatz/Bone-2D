/**
 * A character is often painted with the other states of a part in hidden layers: a closed eye next to the open one, mouth shapes, a fist.
 * They are found by their names ("mouth" and "mouth open", or "closed" and "open" in a group "mouth") and by lying where the visible
 * layer does, so that the import can put them in its slot as further pictures to switch between. Pure functions.
 */
import { guessPart } from '../autorig';

interface Placed {
  /** The groups of the layer and its own name, joined with "/". */
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Words that say which state a picture shows, not what it shows. */
const STATE = new RegExp(
  '^(?:open|opened|close|closed|shut|half|blink|wink|smile|smiling|laugh|grin|frown|pout|happy|sad|angry|mad|surprised|shock|shocked|' +
    'scared|cry|crying|talk|talking|wide|narrow|neutral|normal|default|idle|alt|fist|grip|point|pointing|relaxed|flat|aa|ee|ih|oh|ou|' +
    'a|e|i|o|u|открыт[а-я]*|закрыт[а-я]*|полуоткрыт[а-я]*|прикрыт[а-я]*|улыб[а-я]*|груст[а-я]*|злой|злая|злые|злость|удивл[а-я]*|' +
    'обычн[а-я]*|кулак|морг[а-я]*|зажмур[а-я]*)$',
);
const HAN_STATE = /张开|睁开|闭合|半开|微笑|默认|普通|正常|张|睁|开|闭|合|半|笑|怒|哀|悲|惊|哭|拳/g;

/** What a layer name speaks of without the state it shows, and whether it spoke of a state. */
export function stateOf(name: string): { base: string; state: boolean } {
  const words = name
    .replace(/([a-zа-яё])([A-ZА-ЯЁ])/g, '$1 $2')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9㐀-鿿]+/g, ' ')
    .replace(/([^0-9 ])(?=[0-9])/g, '$1 ')
    .trim()
    .split(' ');
  const kept = words.flatMap((word) => (STATE.test(word) ? [] : word.replace(HAN_STATE, '') || []));
  // numbers count the states of a face or a hand ("mouth 2"); elsewhere they tell different things apart ("rock 2")
  const { part } = guessPart(kept.filter((w) => !/^[0-9]+$/.test(w)).join(' '));
  const numbered = (part === 'face' || part === 'hand') && !kept.includes('copy');
  const base = (numbered ? kept.filter((w) => !/^[0-9]+$/.test(w)) : kept).join(' ');
  return { base, state: base !== words.join(' ') };
}

const shared = (a: Placed, b: Placed) =>
  Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));

/** For the visible layers that have other states among the hidden ones: those, in the order of the file. */
export function findAlternates<L extends Placed>(visible: readonly L[], hidden: readonly L[]): Map<L, L[]> {
  const seen = visible.map((layer) => ({ layer, ...stateOf(layer.name) }));
  const owner = new Map<L, L>();
  for (const other of hidden) {
    const own = stateOf(other.name);
    let most = 0;
    for (const v of seen) {
      if (!own.base || v.base !== own.base || !(own.state || v.state)) continue;
      const area = shared(v.layer, other);
      if (area > most) {
        most = area;
        owner.set(other, v.layer);
      }
    }
  }
  return new Map(
    visible.flatMap((v) => {
      const list = hidden.filter((h) => owner.get(h) === v);
      return list.length ? [[v, list] as const] : [];
    }),
  );
}
