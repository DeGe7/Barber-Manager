/**
 * API client for the Barber Manager backend.
 * Uses native fetch with the API base URL derived from the Replit dev domain.
 */

import { supabase } from '@/services/supabaseClient';

const API_BASE = (() => {
  // In production/deployed: use relative path (same origin, path-based proxy)
  // In dev (Replit): proxy via Vite server → /api/*
  return '';
})();

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let identityHeaders: Record<string, string> = {};
  try {
    const raw = localStorage.getItem('bm_session');
    if (raw) {
      const session = JSON.parse(raw) as { role?: string; professionalId?: string };
      if (session.role) identityHeaders['x-user-role'] = session.role;
      if (session.professionalId) identityHeaders['x-professional-id'] = session.professionalId;
    }
  } catch {
    // Requests remain usable while the local session is being recovered.
  }
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      identityHeaders.Authorization = `Bearer ${data.session.access_token}`;
    }
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...identityHeaders, ...init?.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${init?.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => apiFetch<T>(path);
const post = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del = (path: string) => apiFetch<void>(path, { method: 'DELETE' });

// ─── API ──────────────────────────────────────────────────────────────────────

export const api = {
  professionals: {
    list: () => get<unknown[]>('/api/professionals'),
    create: (body: unknown) => post<unknown>('/api/professionals', body),
    update: (id: string, body: unknown) => put<unknown>(`/api/professionals/${id}`, body),
    remove: (id: string) => del(`/api/professionals/${id}`),
  },
  appointments: {
    list: () => get<unknown[]>('/api/appointments'),
    create: (body: unknown) => post<unknown>('/api/appointments', body),
    update: (id: string, body: unknown) => put<unknown>(`/api/appointments/${id}`, body),
    remove: (id: string) => del(`/api/appointments/${id}`),
  },
  blocks: {
    list: () => get<unknown[]>('/api/blocks'),
    create: (body: unknown) => post<unknown>('/api/blocks', body),
    remove: (id: string) => del(`/api/blocks/${id}`),
  },
  clients: {
    list: () => get<unknown[]>('/api/clients'),
    create: (body: unknown) => post<unknown>('/api/clients', body),
    update: (id: string, body: unknown) => put<unknown>(`/api/clients/${id}`, body),
    remove: (id: string) => del(`/api/clients/${id}`),
  },
  products: {
    list: () => get<unknown[]>('/api/products'),
    create: (body: unknown) => post<unknown>('/api/products', body),
    update: (id: string, body: unknown) => put<unknown>(`/api/products/${id}`, body),
    remove: (id: string) => del(`/api/products/${id}`),
  },
  expenses: {
    list: () => get<unknown[]>('/api/expenses'),
    create: (body: unknown) => post<unknown>('/api/expenses', body),
    remove: (id: string) => del(`/api/expenses/${id}`),
  },
  incomes: {
    list: () => get<unknown[]>('/api/incomes'),
    create: (body: unknown) => post<unknown>('/api/incomes', body),
    remove: (id: string) => del(`/api/incomes/${id}`),
  },
  prothesisSales: {
    list: () => get<unknown[]>('/api/prothesis-sales'),
    create: (body: unknown) => post<unknown>('/api/prothesis-sales', body),
    update: (id: string, body: unknown) => put<unknown>(`/api/prothesis-sales/${id}`, body),
    remove: (id: string) => del(`/api/prothesis-sales/${id}`),
  },
  mentoriaSessions: {
    list: () => get<unknown[]>('/api/mentoria-sessions'),
    create: (body: unknown) => post<unknown>('/api/mentoria-sessions', body),
    update: (id: string, body: unknown) => put<unknown>(`/api/mentoria-sessions/${id}`, body),
    remove: (id: string) => del(`/api/mentoria-sessions/${id}`),
  },
  plans: {
    list: () => get<unknown[]>('/api/plans'),
    create: (body: unknown) => post<unknown>('/api/plans', body),
    update: (id: string, body: unknown) => put<unknown>(`/api/plans/${id}`, body),
    remove: (id: string) => del(`/api/plans/${id}`),
  },
  subscribers: {
    list: () => get<unknown[]>('/api/subscribers'),
    create: (body: unknown) => post<unknown>('/api/subscribers', body),
    update: (id: string, body: unknown) => put<unknown>(`/api/subscribers/${id}`, body),
    remove: (id: string) => del(`/api/subscribers/${id}`),
  },
  config: {
    get: () => get<unknown>('/api/config'),
    update: (body: unknown) => put<unknown>('/api/config', body),
  },
};
