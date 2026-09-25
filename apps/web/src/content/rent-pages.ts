/** Landing pages for the launch categories: /rent/<slug>. */
export interface RentPage {
  slug: string;
  name: string;
  emoji: string;
  title: string;
  intro: string;
  examples: { item: string; perDay: string }[];
  faqs: { q: string; a: string }[];
}

export const RENT_PAGES: RentPage[] = [
  {
    slug: 'trekking-gear',
    name: 'Trekking gear',
    emoji: '🥾',
    title: 'Rent trekking gear in Pune',
    intro:
      'Tents, sleeping bags, poles and rucksacks from trekkers near you, for the weekend you actually need them.',
    examples: [
      { item: 'Two-person tent', perDay: '₹120–200' },
      { item: 'Sleeping bag (5 °C)', perDay: '₹80–120' },
      { item: 'Trekking poles (pair)', perDay: '₹50–80' },
      { item: '50 L rucksack', perDay: '₹100–150' },
    ],
    faqs: [
      {
        q: 'Can I pick up the gear the evening before my trek?',
        a: 'Yes. Handover can happen from the day before your rental starts, so book from the day you leave and arrange an evening pickup with the lender.',
      },
      {
        q: 'What if it rains and the tent comes back wet?',
        a: 'That’s normal in the monsoon. Dry it if you can and tell the lender in the chat. Damage is different: that’s what the deposit and condition photos are for.',
      },
    ],
  },
  {
    slug: 'cameras',
    name: 'Cameras & lenses',
    emoji: '📷',
    title: 'Rent cameras and lenses in Pune',
    intro:
      'DSLRs, mirrorless bodies, lenses and GoPros for a wedding, a trip or a shoot, from photographers near you.',
    examples: [
      { item: 'Entry DSLR with kit lens', perDay: '₹400–600' },
      { item: 'Mirrorless body', perDay: '₹900–1,500' },
      { item: '50 mm prime lens', perDay: '₹200–350' },
      { item: 'GoPro with mounts', perDay: '₹300–500' },
    ],
    faqs: [
      {
        q: 'Do lenders ask for ID for cameras?',
        a: 'Often, yes. A lender can ask you to share a government or college ID for the booking. They see it only for that rental, and the copy is deleted 30 days after it ends.',
      },
      {
        q: 'How big is the deposit?',
        a: 'The lender sets it, usually a third to half of the camera’s value. It’s refunded after the rental unless there’s a problem.',
      },
    ],
  },
  {
    slug: 'tools',
    name: 'Tools',
    emoji: '🛠️',
    title: 'Rent tools in Pune',
    intro:
      'Drills, ladders and pressure washers for the one job you need them for, from neighbours who own them.',
    examples: [
      { item: 'Hammer drill with bits', perDay: '₹100–150' },
      { item: '8 ft aluminium ladder', perDay: '₹80–120' },
      { item: 'Pressure washer', perDay: '₹250–400' },
      { item: 'Tile cutter', perDay: '₹150–250' },
    ],
    faqs: [
      {
        q: 'Are drill bits included?',
        a: 'Check the listing: lenders list what’s included and show it in the photos. Ask in the chat if you need a specific size.',
      },
      {
        q: 'Can I rent for just one day?',
        a: 'Yes, most tools can be rented for a single day. Some lenders set a minimum; it’s shown on the listing.',
      },
    ],
  },
  {
    slug: 'party-gear',
    name: 'Party gear',
    emoji: '🎉',
    title: 'Rent party gear in Pune',
    intro:
      'Speakers, lights, projectors and décor for a birthday or a house party, from people nearby.',
    examples: [
      { item: 'Bluetooth party speaker', perDay: '₹250–400' },
      { item: 'Projector with screen', perDay: '₹400–700' },
      { item: 'Fairy and stage lights', perDay: '₹100–200' },
      { item: 'Karaoke microphones', perDay: '₹150–250' },
    ],
    faqs: [
      {
        q: 'What if the party runs past midnight?',
        a: 'Items are due back by midnight on your last rental day. If you need it longer, book the next day too; a late return costs a day’s rent from the deposit.',
      },
      {
        q: 'Can I pay in cash?',
        a: 'No. Payments go through Sajha so your deposit is protected and the lender is paid after the item is back.',
      },
    ],
  },
];

export const rentPageBySlug = (slug: string) => RENT_PAGES.find((p) => p.slug === slug);
