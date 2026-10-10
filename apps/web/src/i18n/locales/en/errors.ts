import type { Messages } from '../../types';
import type { errors as de } from '../de/errors';

export const errors: Messages<typeof de> = {
  common: {
    forbidden: 'You don’t have permission to do that.',
    unauthorized: 'Please sign in.',
    not_found: 'Not found.',
    invalid_body: 'The input is not valid.',
    offline: 'No connection.',
    server: 'Server error ({{status}}).',
  },
  admin: {
    second_factor_required: 'Please confirm the code from your authenticator app first.',
    invalid_code: 'The code is wrong. Use the current code from the app.',
    locked: 'Too many wrong codes – please try again in 15 minutes.',
    not_set_up: 'Two-factor sign-in is not set up yet.',
    already_enabled: 'Two-factor sign-in is already set up.',
    cannot_change_self: 'Your own account cannot be changed here.',
  },
  adminAi: {
    second_factor_required: 'Please confirm the code from your authenticator app first.',
    invalid_body: 'Please check your input.',
    ai_paused: 'This month’s AI budget is used up – AI is paused.',
    ai_unavailable: 'No model answered. Are the keys set?',
    ai_quota: 'The daily quota is used up.',
    ai_bad_request: 'The model rejected the request (invalid request).',
  },
  feedback: {
    rate_limited: 'A lot of feedback is coming in right now. Please try again shortly.',
    feedback_disabled: 'Feedback is switched off here.',
    second_factor_required: 'Please confirm the code from your authenticator app first.',
  },
  content: {
    stale_revision:
      'The unit has been changed in the meantime. Reload it and then make your change again.',
    wrong_state: 'This step does not fit the unit’s current state. Reload it.',
    invalid_content: 'The content is not valid like this:',
    id_taken: 'An ID already belongs to another unit:',
    payload_too_large: 'The unit is too large.',
  },
  videos: {
    import_unavailable: 'The import needs the YouTube key (SUFFA_YOUTUBE_API_KEY).',
    invalid_body: 'Please check your input (playlist IDs start with PL…).',
    second_factor_required: 'Please confirm the code from your authenticator app first.',
  },
  media: {
    too_large: 'The file is too large (10 GB at most).',
    quota_exceeded: 'This class’s storage is full (50 GB). Delete old recordings.',
    unsupported_type:
      'This file format is not supported (audio or video, e.g. MP3, M4A, MP4).',
    parts_missing: 'Parts of the file are still missing. The upload will continue.',
    consent_required: 'Please confirm that everyone recorded has agreed.',
    upload_interrupted: 'The connection dropped. Choose the file again to continue.',
  },
  interactive: {
    transcription_unavailable: 'Automatic transcripts are not set up on this server.',
    ai_disabled: 'AI is switched off for this class (class settings).',
    no_transcript: 'The recording needs a transcript first.',
    ai_unavailable: 'No AI model is set up on this server.',
    no_summary: 'There is no finished summary yet.',
    transcript_changed:
      'This transcript line has been changed in the meantime. Please discard the suggestion.',
  },
  drive: {
    not_connected: 'Google Drive is not connected (any more). Please connect it again.',
    unsupported_type: 'Please choose audio or video files only.',
    too_large: 'A file is too large (10 GB at most).',
    quota_exceeded: 'This class’s storage is full (50 GB).',
    not_accessible: 'There is no access to one of the files.',
  },
  notifications: {
    push_disabled: 'Reminders are not set up on this server yet.',
  },
  push: {
    unsupported:
      'This device cannot receive reminders. On iPhone/iPad: add Suffa to the home screen and open it from there.',
    denied: 'Notifications are blocked. Allow them in the browser settings.',
    deniedApp: 'Notifications are blocked. Allow them in the device settings.',
    registerFailed: 'This device could not register for notifications.',
  },
  speech: {
    speech_unavailable:
      'Scoring on the server can’t be reached right now. Try it in the browser.',
    speech_off_for_class: 'Your class has switched off scoring on the server.',
    rate_limited: 'Lots of scoring in a short time – please wait a moment.',
    unsupported_audio: 'The server can’t read this recording format.',
    audio_too_short: 'The recording is too short. Say the whole sentence.',
    payload_too_large: 'The recording is too long. Say only this sentence.',
    invalid_text: 'This sentence can’t be scored letter by letter.',
  },
  classes: {
    invalid_invite:
      'This invite link has expired or is not valid. Please ask for a new one.',
    forbidden: 'Only the teacher of this class can do that.',
    not_a_learner: 'This only works for learners of the class.',
    not_eligible: 'The mastery of the unit is still below 90%.',
    exists: 'There already is a certificate for this unit.',
    unknown_unit: 'This unit does not exist.',
  },
  quiz: {
    running: 'A quiz is already running in this class.',
    no_words: 'A quiz still needs words.',
    no_quiz: 'No quiz is running right now.',
    wrong_state: 'This question is already over.',
    too_late: 'Time is up for this question.',
    not_joined: 'Join the quiz first.',
    teacher: 'As the teacher, you run the quiz.',
  },
  tutor: {
    invalid_body: 'The message is empty or too long (2000 characters at most).',
    ai_quota:
      'You have used all of today’s conversations with al-Muʿallim. You can continue tomorrow.',
    ai_paused: 'The AI features are paused this month.',
    ai_unavailable: 'al-Muʿallim can’t be reached right now. Try again in a moment.',
    no_answer: 'al-Muʿallim isn’t answering right now ({{status}}).',
  },
  privacy: {
    confirmation_mismatch: 'The email address does not match your account.',
  },
  sharing: {
    not_member: 'You are not a member of this class (yet).',
    consent_needed:
      'This class first needs your parents’ consent. Your teacher records it.',
    too_many:
      'You have already shared a lot of recordings. Withdraw older ones to share new ones.',
    rate_limited: 'Lots of recordings at once right now – please wait a moment.',
    unsupported_audio: 'The server can’t store this recording format.',
    audio_too_short: 'The recording is too short.',
    payload_too_large: 'The recording is too long. Record only this sentence.',
  },
  passkeys: {
    'already-added': 'A passkey for Suffa is already set up on this device.',
    'stale-session':
      'For your security: sign in again briefly (link or code), then you can add a passkey.',
    'unknown-passkey':
      'This passkey is not (or no longer) registered with Suffa. Sign in with a link or code.',
    'not-verified': 'Please confirm with your face, fingerprint or your device PIN.',
    'rate-limited': 'Too many attempts – please try again in a few minutes.',
    offline: 'No connection – try again in a moment.',
    failed: 'That didn’t work. Try again or use a link or code.',
  },
  signIn: {
    invalidEmail: 'Invalid email address.',
    offline: 'No connection – try again in a moment.',
    rateLimited: 'Too many requests – please try again in a few minutes.',
    unavailable: 'Sign-in is not set up on this server yet.',
    linkFailed: 'The sign-in link could not be sent.',
    codeFormat: 'The code has 6 digits.',
    tooManyAttempts:
      'Too many wrong attempts. Request a new link – it comes with a new code.',
    codeExpired: 'The code has expired. Request a new link.',
    codeWrong: 'The code is wrong. Check the digits in the latest email.',
    signOutFailed: 'Signing out didn’t work.',
    signOutOffline: 'No connection – signing out only works online.',
    notSetUp: 'Sign-in is not set up here.',
    syncDisabled: 'Sync is not configured (offline-only mode).',
  },
};
