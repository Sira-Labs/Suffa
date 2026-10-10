/**
 * German catalogues, one namespace per area (story 16.3). German is the source language: the
 * English catalogues are typed against these, so every key exists in both.
 */
import { account } from './account';
import { admin } from './admin';
import { adminAi } from './adminAi';
import { common } from './common';
import { components } from './components';
import { content } from './content';
import { discover } from './discover';
import { library } from './library';
import { nav } from './nav';
import { settings } from './settings';
import { sources } from './sources';
import { tutor } from './tutor';
import { videos } from './videos';

export const de = {
  common,
  components,
  nav,
  settings,
  account,
  admin,
  adminAi,
  content,
  discover,
  library,
  sources,
  tutor,
  videos,
};
