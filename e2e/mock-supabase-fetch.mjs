const upstream = globalThis.fetch;
const supabaseOrigin = 'https://test-project.supabase.co';
const mockOrigin = process.env.E2E_MOCK_SUPABASE_BASE_URL;

if (!mockOrigin) {
  throw new Error('E2E_MOCK_SUPABASE_BASE_URL is required by the E2E mock fetch preload.');
}

globalThis.fetch = (input, init) => {
  const originalUrl =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!originalUrl.startsWith(supabaseOrigin)) {
    return upstream(input, init);
  }
  return upstream(`${mockOrigin}${originalUrl.slice(supabaseOrigin.length)}`, init);
};