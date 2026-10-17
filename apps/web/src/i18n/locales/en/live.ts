import type { Messages } from '../../types';
import type { live as de } from '../de/live';

export const live: Messages<typeof de> = {
  title: 'Live lessons',
  loading: 'Loading live lessons …',
  notSetUp: 'Live lessons are not set up on this server yet.',
  none: 'No live lesson planned yet.',
  plan: {
    heading: 'Plan a live lesson',
    title: 'Topic',
    titlePlaceholder: 'e.g. Lesson 5',
    startsAt: 'Starts',
    duration: 'Length (minutes)',
    audience: 'For',
    audienceHint:
      'Put learners with the sisters or the brothers under “Members”. Learners without a section only see lessons for everyone.',
    camerasOff: 'Learners’ cameras stay off (microphone only with the floor)',
    submit: 'Plan',
  },
  audience: {
    all: 'Everyone',
    sisters: 'Sisters',
    brothers: 'Brothers',
  },
  session: {
    when: '{{date}}, {{minutes}} minutes',
    live: 'Live now',
    start: 'Start',
    end: 'End',
    cancel: 'Cancel',
    confirmCancel: 'Cancel “{{title}}”?',
    join: 'Join',
    recording: 'Being recorded',
    camerasOff: 'Learners’ cameras off',
  },
  banner: {
    live: 'Live lesson in progress: {{title}}',
    join: 'Join now',
    next: 'Next live lesson: {{title}}, {{date}}',
  },
  room: {
    back: '← Back to the class',
    preJoinTeacher:
      'You lead the lesson. After joining you can turn on your microphone, camera and screen sharing.',
    preJoinLearner:
      'You listen and watch, can write in the chat and raise your hand. The teacher gives you the floor.',
    join: 'Join',
    joining: 'Connecting …',
    reconnecting: 'Reconnecting …',
    ended: 'The live lesson has ended.',
    left: 'You left the room.',
    rejoin: 'Join again',
    waitingForTeacher: 'The teacher has not arrived yet.',
    teacherCameraOff: 'The teacher’s camera is off',
    screenOf: 'Screen of {{name}}',
    hideTeacherCamera: 'Hide teacher',
    showTeacherCamera: 'Show teacher',
    background: 'Background',
    backgroundNote:
      'The background is worked out on your device. The others only see the finished picture.',
    cameraBlocked:
      'The background could not be loaded. The camera stays off until you change it or pick “None”.',
    backgroundError:
      'The background could not be switched on. The camera carries on without it.',
    addBackground: 'Add your own picture',
    removeBackground: 'Delete {{name}}',
    ownBackgroundsNote:
      'Your own pictures stay on this device: up to {{max}}, as JPEG, PNG or WebP of up to 15 MB.',
    ownBackgroundsFull:
      'You already have {{max}} pictures of your own. Delete one to add a new one.',
    ownBackgroundError: {
      type: 'Please choose a JPEG, PNG or WebP picture.',
      size: 'The picture is too large (15 MB at most).',
      full: 'You already have {{max}} pictures of your own. Delete one to add a new one.',
      unreadable: 'This picture could not be opened. Please choose another one.',
      remove: 'The picture could not be deleted. Please try again.',
    },
    you: '(you)',
    controls: 'Controls',
    micOn: 'Microphone on',
    micOff: 'Microphone off',
    cameraOn: 'Camera on',
    cameraOff: 'Camera off',
    shareScreen: 'Share screen',
    stopShare: 'Stop sharing',
    noScreenShare:
      'Screen sharing does not work in the browser on iPhone and iPad, only on a computer.',
    raiseHand: 'Raise hand',
    lowerHand: 'Lower hand',
    leave: 'Leave',
    endForAll: 'End for everyone',
    confirmEnd: 'End the live lesson for everyone?',
    floorGiven: 'You have the floor.',
    floorGivenRecording:
      'You have the floor. The recording is running: your voice is recorded too.',
    recordingNotice:
      'The teacher can record this lesson: the teacher’s picture and voice, and the voice of everyone given the floor. Your picture is never recorded. While it records, “Recording” shows at the top.',
    recordingNow: 'The recording is running right now.',
    recordingBadge: 'Recording',
    startRecording: 'Start recording',
    stopRecording: 'Stop recording',
    confirmRecording:
      'Start recording? Everyone in the room sees “Recording”. Your picture and voice are recorded, and the voice of everyone you give the floor. The recording goes unpublished into the class’s recordings.',
    recordingStarted: 'The teacher started recording.',
    recordingStopped: 'The recording has stopped.',
    recordingSaved:
      'The recording has stopped. It appears in the class’s recordings in a few minutes, still unpublished.',
    deviceError:
      'The microphone or camera could not start. Please check the browser’s permission.',
    people_one: '{{count}} in the room',
    people_other: '{{count}} in the room',
    hands: 'Raised hands',
    noHands: 'No raised hands.',
    giveFloor: 'Give the floor',
    takeFloor: 'Take the floor back',
    handRaised: 'raised a hand',
    speaking: 'speaking',
    chat: 'Chat',
    chatEmpty: 'No messages yet. The chat is not saved.',
    message: 'Message',
    send: 'Send',
  },
  backgrounds: {
    none: 'None',
    blur: 'Blur',
    stars: 'Stars',
    arches: 'Arches',
    mosque: 'Mosque at dusk',
    lattice: 'Mashrabiya',
    own: 'Own picture {{n}}',
  },
};
