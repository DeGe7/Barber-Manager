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
import { getStorageObjectPath } from '@/services/storage';
import { getPermissionsForRole } from './roles';

function missingConfigurationError(): Error {
  return new Error('Configure o Supabase para usar a autenticação.');
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

function translateInvitationError(error: { message: string }): Error {
  const message = error.message.toLowerCase();
  if (message.includes('not found or invalid')) return new Error('Convite inválido ou inexistente.');
  if (message.includes('was revoked')) return new Error('Este convite foi revogado pelo gestor.');
  if (message.includes('already used')) return new Error('Este convite já foi utilizado.');
  if (message.includes('has expired')) return new Error('Este convite expirou. Solicite um novo link ao gestor.');
  if (message.includes('another email')) return new Error('Entre com o e-mail que recebeu este convite.');
  if (message.includes('already belong')) return new Error('Sua conta já pertence a este estabelecimento.');
  if (message.includes('another organization')) return new Error('Sua conta já pertence a outra organização.');
  if (message.includes('another account')) return new Error('Este profissional já está vinculado a outra conta.');
  return new Error(error.message);
}

function baseProfile(user: User): UserSession {
  return {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Usuário',
    role: null,
  };
}

async function fetchProfile(user: User): Promise<UserSession> {
  if (!supabase) return baseProfile(user);

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, default_organization_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError && profileError.code !== 'PGRST205') {
    throw new Error(`Não foi possível carregar seu perfil: ${profileError.message}`);
  }

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id, role, professional_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError && membershipError.code !== 'PGRST205') {
    throw new Error(`Não foi possível carregar seu acesso: ${membershipError.message}`);
  }

  let rolePermissions: string[] | undefined;
  if (membership?.organization_id && membership.role) {
    const { data: settings } = await supabase
      .from('organization_settings')
      .select('payload')
      .eq('organization_id', membership.organization_id)
      .maybeSingle();
    const payload = settings?.payload as { roles?: Array<{ key?: string; permissions?: unknown }> } | undefined;
    const roleConfig = payload?.roles?.find(item => item.key === membership.role);
    if (Array.isArray(roleConfig?.permissions)) {
      rolePermissions = roleConfig.permissions.filter((permission): permission is string => typeof permission === 'string');
    }
  }
  const role = (membership?.role as Role | null) ?? null;

  const avatarPath = getStorageObjectPath(profileRow?.avatar_url, 'avatars');
  let avatar: string | undefined;
  if (avatarPath) {
    const { data: avatarData, error: avatarError } = await supabase.storage.from('avatars').createSignedUrl(avatarPath, 3600);
    if (avatarError) {
      console.error('Não foi possível carregar sua foto:', avatarError.message);
    } else {
      avatar = avatarData.signedUrl;
    }
  }

  return {
    id: user.id,
    email: String(profileRow?.email || user.email || ''),
    name: String(profileRow?.full_name || user.user_metadata?.full_name || 'Usuário'),
    role,
    professionalId: membership?.professional_id ? String(membership.professional_id) : undefined,
    avatar,
    organizationId: membership?.organization_id
      ? String(membership.organization_id)
      : profileRow?.default_organization_id
        ? String(profileRow.default_organization_id)
        : undefined,
    permissions: role ? getPermissionsForRole(role, rolePermissions) : undefined,
  };
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  completeOnboarding: (organizationName: string) => Promise<void>;
  acceptInvitation: (token: string) => Promise<void>;
  setAvatar: (file: File) => Promise<void>;
  setName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setUser(nextSession?.user || null);
    if (!nextSession?.user) {
      setProfile(null);
      return;
    }

    try {
      setProfile(await fetchProfile(nextSession.user));
    } catch (error) {
      console.error('Falha ao carregar perfil Supabase:', error);
      setProfile(baseProfile(nextSession.user));
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) console.error('Falha ao recuperar sessão do Supabase:', error);
      if (mounted) {
        await hydrate(data.session);
        if (mounted) setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      void hydrate(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [hydrate]);

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

  const completeOnboarding = useCallback(async (organizationName: string) => {
    if (!supabase) throw missingConfigurationError();
    const trimmedName = organizationName.trim();
    if (!trimmedName) throw new Error('Informe o nome do estabelecimento.');

    const { error } = await supabase.rpc('bootstrap_organization', {
      p_name: trimmedName,
      p_cnpj: '',
      p_address: '',
    });
    if (error) throw new Error(`Não foi possível criar o estabelecimento: ${error.message}`);

    const { data: currentSession } = await supabase.auth.getSession();
    if (currentSession.session) setProfile(await fetchProfile(currentSession.session.user));
  }, []);

  const acceptInvitation = useCallback(async (token: string) => {
    if (!supabase) throw missingConfigurationError();
    if (!token.trim()) throw new Error('Convite inválido.');
    const { error } = await supabase.rpc('accept_organization_invitation', { p_token: token.trim() });
    if (error) throw translateInvitationError(error);
    const { data: currentSession } = await supabase.auth.getSession();
    if (currentSession.session) setProfile(await fetchProfile(currentSession.session.user));
  }, []);

  const setName = useCallback(async (name: string) => {
    if (!supabase) throw missingConfigurationError();
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.split(/\s+/).length < 2) {
      throw new Error('Informe seu nome completo.');
    }

    const { error } = await supabase.auth.updateUser({ data: { full_name: trimmedName } });
    if (error) throw translateAuthError(error);
    if (user) setProfile(await fetchProfile({ ...user, user_metadata: { ...user.user_metadata, full_name: trimmedName } }));
  }, [user]);

  const setAvatar = useCallback(async (file: File) => {
    if (!supabase || !user) throw missingConfigurationError();
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });
    if (uploadError) throw new Error(`Não foi possível enviar a foto: ${uploadError.message}`);

    const { data: avatarData, error: avatarUrlError } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
    if (avatarUrlError || !avatarData?.signedUrl) {
      throw new Error(`Não foi possível preparar a foto: ${avatarUrlError?.message || 'URL assinada indisponível'}`);
    }

    const { error: profileError } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', user.id);
    if (profileError) throw new Error(`Não foi possível salvar a foto: ${profileError.message}`);
    setProfile((current) => current ? { ...current, avatar: avatarData.signedUrl } : current);
  }, [user]);

  return createElement(
    AuthContext.Provider,
     { value: { user, session, profile, loading, signIn, signUp, signOut, completeOnboarding, acceptInvitation, setAvatar, setName } },
    children,
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}