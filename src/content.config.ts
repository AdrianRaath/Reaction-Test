import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Content collections (REVAMP.md §5).
 *
 * `guides` — long-form articles under /guides/<id>. The entry id (filename)
 * is the URL slug; changing a filename changes a live URL, so don't.
 *
 * `tools` — the long-form copy below each tool, keyed by tool id. The FAQ
 * lives in frontmatter as data so the page can emit FAQPage JSON-LD from it;
 * the *visible* FAQ stays in the body because the live pages deliberately
 * word the two differently.
 */

const guides = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/guides' }),
  schema: z.object({
    /** H1 and breadcrumb label. */
    title: z.string(),
    /** The complete <title>, suffix included — authored, never derived (§7). */
    pageTitle: z.string(),
    description: z.string(),
    /** Dek line under the H1. */
    subtitle: z.string(),
    /** Card copy on the guides index. */
    snippet: z.string(),
    /** Position on the guides index. */
    order: z.number(),
  }),
});

const tools = defineCollection({
  loader: glob({ pattern: '*.mdx', base: './src/content/tools' }),
  schema: z.object({
    /** Source for the FAQPage JSON-LD. Text must match the live schema exactly. */
    faq: z.array(z.object({ question: z.string(), answer: z.string() })),
  }),
});

export const collections = { guides, tools };
