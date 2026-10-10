/**
 * Error messages from the API and the services (story 16.3). Under each area the keys are the
 * error codes the API sends (`errors:<area>.<code>`), so `apiRequest` finds them by code; an
 * area's entry wins over the shared one in `common`.
 */
export const errors = {
  common: {
    forbidden: 'Dafür fehlt die Berechtigung.',
    unauthorized: 'Bitte melde dich an.',
    not_found: 'Nicht gefunden.',
    invalid_body: 'Die Eingabe ist ungültig.',
    offline: 'Keine Verbindung.',
    server: 'Serverfehler ({{status}}).',
  },
  admin: {
    second_factor_required:
      'Bitte bestätige zuerst den Code aus deiner Authenticator-App.',
    invalid_code: 'Der Code stimmt nicht. Nimm den aktuellen Code aus der App.',
    locked: 'Zu viele falsche Codes – bitte in 15 Minuten noch einmal.',
    not_set_up: 'Die Zwei-Faktor-Anmeldung ist noch nicht eingerichtet.',
    already_enabled: 'Die Zwei-Faktor-Anmeldung ist schon eingerichtet.',
    cannot_change_self: 'Das eigene Konto kann hier nicht geändert werden.',
  },
  adminAi: {
    second_factor_required:
      'Bitte bestätige zuerst den Code aus deiner Authenticator-App.',
    invalid_body: 'Bitte prüfe die Eingaben.',
    ai_paused: 'Das KI-Budget dieses Monats ist aufgebraucht – KI macht Pause.',
    ai_unavailable: 'Kein Modell hat geantwortet. Sind die Schlüssel gesetzt?',
    ai_quota: 'Das Tageskontingent ist aufgebraucht.',
    ai_bad_request: 'Das Modell hat die Anfrage abgelehnt (ungültige Anfrage).',
  },
  feedback: {
    rate_limited: 'Gerade kommen sehr viele Rückmeldungen an. Bitte gleich noch einmal.',
    feedback_disabled: 'Rückmeldungen sind hier ausgeschaltet.',
    second_factor_required:
      'Bitte bestätige zuerst den Code aus deiner Authenticator-App.',
  },
  content: {
    stale_revision:
      'Die Einheit wurde inzwischen geändert. Lade sie neu und übernimm deine Änderung dann.',
    wrong_state: 'Dieser Schritt passt nicht zum Stand der Einheit. Lade sie neu.',
    invalid_content: 'Der Inhalt ist so nicht gültig:',
    id_taken: 'Eine Kennung gehört schon zu einer anderen Einheit:',
    payload_too_large: 'Die Einheit ist zu groß.',
  },
  videos: {
    import_unavailable:
      'Für den Import fehlt der YouTube-Schlüssel (SUFFA_YOUTUBE_API_KEY).',
    invalid_body: 'Bitte prüfe die Eingaben (Playlist-IDs beginnen mit PL…).',
    second_factor_required:
      'Bitte bestätige zuerst den Code aus deiner Authenticator-App.',
  },
  media: {
    too_large: 'Die Datei ist zu groß (höchstens 10 GB).',
    quota_exceeded: 'Der Speicher dieser Klasse ist voll (50 GB). Lösche alte Aufnahmen.',
    unsupported_type:
      'Dieses Dateiformat wird nicht unterstützt (Audio oder Video, z. B. MP3, M4A, MP4).',
    parts_missing: 'Es fehlen noch Teile der Datei. Der Upload wird fortgesetzt.',
    consent_required: 'Bitte bestätige, dass alle Aufgenommenen einverstanden sind.',
    /** Not an API code: the upload gave up after several tries. */
    upload_interrupted:
      'Die Verbindung ist abgebrochen. Wähle die Datei erneut, um fortzusetzen.',
  },
  interactive: {
    transcription_unavailable:
      'Automatische Transkripte sind auf diesem Server nicht eingerichtet.',
    ai_disabled: 'KI ist für diese Klasse ausgeschaltet (Klassen-Einstellungen).',
    no_transcript: 'Dafür braucht die Aufnahme zuerst ein Transkript.',
    ai_unavailable: 'Auf diesem Server ist kein KI-Modell eingerichtet.',
    no_summary: 'Es gibt noch keine fertige Zusammenfassung.',
    transcript_changed:
      'Diese Transkript-Zeile wurde inzwischen geändert. Bitte verwirf den Vorschlag.',
  },
  drive: {
    not_connected: 'Google Drive ist nicht (mehr) verbunden. Bitte neu verbinden.',
    unsupported_type: 'Bitte nur Audio- oder Videodateien auswählen.',
    too_large: 'Eine Datei ist zu groß (höchstens 10 GB).',
    quota_exceeded: 'Der Speicher dieser Klasse ist voll (50 GB).',
    not_accessible: 'Auf eine Datei gibt es keinen Zugriff.',
  },
  notifications: {
    push_disabled: 'Erinnerungen sind auf diesem Server noch nicht eingerichtet.',
  },
  /** Switching reminders on in this browser or app (not API codes). */
  push: {
    unsupported:
      'Dieses Gerät kann keine Erinnerungen empfangen. Auf iPhone/iPad: Suffa zum Home-Bildschirm hinzufügen und von dort öffnen.',
    denied: 'Mitteilungen sind blockiert. Erlaube sie in den Browser-Einstellungen.',
    deniedApp:
      'Mitteilungen sind blockiert. Erlaube sie in den Einstellungen des Geräts.',
    registerFailed: 'Dieses Gerät konnte sich nicht für Mitteilungen anmelden.',
  },
  speech: {
    speech_unavailable:
      'Die Bewertung auf dem Server ist gerade nicht erreichbar. Versuch es über den Browser.',
    speech_off_for_class: 'Deine Klasse hat die Bewertung auf dem Server ausgeschaltet.',
    rate_limited: 'Sehr viele Bewertungen in kurzer Zeit – bitte einen Moment warten.',
    unsupported_audio: 'Dieses Aufnahmeformat kann der Server nicht lesen.',
    audio_too_short: 'Die Aufnahme ist zu kurz. Sprich den ganzen Satz.',
    payload_too_large: 'Die Aufnahme ist zu lang. Sprich nur diesen Satz.',
    invalid_text: 'Dieser Satz lässt sich nicht Buchstabe für Buchstabe bewerten.',
  },
  classes: {
    invalid_invite:
      'Dieser Einladungslink ist abgelaufen oder ungültig. Bitte frag nach einem neuen.',
    forbidden: 'Das darf nur die Lehrkraft dieser Klasse.',
    not_a_learner: 'Das geht nur für Lernende der Klasse.',
    not_eligible: 'Die Meisterschaft der Einheit liegt noch unter 90 %.',
    exists: 'Für diese Einheit gibt es schon ein Zertifikat.',
    unknown_unit: 'Diese Einheit gibt es nicht.',
  },
  quiz: {
    running: 'In dieser Klasse läuft schon ein Quiz.',
    no_words: 'Für ein Quiz fehlen noch Wörter.',
    no_quiz: 'Gerade läuft kein Quiz.',
    wrong_state: 'Diese Frage ist schon vorbei.',
    too_late: 'Die Zeit für diese Frage ist um.',
    not_joined: 'Tritt zuerst dem Quiz bei.',
    teacher: 'Als Lehrkraft steuerst du das Quiz.',
  },
  tutor: {
    invalid_body: 'Die Nachricht ist leer oder zu lang (höchstens 2000 Zeichen).',
    ai_quota:
      'Für heute hast du alle Gespräche mit al-Muʿallim genutzt. Morgen geht es weiter.',
    ai_paused: 'Die KI-Funktionen machen diesen Monat Pause.',
    ai_unavailable:
      'al-Muʿallim ist gerade nicht erreichbar. Versuche es gleich noch einmal.',
    /** Not an API code: a turn failed before the stream started. */
    no_answer: 'al-Muʿallim antwortet gerade nicht ({{status}}).',
  },
  privacy: {
    confirmation_mismatch: 'Die E-Mail-Adresse stimmt nicht mit deinem Konto überein.',
  },
  sharing: {
    not_member: 'Du bist (noch) nicht Mitglied dieser Klasse.',
    consent_needed:
      'In dieser Klasse braucht es zuerst das Einverständnis deiner Eltern. Die Lehrkraft trägt es ein.',
    too_many:
      'Du hast schon sehr viele Aufnahmen geteilt. Zieh ältere zurück, um neue zu teilen.',
    rate_limited: 'Gerade viele Aufnahmen auf einmal – bitte einen Moment warten.',
    unsupported_audio: 'Dieses Aufnahmeformat kann der Server nicht speichern.',
    audio_too_short: 'Die Aufnahme ist zu kurz.',
    payload_too_large: 'Die Aufnahme ist zu lang. Nimm nur diesen Satz auf.',
  },
  /** Passkey ceremonies, by failure (`cancelled` stays silent and has no text). */
  passkeys: {
    'already-added': 'Auf diesem Gerät ist schon ein Passkey für Suffa eingerichtet.',
    'stale-session':
      'Zur Sicherheit: Melde dich kurz neu an (Link oder Code), dann kannst du einen Passkey hinzufügen.',
    'unknown-passkey':
      'Dieser Passkey ist bei Suffa nicht (mehr) hinterlegt. Melde dich mit Link oder Code an.',
    'not-verified':
      'Bitte bestätige mit Gesicht, Fingerabdruck oder der PIN deines Geräts.',
    'rate-limited': 'Zu viele Versuche – bitte in ein paar Minuten noch einmal.',
    offline: 'Keine Verbindung – versuch es gleich noch einmal.',
    failed: 'Das hat nicht geklappt. Versuch es noch einmal oder nimm Link oder Code.',
  },
  /** Sign-in by link or code, and signing out. */
  signIn: {
    invalidEmail: 'Ungültige E-Mail-Adresse.',
    offline: 'Keine Verbindung – versuch es gleich noch einmal.',
    rateLimited: 'Zu viele Anfragen – bitte in ein paar Minuten noch einmal.',
    unavailable: 'Die Anmeldung ist auf diesem Server noch nicht eingerichtet.',
    linkFailed: 'Der Anmeldelink konnte nicht gesendet werden.',
    codeFormat: 'Der Code hat 6 Ziffern.',
    tooManyAttempts:
      'Zu viele falsche Versuche. Fordere einen neuen Link an – er bringt einen neuen Code mit.',
    codeExpired: 'Der Code ist abgelaufen. Fordere einen neuen Link an.',
    codeWrong: 'Der Code stimmt nicht. Prüfe die Ziffern in der neuesten Mail.',
    signOutFailed: 'Abmelden hat nicht geklappt.',
    signOutOffline: 'Keine Verbindung – Abmelden geht nur online.',
    notSetUp: 'Anmelden ist hier nicht eingerichtet.',
    syncDisabled: 'Synchronisation ist nicht konfiguriert (reiner Offline-Modus).',
  },
};
