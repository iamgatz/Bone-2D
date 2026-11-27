/**
 * A small DragonBones skeleton, written by hand, with what the importer has to get right: bones listed before their parents, skew,
 * flags written as words, a bone that does not turn with its parent, two bone IK, a pivot, a slanted picture, a plain and a weighted
 * mesh, and keys of every kind.
 */
export function dragonSkeleton() {
  return {
    name: 'fixture',
    version: '5.5',
    frameRate: 24,
    armature: [
      {
        name: 'hero',
        type: 'Armature',
        frameRate: 24,
        bone: [
          { name: 'hand', parent: 'arm', length: 15, transform: { x: 40, skX: 20, skY: 20 } },
          { name: 'root' },
          { name: 'arm', parent: 'root', length: 40, transform: { x: 10, y: -30, skX: 30, skY: 40, scX: 1.2, scY: 0.8 } },
          { name: 'neck', parent: 'root', transform: { x: -30, y: -50, skX: -55, skY: -55 } },
          { name: 'tail', parent: 'neck', inheritRotation: false, transform: { x: -20, skX: 15, skY: 15 } },
          { name: 'leg', parent: 'root', length: 30, transform: { y: 10, skX: 80, skY: 80 } },
          { name: 'shin', parent: 'leg', length: 30, inheritScale: 'false', transform: { x: 30, skX: 20, skY: 20 } },
          { name: 'foot', parent: 'root', transform: { x: 14, y: 58 } },
        ],
        ik: [{ name: 'leg', bone: 'shin', target: 'foot', chain: 1, bendPositive: 'false' }],
        slot: [
          { name: 'body', parent: 'root' },
          { name: 'glove', parent: 'hand', color: { rM: 80, aM: 60 } },
          { name: 'flag', parent: 'arm', blendMode: 'add' },
          { name: 'mark', parent: 'tail' },
          { name: 'zone', parent: 'root' },
        ],
        skin: [
          {
            name: '',
            slot: [
              {
                name: 'body',
                display: [
                  { name: 'body', pivot: { x: 0.25, y: 0.75 }, transform: { x: 5, y: -5, skX: 10, skY: 10, scX: 1.5 } },
                  { name: 'parts/body2' },
                ],
              },
              {
                name: 'glove',
                display: [
                  {
                    name: 'glove',
                    type: 'mesh',
                    vertices: [-10, -8, 12, -8, 12, 9, -10, 9],
                    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
                    triangles: [0, 1, 2, 0, 2, 3],
                    slotPose: [1, 0, 0, 1, 55, -2],
                    bonePose: [2, 0.766, 0.643, -0.4, 0.693, 10, -30, 0, 0.5, 0.866, -0.866, 0.5, 40, -4],
                    weights: [1, 2, 1, 2, 2, 0.5, 0, 0.5, 2, 2, 0.1, 0, 0.9, 2, 2, 0.75, 0, 0.25],
                  },
                ],
              },
              {
                name: 'flag',
                display: [
                  {
                    name: 'flag',
                    type: 'mesh',
                    transform: { x: 2, y: 3, skX: 25, skY: 25 },
                    vertices: [0, 0, 20, 0, 20, 12, 0, 12],
                    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
                    triangles: [0, 1, 2, 0, 2, 3],
                  },
                ],
              },
              { name: 'mark', display: [{ name: 'slant', transform: { x: 6, y: 4, skX: 35, skY: 5, scY: 1.4 } }] },
              { name: 'zone', display: [{ name: 'zone', type: 'boundingBox', subType: 'rectangle', width: 20, height: 10 }] },
            ],
          },
        ],
        animation: [
          {
            name: 'go',
            duration: 12,
            playTimes: 0,
            frame: [{ duration: 5 }, { duration: 7, events: [{ name: 'step', ints: [3], strings: ['a'] }] }],
            zOrder: { frame: [{ duration: 6 }, { duration: 6, zOrder: [0, 2] }] },
            bone: [
              {
                name: 'arm',
                translateFrame: [
                  { duration: 4, tweenEasing: 0 },
                  { duration: 4, tweenEasing: -0.5, x: 20, y: 10 },
                  { duration: 4, tweenEasing: 1, x: -5 },
                ],
                rotateFrame: [
                  { duration: 6, tweenEasing: 0, rotate: 150 },
                  { duration: 6, tweenEasing: 0, rotate: -170, skew: 10 },
                  { duration: 0, rotate: 0 },
                ],
                scaleFrame: [
                  { duration: 12, curve: [0.5, 0, 0.5, 1] },
                  { duration: 0, x: 1.5, y: 0.5 },
                ],
              },
              {
                name: 'hand',
                rotateFrame: [
                  { duration: 6, tweenEasing: 0, clockwise: 1 },
                  { duration: 6, tweenEasing: 0, rotate: 90 },
                  { duration: 0, rotate: 90 },
                ],
              },
              {
                name: 'foot',
                translateFrame: [
                  { duration: 12, tweenEasing: 0 },
                  { duration: 0, x: 18, y: -14 },
                ],
              },
            ],
            slot: [
              {
                name: 'body',
                displayFrame: [{ duration: 6 }, { duration: 6, value: 1 }],
                colorFrame: [
                  { duration: 12, tweenEasing: 0, value: { aM: 50 } },
                  { duration: 0, value: { rM: 20 } },
                ],
              },
              { name: 'flag', displayFrame: [{ duration: 9 }, { duration: 3, value: -1 }] },
            ],
            ffd: [
              {
                skin: '',
                slot: 'glove',
                name: 'glove',
                frame: [
                  { duration: 12, tweenEasing: 0 },
                  { duration: 0, offset: 2, vertices: [5, 3, -4, 2] },
                ],
              },
              {
                slot: 'flag',
                name: 'flag',
                frame: [
                  { duration: 12, tweenEasing: 0, vertices: [0, 0, 3, -2] },
                  { duration: 0, offset: 4, vertices: [6, 5] },
                ],
              },
            ],
            ik: [
              {
                name: 'leg',
                frame: [
                  { duration: 12, tweenEasing: 0, bendPositive: false },
                  { duration: 0, bendPositive: false },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export const DRAGON_PICTURES = new Map([
  ['body', { width: 40, height: 30 }],
  ['parts/body2', { width: 24, height: 24 }],
  ['glove', { width: 22, height: 17 }],
  ['flag', { width: 20, height: 12 }],
  ['slant', { width: 10, height: 8 }],
]);
