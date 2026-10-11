import test from 'node:test';
import assert from 'node:assert/strict';
import { countOpenFindings } from '../assets/js/modules/dashboard.js';

test('dashboard open-findings KPI excludes issues demonstrated by tests', () => {
  assert.equal(countOpenFindings([
    { proven: false },
    { proven: true },
    { kind: 'potencial' },
    { kind: 'demostrado' },
    { proven: false },
  ]), 3);
});

test('dashboard open-findings KPI handles an empty review', () => {
  assert.equal(countOpenFindings([]), 0);
});
