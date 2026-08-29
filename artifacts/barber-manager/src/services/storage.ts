/**
 * Storage metadata is persisted as an object path, never as a public URL.
 * This also lets existing public/sign URLs be converted when they are read
 * after the buckets become private.
 */
export function getStorageObjectPath(value: unknown, bucket: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  const storedValue = value.trim();
  if (!storedValue || storedValue.startsWith('data:')) return undefined;

  if (/^https?:\/\//i.test(storedValue)) {
    try {
      const url = new URL(storedValue);
      const marker = '/storage/v1/object/';
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex < 0) return undefined;

      const parts = url.pathname.slice(markerIndex + marker.length).split('/');
      if (parts.length < 3 || !['public', 'sign'].includes(parts[0]) || parts[1] !== bucket) {
        return undefined;
      }
      return decodeURIComponent(parts.slice(2).join('/')) || undefined;
    } catch {
      return undefined;
    }
  }

  return storedValue;
}