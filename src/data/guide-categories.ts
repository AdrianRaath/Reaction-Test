/**
 * Guide categories — the content-side taxonomy for guides.
 *
 * Single source of truth, same pattern as the tool registry: each category
 * owns its display name and its emoji (the sanctioned color-bearing icon
 * vocabulary, DESIGN.md § Iconography), so two guides in one category can
 * never drift apart. Guides name a category in frontmatter; the schema
 * validates against these ids.
 *
 * Today the category renders as the guide header's eyebrow tag. Down the
 * line it also groups the cards on the /guides hub — a presentational
 * grouping of *content*, deliberately separate from the tool registry,
 * which stays a flat, category-free list (REVAMP.md §3.3).
 */

export const guideCategories = {
  'reaction-time': { name: 'Reaction Time', emoji: '⚡' },
  'click-speed': { name: 'Click Speed', emoji: '🖱️' },
  'memory-cognition': { name: 'Memory & Cognition', emoji: '🧠' },
} as const;

export type GuideCategoryId = keyof typeof guideCategories;

export const guideCategoryIds = Object.keys(guideCategories) as [
  GuideCategoryId,
  ...GuideCategoryId[],
];
