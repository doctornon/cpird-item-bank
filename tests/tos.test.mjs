import test from 'node:test';
import assert from 'node:assert/strict';
import { scaledTargets, TOS, ICD_SYSTEMS } from '../lib/tos.mjs';

test('scaledTargets at full size = base spec (factor 1)', () => {
  const s = scaledTargets('2567', 300);
  assert.equal(s.N, 300);
  assert.equal(s.factor, 1);
  assert.equal(s.category1.target, 30);
  assert.equal(s.group1.target, 50);
  assert.equal(s.systems.length, 19);
  const sys1 = s.systems.find(x => x.code === 1); // 2567 code1 = [12,4]
  assert.equal(sys1.g2, 12); assert.equal(sys1.g3, 4); assert.equal(sys1.target, 16);
});

test('scaledTargets scales proportionally to a smaller N', () => {
  const s = scaledTargets('2567', 150);
  assert.equal(s.N, 150);
  assert.equal(s.factor, 0.5);
  assert.equal(s.category1.target, 15); // round(30*0.5)
  assert.equal(s.group1.target, 25);    // round(50*0.5)
});

test('scaledTargets defaults N to the spec total when targetCount is invalid', () => {
  assert.equal(scaledTargets('2569', 0).N, 250);
  assert.equal(scaledTargets('2569', -5).N, 250);
  assert.equal(scaledTargets('2569').N, 250);
});

test('scaledTargets returns null for an unknown spec version', () => {
  assert.equal(scaledTargets('2999', 100), null);
});

test('diseaseTotal equals the sum of per-system targets', () => {
  const s = scaledTargets('2569', 250);
  const sum = s.systems.reduce((a, x) => a + x.target, 0);
  assert.equal(s.diseaseTotal, sum);
});

test('both official specs are present and well-formed', () => {
  for (const v of ['2567', '2569']) {
    assert.ok(TOS[v].total > 0);
    assert.equal(Object.keys(TOS[v].systems).length, ICD_SYSTEMS.length);
  }
});
