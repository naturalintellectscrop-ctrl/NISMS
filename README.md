# NISMS — Natural Intellects School Management System

A multi-tenant SaaS school management platform: one codebase, one PostgreSQL database, many schools. Every tenant record carries a `schoolId`, feature access is controlled per school through database-driven feature flags, and the whole fleet is managed from the Natural Intellects Control Center.

Specification documents live in [NISMS/](NISMS/) (13 PDFs — vision, FRS, database design, feature-flag architecture, build order).

## Repository layout

| Path | What it is |
|---|---|
| `backend/` | Express + TypeScript + Prisma REST API (port 4000) |
| `frontend/` | Next.js 14 App Router UI (port 3000) |
| `docker-compose.yml` | PostgreSQL 16 for local development |
| `NISMS/` | Product & architecture specification PDFs |

## Quick start

```bash
# 1. Database (requires Docker; or point DATABASE_URL at any PostgreSQL 14+)
docker compose up -d

# 2. Backend API
cd backend
cp .env.example .env          # set JWT_SECRET in production
npm install
npx prisma migrate deploy     # applies prisma/migrations/0001_init
npm run seed                  # platform admin + demo school with sample data
npm run dev                   # http://localhost:4000

# 3. Frontend
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev                   # http://localhost:3000
```

### Seeded login accounts

| Account | Email | Password |
|---|---|---|
| Platform super admin | `admin@naturalintellects.com` | `SuperAdmin@123` |
| Platform support | `support@naturalintellects.com` | `Support@123` |
| School admin (St. Mary's) | `admin@stmarys.ac.ug` | `Admin@1234` |
| Proprietor | `proprietor@stmarys.ac.ug` | `Proprietor@123` |
| Head teacher | `headteacher@stmarys.ac.ug` | `HeadTeacher@123` |
| Secretary | `secretary@stmarys.ac.ug` | `Secretary@123` |
| Bursar | `bursar@stmarys.ac.ug` | `Bursar@1234` |
| Teacher | `teacher@stmarys.ac.ug` | `Teacher@123` |

## Architecture

### Multi-tenancy
- Every tenant table has `schoolId`; every query filters by it.
- School-bound users are locked to their own school by `tenantContext` middleware — a mismatching `x-school-id` header is rejected.
- Platform admins (`SUPER_ADMIN`, `SUPPORT_ADMIN`) select a target school via the `x-school-id` header (the Control Center's "Open school view" sets this automatically).

### Security layers (every request)
1. **Authentication** — JWT (`Authorization: Bearer`), live user lookup blocks deactivated users and suspended schools immediately.
2. **RBAC** — `requireRoles(...)` per route; `SUPER_ADMIN` always passes.
3. **Feature flags** — `requireFeature(key)` consults `hasFeature(schoolId, key)`; disabled features return 403 "Upgrade required".
4. **Tenant ownership** — `schoolId` scoping on every query.

The backend is the final authority; the frontend only reflects state (hides locked nav items, shows upgrade badges).

### Feature flag engine (`backend/src/lib/features.ts`)
- Registry of 15 feature keys (STUDENTS … API_ACCESS).
- Plan mapping: **Starter** (core 7) → **Professional** (+ library, SMS, parent portal, advanced reports) → **Enterprise** (everything).
- `applyPlanFeatures()` makes upgrades/downgrades instant: DB rows change, no code deploys; out-of-plan data is retained but locked.
- Per-school in-memory cache (60 s TTL) invalidated on toggle.

### Business rules enforced
- Students, teachers, payments, academic records are **never deleted** — archiving/status changes only.
- Payments are **immutable**; corrections go through `PaymentAdjustment` records.
- One attendance record per student per day (DB unique constraint).
- Marks cannot exceed the exam total; finalized report cards are immutable.
- One class teacher per class.
- Unique admission numbers, staff numbers, and receipt numbers per school.
- Audit log (`audit_logs`) records every significant action.

## API surface (summary)

| Prefix | Module |
|---|---|
| `POST /api/auth/login`, `/api/auth/me`, `/api/auth/users` | Auth & user management |
| `/api/school` | Tenant school profile, settings, feature map |
| `/api/students`, `/api/guardians` | Student registration, search, profiles, promotion, archiving, guardians |
| `/api/teachers` | Teacher registration, subject & class assignments |
| `/api/academics` | Classes, streams, subjects, terms |
| `/api/attendance` | Daily registers, summaries |
| `/api/exams` | Exams, bulk marks entry, report card generation & finalization |
| `/api/finance` | Fee structures, immutable payments + receipts, adjustments, outstanding balances |
| `/api/announcements` | Role-targeted announcements |
| `/api/cms` | News, gallery, editable pages |
| `/api/public/:shortName` | Public school website data (no auth) |
| `/api/admin` | Control Center: onboard schools, suspend/activate, feature toggles, plan changes, billing, analytics, audit logs |
| `/api/support` | Ticket system (school ↔ Natural Intellects) |

## Useful commands

```bash
# backend
npm run typecheck        # strict TS check
npm run build && npm start
npx prisma studio        # browse the database

# frontend
npm run build            # production build (validates all 20 routes)
```

## Deployment notes
- **Vercel (frontend):** set *Root Directory* to `frontend` when importing this repo, and add the `NEXT_PUBLIC_API_URL` env var. The Express backend cannot run on Vercel — host it on Railway/Render/Fly.io with `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=production`.
- Set a strong `JWT_SECRET`; the API refuses to boot in production with the dev default.
- Run `npx prisma migrate deploy` on release.
- Frontend needs only `NEXT_PUBLIC_API_URL`.
- File/photo URLs are stored as strings — point them at any S3-compatible bucket (Supabase Storage, MinIO, S3).
