import {
  DEFAULT_OFFICE_SLUG,
  parseOfficeSlug,
  RESERVED_OFFICE_SLUGS,
} from '../../shared/office';

export type OfficeRoute =
  | { kind: 'play'; slug: string }
  | { kind: 'create'; slug: string | null };

export function readOfficeRoute(): OfficeRoute {
  const raw = location.pathname.replace(/\/+$/, '') || '/';
  if (raw === '/') return { kind: 'play', slug: DEFAULT_OFFICE_SLUG };
  const segment = raw.slice(1).split('/')[0] ?? '';
  if (segment === 'new') return { kind: 'create', slug: null };
  const slug = parseOfficeSlug(segment);
  if (!slug || RESERVED_OFFICE_SLUGS.has(slug)) return { kind: 'play', slug: DEFAULT_OFFICE_SLUG };
  return { kind: 'play', slug };
}

export function officeHref(slug: string): string {
  return `/${slug}`;
}

export function goToOffice(slug: string): void {
  location.assign(officeHref(slug));
}
