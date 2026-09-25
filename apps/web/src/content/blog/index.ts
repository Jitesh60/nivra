import { post as deposits } from './deposits-and-handover-codes';
import { post as lenders } from './lenders-guide';
import { post as trek } from './rent-vs-buy-trek-gear';
import type { Post } from './types';

export type { Block, Post } from './types';

/** Newest first. */
export const POSTS: Post[] = [lenders, deposits, trek].sort((a, b) => b.date.localeCompare(a.date));

export const postBySlug = (slug: string) => POSTS.find((p) => p.slug === slug);

const long = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
export const postDate = (p: Post) => long.format(new Date(`${p.date}T00:00:00Z`));
