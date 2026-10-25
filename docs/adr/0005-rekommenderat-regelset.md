# ADR-0005 — Rekommenderat regelset

- **Status:** Föreslagen (mekanismen är byggd; produktdelarna — nivåindelning, tak, vad som visas och
  V-1-grindens gränser — väntar på Eriks godkännande)
- **Datum:** 2026-10-25

**Numret:** Erik skrev "ADR-004" i F-1, men 0004 är native-pipelinen
([ADR-0004](0004-native-pipeline-nitro-modules.md)). `docs/adr/` och `docs/decisions/` delar nummerserie
(ADR-002, ADR-003, ADR-0004); nästa lediga är 0005. Bekräftas av Erik.

## Kontext
Betans punkt 3 ([KONTEXT.md](../../KONTEXT.md)): användaren väljer regler själv **eller** får ett
rekommenderat regelset. Regelbiblioteket är kärnprodukten (G2), så rekommendationen är ingången till det
— inte en ersättning för eget val. Kraven:

1. **Ingen kostnad och ingen gissning.** Rekommendationen görs på klienten, utan Claude-anrop, och samma
   indata ger alltid samma set (konsekvens före smarthet). Den ska kunna testas och förklaras.
2. **Kameravinkeln styr vad som går att bedöma.** En regel som inte syns från vald vinkel ger
   `cannot_determine` och slösar tokens. `ruleMatchesAngle` (`core/lib/cameraAngle.ts`) är redan sanningen.
3. **Bara regler som Vision bedömer bra** (F-1). Det avgörs av V-1:s facit, som inte finns än.
4. **Feedback i hörlurarna** (betans punkt 4) tål få regler per sving; en nybörjare kan inte jobba med sju
   saker samtidigt.

Underlag från biblioteket (`core/data/ruleLibrary.ts`, 14 regler, oförändrat i den här ADR:n):
- Ingen regel har fasen `top`; `lib-club-alignment-top` ligger i `backswing`.
- `lib-forward-shaft-lean` ("hands ahead of ball") är taggad `['dtl']`, men handens läge mot bollen syns
  tydligast face-on. Med nuvarande taggning rekommenderas den bara för DTL. Rättas i biblioteket (egen
  uppgift), inte här; V-1 bör mäta den från båda vinklarna.

## Beslut
**En ren funktion `recommendRules` i `packages/core/src/lib/recommendRules.ts`.** Indata: vinkel
(`'dtl' | 'face-on'`), nivå (`beginner | intermediate | advanced`), valfri mål-fas och V-1:s mätningar.
Utdata: ordnad lista med biblioteks-id, valideringsstatus och motiveringskoder. Skalet lägger till reglerna
via befintliga `addFromLibrary` och översätter koderna via i18n — core innehåller ingen användartext.

### Utgångsläge *(förslag — Erik)*
Första gången, och när användaren byter vinkel utan egna ändringar, förväljs det rekommenderade setet för
vald vinkel och nivån `beginner`. Användaren kan alltid lägga till och ta bort; då är setet hennes eget och
skrivs inte över. Nivån frågas en gång i onboarding och kan ändras i inställningar.

### Urval och ordning (deterministiskt)
1. **Grind:** regeln måste matcha vinkeln, och V-1 får inte ha underkänt den.
2. **Sortering:** mål-fasens regler först → V-1-validerade före ovaliderade → nivåns fasordning → vikt
   (3 före 2) → bibliotekets ordning.
3. **En regel per fas först**, sedan fylls taket i samma ordning. Annars blir nybörjarens set tre
   uppställningsregler och säger inget om resten av svingen.

### Nivå *(förslag — Erik)*
| Nivå | Fasordning | Tak | Varför |
| --- | --- | --- | --- |
| Nybörjare | address, follow, backswing, top, downswing, impact | 3 | Uppställning och finish syns på en stillbild och rättas utan att bygga om svingen. |
| Medel | backswing, address, downswing, top, impact, follow | 5 | Baksvingen är där de flesta fel byggs in. |
| Avancerad | downswing, impact, backswing, top, address, follow | 6 | Grunden sitter; sekvens och träff avgör. |

Med dagens bibliotek: nybörjare face-on = viktfördelning, full rotation i finish, axelrotation; DTL =
ryggvinkel, full rotation i finish, axelrotation.

### V-1-grinden *(förslag — Erik)*
`RuleAccuracyMap` (biblioteks-id → `accuracy`, `confidentErrorRate`, `samples`) fylls ur V-1:s
`docs/eval/v1-facit.md` och är **tom tills V-1 körts**. Tre lägen per regel:
- **Godkänd:** träffsäkerhet ≥ 0,8 (räknat på svar som inte är `cannot_determine`) **och** självsäkra fel
  ≤ 0,1, med minst 9 mätningar (3 svingar × 3 körningar). Märks `validated`.
- **Underkänd:** mätt men under gränsen. **Utesluts alltid** ur rekommendationen (kan fortfarande väljas
  själv).
- **Okänd:** saknas eller färre än 9 mätningar. **Får vara med, märkt `unvalidated`** ("ej validerad"),
  tills facit finns. Annars är rekommendationen tom i betan fram till V-1.

Gränserna är platshållare (`ACCURACY_GATE`, flaggat `// OSÄKER`) och sätts mot V-1:s baslinje.
Självsäkra fel vägs in separat eftersom ett säkert fel i hörlurarna kostar mer än ett osäkert.

### Vad som visas och varför *(förslag — Erik, utformas i D-1)*
Per regel: titel, fas och **en kort rad** ur första motiveringskoden —
`goal-phase` ("Din målfas"), `level-phase-priority` ("Viktigast i [fas] för din nivå"),
`high-weight` ("Stor effekt på svingen"), `angle-match` ("Syns från [vinkel]"). En ej validerad regel får
en diskret markering. Användaren ska förstå *varför just de här*, så att valet känns som hennes och hon
vågar ändra det — vilket är det G2 bygger på.

## Alternativ som övervägdes
- **Claude väljer regler utifrån en första sving.** Kostar ett anrop, är inte deterministiskt och kan inte
  valideras mot facit. Kan bli ett tillägg senare, inte grunden.
- **Fasta, handplockade set per vinkel och nivå.** Enklare, men måste skrivas om varje gång biblioteket
  eller V-1 ändras; tränarnas egna bibliotek (G2) skulle kräva egna set.
- **Utesluta alla omätta regler tills V-1 finns.** Ärligast, men ger tom rekommendation i betan.
  Markeringen "ej validerad" bevarar ärligheten.

## Konsekvenser
- Biblioteket och V-1 styr rekommendationen utan kodändring: ny regel eller ny mätning slår igenom direkt.
- Fungerar för tränarens egna bibliotek (parametern `library`), så att samma mekanism bär G2.
- Felaktig vinkeltaggning i biblioteket slår direkt igenom (se `lib-forward-shaft-lean`).
- **Omprövas** när V-1 är kört (gränser), när D-1 har visat hur motiveringen ser ut, eller om användare
  regelmässigt tar bort samma rekommenderade regel.
