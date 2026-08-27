import { ReplitConnectors } from "@replit/connectors-sdk";

export type SupabaseProxyInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export async function supabaseProxy(
  path: string,
  init?: SupabaseProxyInit,
): Promise<Response> {
  const connectors = new ReplitConnectors();
  return connectors.proxy("supabase", path, init);
}