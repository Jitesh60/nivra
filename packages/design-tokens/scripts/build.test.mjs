import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flattenColors, resolveRef, shadowCss, toCss, toDart, toDts } from './build.mjs';

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

const full = {
  ...sample,
  color: { ...sample.color, ink: { 50: '#F6F7F9', 950: '#12151C' } },
  font: { sans: 'X', display: 'Y' },
  semantic: {
    light: { primary: '{brand.500}', surface: '#FFFFFF', danger: '{danger}' },
    dark: { primary: '{ink.50}', surface: '{ink.950}', danger: '#F87171' },
  },
  typeScale: { body: { font: 'sans', size: 15, line: 22, weight: 400, tracking: 0 } },
  shadow: { sm: [{ x: 0, y: 1, blur: 3, spread: 0, color: '#12151C', alpha: 0.08 }] },
  motion: { duration: { fast: 120 }, easing: { standard: [0.2, 0, 0, 1] } },
  size: { control: { md: 44 }, icon: { md: 20 }, border: 1 },
};

test('resolves colour references and refuses unknown ones', () => {
  assert.equal(resolveRef(full, '{brand.500}'), '#1DA482');
  assert.equal(resolveRef(full, '{danger}'), '#DC2626');
  assert.equal(resolveRef(full, '#FFFFFF'), '#FFFFFF');
  assert.throws(() => resolveRef(full, '{brand.999}'));
});

test('emits semantic variables for light and dark, and Tailwind colours for them', () => {
  const css = toCss(full);
  assert.match(css, /:root \{[^}]*--sj-primary: #1DA482;/);
  assert.match(css, /\.dark \{[^}]*--sj-primary: #F6F7F9;/);
  assert.match(css, /--color-sj-primary: var\(--sj-primary\);/);
  assert.match(css, /--sj-control-md: 44px;/);
  assert.match(css, /--text-body: 15px;/);
  assert.match(css, /--text-body--line-height: 22px;/);
  assert.match(css, /--shadow-sm: 0px 1px 3px 0px rgb\(18 21 28 \/ 0\.08\);/);
  assert.match(css, /--ease-standard: cubic-bezier\(0\.2, 0, 0, 1\);/);
});

test('emits the Dart type scale, semantic colours, shadows, motion and sizes', () => {
  const dart = toDart(full);
  assert.match(
    dart,
    /abstract final class SajhaLight \{\n  static const primary = Color\(0xFF1DA482\);/,
  );
  assert.match(
    dart,
    /static const body = TextStyle\(\n    fontFamily: SajhaFonts\.sans,\n    fontSize: 15,/,
  );
  assert.match(dart, /color: Color\(0x1412151C\),/);
  assert.match(dart, /static const fast = Duration\(milliseconds: 120\);/);
  assert.match(dart, /static const double controlMd = 44;/);
  assert.equal(shadowCss(full.shadow.sm), '0px 1px 3px 0px rgb(18 21 28 / 0.08)');
});
