# NISMS Identity & Application Architecture

NISMS is **two independent applications sharing one backend and one database.**

```
┌─────────────────────────────────────────────────────────────────┐
│  APPLICATION A — Natural Intellects Platform                    │
│  Entry: /admin/login   Routes: /admin/*                         │
│  Code: frontend/src/app/(platform)/ + PlatformSidebar           │
│  Users: Natural Intellects staff (SUPER_ADMIN, SUPPORT_ADMIN)   │
│  Session audience: nisms:platform                               │
│  Purpose: manage the fleet — schools, subscriptions, feature    │
│    flags, billing, analytics, audit logs, support triage        │
│  Branding: Natural Intellects, always                           │
│  Must never: write school data outside an explicit School       │
│    Context; appear in any school-facing URL, UI, or copy        │
├─────────────────────────────────────────────────────────────────┤
│  APPLICATION B — School Management System                       │
│  Entry: /login   Routes: /dashboard/*                           │
│  Code: frontend/src/app/(school)/ + SchoolSidebar               │
│  Users: one school's staff (SCHOOL_ADMIN … TEACHER; students    │
│    and parents in future portals)                               │
│  Session audience: nisms:school                                 │
│  Purpose: manage exactly one school                             │
│  Branding: the school's own (logo, colours, motto, footer)      │
│  Must never: reference the platform, other schools, plan        │
│    management, SaaS terminology, or Natural Intellects at all   │
├─────────────────────────────────────────────────────────────────┤
│  SHARED INFRASTRUCTURE                                          │
│  One Express API, one PostgreSQL database (schoolId on every    │
│  tenant row), Prisma schema, primitive UI components (ui.tsx),  │
│  transport (lib/api.ts). Application shells, navigation,        │
│  layouts, and login flows are NEVER shared.                     │
└─────────────────────────────────────────────────────────────────┘
```

## Sessions

JWTs carry `sub`, `role`, `schoolId`, `tokenVersion`, plus `aud` and `iss`:

- `aud: nisms:school` — minted by `POST /api/auth/login`; only school-role accounts.
- `aud: nisms:platform` — minted by `POST /api/admin/auth/login`; only platform-role accounts.
- `iss: nisms-auth` — verified on every request.
- `tokenVersion` — compared to the user row per request; bumped on password change,
  deactivation, or role change to revoke all outstanding sessions instantly.

Each login endpoint rejects the other domain's accounts with the same generic
message as wrong credentials — neither application acknowledges the other exists.
Both endpoints are rate limited (per IP and per account). `STUDENT` accounts
receive 403 until the student portal exists.

`requirePlatformDomain` guards `/api/admin/*` and support triage. School-module
routes are guarded by per-route RBAC plus tenant scoping.

## School Context (not impersonation)

Platform staff are never logged into a school. To work on a school they open a
**School Workspace** from the Control Center:

1. Control Center → school detail → **Open school workspace →**
2. The frontend stores the selection and sends `x-school-context: <schoolId>`
   on subsequent requests; `tenantContext` resolves the tenant from it.
3. The school shell renders a persistent banner — *Viewing: St Mary's — signed
   in as John Doe (SUPER ADMIN)* — with an **Exit school workspace** action.
4. Identity never changes: every audit row records the real platform user as
   the actor and the school as the subject
   (`SUPER_ADMIN performed STUDENT_UPDATED on School X`).

School users are locked to their own school; a mismatching context header is
rejected by the backend.

## Tenant branding

Schools own their interface: logo, primary/secondary colours, motto, and footer
text (`School.logoUrl` + `SchoolSettings`), editable under Settings → Branding.
The school shell applies them as CSS variables. The platform shell is
permanently Natural Intellects branded and ignores tenant branding by
construction (separate component tree).

## Subdomain readiness

Designed so `admin.naturalintellects.com` / `school.nisms.ug` later require only:

- a Host-based rewrite in Next.js middleware (host → route group),
- cookie/CORS configuration,
- no changes to routes, guards, or session logic (audience-based, not URL-based).

## Enforcement layers (every request)

1. Authentication — JWT signature + issuer + audience + tokenVersion + live user lookup
2. Domain — platform routes require the platform audience
3. RBAC — `requireRoles(...)` per route (SUPER_ADMIN passes)
4. Tenant — `schoolId` scoping on every query; context header validated
5. Feature flags — `requireFeature(key)` per module; UI hiding is cosmetic only

The backend is the final authority; the frontend only reflects state.
