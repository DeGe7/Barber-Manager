import { createHash, randomBytes } from "node:crypto";

import { accounts, expect, requireAccount, test } from "../fixtures";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required for the private storage test.`);
  return value.replace(/\/+$/, "");
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function signIn(
  baseUrl: string,
  anonKey: string,
  account: { email: string; password: string },
) {
  const response = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });
  expect(response.ok).toBeTruthy();
  const auth = (await readJson(response)) as {
    access_token?: string;
    user?: { id?: string };
  };
  expect(auth.access_token).toBeTruthy();
  expect(auth.user?.id).toBeTruthy();
  return auth as { access_token: string; user: { id: string } };
}

test.describe("Storage privado", () => {
  test("recusa URL pública e permite URL assinada para avatar próprio", async () => {
    test.skip(
      !process.env.E2E_SUPABASE_TEST_URL ||
        !process.env.E2E_SUPABASE_TEST_ANON_KEY ||
        !accounts.manager,
      "Requires the isolated Supabase test project and a manager account.",
    );

    const baseUrl = requiredEnv("E2E_SUPABASE_TEST_URL");
    const anonKey = requiredEnv("E2E_SUPABASE_TEST_ANON_KEY");
    const productionUrl =
      process.env.E2E_SUPABASE_PRODUCTION_URL?.trim().replace(/\/+$/, "");
    expect(baseUrl).not.toBe(productionUrl);

    const manager = requireAccount(accounts.manager, "manager");
    const auth = await signIn(baseUrl, anonKey, manager);

    const authHeaders = {
      apikey: anonKey,
      Authorization: `Bearer ${auth.access_token}`,
    };
    const profileResponse = await fetch(
      `${baseUrl}/rest/v1/profiles?id=eq.${auth.user!.id}&select=default_organization_id`,
      { headers: authHeaders },
    );
    expect(profileResponse.ok).toBeTruthy();
    const profiles = (await readJson(profileResponse)) as Array<{
      default_organization_id?: string;
    }>;
    expect(profiles[0]?.default_organization_id).toBeTruthy();

    const objects = [
      { bucket: "avatars", folder: auth.user!.id },
      {
        bucket: "logos",
        folder: profiles[0]!.default_organization_id!,
      },
    ] as const;

    for (const { bucket, folder } of objects) {
      const path = `${folder}/e2e-${bucket}-${randomBytes(8).toString("hex")}.txt`;
      const uploadResponse = await fetch(
        `${baseUrl}/storage/v1/object/${bucket}/${path}`,
        {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "text/plain",
            "x-upsert": "false",
          },
          body: `private ${bucket} regression`,
        },
      );
      expect(uploadResponse.ok).toBeTruthy();

      try {
        const publicResponse = await fetch(
          `${baseUrl}/storage/v1/object/public/${bucket}/${path}`,
        );
        expect(publicResponse.ok).toBeFalsy();

        const signedResponse = await fetch(
          `${baseUrl}/storage/v1/object/sign/${bucket}/${path}`,
          {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ expiresIn: 300 }),
          },
        );
        expect(signedResponse.ok).toBeTruthy();
        const signed = (await readJson(signedResponse)) as {
          signedURL?: string;
          signedUrl?: string;
        };
        const signedPath = signed.signedURL || signed.signedUrl;
        expect(signedPath).toBeTruthy();

        const signedObjectResponse = await fetch(
          signedPath!.startsWith("http")
            ? signedPath!
            : `${baseUrl}/storage/v1${signedPath}`,
        );
        expect(signedObjectResponse.ok).toBeTruthy();
        expect(await signedObjectResponse.text()).toBe(
          `private ${bucket} regression`,
        );
      } finally {
        const deleteResponse = await fetch(
          `${baseUrl}/storage/v1/object/${bucket}/${path}`,
          {
            method: "DELETE",
            headers: authHeaders,
          },
        );
        expect(deleteResponse.ok).toBeTruthy();
      }
    }
  });

  test("RPC de convite armazena o hash SHA-256 do token", async () => {
    test.skip(
      !process.env.E2E_SUPABASE_TEST_URL ||
        !process.env.E2E_SUPABASE_TEST_ANON_KEY ||
        !process.env.E2E_SUPABASE_TEST_SERVICE_ROLE_KEY ||
        !accounts.manager,
      "Requires the isolated Supabase test project and a manager account.",
    );

    const baseUrl = requiredEnv("E2E_SUPABASE_TEST_URL");
    const anonKey = requiredEnv("E2E_SUPABASE_TEST_ANON_KEY");
    const serviceRoleKey = requiredEnv("E2E_SUPABASE_TEST_SERVICE_ROLE_KEY");
    const productionUrl =
      process.env.E2E_SUPABASE_PRODUCTION_URL?.trim().replace(/\/+$/, "");
    expect(baseUrl).not.toBe(productionUrl);

    const manager = requireAccount(accounts.manager, "manager");
    const auth = await signIn(baseUrl, anonKey, manager);
    const authHeaders = {
      apikey: anonKey,
      Authorization: `Bearer ${auth.access_token}`,
    };
    const professionalsResponse = await fetch(
      `${baseUrl}/rest/v1/professionals?select=id&is_active=eq.true`,
      { headers: authHeaders },
    );
    expect(professionalsResponse.ok).toBeTruthy();
    const professionals = (await readJson(professionalsResponse)) as Array<{
      id: string;
    }>;
    expect(professionals.length).toBeGreaterThan(0);

    const membersResponse = await fetch(
      `${baseUrl}/rest/v1/organization_members?select=professional_id`,
      { headers: authHeaders },
    );
    expect(membersResponse.ok).toBeTruthy();
    const members = (await readJson(membersResponse)) as Array<{
      professional_id?: string;
    }>;
    const linkedProfessionalIds = new Set(
      members.map((member) => member.professional_id).filter(Boolean),
    );
    const professional = professionals.find(
      (candidate) => !linkedProfessionalIds.has(candidate.id),
    );
    expect(professional).toBeTruthy();

    const tokenEmail = `e2e-hash-${randomBytes(8).toString("hex")}@example.com`;
    let invitationId = "";
    try {
      const invitationResponse = await fetch(
        `${baseUrl}/rest/v1/rpc/create_organization_invitation`,
        {
          method: "POST",
          headers: { ...authHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            p_professional_id: professional!.id,
            p_email: tokenEmail,
            p_expires_in_days: 1,
          }),
        },
      );
      const invitationBody = await readJson(invitationResponse);
      if (!invitationResponse.ok) {
        throw new Error(
          `Invitation RPC failed: ${JSON.stringify(invitationBody)}`,
        );
      }
      const invitation = invitationBody as {
        id?: string;
        token?: string;
      };
      expect(invitation.id).toBeTruthy();
      expect(invitation.token).toBeTruthy();
      invitationId = invitation.id!;

      const storedResponse = await fetch(
        `${baseUrl}/rest/v1/organization_invitations?id=eq.${invitationId}&select=token_hash`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        },
      );
      expect(storedResponse.ok).toBeTruthy();
      const stored = (await readJson(storedResponse)) as Array<{
        token_hash?: string;
      }>;
      expect(stored[0]?.token_hash).toBe(
        createHash("sha256").update(invitation.token!).digest("hex"),
      );
    } finally {
      if (invitationId) {
        const cleanupResponse = await fetch(
          `${baseUrl}/rest/v1/organization_invitations?id=eq.${invitationId}`,
          {
            method: "DELETE",
            headers: {
              apikey: serviceRoleKey,
              Authorization: `Bearer ${serviceRoleKey}`,
            },
          },
        );
        expect(cleanupResponse.ok).toBeTruthy();
      }
    }
  });
});
