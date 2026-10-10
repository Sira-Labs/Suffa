/** Daily quests, streak, weekly goal, badges and certificates. */
export const engagement = {
  tiers: { bronze: 'Bronze', silver: 'Silber', gold: 'Gold' },
  /**
   * Quest titles by quest id (German as in @suffa/engagement); `<id>@<course>` is the title
   * for learners of that course where it differs.
   */
  quests: {
    'review-10': 'Wiederhole 10 Karten',
    'review-20': 'Wiederhole 20 Karten',
    'correct-12': '12 Karten richtig, mindestens 80 % Treffer',
    'new-3': 'Lerne 3 neue Wörter',
    'new-5': 'Lerne 5 neue Wörter',
    'listen-1': 'Höre einen Dialog ganz an',
    'video-1': 'Schau eine Videolektion ganz an',
    'write-3': 'Schreibe 3 Wörter richtig',
    'read-1': 'Lies einen Dialog',
    'cloze-3': 'Löse 3 Lückensätze',
    'practice-5': '5 Übungen in deiner Einheit',
    'practice-5@madinah': '5 Übungen in deiner Lektion',
    'words-5': 'Übe 5 Wörter deiner Lektion',
    'tutor-ar-1': 'Schreib al-Muʿallim etwas auf Arabisch',
  },
  /**
   * Badge meanings and rules by badge id (German as in @suffa/engagement). A rule with a
   * count has a singular and a plural form; `rule_other` is the text of the data.
   */
  badges: {
    mudawim: {
      meaning: 'der Beständige',
      rule_one: '{{count}} Tag in Folge gelernt',
      rule_other: '{{count}} Tage in Folge gelernt',
    },
    talib: {
      meaning: 'der Wissenssuchende',
      rule_one: '{{count}} Wochenziel erreicht',
      rule_other: '{{count}} Wochenziele erreicht',
    },
    mujtahid: {
      meaning: 'der Fleißige',
      rule_one: 'An {{count}} Tag alle drei Tagesaufgaben geschafft',
      rule_other: 'An {{count}} Tagen alle drei Tagesaufgaben geschafft',
    },
    bukur: {
      meaning: 'Frühaufsteher',
      rule_one: 'An {{count}} Tag vor 8 Uhr gelernt',
      rule_other: 'An {{count}} Tagen vor 8 Uhr gelernt',
    },
    hafiz: {
      meaning: 'Bewahrer der Wörter',
      rule_one: '{{count}} Karte gefestigt (Abstand ≥ 21 Tage)',
      rule_other: '{{count}} Karten gefestigt (Abstand ≥ 21 Tage)',
    },
    mustami: {
      meaning: 'der Zuhörer',
      rule_one: '{{count}} Lektion ganz gehört',
      rule_other: '{{count}} Lektionen ganz gehört',
    },
    khattat: {
      meaning: 'der Schreiber',
      rule_one: '{{count}} Wort richtig geschrieben',
      rule_other: '{{count}} Wörter richtig geschrieben',
    },
    mutakallim: {
      meaning: 'der Sprechende',
      rule_one: '{{count}} Satz gesprochen',
      rule_other: '{{count}} Sätze gesprochen',
    },
    mutasarrif: {
      meaning: 'der Konjugierende',
      rule_one: '{{count}} Verb geübt',
      rule_other: '{{count}} Verben geübt',
    },
    najm: {
      meaning: 'Stern der Prüfung',
      rule_one: '{{count}}× volle Punktzahl in einem Test',
      rule_other: '{{count}}× volle Punktzahl in einem Test',
    },
    ruh: {
      meaning: 'Klassengeist',
      rule_one: '{{count}} Klassen-Challenge mitgeschafft',
      rule_other: '{{count}} Klassen-Challenges mitgeschafft',
    },
    'stage-1': { meaning: 'Etappe 1 geschafft', rule: 'Zwischentest bestanden' },
    'stage-2': { meaning: 'Etappe 2 geschafft', rule: 'Abschlusstest bestanden' },
    'madinah-stage-1': {
      meaning: 'Medina-Kurs: Etappe 1 geschafft',
      rule: 'Alle Lektionstests der Etappe 1 bestanden',
    },
    'madinah-stage-2': {
      meaning: 'Medina-Kurs: Etappe 2 geschafft',
      rule: 'Alle Lektionstests der Etappe 2 bestanden',
    },
  },
  gallery: {
    eyebrow: 'Deine Erfolge',
    title: 'Abzeichen',
    summary: 'Level {{level}} · {{xp}} XP · {{earned}} von {{possible}} Stufen erreicht',
    footer:
      'Abzeichen gehen nie verloren. Sie ergeben sich aus deinem Lernverlauf und kommen nach einer Neuinstallation mit der Synchronisierung zurück. <1>Zu den Tagesaufgaben</1>',
    tiers: 'Stufen',
    reachedOn: 'erreicht am {{date}}',
    reached: 'erreicht',
    reachedOnCapital: 'Erreicht am {{date}}',
    progress: '{{rule}} – {{done}} von {{total}}',
    progressLabel: '{{badge}}: Fortschritt',
  },
  home: {
    title: 'Deine Abzeichen',
    reached: '{{reached}} von {{possible}} Stufen erreicht',
    seeAll: 'Alle ansehen',
    earned: 'Erreichte Abzeichen',
    none: 'Noch kein Abzeichen – das erste ist nah:',
    close: 'Fast geschafft',
    toGo: 'noch {{count}}',
    toTier: '{{badge}}: Weg zu {{tier}}',
  },
  certificates: {
    title: 'Zertifikate',
    unitDone: 'Einheit {{unit}} abgeschlossen',
    print: 'Drucken oder als PDF sichern',
  },
  celebrate: {
    quest: 'Tagesaufgabe: {{quest}}',
    allThree: 'Alle drei Tagesaufgaben geschafft',
    badge: 'Abzeichen: {{badge}}',
    badgeTier: 'Abzeichen: {{badge}} ({{tier}})',
  },
  today: {
    title: 'Tagesaufgaben',
    count: '{{done}} von 3 · Bonus +{{xp}} XP',
    keepLearning: 'Weiterlernen',
    minutes: '· ≈ {{minutes}} Min.',
    allThree: 'Alle drei geschafft – Bonus +{{xp}} XP. Bārak Allāhu fīk!',
    allDone: 'Alles erledigt für heute. Masha’Allah!',
    streakStarts: 'Serie startet mit der ersten Aufgabe',
    streak_one: '{{count}} Tag in Folge',
    streak_other: '{{count}} Tage in Folge',
    streakOpen_one: '{{count}} Tag in Folge – heute noch offen',
    streakOpen_other: '{{count}} Tage in Folge – heute noch offen',
    shieldHint:
      'Für je 7 Tage in Folge gibt es einen Schutz (höchstens 2). Er deckt einen verpassten Tag.',
    noShield: 'Kein Pausentag-Schutz',
    shields_one: '{{count}} Pausentag-Schutz',
    shields_other: '{{count}} Pausentag-Schutz',
    weeklyMet: 'Wochenziel erreicht ({{days}}/{{goal}})',
    weekly: 'Woche: {{days}}/{{goal}} Tage · noch {{left}}',
    weeksInARow: ' · {{weeks}} Wochen in Folge',
    done: 'erledigt',
    xp: '+{{xp}} XP',
  },
};
