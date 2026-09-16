import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findDuplicateTestTitles,
  formatDuplicateTitleReport,
  parseTestDiscoveryOutput,
} from './check-structure.mjs';

test('accepts unique Playwright test titles from discovery output', () => {
  const discoveryOutput = [
    'Listing tests:',
    '  [chromium] › tests/auth.spec.ts:10:5 › Auth › signs in',
    '  [chromium] › tests/crud.spec.ts:20:5 › CRUD › creates a client',
    '  2 tests found',
  ].join('\n');

  const testCases = parseTestDiscoveryOutput(discoveryOutput);

  assert.deepEqual(testCases, [
    {
      location: '[chromium] › tests/auth.spec.ts:10:5',
      title: 'Auth › signs in',
    },
    {
      location: '[chromium] › tests/crud.spec.ts:20:5',
      title: 'CRUD › creates a client',
    },
  ]);
  assert.deepEqual(findDuplicateTestTitles(testCases), []);
});

test('reports duplicate titles with every source location', () => {
  const discoveryOutput = [
    'Listing tests:',
    '  [chromium] › tests/auth.spec.ts:10:5 › Auth › signs in',
    '  [chromium] › tests/permissions.spec.ts:42:5 › Auth › signs in',
    '  [chromium] › tests/crud.spec.ts:20:5 › CRUD › creates a client',
  ].join('\n');

  const duplicateTitles = findDuplicateTestTitles(
    parseTestDiscoveryOutput(discoveryOutput),
  );

  assert.deepEqual(duplicateTitles, [
    [
      'Auth › signs in',
      [
        '[chromium] › tests/auth.spec.ts:10:5',
        '[chromium] › tests/permissions.spec.ts:42:5',
      ],
    ],
  ]);
  assert.equal(
    formatDuplicateTitleReport(duplicateTitles),
    [
      'Duplicate Playwright test titles found:',
      '  Auth › signs in',
      '    - [chromium] › tests/auth.spec.ts:10:5',
      '    - [chromium] › tests/permissions.spec.ts:42:5',
    ].join('\n'),
  );
});