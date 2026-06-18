// Detects crisis keywords and returns a flag + a hotline banner payload.
const KEYWORDS = [
  'suicide', 'suicidal', 'kill myself', 'end my life', 'end it all',
  'self-harm', 'self harm', 'cutting myself', 'hurt myself',
  'abuse', 'abused', 'rape', 'raped', 'molested', 'domestic violence',
  'overdose', 'die tonight',
];

function detectCrisis(text) {
  const t = String(text || '').toLowerCase();
  const hits = KEYWORDS.filter((k) => t.includes(k));
  if (!hits.length) return { isCrisis: false };
  return {
    isCrisis: true,
    hits,
    banner: {
      title: 'You are not alone — please reach out for immediate help.',
      lines: [
        'If you are in immediate danger, please contact local emergency services.',
        'USA — 988 Suicide & Crisis Lifeline: call or text 988',
        'UK — Samaritans: 116 123',
        'International directory: https://findahelpline.com',
      ],
    },
  };
}

module.exports = { detectCrisis };
