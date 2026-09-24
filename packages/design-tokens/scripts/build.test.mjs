import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flattenColors, toCss, toDart, toDts } from './build.mjs';

const sample = {
  color: { brand: { 500: '#1DA482' }, danger: '#DC2626' },
  font: { sans: 'X' },
  radius: { md: 10 },
  spacing: { md: 16, '2xl': 48 },
};

test('flattens nested colour scales', () => {
  assert.deepEqual(flattenColors(sample.color), [
    ['brand-500', '#1DA482'],
    ['danger', '#DC2626'],
  ]);
});

test('emits a Tailwind v4 @theme block', () => {
  const css = toCss(sample);
  assert.match(css, /@theme \{/);
  assert.match(css, /--color-brand-500: #1DA482;/);
  assert.match(css, /--radius-md: 10px;/);
});

test('emits valid Dart identifiers', () => {
  const dart = toDart(sample);
  assert.match(dart, /static const brand500 = Color\(0xFF1DA482\);/);
  assert.match(dart, /static const double x2xl = 48;/);
});

test('emits a typed declaration', () => {
  assert.match(toDts(sample), /readonly "500": string;/);
  assert.match(toDts(sample), /readonly "md": number;/);
});
