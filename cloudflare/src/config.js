/**
 * Central site metadata for the Cloudflare deployment.
 * Mirrors cpanel-app/server/config.js so both backends stay in sync.
 */

const DEFAULT_SITE_NAME = 'GraceLine Answers';
const DEFAULT_TAGLINE = 'Anonymous Bible Q&A and faith-centered Christian counseling.';

export function siteConfig(env) {
  const siteName = env.SITE_NAME || DEFAULT_SITE_NAME;
  const publicBase = (env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  return {
    siteName,
    tagline: DEFAULT_TAGLINE,
    publicBase,
    // Absolute site URL: prefer explicit config, otherwise derive from the request origin
    // at render time (see seo.js) so local dev and preview hosts work without configuration.
    defaultDescription:
      'Ask Bible and life questions anonymously. Receive scripture-based counsel from ' +
      'real pastors. Browse a searchable archive of answered questions. Not a substitute ' +
      'for professional therapy or emergency care.',
    crisisDisclaimer:
      'If you are in crisis, please contact local emergency services or a crisis hotline immediately.',
    therapyDisclaimer: 'Not a substitute for licensed therapy or emergency care.',
  };
}
