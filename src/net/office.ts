import { DEFAULT_OFFICE_SLUG, parseOfficeSnapshot, type OfficeSnapshot } from '../../shared/office';

export async function fetchOffice(slug = DEFAULT_OFFICE_SLUG): Promise<OfficeSnapshot | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`/offices/${slug}`, { signal: controller.signal });
    if (!response.ok) return null;
    return parseOfficeSnapshot(await response.json());
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
