# Öppna frågor & beslutslogg

> Numrerade poster. Öppna frågor får status **ÖPPEN**; när de avgörs blir de **BESLUT** med datum och kort motivering.
> Arkitekturval värda en längre motivering bryts ut till en ADR i [adr/](adr/) och refereras härifrån.

---

## BESLUT

### B1 — Rörelsebaserad svingdetektering framför pose-estimering
**Datum:** 2026-06-01 · **Status:** BESLUT · **Detalj:** [ADR-0001](adr/0001-motion-based-swing-detection.md)
Valde en pixel-rörelsemetrik utan nya beroenden framför in-browser pose-estimering, för scenariot
"en riktig sving + lång setup". Ankras på adress-stillheten eftersom impact är osynligt för metriken.

### B2 — Worker som proxy mot Anthropic
**Datum:** 2026-06-30 (retroaktivt dokumenterat) · **Status:** BESLUT
All Anthropic-trafik går via en Cloudflare Worker så att `ANTHROPIC_API_KEY` aldrig når klienten.

### B3 — Lokalt först; Supabase är valfritt
**Datum:** 2026-06-30 (retroaktivt dokumenterat) · **Status:** BESLUT
IndexedDB är källan till sanning. Supabase speglar endast metadata + resultat och degraderar till
no-op när env-varablerna saknas. Appen måste alltid fungera utan backend-konto.

---

## ÖPPNA FRÅGOR

### F1 — Håller den rörelsebaserade detekteringen i praktiken?
**Status:** ÖPPEN
Address-ankrad detektering är implementerad men inte verifierad på varierade klipp. Om den missar
svingen är nästa steg pose-estimering (se ADR-0001, "Konsekvenser").

### F2 — Autentisering och fleranvändarstöd
**Status:** ÖPPEN
Supabase-rader har `user_id = null`. Hur (och om) inloggning ska införas är obeslutat.

### F3 — Vad ska ersätta boilerplate-README:t?
**Status:** ÖPPEN
README är fortfarande Vite-mallen. Förslag: kort projektbeskrivning som pekar till KONTEXT.md.

### F4 — Kalibreringssetets faskvoter matchar inte specens målvikter
**Status:** ÖPPEN · **Upptäckt:** 2026-09-13 (under S-9)
`PHASE_QUOTAS` i `scripts/build-calibration-set.mjs` är downswing 40 / impact 15 / top 12 /
backswing 12 / through 9 / address 7 / finish 5. Specens målvikter (och
`PHASE_TARGET_WEIGHTS` i `src/lib/dataset/phaseQuota.ts`) ger för 100 frames i stället
downswing 34 / impact 18 / top 10 / backswing 14 / through 10 / address 8 / finish 6.
Kommentaren i kalibreringsskriptet påstår att kvoterna *är* målvikterna upplösta till hela
frames, vilket de alltså inte är.

**Konsekvens:** kalibreringssetet är övervikat mot `downswing` (+6) och `impact` (−3),
`backswing` (−2) och `top` (+2) mot specen. Setet är redan draget och annoterat och är
permanent evalset — det ska **inte** dras om, så avvikelsen är nu en egenskap hos evalsetet
som får dokumenteras snarare än rättas. `scripts/build-training-batch.mjs` följer specens
målvikter.

**Att besluta:** (a) rätta kommentaren i kalibreringsskriptet så den beskriver vad kvoterna
faktiskt är, och (b) avgöra om evalsetets fasfördelning ska stå kvar som den är — vilket
betyder att eval-siffror per fas inte är direkt jämförbara med träningsfördelningen — eller
om den skevheten ska vägas bort när eval rapporteras.
