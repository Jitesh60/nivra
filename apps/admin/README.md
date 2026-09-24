# @sajha/admin

Next.js admin panel for Sajha (App Router, Tailwind v4, shadcn/ui).

```bash
cp .env.example .env.local
pnpm dev        # http://localhost:3001
```

- The API URL (`SAJHA_API_URL`) is read on the server only; the browser never talks to the API directly (see ARCHITECTURE §10).
- UI components live in `src/components/ui` (shadcn/ui, `components.json`). Add more with `pnpm dlx shadcn@latest add <component>`.
- Colours come from `@sajha/design-tokens`; shadcn's semantic tokens are mapped onto the Sajha palette in `src/app/globals.css`.
- Next.js 16 note: route protection uses `proxy.ts` (the old `middleware.ts`).
