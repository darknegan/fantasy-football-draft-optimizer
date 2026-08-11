export type ArtifactSource = 'cache' | 'stale_cache' | 'bootstrap';

export interface ArtifactMeta {
  source: ArtifactSource;
  generatedAt: string | null;
}

export function sourceLabel(source: ArtifactSource): string {
  switch (source) {
    case 'cache':
      return 'R2';
    case 'stale_cache':
      return 'R2 (stale)';
    case 'bootstrap':
      return 'Bootstrap';
  }
}

export function formatArtifactGeneratedAt(iso: string, locale?: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatArtifactLine(
  kind: string,
  meta: ArtifactMeta | null | undefined,
  locale?: string,
): string | null {
  if (!meta) return null;

  const source = sourceLabel(meta.source);
  const generatedAt = meta.generatedAt && formatArtifactGeneratedAt(meta.generatedAt, locale);
  return generatedAt ? `${kind} · ${source} · ${generatedAt}` : `${kind} · ${source}`;
}
