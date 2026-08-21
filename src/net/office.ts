import {
  DEFAULT_OFFICE_SLUG,
  parseOfficeSnapshot,
  parseOfficeSlug,
  type OfficeSnapshot,
  type OfficeSummary,
} from '../../shared/office';

export async function fetchOffice(slug = DEFAULT_OFFICE_SLUG): Promise<OfficeSnapshot | null> {
  const clean = parseOfficeSlug(slug) ?? DEFAULT_OFFICE_SLUG;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`/offices/${clean}`, { signal: controller.signal });
    if (!response.ok) return null;
    return parseOfficeSnapshot(await response.json());
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchOffices(): Promise<OfficeSummary[]> {
  try {
    const response = await fetch('/offices');
    if (!response.ok) return [];
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !Array.isArray((body as { offices?: unknown }).offices)) return [];
    return (body as { offices: OfficeSummary[] }).offices.filter(
      (item) => parseOfficeSlug(item.slug) && typeof item.name === 'string',
    );
  } catch {
    return [];
  }
}

export async function createOffice(name: string, slug: string): Promise<OfficeSnapshot> {
  const response = await fetch('/offices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ name, slug }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(officeErrorMessage(body, response.status));
  }
  const snapshot = parseOfficeSnapshot(body);
  if (!snapshot) throw new Error('Resposta inválida ao criar o escritório.');
  return snapshot;
}

export async function updateOffice(
  currentSlug: string,
  patch: { name?: string; slug?: string },
): Promise<OfficeSnapshot> {
  const response = await fetch(`/offices/${currentSlug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(patch),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(officeErrorMessage(body, response.status));
  const snapshot = parseOfficeSnapshot(body);
  if (!snapshot) throw new Error('Resposta inválida ao salvar o escritório.');
  return snapshot;
}

function officeErrorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as { error?: string; message?: string | string[] };
    if (record.error === 'SLUG_TAKEN') return 'Esse slug já está em uso.';
    if (typeof record.message === 'string') return record.message;
    if (Array.isArray(record.message)) return record.message.join(', ');
  }
  return `Não deu para criar (${status}).`;
}
