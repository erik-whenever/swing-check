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
      'Din coach i fickan — filma, få feedback per regel och följ din utveckling.',
    'home.cta': 'Spela in sving',
    'home.rules': 'Mina regler',
    'home.rulesActive': '{count} aktiva',
    'home.history': 'Historik',
    'home.historySaved': '{count} sparade',
    'home.language': 'Språk',
    'home.greeting.morning': 'God morgon.',
    'home.greeting.day': 'God eftermiddag.',
    'home.greeting.evening': 'God kväll.',
    'home.hero': 'Redo för dagens',
    'home.heroAccent': 'svingar?',
    'home.statRules': 'aktiva regler',
    'home.statSwings': 'svingar sparade',

    // Swing phases
    'phase.address': 'Uppställning',
    'phase.backswing': 'Baksving',
    'phase.top': 'Toppen',
    'phase.downswing': 'Nedsving',
    'phase.impact': 'Träff',
    'phase.follow': 'Avslut',

    // Camera
    'camera.frameHint': 'Stå i ramen, hela kroppen synlig',
    'camera.upload': 'Ladda upp',
    'camera.processing': 'Bearbetar film…',
    'camera.error': 'Kamerafel',
    'camera.retry': 'Försök igen',
    'camera.session': 'Sessionsläge',
    'camera.sessionEnd': 'Avsluta session',
    'camera.mode': 'Inspelningsläge',
    'camera.mode.single': 'En sving',
    'camera.mode.session': 'Session',
    'camera.mode.singleHint': 'Spela in en sving i taget och få analysen direkt efteråt.',
    'camera.mode.sessionHint':
      'Kameran rullar. Varje sving hittas, analyseras och läses upp medan du slår vidare.',
    'camera.settings': 'Inspelningsinställningar',
    'camera.settings.close': 'Klar',
    'camera.settings.countdown': 'Nedräkning',
    'camera.settings.countdownHint': 'Sekunder från tryck till inspelning.',
    'camera.settings.remote': 'Hörlursknappen styr inspelningen',
    'camera.settings.remoteHint':
      'Play/paus på hörlurarna startar och stoppar inspelningen, och avbryter uppläsningen. Dubbeltryck avslutar sessionen.',
    'camera.settings.remoteInSession': 'Alltid på i sessionsläge — sessionen är handsfree.',
    'camera.swingCount': '{count} sving',
    'camera.swingCountPlural': '{count} svingar',
    'camera.recording': 'spelar in',
    'camera.voiceBlocked':
      'Rösten blockerades av webbläsaren — slå på den igen i inspelningsinställningarna',

    // Analysis
    'analysis.title': 'Din analys',
    'analysis.quality.good': 'God kvalitet',
    'analysis.quality.acceptable': 'Godtagbar kvalitet',
    'analysis.quality.poor': 'Svag kvalitet',
    'analysis.overall': 'Helhetsbedömning',
    'analysis.passOf': '{pass} av {total}',
    'analysis.focus': 'Fokus',
    'analysis.newSwing': 'Ny sving',
    'analysis.working': 'Analyserar din sving…',
    'analysis.workingSub': '{count} bildrutor skickade till Claude Vision',
    'analysis.failed': 'Analysen misslyckades',
    'analysis.retry': 'Försök igen',
    'analysis.empty': 'Ingen analys än. Spela in en sving först.',
    'analysis.toCamera': 'Till kameran',
    'analysis.noRules': 'Inga aktiva regler. Lägg till regler innan du analyserar.',
    'analysis.toRules': 'Till regler',
    'analysis.cannotDetermine': 'Kunde inte avgöra',
    'analysis.analyzedAs': 'Analyserad som',
    'analysis.detected': 'upptäckt: {angle}',
    'analysis.stopSpeech': 'Stoppa uppläsning',
    'analysis.tip': 'Tips',
    'analysis.correction': 'Rättning',
    'analysis.drill': 'Drill',
    'analysis.requiresAngle': 'Kräver vinkeln {angle}',
    'analysis.session': 'Session · sving {n}',

    // History
    'history.title': 'Historik',
    'history.tab.swings': 'Svingar',
    'history.tab.stats': 'Statistik',
    'history.loading': 'Laddar historik…',
    'history.empty': 'Inga svingar inspelade än — spela in din första!',
    'history.today': 'Idag',
    'history.yesterday': 'Igår',
    'history.passOf': '{pass} av {total} godkända',
    'history.trend': 'Trend, {count} senaste',

    // Statistics
    'stats.loading': 'Laddar statistik…',
    'stats.analyzed': '{count} svingar analyserade · sorterat: behöver träning först',
    'stats.none': 'Inga aktiva regler att visa statistik för.',
    'stats.assessed': '{assessed} bedömda av {total} senaste',
    'stats.tooLittle': 'För lite data',
    'stats.suggestion': 'Förslag:',
    'stats.suggestionBody': 'sätt ”{rule}” som fokusregel nästa pass.',

    // Rules
    'rules.tab.mine': 'Mina regler',
    'rules.tab.library': 'Bibliotek',
    'rules.focus': 'Fokus',
    'rules.solo': 'Solo',
    'rules.delete': 'Ta bort',
    'rules.create': '+ Skapa egen regel',
    'rules.empty': 'Inga regler än. Lägg till från biblioteket eller skapa en egen.',
    'rules.libraryEmpty': 'Alla regler för den här vinkeln är redan tillagda.',
    'rules.showDrills': 'Visa drills',
    'rules.hideDrills': 'Dölj drills',
    'rules.add': '+ Lägg till',
    'rules.added': '”{title}” tillagd i Mina regler',
    'rules.filtered': 'Filtrerat för {angle} — byt vinkel för fler regler',
    'rules.notUsedAt': 'Används inte i vinkeln {angle}.',
    'rules.drillCount': '{count} drills',
    'rules.more': 'Fler åtgärder',
    'rules.form.title': 'Regelns namn',
    'rules.form.desc': 'Vad ska kontrolleras?',
    'rules.form.phase': 'Svingfas',
    'rules.form.angles': 'Kan verifieras från',
    'rules.form.cancel': 'Avbryt',
    'rules.form.save': 'Lägg till',

    // Settings
    'settings.title': 'Inställningar',
    'settings.appearance': 'Utseende',
    'settings.theme': 'Tema',
    'settings.theme.system': 'System',
    'settings.theme.light': 'Ljust',
    'settings.theme.dark': 'Mörkt',
    'settings.accent': 'Accentfärg',
    'settings.language': 'Språk',
    'settings.voice': 'Röstuppläsning',
    'settings.voice.enable': 'Läs upp feedback',
    'settings.voice.mode': 'Uppläsningsläge',
    'settings.voice.quick': 'Kort',
    'settings.voice.detailed': 'Detalj',
    'settings.voice.voice': 'Röst',
    'settings.voice.auto': 'Automatisk (bästa svenska)',
    'settings.voice.none': 'Ingen röst tillgänglig',
    'settings.camera': 'Kamera',
    'settings.camera.angle': 'Standardvinkel',
    'settings.help': 'Hjälp',
    'settings.replayOnboarding': 'Visa introduktionen igen',
    'settings.feedback': 'Lämna feedback',
    'settings.feedbackSubtitle': 'Hittat en bugg eller har en idé? Hör av dig.',
    'settings.about': 'SwingCheck · regelbaserad svinganalys',

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
      'Under kugghjulet slår du på uppläsning — välj Kort för en snabb dom eller Detalj för hela analysen.',
    'onb.record.range': 'Hörlursstyrning',
    'onb.recordBody2':
      'På rangen kan hörlurarnas play/paus-knapp starta och stoppa inspelningen, så du slipper titta på skärmen. Slås på automatiskt i sessionsläge.',
  },
  en: {
    'nav.home': 'Home',
    'nav.camera': 'Camera',
    'nav.rules': 'Rules',
    'nav.analysis': 'Analysis',
    'nav.history': 'History',
    'home.tagline':
      'Your coach in your pocket — record, get feedback per rule and track your progress.',
    'home.cta': 'Record a swing',
    'home.rules': 'My rules',
    'home.rulesActive': '{count} active',
    'home.history': 'History',
    'home.historySaved': '{count} saved',
    'home.language': 'Language',
    'home.greeting.morning': 'Good morning.',
    'home.greeting.day': 'Good afternoon.',
    'home.greeting.evening': 'Good evening.',
    'home.hero': 'Ready for today’s',
    'home.heroAccent': 'swings?',
    'home.statRules': 'active rules',
    'home.statSwings': 'swings saved',

    // Swing phases
    'phase.address': 'Address',
    'phase.backswing': 'Backswing',
    'phase.top': 'Top',
    'phase.downswing': 'Downswing',
    'phase.impact': 'Impact',
    'phase.follow': 'Follow-through',

    // Camera
    'camera.frameHint': 'Stand in frame, full body visible',
    'camera.upload': 'Upload',
    'camera.processing': 'Processing video…',
    'camera.error': 'Camera error',
    'camera.retry': 'Retry',
    'camera.session': 'Session mode',
    'camera.sessionEnd': 'End session',
    'camera.mode': 'Recording mode',
    'camera.mode.single': 'Single swing',
    'camera.mode.session': 'Session',
    'camera.mode.singleHint': 'Record one swing at a time and get the analysis right after.',
    'camera.mode.sessionHint':
      'The camera keeps rolling. Every swing is found, analysed and read aloud while you keep hitting.',
    'camera.settings': 'Recording settings',
    'camera.settings.close': 'Done',
    'camera.settings.countdown': 'Countdown',
    'camera.settings.countdownHint': 'Seconds from tap to recording.',
    'camera.settings.remote': 'Headset button controls recording',
    'camera.settings.remoteHint':
      'Play/pause on the headset starts and stops recording, and interrupts the readout. Double-press ends the session.',
    'camera.settings.remoteInSession': 'Always on in session mode — the session is hands-free.',
    'camera.swingCount': '{count} swing',
    'camera.swingCountPlural': '{count} swings',
    'camera.recording': 'recording',
    'camera.voiceBlocked':
      'The browser blocked speech — turn it back on in recording settings',

    // Analysis
    'analysis.title': 'Your analysis',
    'analysis.quality.good': 'Good quality',
    'analysis.quality.acceptable': 'Acceptable quality',
    'analysis.quality.poor': 'Poor quality',
    'analysis.overall': 'Overall',
    'analysis.passOf': '{pass} of {total}',
    'analysis.focus': 'Focus',
    'analysis.newSwing': 'New swing',
    'analysis.working': 'Analysing your swing…',
    'analysis.workingSub': '{count} frames sent to Claude Vision',
    'analysis.failed': 'Analysis failed',
    'analysis.retry': 'Try again',
    'analysis.empty': 'No analysis yet. Record a swing first.',
    'analysis.toCamera': 'Go to camera',
    'analysis.noRules': 'No active rules. Add rules before analysing.',
    'analysis.toRules': 'Go to rules',
    'analysis.cannotDetermine': 'Could not determine',
    'analysis.analyzedAs': 'Analysed as',
    'analysis.detected': 'detected: {angle}',
    'analysis.stopSpeech': 'Stop readout',
    'analysis.tip': 'Tip',
    'analysis.correction': 'Correction',
    'analysis.drill': 'Drill',
    'analysis.requiresAngle': 'Requires the {angle} angle',
    'analysis.session': 'Session · swing {n}',

    // History
    'history.title': 'History',
    'history.tab.swings': 'Swings',
    'history.tab.stats': 'Statistics',
    'history.loading': 'Loading history…',
    'history.empty': 'No swings recorded yet — record your first one!',
    'history.today': 'Today',
    'history.yesterday': 'Yesterday',
    'history.passOf': '{pass} of {total} passed',
    'history.trend': 'Trend, last {count}',

    // Statistics
    'stats.loading': 'Loading statistics…',
    'stats.analyzed': '{count} swings analysed · sorted: needs work first',
    'stats.none': 'No active rules to show statistics for.',
    'stats.assessed': '{assessed} assessed of last {total}',
    'stats.tooLittle': 'Not enough data',
    'stats.suggestion': 'Suggestion:',
    'stats.suggestionBody': 'set “{rule}” as your focus rule next session.',

    // Rules
    'rules.tab.mine': 'My rules',
    'rules.tab.library': 'Library',
    'rules.focus': 'Focus',
    'rules.solo': 'Solo',
    'rules.delete': 'Delete',
    'rules.create': '+ Create your own rule',
    'rules.empty': 'No rules yet. Add one from the library or create your own.',
    'rules.libraryEmpty': 'Every rule for this angle has already been added.',
    'rules.showDrills': 'Show drills',
    'rules.hideDrills': 'Hide drills',
    'rules.add': '+ Add',
    'rules.added': '“{title}” added to My Rules',
    'rules.filtered': 'Filtered for {angle} — switch angle for more rules',
    'rules.notUsedAt': 'Not used at the {angle} angle.',
    'rules.drillCount': '{count} drills',
    'rules.more': 'More actions',
    'rules.form.title': 'Rule title',
    'rules.form.desc': 'What should be checked?',
    'rules.form.phase': 'Swing phase',
    'rules.form.angles': 'Verifiable from',
    'rules.form.cancel': 'Cancel',
    'rules.form.save': 'Add',

    // Settings
    'settings.title': 'Settings',
    'settings.appearance': 'Appearance',
    'settings.theme': 'Theme',
    'settings.theme.system': 'System',
    'settings.theme.light': 'Light',
    'settings.theme.dark': 'Dark',
    'settings.accent': 'Accent color',
    'settings.language': 'Language',
    'settings.voice': 'Voice readout',
    'settings.voice.enable': 'Read feedback aloud',
    'settings.voice.mode': 'Readout mode',
    'settings.voice.quick': 'Quick',
    'settings.voice.detailed': 'Detail',
    'settings.voice.voice': 'Voice',
    'settings.voice.auto': 'Automatic (best Swedish)',
    'settings.voice.none': 'No voice available',
    'settings.camera': 'Camera',
    'settings.camera.angle': 'Default angle',
    'settings.help': 'Help',
    'settings.replayOnboarding': 'Replay the intro tour',
    'settings.feedback': 'Send feedback',
    'settings.feedbackSubtitle': 'Found a bug or have an idea? Get in touch.',
    'settings.about': 'SwingCheck · rule-based swing analysis',

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
      'Behind the gear you turn on the readout — choose Quick for a fast verdict or Detail for the full analysis.',
    'onb.record.range': 'Headset control',
    'onb.recordBody2':
      'At the range, the headset play/pause button can start and stop recording so you never look at the screen. Turns on automatically in session mode.',
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
