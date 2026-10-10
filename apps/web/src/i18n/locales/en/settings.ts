import type { Messages } from '../../types';
import type { settings as de } from '../de/settings';

export const settings: Messages<typeof de> = {
  title: 'Settings',
  account: {
    title: 'Account & sync',
    serverDown:
      'The server cannot be reached right now. Your progress stays on this device and syncs as soon as it is back – you stay signed in.',
    offline:
      'Offline mode: all data stays on this device. Signing in to sync between devices is not set up on this server yet.',
    justSignedIn: '✓ You are signed in. Your progress is syncing.',
    signedInAs: 'Signed in as <1>{{who}}</1>',
    autoSync:
      'Your progress syncs automatically: when you open the app, every few minutes and shortly after each exercise.',
    lastSync: ' Last sync: {{when}}.',
    syncNow: 'Sync now',
    syncNowHint: 'Only needed if you switch to another device right away',
    signInIntro:
      'Sign in without a password: you get a link by email. With the same account on phone and computer, your progress syncs automatically.',
  },
  display: {
    title: 'Display',
    language: 'Interface language',
    languageHint: 'Word meanings stay in German for now.',
    design: 'Theme',
    dark: '🌙 Dark',
    light: '☀️ Light',
    toggle: '{{current}} – switch',
    fontScale: 'Arabic font size: {{scale}}×',
    transliteration: 'Show transliteration',
    dialectNotes: 'Gulf dialect side notes (not part of the tests)',
  },
  learning: {
    title: 'Learning',
    dailyGoal: 'Daily goal (cards)',
    weeklyGoal: 'Weekly goal',
    weeklyGoalHint: 'Learning days per week – a day off does not break the goal',
    weeklyGoalDays_one: '{{count}} day',
    weeklyGoalDays_other: '{{count}} days',
    schedule: 'Review schedule',
    scheduleHint:
      'FSRS schedules each card by your memory (pilot). Cards due today stay due; you can switch back at any time without losing anything.',
    classic: 'Classic',
    fsrs: 'FSRS (pilot)',
  },
  sources: {
    title: 'Sources & licences',
    intro:
      'Where books, recordings, videos and example sentences come from and on what terms we show them.',
    link: 'All sources & licences',
  },
  devices: {
    unknownDevice: 'Unknown device',
    browserOn: '{{browser}} on {{system}}',
    openAdmin: 'Open administration',
    timeZone: 'Time zone (for daily goal and streak)',
    title: 'Signed-in devices',
    lastActive: 'last active {{when}}',
    signedOut: '✓ Device signed out.',
    othersSignedOut_one: '✓ One device signed out.',
    othersSignedOut_other: '✓ {{count}} devices signed out.',
    signOutOthers: 'Sign out on all other devices',
  },
  passkeys: {
    title: 'Passkeys',
    intro:
      'Sign in with your face, fingerprint or device PIN – without waiting for an email. Link and code keep working.',
    synced: '{{name}} · synced across your devices',
    added: 'added on {{date}}',
    addedMessage: '✓ Passkey added. From now on “Sign in with a passkey” is enough.',
    removed: '✓ Passkey removed.',
    add: 'Add a passkey',
  },
  reminders: {
    title: 'Reminders',
    unavailable: 'Reminders are not set up on this server yet.',
    daily: 'Daily reminder',
    dailyHint: 'At most one a day – and none once you have learned',
    time: 'Time',
    quiet: 'Quiet hours',
    quietFrom: 'Quiet hours from',
    quietTo: 'Quiet hours until',
    until: 'to',
    recap: 'Weekly recap',
    recapHint: 'Sunday evening: your week in numbers',
    noDevice: 'No device registered yet',
    devices_one: '{{count}} device gets notifications',
    devices_other: '{{count}} devices get notifications',
    selfPlanned: 'This device schedules the reminder itself',
    localTitle: 'Time for Arabic',
    localBody: 'A few minutes today keep your streak alive.',
    unsupported:
      'This device cannot receive notifications. On iPhone/iPad: add Suffa to the home screen and open it from there.',
  },
  privacy: {
    title: 'My data',
    intro:
      'You can download everything Suffa stores about you at any time, or delete your account with all its data.',
    download: 'Download data',
    delete: 'Delete account …',
    confirm:
      'This deletes your account, your progress on the server and your class memberships. <1>This cannot be undone.</1> Enter your email address to confirm:',
    confirmEmail: 'Email address to confirm',
    alsoLocal: 'Also delete the data on this device',
    deleteForGood: 'Delete for good',
  },
};
