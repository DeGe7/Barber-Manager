import { Router, type Request, type Response as ExpressResponse } from "express";
import {
  ProvisionDevAdminBody,
  ProvisionDevAdminResponse,
  ProvisionOrganizationManagerBody,
  ProvisionOrganizationManagerResponse,
} from "@workspace/api-zod";

const router = Router();
const authUsersPerPage = 1000;
const maxAuthUserPages = 20;

type SupabaseConfig = {
  supabaseUrl: string;
  anonKey: string;
};

type SupabaseAdminConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: {
    full_name?: unknown;
    name?: unknown;
  } | null;
};

type MembershipRow = {
  organization_id: string;
  role: string;
  is_active: boolean;
  granted_at?: string | null;
};

class RouteError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

function getSupabaseConfig(): SupabaseConfig {
  const rawUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!rawUrl || !anonKey) {
    throw new RouteError("A configuração do Supabase não está disponível no servidor.", 503);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new RouteError("A URL do Supabase configurada no servidor é inválida.", 503);
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost") {
    throw new RouteError("A URL do Supabase configurada no servidor deve usar HTTPS.", 503);
  }

  return { supabaseUrl: parsedUrl.origin, anonKey };
}

function getAdminConfig(): SupabaseAdminConfig {
  const { supabaseUrl } = getSupabaseConfig();
  const serviceRoleKey =
    process.env.NODE_ENV === "production"
      ? process.env.SUPABASE_SERVICE_ROLE_KEY
      : process.env.E2E_SUPABASE_TEST_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new RouteError("A configuração segura do Supabase não está disponível no servidor.", 503);
  }
  return { supabaseUrl, serviceRoleKey };
}

function getAppOrigin(req: Request): string {
  const rawOrigin = req.header("origin");
  const requestHost = req.header("x-forwarded-host")?.split(",")[0]?.trim() || req.header("host");
  if (!rawOrigin || !requestHost) {
    throw new RouteError("Não foi possível validar o endereço do aplicativo.", 400);
  }
  try {
    const origin = new URL(rawOrigin);
    const localHttp = origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname);
    if (
      origin.origin !== rawOrigin ||
      origin.host.toLowerCase() !== requestHost.toLowerCase() ||
      (origin.protocol !== "https:" && !localHttp)
    ) {
      throw new Error("Invalid origin");
    }
    return origin.origin;
  } catch {
    throw new RouteError("O endereço de retorno precisa pertencer a este aplicativo.", 400);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    value = null;
  }
  if (!response.ok) {
    const errorFields = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const message = ["message", "msg", "error_description"]
      .map(key => typeof errorFields[key] === "string" ? String(errorFields[key]).toLowerCase() : "")
      .find(Boolean) ?? "";
    if (response.status === 401 || response.status === 403) {
      throw new RouteError("A sessão expirou ou não tem autorização para esta operação.", 401);
    }
    if (
      response.status === 409 ||
      ((response.status === 422 || response.status === 400) &&
        (message.includes("already registered") || message.includes("already exists")))
    ) {
      throw new RouteError("A conta ou o vínculo mudou durante a operação. Atualize a página e tente novamente.", 409);
    }
    throw new RouteError("Não foi possível concluir o provisionamento da conta.", 502);
  }
  return value as T;
}

async function authenticate(req: Request): Promise<{ token: string; userId: string; config: SupabaseConfig }> {
  const token = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new RouteError("Faça login para provisionar a conta.", 401);

  const config = getSupabaseConfig();
  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new RouteError("Não foi possível validar sua sessão do Supabase.", 502);
  }
  const user = await parseResponse<{ id?: unknown }>(response);
  if (typeof user.id !== "string" || !user.id) {
    throw new RouteError("Não foi possível validar sua sessão.", 401);
  }
  return { token, userId: user.id, config };
}

