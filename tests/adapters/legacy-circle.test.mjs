import assert from 'node:assert/strict';
import test from 'node:test';
import { drawLegacyCircle, legacyCircleRadius } from '../../src/adapters/outbound/browser/legacy-circle.ts';

test('circle radius preserves the original responsive breakpoints in both orientations', () => {
  for (const [size, divisor] of [[320,3],[639,3],[640,4],[767,4],[768,5],[1023,5],[1024,7],[1279,7],[1280,10],[1920,10]]) {
    assert.equal(legacyCircleRadius(size, 200), size / divisor);
    assert.equal(legacyCircleRadius(200, size), size / divisor);
  }
});

test('circle has an empty center and a smaller lower half-disc separated from its ring', () => {
  const arcs = [], fills = []; let current = [];
  const context = {
    save() {}, restore() {}, beginPath() { current = []; }, moveTo() {}, closePath() {},
    arc(...args) { arcs.push(args); current.push(args); },
    fill(rule) { fills.push({ rule, arcs: [...current], opacity: this.globalAlpha, color: this.fillStyle }); },
  };
  drawLegacyCircle(context, 1120, 360);
  const radius = 1120 / 7;
  assert.deepEqual(arcs[0], [560,180,radius * 1.5,0,Math.PI * 2]);
  assert.deepEqual(arcs[1], [560,180,radius * 0.5,0,Math.PI * 2,true]);
  assert.equal(fills[0].rule, 'evenodd'); assert.equal(fills[0].arcs.length, 2);
  assert.deepEqual(arcs[2], [560,180,radius * 0.45,0,Math.PI]);
  assert.ok(arcs[2][2] < arcs[1][2], 'the half-disc does not touch the ring');
  assert.ok(fills.every(fill => fill.opacity === 0.17 && fill.color === 'black'));
});
