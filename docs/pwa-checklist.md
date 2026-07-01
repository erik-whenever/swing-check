# App-ikoner + iOS PWA-verifiering (Ström C)

Auktoritativ uppgiftslista: [BACKLOG.md](BACKLOG.md#ström-c--app-ikoner--ios-pwa-verifiering).

## Checklista
- [x] C-1 — App-ikoner (verifierade + maskable-fix)
- [ ] C-2 — iOS Safari installations- och beteendeverifiering

## C-1 — App-ikoner

### Approach: emoji → PNG (behållen)
`scripts/generate-icons.mjs` renderar 🏌️-emoji på grön gradient (#0f3d2e → #1a6645,
iOS-rundade hörn radius 22%) i headless Chrome (Puppeteer) och skärmdumpar i varje storlek.

Renderings­risken som motiverade en SVG-approach gäller **inte i praktiken**: ikonerna
bakas till statiska PNG:er i repot vid bygge, så runtime renderar aldrig emoji — den
plattforms­varians som kunde uppstå är låst till byggmaskinen. Verifierat: emoji renderar
skarpt (Segoe UI Emoji) i alla storlekar. SVG-omskrivning behövdes därför inte.

Kör om vid behov: `npm run icons`.

### Ikon-storlekar
| Fil | Storlek | Purpose | Not |
|-----|---------|---------|-----|
| `public/icon-192.png` | 192×192 | any | rundade hörn, emoji ~75% |
| `public/icon-512.png` | 512×512 | any | rundade hörn, emoji ~75% |
| `public/icon-maskable-512.png` | 512×512 | maskable | **full-bleed** kvadrat, emoji ~55% i säker zon |
| `public/apple-touch-icon.png` | 180×180 | (iOS) | rundade hörn, emoji ~75% |

### Manifest (genereras av vite-plugin-pwa i `vite.config.ts`, ej statisk fil)
`icons`-arrayen listar `any`- (192, 512) och `maskable`-ikonen separat. Den tidigare
buggen — samma `icon-512.png` återanvänt som maskable — klippte golfaren och exponerade
transparenta hörn under cirkel/squircle-mask. Åtgärdat med dedikerad full-bleed maskable-fil.

### index.html
`<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` + `theme-color` finns.