async function callerCanManageOrganization(
  context: { token: string; userId: string; config: SupabaseConfig },
  organizationId: string,
): Promise<boolean> {
  const query = new URLSearchParams({
    select: "role",
    organization_id: `eq.${organizationId}`,
    user_id: `eq.${context.userId}`,
    is_active: "eq.true",
    limit: "1",
  });
  let response: Response;
  try {
    response = await fetch(`${context.config.supabaseUrl}/rest/v1/organization_members?${query}`, {
      headers: {
        apikey: context.config.anonKey,
        Authorization: `Bearer ${context.token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new RouteError("Não foi possível confirmar seu acesso à empresa.", 502);
  }
  const memberships = await parseResponse<Array<{ role?: unknown }>>(response);
  return Array.isArray(memberships) && memberships.some(row => row.role === "gestor" || row.role === "dev-admin");
}

async function adminRequest<T>(
  admin: SupabaseAdminConfig,
  path: string,
  method = "GET",
  body?: unknown,
  prefer?: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${admin.supabaseUrl}${path}`, {
      method,
      headers: {
        apikey: admin.serviceRoleKey,
        Authorization: `Bearer ${admin.serviceRoleKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(prefer ? { Prefer: prefer } : {}),
        Accept: "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new RouteError("Não foi possível concluir a operação segura no Supabase.", 502);
  }
  return parseResponse<T>(response);
}

async function findAuthUser(admin: SupabaseAdminConfig, email: string): Promise<AuthUser | null> {
  for (let page = 1; page <= maxAuthUserPages; page += 1) {
    const query = new URLSearchParams({ page: String(page), per_page: String(authUsersPerPage) });
    const result = await adminRequest<{ users?: AuthUser[] }>(
      admin,
      `/auth/v1/admin/users?${query.toString()}`,
    );
    const users = Array.isArray(result.users) ? result.users : [];
    const match = users.find(user => user.email?.trim().toLowerCase() === email);
    if (match) return match;
    if (users.length < authUsersPerPage) return null;
  }
  throw new RouteError("Não foi possível localizar a conta com segurança. Peça suporte antes de tentar novamente.", 503);
}

async function getMemberships(admin: SupabaseAdminConfig, userId: string): Promise<MembershipRow[]> {
  const query = new URLSearchParams({
    select: "organization_id,role,is_active",
    user_id: `eq.${userId}`,
  });
  const memberships = await adminRequest<MembershipRow[]>(
    admin,
    `/rest/v1/organization_members?${query.toString()}`,
  );
  return Array.isArray(memberships) ? memberships : [];
}

async function getManagerGrantMemberships(admin: SupabaseAdminConfig, userId: string): Promise<MembershipRow[]> {
  const query = new URLSearchParams({
    select: "organization_id,role,is_active,granted_at",
    user_id: `eq.${userId}`,
  });
  const memberships = await adminRequest<MembershipRow[]>(
    admin,
    `/rest/v1/organization_members?${query.toString()}`,
  );
  return Array.isArray(memberships) ? memberships : [];
}

async function callerCanGrantManager(
  context: { token: string; userId: string; config: SupabaseConfig },
  organizationId: string,
): Promise<boolean> {
  const query = new URLSearchParams({
    select: "role",
    organization_id: `eq.${organizationId}`,
    user_id: `eq.${context.userId}`,
    is_active: "eq.true",
    limit: "1",
  });
  let response: Response;
  try {
    response = await fetch(`${context.config.supabaseUrl}/rest/v1/organization_members?${query}`, {
      headers: {
        apikey: context.config.anonKey,
        Authorization: `Bearer ${context.token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new RouteError("Não foi possível confirmar seu acesso à empresa.", 502);
  }
  const memberships = await parseResponse<Array<{ role?: unknown }>>(response);
  return Array.isArray(memberships) && memberships.some(row => row.role === "gestor");
}

async function getProfile(admin: SupabaseAdminConfig, userId: string): Promise<boolean> {
  const query = new URLSearchParams({ select: "id", id: `eq.${userId}`, limit: "1" });
  const profiles = await adminRequest<Array<{ id: string }>>(
    admin,
    `/rest/v1/profiles?${query.toString()}`,
  );
  return Array.isArray(profiles) && profiles.some(profile => profile.id === userId);
}

async function ensureExistingAuthProfile(admin: SupabaseAdminConfig, user: AuthUser): Promise<boolean> {
  if (await getProfile(admin, user.id)) return false;

  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  const fullName = typeof metadataName === "string" && metadataName.trim()
    ? metadataName.trim()
    : user.email?.split("@")[0]?.trim() || "Usuário";
  const insertQuery = new URLSearchParams({ on_conflict: "id" });
  await adminRequest(
    admin,
    `/rest/v1/profiles?${insertQuery.toString()}`,
    "POST",
    {
      id: user.id,
      email: user.email?.trim().toLowerCase() ?? "",
      full_name: fullName,
    },
    "resolution=ignore-duplicates,return=minimal",
  );
  if (!(await getProfile(admin, user.id))) {
    throw new RouteError("Não foi possível criar o perfil da conta existente. Nenhum acesso foi concedido.", 502);
  }
  return true;
}

async function createSetupLink(
  admin: SupabaseAdminConfig,
  email: string,
  isNewUser: boolean,
  redirectTo: string,
): Promise<{ user: AuthUser; actionLink: string }> {
  const query = new URLSearchParams({ redirect_to: redirectTo });
  const result = await adminRequest<{
    user?: AuthUser;
    id?: string;
    email?: string;
    action_link?: string;
    properties?: { action_link?: string };
  }>(admin, `/auth/v1/admin/generate_link?${query.toString()}`, "POST", {
    type: isNewUser ? "invite" : "recovery",
    email,
  });
  const actionLink = result.properties?.action_link ?? result.action_link;
  const user = result.user ?? (result.id ? { id: result.id, email: result.email ?? email } : undefined);
  if (!user?.id || typeof actionLink !== "string" || !actionLink) {
    throw new RouteError("O Supabase não gerou um link seguro para definir a senha.", 502);
  }
  return { user, actionLink };
}

async function cleanupNewUser(admin: SupabaseAdminConfig, userId: string): Promise<void> {
  try {
    await adminRequest(admin, `/auth/v1/admin/users/${encodeURIComponent(userId)}`, "DELETE");
  } catch {
    // The primary failure is returned; cleanup is best effort so details from
    // the Supabase admin API are never exposed to the caller.
  }
}

router.post("/admin/dev-admins", async (req, res: ExpressResponse): Promise<void> => {
  try {
    const parsedBody = ProvisionDevAdminBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "Informe um e-mail válido e a empresa correta." });
      return;
    }
    const email = parsedBody.data.email.trim().toLowerCase();
    const organizationId = parsedBody.data.organizationId.trim();

    const origin = getAppOrigin(req);
    const caller = await authenticate(req);
    if (!(await callerCanManageOrganization(caller, organizationId))) {
      res.status(403).json({ error: "Somente um Gestor ou DEV/ADMIN da empresa pode conceder este acesso." });
      return;
    }

    const admin = getAdminConfig();
    const redirectTo = new URL("/redefinir-senha", origin).toString();
    let user = await findAuthUser(admin, email);
    let createdUser = false;
    let actionLink: string | undefined;

    if (user) {
      const memberships = await getMemberships(admin, user.id);
      const existing = memberships.find(member => member.organization_id === organizationId);
      if (existing?.is_active && existing.role === "dev-admin") {
        // Reissuing a setup/reset link is intentional and does not change access.
      } else if (memberships.some(member => member.is_active) || existing) {
        res.status(409).json({
          error: "Esta conta já tem um vínculo ativo ou histórico. Nenhum acesso existente foi alterado.",
        });
        return;
      }
    }

    if (!user) {
      try {
        const created = await createSetupLink(admin, email, true, redirectTo);
        user = created.user;
        actionLink = created.actionLink;
        createdUser = true;
      } catch (error) {
        if (!(error instanceof RouteError) || error.statusCode !== 409) throw error;
        user = await findAuthUser(admin, email);
        if (!user) throw error;
      }
    }

    if (!(await getProfile(admin, user.id))) {
      if (createdUser) await cleanupNewUser(admin, user.id);
      throw new RouteError("O perfil da conta não foi criado pelo fluxo normal do Supabase. Nenhum vínculo foi adicionado.", 502);
    }

    let memberships = await getMemberships(admin, user.id);
    const alreadyProvisioned = memberships.some(
      member => member.organization_id === organizationId && member.role === "dev-admin" && member.is_active,
    );
    if (!alreadyProvisioned) {
      if (memberships.some(member => member.is_active) || memberships.some(member => member.organization_id === organizationId)) {
        if (createdUser) await cleanupNewUser(admin, user.id);
        res.status(409).json({
          error: "Esta conta já tem um vínculo ativo ou histórico. Nenhum acesso existente foi alterado.",
        });
        return;
      }

      const insertQuery = new URLSearchParams({ on_conflict: "organization_id,user_id" });
      try {
        await adminRequest(
          admin,
          `/rest/v1/organization_members?${insertQuery.toString()}`,
          "POST",
          {
            organization_id: organizationId,
            user_id: user.id,
            role: "dev-admin",
            professional_id: null,
            is_active: true,
          },
          "resolution=ignore-duplicates,return=minimal",
        );
      } catch (error) {
        memberships = await getMemberships(admin, user.id);
        const racedProvision = memberships.some(
          member => member.organization_id === organizationId && member.role === "dev-admin" && member.is_active,
        );
        if (!racedProvision) {
          if (createdUser) await cleanupNewUser(admin, user.id);
          throw error;
        }
      }
    }

    if (!actionLink) {
      const link = await createSetupLink(admin, email, false, redirectTo);
      actionLink = link.actionLink;
    }
    res.status(200).json(ProvisionDevAdminResponse.parse({
      email,
      organizationId,
      actionLink,
      createdIdentity: createdUser,
      membershipCreated: !alreadyProvisioned,
    }));
  } catch (error) {
    if (error instanceof RouteError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(502).json({ error: "Não foi possível provisionar a conta DEV/ADMIN." });
  }
});

router.post("/admin/organization-managers", async (req, res: ExpressResponse): Promise<void> => {
  try {
    const parsedBody = ProvisionOrganizationManagerBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "Informe um e-mail válido e a empresa correta." });
      return;
    }
    const email = parsedBody.data.email.trim().toLowerCase();
    const organizationId = parsedBody.data.organizationId.trim();
    const caller = await authenticate(req);
    if (!(await callerCanGrantManager(caller, organizationId))) {
      res.status(403).json({ error: "Somente o Gestor da empresa pode conceder o cargo de Gestor / Proprietário." });
      return;
    }

    const admin = getAdminConfig();
    const user = await findAuthUser(admin, email);
    if (!user) {
      res.status(404).json({ error: "Não encontramos uma conta cadastrada com esse e-mail. Nenhum acesso foi criado." });
      return;
    }

    const memberships = await getManagerGrantMemberships(admin, user.id);
    if (memberships.some(member => member.is_active || member.organization_id === organizationId)) {
      res.status(409).json({
        error: "Esta conta já tem um vínculo ativo ou histórico. Nenhum acesso existente foi alterado.",
      });
      return;
    }

    const metadataName = [user.user_metadata?.full_name, user.user_metadata?.name]
      .find(value => typeof value === "string" && value.trim());
    const fullName = typeof metadataName === "string"
      ? metadataName.trim()
      : user.email?.split("@")[0]?.trim() || "Usuário";
    const createdProfile = await ensureExistingAuthProfile(admin, user);
    const insertQuery = new URLSearchParams({ on_conflict: "organization_id,user_id" });
    let grantedAt: string | undefined;
    let membershipCreated = false;
    try {
      const inserted = await adminRequest<Array<{ granted_at?: string | null }>>(
        admin,
        `/rest/v1/organization_members?${insertQuery.toString()}`,
        "POST",
        {
          organization_id: organizationId,
          user_id: user.id,
          role: "gestor",
          professional_id: null,
          is_active: true,
          granted_by: caller.userId,
        },
        "resolution=ignore-duplicates,return=representation",
      );
      grantedAt = Array.isArray(inserted) ? inserted[0]?.granted_at ?? undefined : undefined;
      membershipCreated = Boolean(Array.isArray(inserted) && inserted.length > 0);
    } catch (error) {
      const latestMemberships = await getManagerGrantMemberships(admin, user.id);
      const racedGrant = latestMemberships.find(
        member => member.organization_id === organizationId && member.role === "gestor" && member.is_active,
      );
      if (!racedGrant) throw error;
      grantedAt = racedGrant.granted_at ?? undefined;
      membershipCreated = false;
    }

    if (!grantedAt) {
      const latestMemberships = await getManagerGrantMemberships(admin, user.id);
      const grantedMembership = latestMemberships.find(
        member => member.organization_id === organizationId && member.role === "gestor" && member.is_active,
      );
      if (!grantedMembership) {
        throw new RouteError("O Supabase não confirmou o vínculo de Gestor. Atualize a página antes de tentar novamente.", 502);
      }
      grantedAt = grantedMembership.granted_at ?? undefined;
    }

    if (!grantedAt) {
      throw new RouteError("O Supabase não confirmou a data da concessão. Verifique a migração de auditoria antes de continuar.", 503);
    }

    res.status(200).json(ProvisionOrganizationManagerResponse.parse({
      email,
      organizationId,
      fullName,
      createdProfile,
      membershipCreated,
      grantedAt,
    }));
  } catch (error) {
    if (error instanceof RouteError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    res.status(502).json({ error: "Não foi possível conceder o acesso de Gestor / Proprietário." });
  }
});

export default router;
