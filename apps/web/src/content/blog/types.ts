/** A blog post body is a list of simple blocks, rendered by the post page. */
export type Block = { h2: string } | { p: string } | { ul: string[] } | { tip: string };

export interface Post {
  slug: string;
  title: string;
  /** Used for the meta description, the card and the RSS item (≤ 160 chars). */
  description: string;
  /** YYYY-MM-DD */
  date: string;
  author: string;
  minutes: number;
  body: Block[];
}
