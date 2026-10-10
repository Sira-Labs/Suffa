/** The settings page and its cards (account, devices, reminders, privacy). */
export const settings = {
  title: 'Einstellungen',
  account: {
    title: 'Konto & Synchronisation',
    serverDown:
      'Der Server ist gerade nicht erreichbar. Dein Lernstand bleibt auf diesem Gerät und wird abgeglichen, sobald er wieder da ist – du bleibst angemeldet.',
    offline:
      'Offline-Modus: Alle Daten liegen lokal auf diesem Gerät. Die Anmeldung für den Abgleich zwischen Geräten ist auf diesem Server noch nicht eingerichtet.',
    justSignedIn: '✓ Du bist angemeldet. Dein Lernstand wird abgeglichen.',
    signedInAs: 'Angemeldet als <1>{{who}}</1>',
    autoSync:
      'Dein Lernstand wird automatisch abgeglichen: beim Öffnen der App, alle paar Minuten und kurz nach jeder Übung.',
    lastSync: ' Zuletzt: {{when}}.',
    syncNow: 'Sofort abgleichen',
    syncNowHint: 'Nur nötig, wenn du sofort auf ein anderes Gerät wechselst',
    signInIntro:
      'Anmelden ohne Passwort: Du bekommst einen Link per E-Mail. Mit demselben Konto auf Handy und Computer wird dein Lernstand automatisch abgeglichen.',
  },
  display: {
    title: 'Darstellung',
    language: 'Sprache der Oberfläche',
    languageHint: 'Bedeutungen der Wörter bleiben vorerst auf Deutsch.',
    design: 'Design',
    dark: '🌙 Dunkel',
    light: '☀️ Hell',
    toggle: '{{current}} – umschalten',
    fontScale: 'Arabische Schriftgröße: {{scale}}×',
    transliteration: 'Umschrift anzeigen',
    dialectNotes: 'Golf-Dialekt-Randnotizen (nicht prüfungsrelevant)',
  },
  learning: {
    title: 'Lernen',
    dailyGoal: 'Tagesziel (Karten)',
    weeklyGoal: 'Wochenziel',
    weeklyGoalHint: 'Lerntage pro Woche – ein freier Tag bricht das Ziel nicht',
    weeklyGoalDays_one: '{{count}} Tag',
    weeklyGoalDays_other: '{{count}} Tage',
    schedule: 'Wiederholungsplan',
    scheduleHint:
      'FSRS plant jede Karte nach deinem Gedächtnis (Pilot). Heute fällige Karten bleiben fällig; zurückwechseln geht jederzeit ohne Verlust.',
    classic: 'Klassisch',
    fsrs: 'FSRS (Pilot)',
  },
  sources: {
    title: 'Quellen & Lizenzen',
    intro:
      'Woher Bücher, Aufnahmen, Videos und Beispielsätze kommen und unter welchen Bedingungen wir sie zeigen.',
    link: 'Alle Quellen & Lizenzen',
  },
  devices: {
    unknownDevice: 'Unbekanntes Gerät',
    browserOn: '{{browser}} auf {{system}}',
    openAdmin: 'Verwaltung öffnen',
    timeZone: 'Zeitzone (für Tagesziel und Serie)',
    title: 'Angemeldete Geräte',
    lastActive: 'zuletzt aktiv {{when}}',
    signedOut: '✓ Gerät abgemeldet.',
    othersSignedOut_one: '✓ Ein Gerät abgemeldet.',
    othersSignedOut_other: '✓ {{count}} Geräte abgemeldet.',
    signOutOthers: 'Auf allen anderen Geräten abmelden',
  },
  passkeys: {
    title: 'Passkeys',
    intro:
      'Melde dich mit Gesicht, Fingerabdruck oder der PIN deines Geräts an – ohne auf eine E-Mail zu warten. Link und Code funktionieren weiterhin.',
    synced: '{{name}} · auf deinen Geräten synchronisiert',
    added: 'hinzugefügt am {{date}}',
    addedMessage: '✓ Passkey hinzugefügt. Ab jetzt reicht „Mit Passkey anmelden“.',
    removed: '✓ Passkey entfernt.',
    add: 'Passkey hinzufügen',
  },
  reminders: {
    title: 'Erinnerungen',
    unavailable: 'Erinnerungen sind auf diesem Server noch nicht eingerichtet.',
    daily: 'Tägliche Erinnerung',
    dailyHint: 'Höchstens eine am Tag – und keine, wenn du schon gelernt hast',
    time: 'Uhrzeit',
    quiet: 'Ruhezeit',
    quietFrom: 'Ruhezeit von',
    quietTo: 'Ruhezeit bis',
    until: 'bis',
    recap: 'Wochenrückblick',
    recapHint: 'Sonntagabend: deine Woche in Zahlen',
    noDevice: 'Noch kein Gerät angemeldet',
    devices_one: '{{count}} Gerät bekommt Mitteilungen',
    devices_other: '{{count}} Geräte bekommen Mitteilungen',
    selfPlanned: 'Dieses Gerät plant die Erinnerung selbst',
    localTitle: 'Zeit für Arabisch',
    localBody: 'Ein paar Minuten heute halten deine Serie am Leben.',
    unsupported:
      'Dieses Gerät kann keine Mitteilungen empfangen. Auf iPhone/iPad: Suffa zum Home-Bildschirm hinzufügen und von dort öffnen.',
  },
  privacy: {
    title: 'Meine Daten',
    intro:
      'Du kannst jederzeit alles herunterladen, was Suffa über dich speichert, oder dein Konto mit allen Daten löschen.',
    download: 'Daten herunterladen',
    delete: 'Konto löschen …',
    confirm:
      'Das löscht dein Konto, deinen Lernstand auf dem Server und deine Klassenmitgliedschaften. <1>Das lässt sich nicht rückgängig machen.</1> Gib zur Bestätigung deine E-Mail-Adresse ein:',
    confirmEmail: 'E-Mail-Adresse zur Bestätigung',
    alsoLocal: 'Auch die Daten auf diesem Gerät löschen',
    deleteForGood: 'Endgültig löschen',
  },
};
