/** Speaking practice: shadowing, pronunciation scoring, minimal pairs, sharing (story 16.3). */
export const speaking = {
  title: 'Sprechen (Pushed Output)',
  tabs: {
    shadowing: 'Shadowing & Aussprache',
    phonology: 'Phonologie-Drills',
  },
  noLines: 'Für diese Einheit gibt es noch keine Sätze zum Nachsprechen.',
  shadowing: {
    position: 'Satz {{current}} von {{total}}',
    recorded: ' · ✓ aufgenommen',
    model: '🔊 Vormachen',
    tempo: 'Tempo',
    stop: '⏹ Aufnahme stoppen',
    record: '⏺ Aufnehmen',
    scoring: 'Bewerte…',
    scoreRecording: '✨ Aufnahme bewerten',
    listening: 'Höre zu…',
    scoreLive: '🎤 Aussprache bewerten',
    notScorable: 'Dieser Satz lässt sich nicht Buchstabe für Buchstabe bewerten.',
    previous: '← Vorheriger Satz',
    next: 'Nächster Satz →',
  },
  pairs: {
    correct: '✓ Richtig gehört!',
    wrong: '✗ Daneben – nochmal anhören.',
    contrast: 'Kontrast:',
    play: '🔊 Wort abspielen',
    noTts: 'Kein TTS verfügbar – Wörter unten zum Selbstsprechen.',
    next: 'Nächstes Paar',
  },
  letters: {
    good: 'gut',
    check: 'prüfen',
    wrong: 'verwechselt',
    recognised: '{{percent}} % der Laute erkannt',
    toPractise: 'Laute zum Üben',
    heardAs: 'gehört als',
    notHeard: 'nicht gehört',
    allClear: 'Alle Laute klar erkannt – sehr gut!',
    heard: 'Gehört:',
  },
  share: {
    needsConsent:
      'Aufnahmen mit der Lehrkraft teilen geht in deiner Klasse, sobald das Einverständnis deiner Eltern eingetragen ist.',
    shared:
      '✓ Mit der Lehrkraft von {{name}} geteilt. Unter Klasse kannst du sie jederzeit zurückziehen.',
    class: 'Klasse',
    busy: 'Teile …',
    share: '📤 Mit Lehrkraft teilen',
    shareWith: '📤 Mit Lehrkraft von {{name}} teilen',
    privacy:
      'Nur die Lehrkraft der Klasse hört sie; du kannst sie jederzeit zurückziehen.',
  },
  recorderHelp: {
    deniedIos:
      'Kein Zugriff aufs Mikrofon. iPhone: Einstellungen → Apps → Safari → Mikrofon auf „Fragen“ oder „Erlauben“ stellen, dann die Seite neu laden und beim Nachfragen „Erlauben“ tippen.',
    denied:
      'Kein Zugriff aufs Mikrofon. Erlaube das Mikrofon für diese Seite (Schloss-Symbol in der Adressleiste) und lade die Seite neu.',
    noDevice:
      'Kein Mikrofon gefunden. Schließe ein Mikrofon/Headset an oder prüfe, ob es vom System erkannt wird.',
    busy: 'Das Mikrofon wird gerade von einer anderen App benutzt (z. B. Anruf, Sprachnachricht). Beende sie und versuche es erneut.',
    insecure: 'Aufnahmen sind nur über eine sichere Verbindung (https) möglich.',
    unsupportedIos:
      'Dieser Browser kann nicht aufnehmen. Öffne Suffa in Safari (ab iOS 14.3).',
    unsupported:
      'Dieser Browser kann nicht aufnehmen. Nutze einen aktuellen Chrome, Edge, Firefox oder Safari.',
    empty:
      'Die Aufnahme ist leer. Tippe auf „Aufnehmen“, sprich die Zeile und tippe erst danach auf „Stoppen“.',
    error: 'Die Aufnahme ist fehlgeschlagen. Bitte versuche es noch einmal.',
  },
  recognitionHelp: {
    iosSetup:
      'iPhone: Einstellungen → Allgemein → Tastatur → „Diktierfunktion“ einschalten und unter „Tastaturen“ Arabisch hinzufügen.',
    noSpeech:
      'Es wurde nichts erkannt. Sprich direkt nach dem Tippen, deutlich und etwas lauter, und halte das Telefon näher.',
    timeoutIos: 'Die Spracherkennung hat nicht geantwortet. {{setup}}{{standalone}}',
    timeoutStandalone:
      ' Öffne Suffa zum Bewerten außerdem in Safari statt als Home-Bildschirm-App.',
    timeout: 'Die Spracherkennung hat nicht geantwortet. Bitte versuche es noch einmal.',
    notAllowedIos:
      'Kein Zugriff aufs Mikrofon für die Spracherkennung. iPhone: Einstellungen → Apps → Safari → Mikrofon erlauben, dann neu laden.',
    notAllowed:
      'Kein Zugriff aufs Mikrofon für die Spracherkennung. Erlaube das Mikrofon für diese Seite und lade neu.',
    serviceNotAllowedIos:
      'Die Spracherkennung von iOS ist ausgeschaltet oder in der Home-Bildschirm-App nicht erlaubt. {{setup}} Öffne Suffa dann in Safari.',
    serviceNotAllowed:
      'Die Spracherkennung ist in diesem Browser nicht erlaubt. Nutze Chrome oder Edge.',
    languageIos:
      'Arabisch ist für die Spracherkennung dieses Geräts nicht eingerichtet. {{setup}}',
    language:
      'Arabisch wird von der Spracherkennung dieses Browsers nicht unterstützt. Nutze Chrome oder Edge.',
    audioCapture:
      'Das Mikrofon liefert kein Signal. Prüfe das Mikrofon und ob eine andere App es gerade benutzt.',
    network:
      'Für die Spracherkennung braucht der Browser eine Internetverbindung. Bitte prüfe die Verbindung.',
    unsupportedIos:
      'Automatisches Bewerten geht in diesem Browser nicht. Nutze „Aufnehmen“ und vergleiche mit „Vormachen“.',
    unsupported:
      'Automatisches Bewerten geht in diesem Browser nicht (z. B. Firefox). Nutze Chrome oder Edge oder vergleiche deine Aufnahme mit „Vormachen“.',
    error: 'Die Bewertung ist fehlgeschlagen. Bitte versuche es noch einmal.',
  },
};
