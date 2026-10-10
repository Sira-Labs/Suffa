/**
 * German catalogues, one namespace per area (story 16.3). German is the source language: the
 * English catalogues are typed against these, so every key exists in both.
 */
import { account } from './account';
import { common } from './common';
import { components } from './components';
import { nav } from './nav';
import { settings } from './settings';

export const de = { common, components, nav, settings, account };
