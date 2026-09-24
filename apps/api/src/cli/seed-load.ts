/**
 * Fills a throwaway database for load tests (infra/load): lenders with live
 * listings spread over Pune, across every category, with varied titles so
 * search has something to rank. Never run it against a real database.
 *
 *   DATABASE_URL=postgresql://…/sajha_load pnpm --filter @sajha/api seed:load -- --listings 2000
 */
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../generated/prisma/client.js';

loadEnv({ quiet: true });

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    listings: { type: 'string', default: '2000' },
    lenders: { type: 'string', default: '50' },
  },
});

const THINGS = [
  ['Quechua 2-person tent', 'Waterproof, pegs and bag included.'],
  ['Canon EOS 200D camera', 'With 18-55 mm lens, two batteries and charger.'],
  ['Bosch drill machine', 'Hammer drill with a set of bits.'],
  ['Trekking poles (pair)', 'Adjustable aluminium poles.'],
  ['PS5 with two controllers', 'Comes with three games.'],
  ['Projector 1080p', 'HDMI, with a 100-inch screen.'],
  ['Sleeping bag −5°C', 'Mummy style, compression sack.'],
  ['Party speaker', 'Bluetooth, 8 hours of battery.'],
  ['Ladder 8 ft', 'Aluminium, folds flat.'],
  ['Wedding sherwani (M)', 'Cream, worn once.'],
] as const;
const AREAS = [
  'Kothrud',
  'Baner',
  'Aundh',
  'Wakad',
  'Hinjewadi',
  'Viman Nagar',
  'Hadapsar',
  'Kharadi',
];

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL ?? '';
  if (!/load|test/i.test(url)) {
    console.error('Refusing: DATABASE_URL must point at a load or test database.');
    return 1;
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const categories = await prisma.category.findMany({ where: { isActive: true } });
    const listings = Number(values.listings);
    const lenders = Number(values.lenders);
    const run = Date.now() % 1_000_000;
    const lenderIds: string[] = [];
    for (let i = 0; i < lenders; i++) {
      const u = await prisma.user.create({
        data: {
          phone: `+917${String(run).padStart(6, '0')}${String(i).padStart(3, '0')}`,
          phoneVerifiedAt: new Date(),
          email: `lender-${run}-${i}@load.sajha.test`,
          emailVerifiedAt: new Date(),
          name: `Load Lender ${i}`,
        },
      });
      lenderIds.push(u.id);
    }
    for (let i = 0; i < listings; i++) {
      const [title, description] = THINGS[i % THINGS.length]!;
      const area = AREAS[i % AREAS.length]!;
      await prisma.listing.create({
        data: {
          lenderId: lenderIds[i % lenders]!,
          categoryId: categories[i % categories.length]!.id,
          title: `${title} #${i}`,
          description: `${description} Pickup in ${area}.`,
          condition: 'GOOD',
          pricePerDayPaise: 10_000 + (i % 40) * 2_500,
          depositPaise: 50_000 + (i % 10) * 25_000,
          minDays: 1,
          maxDays: 30,
          advanceNoticeDays: 0,
          // About 12 km across the city.
          lat: 18.46 + ((i * 37) % 100) / 1000,
          lng: 73.76 + ((i * 53) % 150) / 1000,
          areaLabel: `${area}, Pune`,
          status: 'LIVE',
          publishedAt: new Date(),
        },
      });
    }
    console.log(`Seeded ${lenders} lenders and ${listings} live listings.`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

process.exitCode = await main();
