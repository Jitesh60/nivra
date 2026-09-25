import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge that knows the Sajha type scale, so `text-button` is merged as
 * a font size and not mistaken for a colour (which would drop `text-white`).
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display',
            'h1',
            'h2',
            'h3',
            'title',
            'body',
            'small',
            'caption',
            'button',
            'mono',
          ],
        },
      ],
      shadow: [{ shadow: ['glow'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
