/**
 * The tool registry — single source of truth for every tool on the site.
 * See REVAMP.md §3.3.
 *
 * Drives the sidebar, related-tool cross-links, the sitemap, JSON-LD, and each
 * tool page's SEO block. Adding a tool should mean one entry here, one content
 * file, and one measurement loop — nothing else.
 *
 * Deliberately has NO category field. Tools are standalone and the list stays
 * flat; grouping is a presentational concern that can be added later without
 * touching stored data or URLs.
 *
 * Metric definitions and rank tables join this type in phase 2, when the tool
 * engine lands.
 */

export interface Tool {
  /** Route, without trailing slash. The reaction test lives at '/' (§3.4). */
  href: string;
  /** Full name — used for SEO, headings, and cross-links. */
  name: string;
  /** Short label for the sidebar, where horizontal space is tight. */
  navLabel: string;
  /** Iconify name, inlined as SVG at build time. */
  icon: string;
  /** One line, used on cross-links and link previews. */
  blurb: string;
}

export interface NavLink {
  href: string;
  label: string;
  icon: string;
}

export const tools: Tool[] = [
  {
    href: '/',
    name: 'Reaction Time Test',
    navLabel: 'Reaction Time',
    icon: 'ph:lightning',
    blurb: 'Measure your visual reaction speed in milliseconds.',
  },
  {
    href: '/cps',
    name: 'Clicks Per Second Test',
    navLabel: 'CPS Test',
    icon: 'ph:cursor-click',
    blurb: 'Measure how fast you can click, in clicks per second.',
  },
  {
    href: '/kohi-click-test',
    name: 'Kohi Click Test',
    navLabel: 'Kohi Test',
    icon: 'ph:sword',
    blurb: 'The classic fixed 10-second click test. Get your CPS and rank.',
  },
  {
    href: '/right-click-cps-test',
    name: 'Right Click CPS Test',
    navLabel: 'Right Click Test',
    icon: 'ph:mouse-right-click',
    blurb: 'Measure how fast you can right click, in clicks per second.',
  },
];

/**
 * Secondary sidebar block. Separate from `tools` because these are content,
 * not instruments — and because with only two tools today, they are also what
 * keeps the sidebar from looking empty (§3.5).
 */
export const secondaryLinks: NavLink[] = [
  { href: '/guides', label: 'Guides', icon: 'ph:book-open' },
  { href: '/about', label: 'About', icon: 'ph:info' },
];

/** Resolve the registry entry for a route, if it is a tool. */
export function getTool(href: string): Tool | undefined {
  return tools.find((t) => t.href === href);
}

/** Every tool except the one given — the basis for cross-linking (§3.3). */
export function otherTools(href: string): Tool[] {
  return tools.filter((t) => t.href !== href);
}
