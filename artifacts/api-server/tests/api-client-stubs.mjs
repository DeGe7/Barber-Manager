export const supabase = {
  auth: {
    getSession: async () => ({
      data: { session: { access_token: 'valid-supabase-session' } },
      error: null,
    }),
  },
};

export function getStorageObjectPath(path) {
  return path;
}