/**
 * Plain-language help texts for when recording or pronunciation scoring fails –
 * on iPhone with the specific settings that are usually the cause.
 */
import type { RecorderFailure } from '@/services/audio';
import type { RecognitionFailure } from '@/services/speech';

export interface HelpContext {
  ios: boolean;
  /** Launched as a Home Screen app (PWA) instead of in a browser tab. */
  standalone: boolean;
}

export function recorderHelp(
  reason: RecorderFailure | 'empty',
  ctx: HelpContext
): string {
  switch (reason) {
    case 'denied':
      return ctx.ios
        ? 'Kein Zugriff aufs Mikrofon. iPhone: Einstellungen → Apps → Safari → Mikrofon auf „Fragen“ oder „Erlauben“ stellen, dann die Seite neu laden und beim Nachfragen „Erlauben“ tippen.'
        : 'Kein Zugriff aufs Mikrofon. Erlaube das Mikrofon für diese Seite (Schloss-Symbol in der Adressleiste) und lade die Seite neu.';
    case 'no-device':
      return 'Kein Mikrofon gefunden. Schließe ein Mikrofon/Headset an oder prüfe, ob es vom System erkannt wird.';
    case 'busy':
      return 'Das Mikrofon wird gerade von einer anderen App benutzt (z. B. Anruf, Sprachnachricht). Beende sie und versuche es erneut.';
    case 'insecure':
      return 'Aufnahmen sind nur über eine sichere Verbindung (https) möglich.';
    case 'unsupported':
      return ctx.ios
        ? 'Dieser Browser kann nicht aufnehmen. Öffne Suffa in Safari (ab iOS 14.3).'
        : 'Dieser Browser kann nicht aufnehmen. Nutze einen aktuellen Chrome, Edge, Firefox oder Safari.';
    case 'empty':
      return 'Die Aufnahme ist leer. Tippe auf „Aufnehmen“, sprich die Zeile und tippe erst danach auf „Stoppen“.';
    case 'error':
      return 'Die Aufnahme ist fehlgeschlagen. Bitte versuche es noch einmal.';
  }
}

export function recognitionHelp(reason: RecognitionFailure, ctx: HelpContext): string {
  const iosSetup =
    'iPhone: Einstellungen → Allgemein → Tastatur → „Diktierfunktion“ einschalten und unter „Tastaturen“ Arabisch hinzufügen.';
  switch (reason) {
    case 'no-speech':
      return 'Es wurde nichts erkannt. Sprich direkt nach dem Tippen, deutlich und etwas lauter, und halte das Telefon näher.';
    case 'timeout':
      return ctx.ios
        ? `Die Spracherkennung hat nicht geantwortet. ${iosSetup}${ctx.standalone ? ' Öffne Suffa zum Bewerten außerdem in Safari statt als Home-Bildschirm-App.' : ''}`
        : 'Die Spracherkennung hat nicht geantwortet. Bitte versuche es noch einmal.';
    case 'not-allowed':
      return ctx.ios
        ? 'Kein Zugriff aufs Mikrofon für die Spracherkennung. iPhone: Einstellungen → Apps → Safari → Mikrofon erlauben, dann neu laden.'
        : 'Kein Zugriff aufs Mikrofon für die Spracherkennung. Erlaube das Mikrofon für diese Seite und lade neu.';
    case 'service-not-allowed':
      return ctx.ios
        ? `Die Spracherkennung von iOS ist ausgeschaltet oder in der Home-Bildschirm-App nicht erlaubt. ${iosSetup} Öffne Suffa dann in Safari.`
        : 'Die Spracherkennung ist in diesem Browser nicht erlaubt. Nutze Chrome oder Edge.';
    case 'language-not-supported':
      return ctx.ios
        ? `Arabisch ist für die Spracherkennung dieses Geräts nicht eingerichtet. ${iosSetup}`
        : 'Arabisch wird von der Spracherkennung dieses Browsers nicht unterstützt. Nutze Chrome oder Edge.';
    case 'audio-capture':
      return 'Das Mikrofon liefert kein Signal. Prüfe das Mikrofon und ob eine andere App es gerade benutzt.';
    case 'network':
      return 'Für die Spracherkennung braucht der Browser eine Internetverbindung. Bitte prüfe die Verbindung.';
    case 'unsupported':
      return ctx.ios
        ? 'Automatisches Bewerten geht in diesem Browser nicht. Nutze „Aufnehmen“ und vergleiche mit „Vormachen“.'
        : 'Automatisches Bewerten geht in diesem Browser nicht (z. B. Firefox). Nutze Chrome oder Edge oder vergleiche deine Aufnahme mit „Vormachen“.';
    case 'error':
      return 'Die Bewertung ist fehlgeschlagen. Bitte versuche es noch einmal.';
  }
}
