import type { Messages } from '../../types';
import type { common as de } from '../de/common';

export const common: Messages<typeof de> = {
  appName: 'Suffa',
  toOverview: 'Suffa – to the overview',
  loadingProgress: 'Loading your progress…',
  save: 'Save',
  saved: 'Saved.',
  cancel: 'Cancel',
  remove: 'Remove',
  continue: 'Continue',
  signOut: 'Sign out',
  close: 'Close',
  back: 'Back',
  skipToContent: 'Skip to content',
  thisDevice: 'this device',
  palettes: {
    oase: { name: 'Oasis', hint: 'Deep green with saffron – the classic Suffa' },
    meer: { name: 'Sea', hint: 'Fresh turquoise with coral' },
    minze: { name: 'Mint', hint: 'Light mint green with sunflower yellow' },
    lavendel: { name: 'Lavender', hint: 'Calm violet with gold' },
    sand: { name: 'Sand', hint: 'Warm sand with terracotta' },
  },
};
