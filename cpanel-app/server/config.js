'use strict';

/**
 * Central, single source of truth for site-level metadata used across the app
 * (emails, SEO endpoints, structured data). Keep text here so it stays consistent.
 */

const SITE_NAME = 'GraceLine Answers';
const SITE_TAGLINE = 'Anonymous Bible Q&A and faith-centered Christian counseling.';

const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const SITE_URL = PUBLIC_BASE_URL || 'http://localhost:5173';

const DEFAULT_DESCRIPTION =
  'Ask Bible and life questions anonymously. Receive scripture-based counsel from ' +
  'real pastors. Browse a searchable archive of answered questions. Not a substitute ' +
  'for professional therapy or emergency care.';

const CRISIS_DISCLAIMER =
  'If you are in crisis, please contact local emergency services or a crisis hotline immediately.';
const THERAPY_DISCLAIMER = 'Not a substitute for licensed therapy or emergency care.';

module.exports = {
  SITE_NAME,
  SITE_TAGLINE,
  PUBLIC_BASE_URL,
  SITE_URL,
  DEFAULT_DESCRIPTION,
  CRISIS_DISCLAIMER,
  THERAPY_DISCLAIMER,
};
