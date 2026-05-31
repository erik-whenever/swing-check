import { useSettingsStore } from '../store/settings';
import type { Language } from './languages';

/** UI string keys and their translations. */
const translations = {
  sv: {
    'nav.home': 'Hem',
    'nav.camera': 'Kamera',
    'nav.rules': 'Regler',
    'nav.analysis': 'Analys',
    'nav.history': 'Historik',
    'home.tagline':
      'Filma din sving och få direkt, regelbaserad feedback för att finslipa varje del av ditt spel.',
    'home.cta': 'Kolla en sving',
    'home.rules': 'Mina regler',
    'home.rulesActive': '{count} aktiva',
    'home.history': 'Historik',
    'home.historySaved': '{count} sparade',
    'home.language': 'Språk',

    // Onboarding wizard
    'onb.skip': 'Hoppa över',
    'onb.back': 'Tillbaka',
    'onb.next': 'Nästa',
    'onb.start': 'Sätt igång',
    'onb.stepOf': 'Steg {current} av {total}',

    'onb.welcome.title': 'Välkommen till SwingCheck',
    'onb.welcome.body':
      'Filma din golfsving och få direkt, regelbaserad feedback på varje del av rörelsen. Den här snabbguiden visar hur du får bästa resultat på under en minut.',
    'onb.welcome.tag': '5 snabba steg',

    'onb.angle.title': 'Välj din filmvinkel',
    'onb.angle.body':
      'Två vinklar säger mest om en sving. Välj samma vinkel som dina regler är skrivna för.',
    'onb.angle.dtl': 'Down-the-line (DTL)',
    'onb.angle.dtlBody':
      'Kameran står bakom dig, längs med målinjen. Bäst för svingplan, klubbväg och kroppsvinklar.',
    'onb.angle.faceOn': 'Face-on',
    'onb.angle.faceOnBody':
      'Kameran står rakt framför dig. Bäst för viktöverföring, höftrotation och handposition.',

    'onb.camera.title': 'Placera kameran rätt',
    'onb.camera.body':
      'Stabil kamera ger en stabil analys. Tänk på tre saker innan du trycker på rec.',
    'onb.camera.distance': 'Hela kroppen i bild',
    'onb.camera.distanceBody':
      'Stå 3–4 meter bort så att klubban syns genom hela svingen, från uppställning till avslut.',
    'onb.camera.height': 'Höfthöjd & stadigt',
    'onb.camera.heightBody':
      'Sätt telefonen i höfthöjd på ett stativ eller en golfbag — undvik att hålla den i handen.',
    'onb.camera.light': 'Ljus framför, inte bakom',
    'onb.camera.lightBody':
      'Ha solen eller ljuset bakom kameran. Motljus gör att silhuetten försvinner.',

    'onb.rules.title': 'Välj dina regler',
    'onb.rules.body':
      'Regler är de checkpunkter SwingCheck letar efter. Aktivera dem du jobbar med just nu.',
    'onb.rules.library': 'Regelbibliotek',
    'onb.rulesBody1':
      'Bläddra bland färdiga regler för varje vinkel och slå på de som passar din träning.',
    'onb.rules.custom': 'Egna regler',
    'onb.rulesBody2':
      'Skriv egna checkpunkter med egna ord. Bara aktiva regler analyseras — håll listan fokuserad.',

    'onb.record.title': 'Spela in & få feedback',
    'onb.record.body':
      'Tryck på den stora knappen, en nedräkning startar och svingen analyseras automatiskt.',
    'onb.record.voice': 'Röstuppläsning',
    'onb.recordBody1':
      'Slå på Röst för att få feedbacken uppläst — välj Kort för en snabb dom eller Detalj för hela analysen.',
    'onb.record.range': 'Hörlursläge',
    'onb.recordBody2':
      'På rangen kan du styra inspelningen med hörlurarnas knapp och lyssna på resultatet utan att titta på skärmen.',
  },
  en: {
    'nav.home': 'Home',
    'nav.camera': 'Camera',
    'nav.rules': 'Rules',
    'nav.analysis': 'Analysis',
    'nav.history': 'History',
    'home.tagline':
      'Record your swing and get instant, rule-based feedback to sharpen every part of your game.',
    'home.cta': 'Check a swing',
    'home.rules': 'My rules',
    'home.rulesActive': '{count} active',
    'home.history': 'History',
    'home.historySaved': '{count} saved',
    'home.language': 'Language',

    // Onboarding wizard
    'onb.skip': 'Skip',
    'onb.back': 'Back',
    'onb.next': 'Next',
    'onb.start': 'Get started',
    'onb.stepOf': 'Step {current} of {total}',

    'onb.welcome.title': 'Welcome to SwingCheck',
    'onb.welcome.body':
      'Record your golf swing and get instant, rule-based feedback on every part of the motion. This quick tour shows how to get the best results in under a minute.',
    'onb.welcome.tag': '5 quick steps',

    'onb.angle.title': 'Choose your camera angle',
    'onb.angle.body':
      'Two angles tell you the most about a swing. Pick the same one your rules are written for.',
    'onb.angle.dtl': 'Down-the-line (DTL)',
    'onb.angle.dtlBody':
      'Camera behind you, along the target line. Best for swing plane, club path and body angles.',
    'onb.angle.faceOn': 'Face-on',
    'onb.angle.faceOnBody':
      'Camera straight in front of you. Best for weight shift, hip rotation and hand position.',

    'onb.camera.title': 'Position the camera',
    'onb.camera.body':
      'A steady camera makes for a steady analysis. Keep three things in mind before you hit record.',
    'onb.camera.distance': 'Full body in frame',
    'onb.camera.distanceBody':
      'Stand 3–4 metres away so the club is visible through the whole swing, from setup to finish.',
    'onb.camera.height': 'Hip height & stable',
    'onb.camera.heightBody':
      'Set the phone at hip height on a tripod or golf bag — avoid holding it in your hand.',
    'onb.camera.light': 'Light in front, not behind',
    'onb.camera.lightBody':
      'Keep the sun or light behind the camera. Backlight makes your silhouette disappear.',

    'onb.rules.title': 'Pick your rules',
    'onb.rules.body':
      'Rules are the checkpoints SwingCheck looks for. Turn on the ones you are working on right now.',
    'onb.rules.library': 'Rule library',
    'onb.rulesBody1':
      'Browse ready-made rules for each angle and switch on the ones that fit your practice.',
    'onb.rules.custom': 'Custom rules',
    'onb.rulesBody2':
      'Write your own checkpoints in plain words. Only active rules are analysed — keep the list focused.',

    'onb.record.title': 'Record & get feedback',
    'onb.record.body':
      'Tap the big button, a countdown starts and your swing is analysed automatically.',
    'onb.record.voice': 'Voice readout',
    'onb.recordBody1':
      'Turn on Voice to hear the feedback — choose Quick for a fast verdict or Detail for the full analysis.',
    'onb.record.range': 'Range mode',
    'onb.recordBody2':
      'At the range, control recording with your headset button and listen to the result without looking at the screen.',
  },
} as const;

export type TranslationKey = keyof (typeof translations)['en'];

export function translate(
  lang: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  let str: string = translations[lang][key] ?? translations.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}

/** Hook returning a translator bound to the current language. */
export function useT() {
  const lang = useSettingsStore((s) => s.language);
  return (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(lang, key, vars);
}
