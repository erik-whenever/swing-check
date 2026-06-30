# ADR-0001 — Rörelsebaserad svingdetektering utan pose-estimering

- **Status:** Antagen
- **Datum:** 2026-06-01

## Kontext
Appen måste välja ~10 bildrutor ur en svingvideo som faktiskt täcker svingen
(address → backswing → top → downswing → impact → follow-through). Den vanliga
inspelningssituationen är *en riktig sving omgiven av lång setup* (golfaren går in i
bild, ställer sig till rätta, svingar, sänker klubban, går ur bild). För klipp längre
än ~6 s valde den tidigare logiken fel bildrutor.

Den centrala kraften: en pixel-diff-rörelsemetrik **kan inte se själva träffögonblicket**.
Vid impact rör sig bara en tunn, snabb klubba → mycket få pixlar ändras → impact hamnar
i en rörelse-*dal*. Den stora kroppsrotationen i follow-through dominerar i stället
metriken. "Hitta rörelsetoppen = impact" är därför fundamentalt fel — den landar på
follow-through, inte på svingen.

## Beslut
Använd en rörelsebaserad metod **utan nya beroenden**, och **ankra på adress-stillheten**
i stället för rörelsetoppen:

1. Nedskalad rörelse-canvas (~360 px längsta sida) för att dränka sensor-/codec-brus.
2. Rörelsemetrik = andel centrumviktade pixlar vars luma ändrats över tröskel, efter att
   en global ljusstyrkeförskjutning subtraherats (robust mot autoexponering/vitbalans).
3. Grov skanning av hela klippet → utjämnad rörelsekurva.
4. Address = längsta sammanhängande "stilla"-sekvensen; impact ≈ första rörliga bildrutan
   efter den. Fallback till global rörelsetopp om ingen tydlig stillhet finns.
5. Fönster `[impact − 1.2 s, impact + 1.2 s]`, trimmat om rörelsen lägger sig igen.
6. 10 bildrutor jämnt spridda över fönstret; den närmast uppskattad impact tvingas till
   `impact`-etiketten. Jämn spridning är medvetet — impact-tiden är en uppskattning, så
   heltäckning slår att satsa bildrutor på ett exakt ögonblick.

Implementation: `src/lib/frameExtractor.ts`. Tunables överst i filen.

## Alternativ som övervägdes
- **Pose-estimering (MediaPipe Tasks Vision / MoveNet) i webbläsaren** — bäst kvalitet
  (spårar klubba/händer, hittar impact direkt) men nytt tungt beroende och mer komplexitet.
  Medvetet bortvald initialt; kvar som eskaleringsväg.
- **Rörelsetopp = impact** — förkastat: landar på follow-through, inte svingen.

## Konsekvenser
- (+) Inga nya beroenden; körs helt i webbläsaren; snabbt nog för mobil.
- (+) Robust mot ljusförändringar och brus tack vare nedskalning + global-shift-subtraktion.
- (−) Impact-tiden är en uppskattning, inte en mätning.
- (−) Misslyckas om golfaren aldrig står still (då används den svagare rörelsetopps-fallbacken).
- **Trigger för omprövning:** om verifiering på varierade klipp visar att metoden missar
  svingen → eskalera till pose-estimering. Se öppen fråga **F1** i
  [../oppna-fragor.md](../oppna-fragor.md) och sessionsanteckningarna i
  [../swing-detection-handoff.md](../swing-detection-handoff.md).
