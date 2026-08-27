import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  createElement,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { UserSession, Role } from './types';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';

const PROFILE_KEY = 'bm_profile';

function readProfile(user: User): UserSession {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as UserSession;
      if (stored.id === user.id) return stored;
    }
  } catch {
    // Recreate the profile from the authenticated Supabase user below.
  }

  return {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
    role: null,
  };
}

function writeProfile(profile: UserSession | null): void {
  if (profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    // Kept temporarily for the current API's compatibility headers.
    localStorage.setItem('bm_session', JSON.stringify(profile));
  } else {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem('bm_session');
  }
}

function missingConfigurationError(): Error {
  return new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para usar a autenticação.');
}

function translateAuthError(error: { message: string }): Error {
  const message = error.message.toLowerCase();
  if (message.includes('invalid login credentials')) return new Error('E-mail ou senha inválidos.');
  if (message.includes('email not confirmed')) return new Error('Confirme seu e-mail antes de entrar.');
  if (message.includes('user already registered')) return new Error('Este e-mail já está cadastrado.');
  if (message.includes('password should be at least')) return new Error('A senha deve ter pelo menos 6 caracteres.');
  if (message.includes('rate limit')) return new Error('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  return new Error(error.message);
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  setRole: (role: Role) => void;
  setProfessional: (professionalId: string) => void;
  setAvatar: (avatar: string) => void;
  setName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const applyAuthState = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user || null);
    if (nextSession?.user) {
      const nextProfile = readProfile(nextSession.user);
      setProfile(nextProfile);
      writeProfile(nextProfile);
    } else {
      setProfile(null);
      writeProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Falha ao recuperar sessão do Supabase:', error);
      if (mounted) {
        applyAuthState(data.session);
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) applyAuthState(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [applyAuthState]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw missingConfigurationError();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw translateAuthError(error);
  }, []);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    if (!supabase) throw missingConfigurationError();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name.trim() } },
    });
    if (error) throw translateAuthError(error);
    return { needsEmailConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) throw missingConfigurationError();
    const { error } = await supabase.auth.signOut();
    if (error) throw translateAuthError(error);
  }, []);

  const updateProfile = useCallback((update: Partial<UserSession>) => {
    setProfile((current) => {
      if (!current) return null;
      const updated = { ...current, ...update };
      writeProfile(updated);
      return updated;
    });
  }, []);

  const setRole = useCallback((role: Role) => updateProfile({ role }), [updateProfile]);
  const setProfessional = useCallback((professionalId: string) => updateProfile({ professionalId }), [updateProfile]);
  const setAvatar = useCallback((avatar: string) => updateProfile({ avatar }), [updateProfile]);
  const setName = useCallback(async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error('Informe seu nome completo.');
    if (supabase) {
      const { error } = await supabase.auth.updateUser({ data: { full_name: trimmedName } });
      if (error) throw translateAuthError(error);
    }
    updateProfile({ name: trimmedName });
  }, [updateProfile]);

  return createElement(
    AuthContext.Provider,
    { value: { user, session, profile, loading, signIn, signUp, signOut, setRole, setProfessional, setAvatar, setName } },
    children,
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}