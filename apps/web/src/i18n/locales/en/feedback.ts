import type { Messages } from '../../types';
import type { feedback as de } from '../de/feedback';

export const feedback: Messages<typeof de> = {
  button: 'Feedback',
  title: 'Feedback on this page',
  thanks: 'Thank you! Your feedback has arrived.',
  another: 'Report something else',
  done: 'Done',
  form: 'Send feedback',
  kind: 'Type of feedback',
  kinds: {
    bug: 'Bug',
    idea: 'Idea',
    confusing: 'Unclear',
    praise: 'I like it',
  },
  message: 'Your feedback',
  placeholder: 'What did you notice? What were you looking for?',
  stored:
    'We store your text, this page ({{page}}) and – if you are signed in – your account, so we can ask you about it.',
  sending: 'Sending …',
  send: 'Send',
};
