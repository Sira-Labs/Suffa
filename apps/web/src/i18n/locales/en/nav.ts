import type { Messages } from '../../types';
import type { nav as de } from '../de/nav';

export const nav: Messages<typeof de> = {
  main: 'Main navigation',
  more: 'More',
  training: 'Practise',
  trainingIntro:
    'Practise with everything from the units you have reached – new units join with every test you pass.',
  trainingAreas: 'Practice areas',
  groups: { media: 'Media', help: 'Help', me: 'Me' },
  items: {
    today: { label: 'Today', description: 'Your path for today' },
    units: { label: 'Unit', description: 'Levels, stages and your unit' },
    classes: { label: 'Class', description: 'Your class: tasks, recordings, challenge' },
    classesTeacher: { label: 'Classes', description: 'Lead your classes' },
    training: { label: 'Practise', description: 'Practise across all units' },
    alphabet: { label: 'Alphabet', description: 'The 28 letters – to get started' },
    review: { label: 'Review', description: 'Due cards in focus mode' },
    vocab: {
      label: 'Vocabulary',
      description: 'Vocabulary trainer with every exercise type',
    },
    reading: { label: 'Reading', description: 'Dialogues with word explanations' },
    writing: { label: 'Writing', description: 'Copying, dictation and translation' },
    speaking: { label: 'Speaking', description: 'Repeat, record, minimal pairs' },
    roots: { label: 'Roots', description: 'Roots, patterns and word families' },
    conjugation: { label: 'Conjugation', description: 'Verb tables for every person' },
    exam: { label: 'Test', description: 'Mixed tests across several units' },
    discover: { label: 'Discover', description: 'Selected videos and podcasts' },
    videos: {
      label: 'Video lessons',
      description: 'Lessons on the book on YouTube, with questions along the way',
    },
    library: {
      label: 'Book media',
      description: 'All publisher videos and audio for Book 1',
    },
    tutor: {
      label: 'al-Muʿallim',
      description: 'Your AI teacher: ask, practise, get explanations',
    },
    progress: {
      label: 'Progress',
      description: 'Level, statistics, wobbly words and badges',
    },
    settings: { label: 'Settings', description: 'Account, display, reminders' },
    content: {
      label: 'Review content',
      description: 'Read units and mark them as checked',
    },
    admin: { label: 'Administration', description: 'Users, roles and audit log' },
  },
};
