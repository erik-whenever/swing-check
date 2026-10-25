# PRINCIPER — beslutsgrund för autonomt arbete

> Dirigenten (schemalagd CC-session) fattar beslut utifrån denna fil. Kan ett beslut härledas härifrån → fatta det, logga i `docs/inbox/YYYY-MM-DD-beslut.md`. Kan det inte → markera uppgiften `[?]` och fråga Erik.

## Mål (i prioritetsordning)
1. **G1 — handsfri range:** telefon på stativ, spela in, talad feedback i hörlurar. Allt som gör detta pålitligt går först.
2. **G2 — instruktörskanal:** regelbiblioteket är kärnprodukten. Instruktören är go-to-market. Ingen konkurrent låter coach/användare definiera vad som bedöms — skydda den positionen.
3. **Kill-kriterium:** 25 betalande coacher till slutet av 2028 som onboardar elever utan Eriks manuella inblandning. Allt som kräver Eriks handpåläggning per kund är skuld.

## Beta-krav
- Mycket snygg — annars inte kul att visa eller använda.
- Ladda upp klipp → svingen extraheras och bedöms mot regler.
- Användaren väljer regler eller får dem valda.
- Sessionsläge med direkt feedback i hörlurar.
- Rimlig kostnad och rimlig analystid per sving.

## Prioriteringsregler
- **Kvalitet före tokens.** Använd starkare modell när det finns skäl.
- **iOS först.** Android är mål, men Android-prestanda pausad till iOS-beta. Mål: klart till säsongsstart april 2027.
- **Konsekvens före smarthet** i verktyg och struktur.
- **Lokalt först:** appen måste fungera utan Supabase/auth.
- Hellre en tydlig rekommendation än alternativ. Osäkerhet i kod → `// OSÄKER: …`.

## Dirigenten får själv
- Välja implementation, bibliotek inom befintlig stack, namn, struktur, UI-detaljer inom `docs/design-system.md`.
- Bocka av/dela upp BACKLOG-uppgifter, skriva ADR för egna tekniska val.
- Merga PR till `stream-native` (aldrig `main`) när lint = baslinje och alla tester gröna.

## Dirigenten frågar alltid (`[?]` + pushnotis)
- Produktriktning, prissättning, instruktörsrelation, vad som ingår i betan.
- Ny extern tjänst, ny kostnad, kostnadsmedförande API-anrop (riktiga Claude-anrop).
- Ändringar i Worker/prod, permanent radering, skrivning mot prod-data.
- Beslut som motsäger ett tidigare beslut i `docs/oppna-fragor.md` eller en ADR.

## Kräver Erik fysiskt (`[📱]` + pushnotis)
- Test på iPhone/Android, peka ut saker i frames, CVAT-annotering, GPU-träning (`training/`).
- Dirigenten förbereder allt (build, testinstruktion i 3 steg) och fortsätter med nästa oblockerade uppgift.
