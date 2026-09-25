// Renders the brand SVGs to the PNGs flutter_launcher_icons and
// flutter_native_splash read, and the placeholder photos the store
// screenshots use. Run from the repo root after editing an SVG:
//   node apps/mobile/assets/brand/render.mjs
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(join(here, '../../../api/package.json'))('sharp');

for (const [svg, png, size] of [
  ['nivra-icon.svg', 'icon.png', 1024],
  ['nivra-foreground.svg', 'icon-foreground.png', 1024],
  ['nivra-splash.svg', 'splash.png', 768],
  ['nivra-icon.svg', 'store-icon-512.png', 512],
  // The rounded tile shown inside the app (NivraLogo).
  ['nivra-tile.svg', 'logo-mark.png', 384],
]) {
  await sharp(join(here, svg), { density: 300 }).resize(size, size).png().toFile(join(here, png));
  console.log(`${png} (${size}×${size})`);
}

// Placeholder listing photos for the store screenshots (store/photos).
const photos = join(here, '../../store/photos');
for (const name of ['tent', 'camera', 'drill', 'speaker']) {
  await sharp(join(photos, `${name}.svg`)).resize(800, 600).png().toFile(join(photos, `${name}.png`));
  console.log(`store/photos/${name}.png`);
}
