/** packages/ui/brand/icon.svg as a string, for image generation (OG images, emails). Keep in sync. */
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <linearGradient id="nv-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2A6E52"/>
      <stop offset="1" stop-color="#153A2B"/>
    </linearGradient>
    <linearGradient id="nv-orange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F7A062"/>
      <stop offset="1" stop-color="#EC7A3A"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" rx="48" fill="url(#nv-bg)"/>
  <circle cx="70" cy="58" r="15" fill="#FBF8F2"/>
  <circle cx="130" cy="58" r="15" fill="url(#nv-orange)"/>
  <path d="M70 88 C38 90 40 128 100 158" fill="none" stroke="#FBF8F2" stroke-width="16" stroke-linecap="round"/>
  <path d="M130 88 C162 90 160 128 100 158" fill="none" stroke="url(#nv-orange)" stroke-width="16" stroke-linecap="round"/>
  <rect x="80" y="92" width="40" height="36" rx="6" fill="#FBF8F2"/>
  <line x1="80" y1="104" x2="120" y2="104" stroke="#1E4D3A" stroke-width="3"/>
  <rect x="95" y="92" width="10" height="12" fill="#F28C4E"/>
</svg>`;
