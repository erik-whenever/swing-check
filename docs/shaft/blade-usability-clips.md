**Tio klipp, valda på annotatörernas egna etiketter — inte på hur graferna såg ut.**
Urvalet gjordes innan modellen kördes på ett enda av dem, av samma skäl som
evalsetet en gång reserverades: ett urval som plockas efter utfallet mäter
urvalet, inte modellen.

**Poolen.** `data/shaft/clips/` bär 97 klipp. Ett klipp är valbart bara om det har
minst en bildruta i en träningsbatch **och** den bildrutan är annoterad — utan
manifestpost finns ingen envelope att härleda svingfasen ur, utan annotering finns
ingen `view`/`blur` att dela upp på. Det ger **80 valbara klipp**.

**Vygrinden är den knappa resursen.** Av de 80 har bara **9** någon `face_on`-märkt
bildruta alls, och tre av dem (`048`, `072`, `IMG_5427`) blandar `face_on` och `dtl`
inom samma klipp. De fem valda face_on-klippen — `008`, `013`, `033`, `059`, `069` —
är alla **enhälligt** `face_on` i sina annoterade bildrutor, så vyraden i tabellerna
betyder en sak och inte två. Det sjätte enhälliga (`036`) ströks eftersom det inte
tillför något `059` inte redan bär. Fem `dtl` mot fem `face_on` är därmed en kraftig
**översampling** av face_on mot poolen, och det är avsiktligt: `face_on` är där
`shaft-v2` tappade 60 % av sina detektioner, och en jämn fördelning hade gett en
face_on-kolumn för tunn att läsa.

**Oskärpan är vald per cell, inte per klipp.** Målet var båda vyerna i både skarpt
och suddigt skick:

| | skarpt (`none` dominerar) | suddigt (`severe` finns) |
|---|---|---|
| `dtl` | `095`, `089` | `002`, `045`, `090` |
| `face_on` | `033`, `069` | `008`, `013`, `059` |

Över de tio klippen är **69 bildrutor annoterade**: 39 `none`, 10 `mild`, 20
`severe` — alltså ungefär **29 % `severe`**, mot 10,8 % i det annoterade materialet
som helhet. Även oskärpan är medvetet översamplad, av samma skäl som `face_on`.

**`002.mp4` är med för kontinuitetens skull.** Det är klippet vars trace väckte hela
frågan (slät bladvinkel medan klubban står still, taggig så snart huvudet rör sig),
och det ska gå att läsa den observationen i samma tabeller som de nio andra.

**Flera svingar per klipp togs där de fanns** (`095` och `090` bär fyra vardera,
`045` och `089` tre) — svingar, inte klipp, är det fas-tabellerna delas upp på, och
ett klipp med fyra svingar ger fyra envelopes att placera bildrutorna i.

**Vad urvalet inte är.** Det är inte slumpmässigt och inte representativt för
poolen; det är en *täckning* av fyra celler med det material som finns. Andelarna i
rapporten beskriver därför de här tio klippen och ska inte läsas som andelar över
alla 97.
