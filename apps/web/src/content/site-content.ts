/** Copy used across the marketing pages. */

export const categories = [
  { emoji: '🥾', name: 'Trekking & outdoor', example: 'Shoes, tents, sleeping bags, poles' },
  { emoji: '📷', name: 'Cameras & electronics', example: 'DSLRs, lenses, GoPros, projectors' },
  { emoji: '🛠️', name: 'Tools & DIY', example: 'Drills, ladders, pressure washers' },
  { emoji: '🏏', name: 'Sports & fitness', example: 'Cricket kits, cycles, rackets' },
  { emoji: '🎉', name: 'Party & events', example: 'Speakers, lights, décor' },
  { emoji: '🧳', name: 'Travel', example: 'Suitcases, backpacks, car racks' },
  { emoji: '📚', name: 'Books & study', example: 'Exam guides, calculators, instruments' },
  { emoji: '🍼', name: 'Baby & kids', example: 'Strollers, car seats, toys' },
  { emoji: '👗', name: 'Costumes & ethnic wear', example: 'Lehengas, sherwanis, fancy dress' },
] as const;

export const borrowerSteps = [
  {
    title: 'Find it nearby',
    body: 'Search by what you need, where you are and the dates you need it.',
  },
  {
    title: 'Chat and agree',
    body: 'Ask questions, agree on the price and dates, and share any documents the lender asks for.',
  },
  {
    title: 'Pay safely',
    body: 'Pay the rent and a refundable deposit in the app with UPI or card.',
  },
  {
    title: 'Pick up, use, return',
    body: 'Meet, confirm the handover with a code, return on time and get your deposit back.',
  },
] as const;

export const lenderSteps = [
  {
    title: 'List in minutes',
    body: 'Add photos, set a price per day, a refundable deposit and when it’s available.',
  },
  {
    title: 'Choose who borrows',
    body: 'See verified profiles and reviews, ask for an ID if you want, then accept or decline.',
  },
  {
    title: 'Hand it over',
    body: 'Meet the borrower, confirm the handover with a code, and note the condition with photos.',
  },
  {
    title: 'Get paid',
    body: 'When the item comes back, your earnings are paid to your bank account.',
  },
] as const;

export const trustPoints = [
  {
    title: 'Verified people',
    body: 'Every member verifies their phone and email. Lenders can also ask for a government or college ID.',
  },
  {
    title: 'Refundable deposits',
    body: 'Borrowers pay a deposit set by the lender. It comes back in full when the item is returned as it was.',
  },
  {
    title: 'Photos at handover and return',
    body: 'Both sides record the item’s condition, so there’s proof if something goes wrong.',
  },
  {
    title: 'Documents stay private',
    body: 'IDs are shared only with that lender, only for that booking, and deleted afterwards.',
  },
  { title: 'Reviews both ways', body: 'Lenders and borrowers rate each other after every rental.' },
  {
    title: 'Help when you need it',
    body: 'If there’s a problem, our team reviews the evidence and decides on the deposit.',
  },
] as const;

export const faqs = [
  {
    q: 'What is Sajha?',
    a: 'Sajha (साझा, “shared”) is a marketplace where people rent out things they rarely use, and others rent them for a few days instead of buying.',
  },
  {
    q: 'How much does it cost to borrow?',
    a: 'The lender sets a price per day. You pay the rent plus a refundable security deposit. The deposit comes back when you return the item in the same condition.',
  },
  {
    q: 'How much does Sajha charge lenders?',
    a: 'We plan to keep 10% of the rent as a platform fee. Listing is free, and you only pay when you earn.',
  },
  {
    q: 'What if the item gets damaged?',
    a: 'Both sides take condition photos at handover and return. If the lender reports damage within 24 hours, our team reviews the photos and can use some or all of the deposit to cover it.',
  },
  {
    q: 'Why would a lender ask for my ID?',
    a: 'For valuable items, a lender may ask to see a government or college ID before accepting. It’s shared only with that lender, only for that booking, and deleted after the rental.',
  },
  {
    q: 'How do pickup and return work?',
    a: 'You meet the lender at an agreed place. A code in the app confirms the handover and the return, so both sides have a record.',
  },
  {
    q: 'Where is Sajha available?',
    a: 'We’re launching in India, one city at a time. Join the waitlist and tell us your city, and we’ll let you know when we arrive.',
  },
  {
    q: 'What can’t be listed?',
    a: 'Weapons, drugs, alcohol, medicines, vehicles that need registration, animals, counterfeit or stolen goods, adult content and hazardous materials.',
  },
] as const;
