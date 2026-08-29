# Barber Manager E2E

The suite uses Playwright against the real Supabase-backed Barber Manager app.
It never contains a password, anon key, service-role key, or fixed test user.

## Run

Against an already running artifact workflow:

```bash
E2E_BASE_URL=https://your-development-domain.example pnpm e2e
```

To let Playwright start a local Vite server instead:

```bash
E2E_START_SERVER=true pnpm e2e
```

## Accounts

Set these variables in the Replit environment or CI secret store:

```text
E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD
E2E_OPERATIONAL_EMAIL / E2E_OPERATIONAL_PASSWORD
E2E_CUSTOM_ROLE_EMAIL / E2E_CUSTOM_ROLE_PASSWORD
E2E_INVITED_EMAIL / E2E_INVITED_PASSWORD
E2E_ONBOARDING_EMAIL / E2E_ONBOARDING_PASSWORD
```

The manager account must already belong to an organization. The operational and
custom-role accounts must be members of the same test organization. The
onboarding account must not belong to an organization.

Invitation outcome tests are enabled by providing the token for the matching
fixture:

```text
E2E_INVITATION_TOKEN
E2E_EXPIRED_INVITATION_TOKEN
E2E_REVOKED_INVITATION_TOKEN
E2E_USED_INVITATION_TOKEN
E2E_EMAIL_CHECK_INVITATION_TOKEN
```

The optional custom-role route defaults to `/agenda` as allowed and
`/produtos` as denied. Override them with
`E2E_CUSTOM_ALLOWED_PATH`, `E2E_CUSTOM_ALLOWED_HEADING`, and
`E2E_CUSTOM_DENIED_PATH` when the test role has a different permission set.

Fixtures that need a dedicated account or invitation token are reported as
skipped when their environment variables are absent; public auth and route
guards still run without an account.