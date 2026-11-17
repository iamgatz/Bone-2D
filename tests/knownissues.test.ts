/**
 * Differences from the official runtime that the random-session tests found and that are not fixed yet. Each one has its smallest
 * document in tests/fixtures; the test is skipped until the cause is found, and is the first thing to run when someone does.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Project } from '../src/core/model';
import { parityMismatch } from './fuzzkit';

describe('known differences from the official runtime', () => {
  // seed 118 (150 actions): a slider driven by a bone applies the animation that also poses the bones a transform constraint reads
  // and writes; bone "driven" comes out at world rotation 84 degrees here and 12 in the official runtime. Without the slider the two agree.
  it.skip('a bone-driven slider next to a transform constraint (fuzz seed 118)', () => {
    const p = JSON.parse(readFileSync('tests/fixtures/transform-parity.json', 'utf8')) as Project;
    expect(parityMismatch(p)).toBeNull();
  });
});
