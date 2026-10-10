import type { Messages } from '../../types';
import type { speaking as de } from '../de/speaking';

export const speaking: Messages<typeof de> = {
  title: 'Speaking (pushed output)',
  tabs: {
    shadowing: 'Shadowing & pronunciation',
    phonology: 'Phonology drills',
  },
  noLines: 'There are no sentences to repeat for this unit yet.',
  shadowing: {
    position: 'Sentence {{current}} of {{total}}',
    recorded: ' · ✓ recorded',
    model: '🔊 Play model',
    tempo: 'Speed',
    stop: '⏹ Stop recording',
    record: '⏺ Record',
    scoring: 'Scoring…',
    scoreRecording: '✨ Score recording',
    listening: 'Listening…',
    scoreLive: '🎤 Score pronunciation',
    notScorable: 'This sentence cannot be scored letter by letter.',
    previous: '← Previous sentence',
    next: 'Next sentence →',
  },
  pairs: {
    correct: '✓ Well heard!',
    wrong: '✗ Missed – listen again.',
    contrast: 'Contrast:',
    play: '🔊 Play word',
    noTts: 'No speech output available – say the words below yourself.',
    next: 'Next pair',
  },
  letters: {
    good: 'good',
    check: 'check',
    wrong: 'confused',
    recognised: '{{percent}} % of the sounds recognised',
    toPractise: 'Sounds to practise',
    heardAs: 'heard as',
    notHeard: 'not heard',
    allClear: 'All sounds clearly recognised – very good!',
    heard: 'Heard:',
  },
  share: {
    needsConsent:
      'Sharing recordings with the teacher works in your class once your parents’ consent has been entered.',
    shared:
      '✓ Shared with the teacher of {{name}}. You can withdraw it at any time under Class.',
    class: 'Class',
    busy: 'Sharing …',
    share: '📤 Share with teacher',
    shareWith: '📤 Share with the teacher of {{name}}',
    privacy: 'Only the class teacher hears it; you can withdraw it at any time.',
  },
  recorderHelp: {
    deniedIos:
      'No access to the microphone. iPhone: Settings → Apps → Safari → set Microphone to “Ask” or “Allow”, then reload the page and tap “Allow” when asked.',
    denied:
      'No access to the microphone. Allow the microphone for this page (padlock icon in the address bar) and reload the page.',
    noDevice:
      'No microphone found. Connect a microphone/headset or check that your system recognises it.',
    busy: 'Another app is using the microphone right now (e.g. a call or voice message). Close it and try again.',
    insecure: 'Recording only works over a secure connection (https).',
    unsupportedIos:
      'This browser cannot record. Open Suffa in Safari (iOS 14.3 or later).',
    unsupported:
      'This browser cannot record. Use an up-to-date Chrome, Edge, Firefox or Safari.',
    empty: 'The recording is empty. Tap “Record”, say the line and only then tap “Stop”.',
    error: 'The recording failed. Please try again.',
  },
  recognitionHelp: {
    iosSetup:
      'iPhone: Settings → General → Keyboard → turn on “Dictation” and add Arabic under “Keyboards”.',
    noSpeech:
      'Nothing was recognised. Speak right after tapping, clearly and a little louder, and hold the phone closer.',
    timeoutIos: 'Speech recognition did not respond. {{setup}}{{standalone}}',
    timeoutStandalone:
      ' To score, also open Suffa in Safari instead of as a Home Screen app.',
    timeout: 'Speech recognition did not respond. Please try again.',
    notAllowedIos:
      'No microphone access for speech recognition. iPhone: Settings → Apps → Safari → allow Microphone, then reload.',
    notAllowed:
      'No microphone access for speech recognition. Allow the microphone for this page and reload.',
    serviceNotAllowedIos:
      'iOS speech recognition is turned off or not allowed in the Home Screen app. {{setup}} Then open Suffa in Safari.',
    serviceNotAllowed:
      'Speech recognition is not allowed in this browser. Use Chrome or Edge.',
    languageIos: 'Arabic is not set up for speech recognition on this device. {{setup}}',
    language:
      'This browser’s speech recognition does not support Arabic. Use Chrome or Edge.',
    audioCapture:
      'The microphone gives no signal. Check the microphone and whether another app is using it.',
    network:
      'The browser needs an internet connection for speech recognition. Please check your connection.',
    unsupportedIos:
      'Automatic scoring does not work in this browser. Use “Record” and compare with “Play model”.',
    unsupported:
      'Automatic scoring does not work in this browser (e.g. Firefox). Use Chrome or Edge, or compare your recording with “Play model”.',
    error: 'Scoring failed. Please try again.',
  },
};
