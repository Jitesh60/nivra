# Nivra design system

One look for the website, the admin panel and the app. Every value here comes from **`packages/design-tokens/src/tokens.json`**. Change it there, run `pnpm tokens`, and all three apps pick it up:
- Web and admin get Tailwind utilities and CSS variables (`@sajha/design-tokens/theme.css`).
- The app gets `apps/mobile/lib/core/theme/tokens.g.dart`.

Where the components live:

| App | Components |
|---|---|
| Web + admin | **`packages/ui`** (`@sajha/ui`): React + Tailwind |
| Mobile | `apps/mobile/lib/shared/widgets/` plus the Material theme in `app_theme.dart` |

A component looks and measures the same on every platform. When you change one, change all three.

## 1. Principles

- **Calm, bright, trustworthy.** White surfaces, one strong green for actions, orange only for small highlights (a price, a badge, the gradient's warm end).
- **One primary action per screen.** It gets the `primary` button, or `glow` on marketing and hero screens. Everything else is secondary, outline or ghost.
- **Effects are accents, not wallpaper.** Shaders and animated borders appear on first impressions: the website hero, admin sign-in and the dashboard header, and in the app the splash, onboarding, sign-in and empty states. Lists, forms and detail pages stay still and fast.
- **Motion respects the user.** `prefers-reduced-motion` on the web and "Remove animations" on phones switch every shader to its static gradient and turn off animated borders.

## 2. Logo

The Nivra mark: two people whose arms form a heart around a shared box. The artwork lives in **`packages/ui/brand/`**:

| File | Use |
|---|---|
| `icon.svg` | the app-icon tile: cream mark on the green gradient (`#2A6E52` → `#153A2B`), radius 48/200. Favicons, the app launcher icon, the store icon, OG images |
| `icon-cream.svg` | a cream tile with the green mark, for dark backgrounds |
| `mark-light.svg` / `mark-dark.svg` | the mark alone (cream or green), e.g. on the splash screen |

- **Web and admin:** `<Logo />` (tile + "nivra" wordmark; `inverse` on dark backgrounds, `suffix="Admin"`, `tagline` for "Borrow · Lend · Share") and `<LogoMark />` from `@sajha/ui`. `ICON_SVG` is the tile as a string, for generated images.
- **Mobile:** launcher icon, splash and in-app logo are rendered from the same SVGs (`apps/mobile/assets/brand/render.mjs`).
- **Wordmark:** "nivra" in lowercase, display type, bold, tracking −4%, deep green `#1E4D3A` (cream `#FBF8F2` on dark). The tagline is caption type, uppercase, tracking 0.3em, orange `#EC7A3A`.
- Keep clear space of at least half the tile's width around the logo. Don't recolour, stretch or add effects to the mark.

## 3. Colour

**Scales:**

| Scale | Use | Key steps |
|---|---|---|
| `brand` (green) | actions, links, focus, selected states | 50 `#EEFBF6` · 500 `#1DA482` · 600 `#11846A` · 700 `#0F6A57` · 950 `#062722` |
| `accent` (orange) | highlights only: prices on cards, "new" badges, the shader's warm colour | 500 `#F57B0B` |
| `ink` (neutral) | text, borders, surfaces | 50 `#F6F7F9` · 200 `#D5DAE2` · 500 `#667691` · 950 `#12151C` |
| status | success `#16A34A` · warning `#F59E0B` · danger `#DC2626` · info `#2563EB` |  |

**Semantic roles.** Components use these roles, never raw scale steps:

| Role | Light | Dark |
|---|---|---|
| `background` | ink-50 | ink-950 |
| `surface` (cards, sheets, inputs) | white | ink-900 |
| `surface-muted` (table headers, chips) | ink-100 | ink-800 |
| `foreground` | ink-950 | ink-50 |
| `muted-foreground` | ink-500 | ink-400 |
| `border`, `input` | ink-200 | ink-800 / ink-700 |
| `ring` (focus) | brand-500 | brand-400 |
| `primary` / `primary-hover` / `on-primary` | brand-600 / brand-700 / white | brand-400 / brand-300 / brand-950 |
| `primary-soft` / `on-primary-soft` | brand-50 / brand-700 | brand-900 / brand-200 |
| `accent` / `on-accent` | accent-500 / white | accent-400 / ink-950 |
| `danger` / `on-danger` | `#DC2626` / white | `#F87171` / ink-950 |

**How to use the roles:**
- **Web and admin:** `bg-sj-primary text-sj-on-primary`, `border-sj-border`, `text-sj-muted-foreground`, or `var(--sj-primary)` directly. The `.dark` class switches the palette. Admin follows the system setting and has a toggle; the website stays light.
- **Mobile:** `SajhaLight.*` / `SajhaDark.*` feed the `ColorScheme`, and the app follows the system setting.
- **Contrast:** text on `primary` and body text on `surface` meet WCAG AA. Muted text is for secondary information only, never for the only copy of something important.

## 4. Typography

Three families, bundled everywhere (Google Fonts on the web; asset fonts in the app, each with its OFL licence):

| Family | Use |
|---|---|
| **Bricolage Grotesque** (`display`) | display and page titles (h1, h2) |
| **Plus Jakarta Sans** (`sans`) | everything else: UI, body, buttons, labels |
| **JetBrains Mono** (`mono`) | codes (handover code, invite code), ids, amounts in tables |

**One scale, in px, identical on every platform:**

| Token | Size / line | Weight | Font | Use |
|---|---|---|---|---|
| `display` | 40 / 48 | 700 | display | website hero, empty-state headlines |
| `h1` | 32 / 40 | 700 | display | page title (admin page header, app screen hero) |
| `h2` | 24 / 32 | 700 | display | section title |
| `h3` | 20 / 28 | 600 | sans | card title, dialog title |
| `title` | 17 / 24 | 600 | sans | list item title, app bar title |
| `body` | 15 / 22 | 400 | sans | default text |
| `small` | 13 / 18 | 400 | sans | secondary lines, table cells |
| `caption` | 12 / 16 | 500 | sans | labels, badges, timestamps |
| `button` | 15 / 20 | 600 | sans | every button |
| `mono` | 13 / 18 | 500 | mono | codes, ids, money in tables |

- **Web and admin:** `text-display`, `text-h1` … `text-caption` set size, line height, weight and tracking. Add `font-display` or `font-mono` where the table says so.
- **Mobile:** use `SajhaType.*`. The Material `TextTheme` maps display/headline/title/body/label to these.

## 5. Space, size and shape

- **Spacing:** a 4 px grid. Tokens: xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48. Screen gutter: 16 on phones, 24 on tablet and desktop.
- **Control heights:** sm **36** · md **44** (the default for buttons and inputs) · lg **52** (the one main action on a screen, and full-width buttons on phones).
- **Radius:**

| Size | Used for |
|---|---|
| sm 8 | chips inside tables, small tags |
| md 12 | inputs, menus, toasts |
| lg 16 | cards, sheets, dialogs |
| xl 24 | hero panels, feature cards |
| full | buttons, badges, avatars, segmented toggles |

- **Borders:** 1 px, in `border`.
- **Icons:** **Lucide** everywhere (`lucide-react`, `lucide_icons_flutter`). Sizes 16 inline, 20 in buttons and lists, 24 in navigation. Stroke width 2.
- **Elevation:**

| Level | Used for |
|---|---|
| `shadow-xs` | inputs |
| `shadow-sm` | cards at rest |
| `shadow-md` | cards on hover, dropdowns |
| `shadow-lg` | dialogs, sheets |
| `shadow-glow` | the primary and glow button on hover |

## 6. Motion

| Token | Value | Use |
|---|---|---|
| `fast` | 120 ms | hover, press, toggles |
| `base` | 200 ms | cards, dropdowns, tabs |
| `slow` | 320 ms | sheets, page transitions, reveal-on-scroll |
| easing `standard` | `cubic-bezier(0.2, 0, 0, 1)` | almost everything |
| easing `emphasized` | `cubic-bezier(0.3, 0, 0, 1.2)` | a little overshoot for success moments |

- Buttons scale to 0.97 while pressed.
- Cards lift by 2 px (`shadow-sm` → `shadow-md`) on hover (web and admin only).
- The glow border's conic gradient turns once every 4 s.

## 7. Components

### Button
- **Shape:** always a **pill** (radius full). Label in `button` type, icon 20 px with an 8 px gap.
- **Sizes:** sm 36 (padding 16) · **md 44 (padding 20, default)** · lg 52 (padding 24).

| Variant | Look | When |
|---|---|---|
| `primary` | `primary` fill, `on-primary` label; on hover `primary-hover` and `shadow-glow`, and the animated **glow border** appears (Uiverse-style conic ring) | the main action |
| `glow` | ink-950 fill, white label, always-on animated brand→accent glow border | hero calls to action (website, sign-in, onboarding) |
| `secondary` | `primary-soft` fill, `on-primary-soft` label | a helpful second action |
| `outline` | transparent, 1 px `border`, `foreground` label; hover `surface-muted` | neutral actions (Cancel, Export) |
| `ghost` | transparent, `foreground` label; hover `surface-muted` | toolbars, inline actions |
| `danger` | `danger` fill, `on-danger` label | destructive confirms only |
| `link` | `primary` text, underline on hover | inside text |

- **Loading:** the label is replaced by a **dots loader** (three 6 px dots bouncing), and the width stays the same.
- **Disabled:** 50% opacity, no hover effects.
- **Focus:** a 2 px `ring` with a 2 px offset (web and admin).

### Input, textarea, select
- 44 px tall (textarea: 96 px minimum), radius md, 1 px `input` border, `surface` fill, `shadow-xs`, padding 14 px horizontally.
- **Focus:** border `ring` plus a 3 px ring at 25% opacity.
- **Label:** `caption` weight 600, 6 px above. Help or error text is `small`, with `danger` for errors.

### Card
- **Standard:** `surface`, 1 px `border`, radius lg, `shadow-sm`, padding 24 (16 on phones). On hover, if clickable: `shadow-md` and a 2 px lift.
- **Spotlight** (feature cards on the website and dashboard KPI tiles): a soft brand radial light follows the pointer. On mobile it's a static soft gradient in the top-left corner.
- **Card title:** `h3`. **Description:** `small` in `muted-foreground`.

### Badge
- A pill, `caption` type, 4 × 10 px padding.
- **Tones:** `neutral` (surface-muted), `brand` (primary-soft), `success`, `warning`, `danger`, `info`. Each tint is the colour at 12%; the text is the colour mixed 38% toward `foreground`, so it passes contrast in light and dark.

### Other components
- **Segmented toggle:** a pill track in `surface-muted`, the selected segment in `surface` with `shadow-sm`, and 200 ms sliding.
- **Table** (admin): the header row is `surface-muted` in `caption` uppercase and sticky; rows use `small` type, are 48 px tall, highlight `surface-muted` on hover, and use `mono` for ids and money.
- **Empty state:** a Lucide icon in a `primary-soft` circle, an `h3` title, a `small` hint, and one button.
- **Toast:** `surface`, radius md, `shadow-lg`, with a status icon; it lasts 4 s. Sonner on the web and admin, a SnackBar in the app.
- **Skeleton:** `surface-muted` blocks with a slow shimmer (off with reduced motion).
- **Navigation:**
  - Admin: a sidebar with Lucide icons. The active item is a `primary-soft` pill with `on-primary-soft` text.
  - App: a bottom NavigationBar with the same pill indicator.

## 8. Effects (accents only)

- **Mesh gradient shader:** Paper Shaders `MeshGradient` on the web and admin; the GLSL `aurora.frag` in the app, tuned to match.
  - Colours: brand-700, brand-500, brand-300 and accent-400 over brand-950.
  - It runs at speed 0.2, is capped at 1280 × 800 and pauses when off-screen.
  - It shows only on capable GPUs (not software WebGL), without Data Saver and with more than 2 GB of memory. Otherwise the same colours are shown as a static CSS or Flutter gradient.
  - **Where:** the website hero, admin sign-in (left panel), the admin dashboard header band, and in the app the splash, onboarding, the sign-in header and empty states.
- **Glow border:** a conic gradient (brand-400 → accent-400 → brand-600) rotating behind a 1.5 px gap, for `glow` and hovered `primary` buttons. Web and admin use CSS `@property --angle`; the app uses a CustomPainter with a SweepGradient.
- **Text reveal (web only):** the hero headline blurs in word by word (pure CSS).
- **Count-up:** KPI numbers count up once when first shown, on the web and the admin dashboard.

## 9. Libraries

| | Web | Admin | Mobile |
|---|---|---|---|
| Components | `@sajha/ui` | `@sajha/ui`, with shadcn/Radix for complex primitives (dialog, dropdown) | `lib/shared/widgets` + Material 3 theme |
| Shaders | `@paper-design/shaders-react` | `@paper-design/shaders-react` | `FragmentProgram` (`shaders/aurora.frag`) |
| Motion | `motion` | `motion` | `flutter_animate` |
| Icons | `lucide-react` | `lucide-react` | `lucide_icons_flutter` |
| Toasts | — | `sonner` | SnackBar |

The Uiverse and React Bits pieces (glow button, spotlight card, dots loader, blur text, count-up, magnet) are recreated in-repo rather than installed, so they follow these tokens.

## 10. Checklist for a new screen

- [ ] Only semantic colours (`sj-*` / `SajhaLight`), no hex values.
- [ ] Type from the scale (`text-h2`, `SajhaType.h2`), with the right family.
- [ ] Buttons: one `primary` (or `glow`); md 44 by default, lg 52 for the main phone action.
- [ ] Cards are radius lg with `shadow-sm`; inputs are 44 px with radius md.
- [ ] Lucide icons at 16/20/24.
- [ ] Works in dark mode (admin, app), and still usable with reduced motion.
