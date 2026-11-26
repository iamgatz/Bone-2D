/** Hidden layers that are other states of a visible one (a closed eye, an open mouth) are found by their names and places. */
import { describe, expect, it } from 'vitest';
import { findAlternates, stateOf } from '@/core/import/alternates';

const at = (name: string, left = 0, top = 0, width = 20, height = 10) => ({ name, left, top, width, height });
const pairs = (visible: ReturnType<typeof at>[], hidden: ReturnType<typeof at>[]) =>
  [...findAlternates(visible, hidden)].map(([v, list]) => [v.name, list.map((h) => h.name)]);

describe('the state a layer name speaks of', () => {
  it.each([
    ['mouth open', 'mouth', true],
    ['MouthClosed', 'mouth', true],
    ['face/mouth/smile', 'face mouth', true],
    ['mouth 2', 'mouth', true],
    ['eye_l half', 'eye l', true],
    ['hand-r fist', 'hand r', true],
    ['mouth', 'mouth', false],
    ['рот открытый', 'рот', true],
    ['Глаз_л закрыт', 'глаз л', true],
    ['嘴张开', '嘴', true],
    ['左眼闭', '左眼', true],
    ['sword 2', 'sword 2', false],
    ['mouth copy', 'mouth copy', false],
  ])('%s', (name, base, state) => {
    expect(stateOf(name)).toEqual({ base, state });
  });
});

describe('alternate pictures of a layered file', () => {
  it('gives each visible layer the hidden states of it that lie where it does', () => {
    expect(
      pairs(
        [at('head', 0, 0, 100, 100), at('eye l closed', 20, 30), at('mouth', 40, 70)],
        [at('eye l open', 21, 29), at('eye l half', 20, 30), at('mouth open', 40, 68, 22, 18), at('mouth smile', 38, 70)],
      ),
    ).toEqual([
      ['eye l closed', ['eye l open', 'eye l half']],
      ['mouth', ['mouth open', 'mouth smile']],
    ]);
  });

  it('takes the layers of a group named after the thing', () => {
    expect(pairs([at('face/mouth/closed')], [at('face/mouth/open'), at('face/mouth/a')])).toEqual([
      ['face/mouth/closed', ['face/mouth/open', 'face/mouth/a']],
    ]);
  });

  it('keeps the two sides apart, and gives a state to the one it overlaps most', () => {
    expect(pairs([at('eye l', 0), at('eye r', 60)], [at('eye r closed', 60), at('eye l closed', 0)])).toEqual([
      ['eye l', ['eye l closed']],
      ['eye r', ['eye r closed']],
    ]);
    expect(pairs([at('hand/open', 0), at('hand/point', 15)], [at('hand/fist', 14)])).toEqual([['hand/point', ['hand/fist']]]);
  });

  it.each([
    ['a sketch of another name', at('torso'), at('torso sketch')],
    ['a backup copy', at('mouth'), at('mouth copy')],
    ['a state far away', at('mouth open', 0), at('mouth closed', 500)],
    ['two layers without names of their own', at('layer 1'), at('layer 2')],
    ['the same picture twice', at('torso'), at('torso')],
    ['another thing in the same state', at('eye closed'), at('mouth closed')],
    ['a state with nothing to say what of', at('open'), at('closed')],
    ['a numbered thing that is no part of a face or a hand', at('rock 1'), at('rock 2')],
  ])('leaves out %s', (_, visible, hidden) => {
    expect(pairs([visible], [hidden])).toEqual([]);
  });
});
