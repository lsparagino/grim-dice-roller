/**
 * SVG icons for each die type — stylized outlines matching the Grim aesthetic.
 */
export const diceIcons = {
  d4: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 4L4 40h40L24 4z"/>
    <path d="M24 4L14 40M24 4l10 36M4 40h40" opacity="0.3"/>
  </svg>`,
  d6: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="6" y="6" width="36" height="36" rx="3"/>
    <circle cx="16" cy="16" r="2" fill="currentColor" opacity="0.4"/>
    <circle cx="32" cy="16" r="2" fill="currentColor" opacity="0.4"/>
    <circle cx="16" cy="32" r="2" fill="currentColor" opacity="0.4"/>
    <circle cx="32" cy="32" r="2" fill="currentColor" opacity="0.4"/>
    <circle cx="24" cy="24" r="2" fill="currentColor" opacity="0.4"/>
  </svg>`,
  d8: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 2L4 18v12l20 16 20-16V18L24 2z"/>
    <path d="M4 18l20 6 20-6M24 24v22M24 2v22" opacity="0.3"/>
  </svg>`,
  d10: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 2L6 16l18 30 18-30L24 2z"/>
    <path d="M6 16h36" opacity="0.3"/>
    <path d="M24 2v44" opacity="0.2"/>
  </svg>`,
  d12: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 2l-14 8-4 14 8 14h20l8-14-4-14L24 2z"/>
    <path d="M10 10l14 14M38 10L24 24M6 24h18M42 24H24M18 38l6-14M30 38l-6-14" opacity="0.25"/>
  </svg>`,
  d20: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M24 2L4 16v16l20 14 20-14V16L24 2z"/>
    <path d="M24 2v44M4 16l20 8 20-8M4 32l20-8 20 8" opacity="0.25"/>
  </svg>`,
};

/**
 * The max face value for each die type.
 */
export const diceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];
export const diceMax = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };
