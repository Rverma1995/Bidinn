# Bidinn Sales CRM — Complete Implementation Documentation

**Application:** Bidinn Sales CRM  
**Version:** 2.0.0 (API)  
**Last reviewed:** August 29, 2026  
**Scope:** What is actually implemented in `frontend/` and `backend/` (not backlog specs)

This file is the single source of truth for the live product. Related specs that are **not** fully implemented live alongside it:

- [Tata Smartflo telephony](./Tata_Telephone_Integration.md) — specification only; not in code
- [Meta Lead Ads](./Meta_integration.md) — implemented; this file summarizes the live behavior

---

## Table of Contents

1. [Overview](#1-overview)
2. [Technical Stack](#2-technical-stack)
3. [Architecture](#3-architecture)
4. [Environment Variables](#4-environment-variables)
5. [Authentication](#5-authentication)
6. [Roles and Permissions](#6-roles-and-permissions)
7. [Database Schema](#7-database-schema)
8. [Lead Pipeline and Business Rules](#8-lead-pipeline-and-business-rules)
9. [Backend API](#9-backend-api)
10. [Frontend](#10-frontend)
11. [Background Jobs](#11-background-jobs)
12. [Caching](#12-caching)
13. [Integrations](#13-integrations)
14. [Known Gaps and Mismatches](#14-known-gaps-and-mismatches)

---

## 1. Overview

Bidinn is an internal sales CRM for a travel/hospitality team. Reps work leads through a pipeline, log calls manually, create hotel bookings, record payments in INR, and report on conversion and revenue.

**What ships today**

- JWT login with four roles (Admin, Manager, Team Lead, Sales Rep)
- Lead CRUD, assignment, bulk tools, CSV/Excel import, CSV export, duplicate-phone blocking
- Kanban pipeline with drag-and-drop
- Manual call logging (outcome, duration, notes, next follow-up)
- Bookings and payments
- Dashboard, reports, team/user management
- In-app notifications (idle leads, upcoming/missed follow-ups, lead assignment)
- Assignment email to the assigned agent (`N leads assigned to you — check your dashboard`)
- Scheduled PDF email reports (delay / weekly / monthly) to a fixed recipient list
- Meta (Facebook/Instagram) Lead Ads webhook ingest
- Light/dark theme
- Command palette (`Cmd/Ctrl+K`) to jump to pages, leads, and bookings
- Installable PWA (manifest + app-shell service worker + optional Web Push)

**What does not ship today**

- Tata Smartflo click-to-call, live call status, or recordings
- SMS / WhatsApp / native mobile apps
- Offline create/edit of leads (PWA caches the app shell only)
- Email for follow-up reminders (those stay in-app / Web Push, assigned agent only)
- Google Sheets import/export
- Socket.IO / SSE (in-app notifications still poll; Web Push covers a closed tab)

---

## 2. Technical Stack

### Backend

| Piece | Choice |
|-------|--------|
| Runtime | Node.js |
| Framework | Express.js |
| Language | TypeScript |
| ORM | TypeORM |
| Database | MySQL (utf8mb4), typically AWS RDS |
| Auth | JWT (`jsonwebtoken`) + bcryptjs |
| Cache | Redis (`ioredis`) |
| File upload | multer (in-memory, used for lead import) |
| Spreadsheets | `xlsx` |
| Email | `nodemailer` (SMTP; PDF reports + assignment mail) |
| Web Push | `web-push` (VAPID; optional) |
| PDF | Puppeteer (headless Chromium HTML→PDF) |
| Scheduling | `node-cron` (email reports; other jobs use `setInterval`) |
| IDs | UUID v4 |

Entry point: `backend/src/index.ts`  
Default listen port: `8001`

### Frontend

| Piece | Choice |
|-------|--------|
| Framework | React 19 (CRA + CRACO) |
| Language | TypeScript / JS |
| Styling | Tailwind CSS + shadcn/ui |
| Routing | react-router-dom v7 |
| HTTP | axios (5-minute timeout for large imports) |
| Charts | Recharts |
| Toasts | sonner |
| Dates | date-fns |
| Currency | INR (₹) |
| PWA | CRA Workbox `src/service-worker.ts` (production only) + `public/manifest.json` |

Entry point: `frontend/src/App.tsx`  
API base: `REACT_APP_BACKEND_URL/api` if set, otherwise relative `/api`

### Production serving

In production the Express server also serves `frontend/build` and falls back to `index.html` for non-API routes. `index.html`, `service-worker.js`, and `manifest.json` are served `Cache-Control: no-store` so a new deploy is not stuck behind a cached shell. Hashed webpack files (`main.abcd1234.js`) are `immutable`.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Bidinn CRM                              │
│  ┌──────────────────┐   ┌──────────────────┐   ┌─────────────┐  │
│  │ Frontend         │   │ Backend          │   │ MySQL       │  │
│  │ React 19 + TS    │◄─►│ Express + TS     │◄─►│ TypeORM     │  │
│  │ pages, layout,   │   │ /api/* routes    │   │ 9 entities  │  │
│  │ AuthContext      │   │ JWT + RBAC       │   └─────────────┘  │
│  └──────────────────┘   │ cron jobs        │                    │
│                         └────────┬─────────┘   ┌─────────────┐  │
│                                  │             │ Redis cache │  │
│                                  └────────────►│ short TTL   │  │
│                                                └─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
         │                                         ▲
         │ POST /api/meta/webhook                  │
         └──────── Meta Lead Ads ──────────────────┘

Calling today: rep dials outside CRM → logs outcome in UI → POST /api/calls
Tata Smartflo: documented only, no /api/tata routes
```

### Repository layout (implementation)

```
backend/src/
  index.ts                 # server, CORS, jobs, route mount
  config/data-source.ts    # TypeORM MySQL
  middleware/auth.ts       # JWT + requireRole
  middleware/cache.ts      # Redis cache + invalidation
  entities/                # User, Lead, Call, Booking, Payment, Activity, Notification, MetaConfig, SavedFilter
  routes/                  # auth, users, leads, calls, bookings, payments, dashboard, activities, meta, admin, notifications, saved-filters
  services/                # cache, email, pdf, report-jobs, dashboard-metrics, agent-performance

frontend/src/
  App.tsx                  # routes + role gates
  contexts/AuthContext.tsx
  contexts/ThemeContext.tsx
  components/layout/       # Sidebar, Header, Layout, CommandPalette
  pages/                   # 10 screens
  lib/nav.ts               # role-filtered nav items (Sidebar + command palette)
  lib/utils.ts             # status labels, rules helpers, INR formatting
```

---

## 4. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Notes |
|----------|----------|--------|
| `DB_HOST` | Yes | MySQL host |
| `DB_PORT` | No | Default `3306` |
| `DB_USERNAME` | Yes | |
| `DB_PASSWORD` | Yes | |
| `DB_DATABASE` | Yes | |
| `JWT_SECRET` | Yes | No fallback; process throws if missing |
| `PORT` | No | Default `8001` |
| `CORS_ORIGINS` | No | Default `*` |
| `REDIS_URL` | No | Default `redis://localhost:6379` |
| `TELEPHONY_ENABLED` | No | Exposed on `GET /api/admin/features`; does not enable Tata routes |
| `SMTP_HOST` | No | If unset, report emails are skipped (warning, not a crash) |
| `SMTP_PORT` | No | Default `587` (`465` uses SMTPS) |
| `SMTP_USER` / `SMTP_PASSWORD` | No | SMTP auth |
| `EMAIL_FROM` | No | From header; falls back to `SMTP_USER` then `noreply@bidinn.com` |
| `REPORT_RECIPIENT_EMAILS` | No | Comma-separated list. Not looked up from `users`. Empty → warning, reports skip send |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | No | Web Push. Generate with `yarn vapid-keys` in `backend/`. Missing → push subscribe returns 503; in-app notifications still work |
| `VAPID_SUBJECT` | No | `mailto:` or `https:` URL. Default `mailto:noreply@bidinn.in` |

### Frontend (`frontend/.env`)

| Variable | Required | Notes |
|----------|----------|--------|
| `REACT_APP_BACKEND_URL` | No | If unset, axios uses `/api` (same origin) |

---

## 5. Authentication

### Flow

1. `POST /api/auth/login` with `{ email, password }`
2. Response: `{ access_token, user }`
3. Frontend stores token in `localStorage` key `bidinn_token`
4. Subsequent requests send `Authorization: Bearer <token>`
5. `GET /api/auth/me` hydrates the session on reload
6. HTTP 401 clears the token and sends the user to `/login`

### Token payload

```
{ sub: userId, email, role }
```

Inactive users (`is_active = false`) are rejected with 401.

### Auth endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | Public | Email/password login |
| GET | `/api/auth/me` | JWT | Current user |
| POST | `/api/auth/change-password` | JWT | Change own password |

Empty databases auto-seed one admin on startup: `alex@bidinn.com` / `password123`.

---

## 6. Roles and Permissions

Roles (`users.role` enum): `admin`, `manager`, `team_lead`, `sales_rep`

| Capability | Admin | Manager | Team Lead | Sales Rep |
|------------|-------|---------|-----------|-----------|
| View all leads | Yes | Yes | Yes | Own assigned only |
| Create leads | Yes | Yes | Yes | Yes |
| Assign / bulk assign | Yes | Yes | Yes | No |
| Import CSV/Excel | Yes | Yes | No | No |
| Bulk delete leads | Yes | Yes | No | No |
| Analyze / merge-all duplicates | Yes | No | No | No |
| Create users | Yes | Yes | No | No |
| Edit users | Yes | Yes | No | Self (name/email) |
| Reset password | Yes | No | No | No |
| View reports | All agents | All agents | All agents | Own only |
| Team page | Yes | Yes | Yes | No |
| Payments page | Yes | Yes | Yes | No |
| Edit/delete bookings | Yes | Yes | No | No |
| Edit/delete payments | Yes | Yes | No | No |
| Meta config | Yes | Yes | No | No |
| Export / wipe database | Yes | No | No | No |

Frontend route gates (`App.tsx` + `Sidebar.js` / command palette) match the table above. Settings is visible to all roles; Meta and database admin blocks inside Settings are admin/manager (Meta) or admin (DB).

---

## 7. Database Schema

TypeORM `synchronize` is **off**. Tables are expected to already exist. Charset: `utf8mb4` / `utf8mb4_unicode_ci`.

### `users`

| Column | Type | Notes |
|--------|------|--------|
| id | varchar(36) PK | UUID |
| email | varchar(255) unique | |
| name | varchar(255) | |
| password_hash | varchar(255) | bcrypt |
| role | enum | admin / manager / team_lead / sales_rep |
| is_active | boolean | default true |
| created_at | datetime | |

Index: `idx_users_role`

There is **no** `tata_extension` column.

### `leads`

| Column | Type | Notes |
|--------|------|--------|
| id | varchar(36) PK | UUID |
| name | varchar(255) | |
| phone | varchar(50) | Duplicate key for Rule 3 |
| email | varchar(255) nullable | |
| source | varchar(100) | |
| campaign | varchar(255) nullable | |
| city | varchar(100) nullable | |
| status | varchar(50) | default `new` |
| assigned_to | varchar(36) nullable | FK users.id |
| assigned_name | varchar(255) nullable | Denormalized |
| attempt_count | int | Incremented on call log |
| last_activity | datetime nullable | |
| next_followup | datetime nullable | |
| notes | text nullable | |
| meta_leadgen_id | varchar(255) nullable | Meta ingest |
| closed_reason | varchar(50) nullable | |
| closed_reason_notes | text nullable | |
| created_at / updated_at | datetime | |

Indexes: assigned_to, status, created_at, phone, source, (assigned_to, status), (status, created_at), next_followup, attempt_count, campaign.

### `calls`

Manual call logs only.

| Column | Type | Notes |
|--------|------|--------|
| id | varchar(36) PK | |
| lead_id | varchar(36) | FK leads, CASCADE |
| user_id | varchar(36) | FK users, CASCADE |
| user_name | varchar(255) | Denormalized |
| outcome | enum | see [Call outcomes](#call-outcomes) |
| duration_minutes | int | default 0 |
| notes | text nullable | |
| next_followup | datetime nullable | Copied onto the lead if set |
| created_at | datetime | |

There are **no** Tata fields (`tata_call_id`, `recording_url`, `direction`, `started_at`, `answered_at`, `ended_at`).

### `bookings`

| Column | Type | Notes |
|--------|------|--------|
| id | varchar(36) PK | |
| lead_id | varchar(36) | FK leads, CASCADE |
| lead_name | varchar(255) nullable | |
| hotel_name | varchar(255) | |
| check_in / check_out | date | |
| final_price | decimal(10,2) | |
| bid_price | decimal(10,2) nullable | |
| payment_status | enum | unpaid / partial / paid |
| payment_amount | decimal(10,2) | default 0 |
| notes | text nullable | |
| booking_reason | varchar(255) nullable | |
| created_by_id | varchar(36) | FK users |
| created_at | datetime | |

### `payments`

| Column | Type | Notes |
|--------|------|--------|
| id | varchar(36) PK | |
| booking_id | varchar(36) | FK bookings, CASCADE |
| amount | decimal(10,2) | |
| notes | text nullable | |
| created_by | varchar(36) | FK users |
| created_at | datetime | |

### `activities`

Audit trail. `user_id` may be null for system jobs.

| Column | Type | Notes |
|--------|------|--------|
| id | varchar(36) PK | |
| user_id | varchar(36) nullable | |
| user_name | varchar(255) | e.g. "System" |
| action | varchar(100) | e.g. logged_call, assigned_lead, auto_reset |
| target_id | varchar(36) nullable | |
| target_type | varchar(50) nullable | lead, escalation, … |
| target_name | varchar(255) nullable | |
| details | text nullable | |
| created_at | datetime | |

### `notifications`

| Column | Type | Notes |
|--------|------|--------|
| id | varchar(36) PK | |
| user_id | varchar(36) | FK users, CASCADE |
| type | varchar(100) | idle_lead, duplicate_lead, lead_merged, lead_assignment, followup_upcoming, followup_missed, system |
| priority | varchar(50) | low / medium / high |
| title / message | varchar / text | |
| target_id / target_type | nullable | Usually a lead |
| metadata | json nullable | |
| is_read | boolean | default false |
| created_at | datetime | |

### `saved_filters`

Personal lead-list views. Not shared across users.

| Column | Type | Notes |
|--------|------|--------|
| id | varchar(36) PK | UUID |
| user_id | varchar(36) | FK users.id, CASCADE |
| name | varchar(100) | Display name |
| filter_json | json | `{ status, source, campaign, assigned_to, search }` |
| created_at | datetime | |

Index: `idx_saved_filters_user_id`. Cap 50 rows per user.

### `push_subscriptions`

One row per browser/device endpoint. Re-login on the same device updates `user_id`. Expired endpoints (Web Push 404/410) are deleted on send.

| Column | Type | Notes |
|--------|------|--------|
| id | varchar(36) PK | UUID |
| user_id | varchar(36) | FK users.id, CASCADE |
| endpoint | varchar(768) unique | Push service URL |
| p256dh / auth | varchar(255) | Web Push keys |
| user_agent | varchar(512) nullable | |
| created_at / updated_at | datetime | |

### `meta_config`

Single-row style config for Facebook/Instagram Lead Ads.

| Column | Type |
|--------|------|
| id | varchar(36) PK |
| page_id | varchar(255) nullable |
| app_secret | varchar(255) nullable |
| verify_token | varchar(255) nullable |
| page_access_token | text nullable |
| is_active | boolean |
| created_at / updated_at | datetime |

---

## 8. Lead Pipeline and Business Rules

### Stages

| Value | Label | Notes |
|-------|-------|--------|
| `new` | New | 1-hour uncontacted countdown if `attempt_count = 0` |
| `not_answered` | Not Answered | Requires assignment |
| `interested` | Interested | Requires assignment; cannot go directly to Not Interested |
| `followup` | Follow-up | Requires assignment; cannot go directly to Not Interested |
| `not_interested` | Not Interested | Requires closed reason; reopen only to New |
| `won` | Won | Final stage (no outbound transitions in entity rules) |
| `lost` | Lost | Requires closed reason; reopen only to New |

Allowed transitions are defined in `backend/src/entities/Lead.ts` (`STAGE_TRANSITIONS`) and mirrored in `frontend/src/lib/utils.ts` (`isTransitionAllowed`).

### Closed reasons

Required when status is `not_interested` or `lost`:

| Value | Label |
|-------|-------|
| `price_too_high` | Price Too High |
| `booked_elsewhere` | Booked Elsewhere |
| `not_travelling` | Not Travelling |
| `no_response` | No Response |
| `just_browsing` | Just Browsing |
| `wrong_contact` | Wrong Contact |
| `competitor` | Went to Competitor |
| `budget_issues` | Budget Issues |
| `timing_not_right` | Timing Not Right |
| `other` | Other |

### Five CRM rules

| # | Rule | Implementation |
|---|------|----------------|
| 1 | Assignment enforcement | Cannot move to Not Answered / Interested / Follow-up unless `assigned_to` is set. Enforced in lead detail, pipeline, and bulk status. |
| 2 | Closed-reason capture | Lost / Not Interested require `closed_reason`. |
| 3 | Duplicate phone | `POST /leads` and import **block/skip** matching phones. No force-create. |
| 4 | Idle lead escalation | Cron every 6 hours: active leads with no activity for 5+ days notify admins and managers. |
| 5 | Stage restriction | Interested / Follow-up cannot jump to Not Interested; must go Won or Lost first. |

Additional live rule on `PUT /api/leads/:id`: notes are required when changing stage if the lead has no notes yet (`notes_required_for_stage_change`).

### Call outcomes

Used by manual logging (`POST /api/calls`):

`connected`, `no_answer`, `busy`, `voicemail`, `wrong_number`, `callback_requested`

Logging a call increments `lead.attempt_count`, sets `last_activity`, and optionally sets `next_followup`.

### Lead sources (frontend presets)

Website, Referral, Google Ads, Facebook, LinkedIn, Cold Call, Trade Show, Partner. Import and Meta can write other source strings.

---

## 9. Backend API

All business routes are prefixed with `/api`. Authenticated routes require `Authorization: Bearer <JWT>` unless noted.

Error shape: `{ "detail": "..." }`

List responses for leads (and several other resources) are paginated:

```json
{
  "leads": [ ... ],
  "pagination": { "page": 1, "limit": 50, "total": 0, "totalPages": 0 }
}
```

Default page size: **50**.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/` | Public | `{ message, version, orm }` |
| GET | `/api/health` | Public | Database connected check |

### Users — `/api/users`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | Any authenticated | List users |
| GET | `/:id` | Any authenticated | Get user |
| POST | `/` | Admin, Manager | Create user |
| PUT | `/:id` | Admin/Manager, or self for name/email | Update user (cannot change own role/active) |
| POST | `/:id/reset-password` | Admin | Set new password |
| DELETE | `/:id` | Admin, Manager | Hard-delete user (managers cannot delete admins) |

There is **no** `POST /:id/toggle-status` route (the Team UI still calls it).

### Leads — `/api/leads`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | Any | Paginated list. Query: `page`, `limit`, `status`, `source`, `campaign`, `assigned_to`, `search`, `compact`, `last_seen`. Sales reps scoped to own leads. |
| GET | `/uncontacted` | Any | New leads with `attempt_count = 0` older than 1 hour |
| GET | `/closed-reasons` | Any | Reason catalog |
| GET | `/campaigns` | Any | Distinct campaign names |
| GET | `/export/csv` | Any | Filtered CSV download |
| GET | `/:id` | Any | Single lead |
| POST | `/` | Any | Create; **blocks** duplicate phone |
| PUT | `/:id` | Any | Update with stage/notes rules |
| POST | `/:id/assign` | Any with assign rights in UI | Body: `{ assignee_id }` |
| POST | `/check-duplicate` | Any | Body: `{ phone, email? }` |
| POST | `/merge` | Admin, Manager, Team Lead | Merge two leads |
| GET | `/duplicates/analyze` | Admin | Duplicate groups |
| POST | `/duplicates/merge-all` | Admin | Merge all duplicate groups |
| POST | `/import` | Admin, Manager | Multipart file CSV/XLSX/XLS |
| POST | `/bulk-assign` | Admin, Manager, Team Lead | |
| POST | `/bulk-status` | Admin, Manager, Team Lead | |
| POST | `/bulk-update-status` | Admin, Manager, Team Lead | Alternate bulk status |
| POST | `/bulk-notes` | Admin, Manager, Team Lead | |
| POST | `/bulk-delete` | Admin, Manager | |
| DELETE | `/:id` | Admin | Single delete |

Frontend export currently calls `GET /leads/export?format=csv` (see [Gaps](#14-known-gaps-and-mismatches)).

### Calls — `/api/calls`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/lead/:leadId` | Call logs for a lead |
| GET | `/` | Recent calls (cap 100) |
| POST | `/` | Manual log: `{ lead_id, outcome, duration_minutes?, notes?, next_followup? }` |

### Bookings — `/api/bookings`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/reasons` | Any | Distinct booking reasons |
| GET | `/` | Any | List (paginated) |
| GET | `/:id` | Any | Get |
| POST | `/` | Any | Create |
| PUT | `/:id` | Admin, Manager | Update |
| DELETE | `/:id` | Admin, Manager | Delete |

### Payments — `/api/payments`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | Any authenticated (page gated in UI) | List |
| GET | `/:id` | Any | Get |
| POST | `/` | Any | Create against a booking |
| PUT | `/:id` | Admin, Manager | Update |
| DELETE | `/:id` | Admin, Manager | Delete |

### Dashboard — `/api/dashboard`

All JWT-authenticated.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Totals, conversion, revenue, overdue follow-ups, uncontacted >1h |
| GET | `/leaderboard` | Closed deals / revenue / calls |
| GET | `/activities` | Recent activity feed |
| GET | `/pipeline` | Leads grouped for pipeline |
| GET | `/pipeline-stats` | Counts per stage |
| GET | `/overdue-followups` | Past-due `next_followup` |
| GET | `/upcoming-followups` | Assigned leads with `next_followup` in the next 24 hours |
| GET | `/agent-performance` | Per-agent metrics (date filters) |
| GET | `/revenue-trend` | Time series |
| GET | `/source-performance` | By lead source |
| GET | `/lead-counts` | Counts with query filters |

### Activities — `/api/activities`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | List; supports `lead_id` query used by lead detail |
| GET | `/target/:targetId` | By target |

### Notifications — `/api/notifications`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Current user's notifications |
| PUT | `/:id/read` | Mark one read |
| PUT | `/mark-all-read` | Mark all read |
| DELETE | `/:id` | Delete |

### Push — `/api/push`

HTTPS (or localhost) required. No Socket.IO/SSE; this delivers a system notification when the CRM tab is closed.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/vapid-public-key` | Public | `{ enabled, publicKey }` |
| POST | `/subscribe` | JWT | Body: PushSubscription JSON (`endpoint`, `keys.p256dh`, `keys.auth`) |
| DELETE | `/subscribe` | JWT | Body or `?endpoint=` to drop this device |

### Saved filters — `/api/saved-filters`

Personal to the JWT user. Applying a saved view on the Leads page sets the existing list filters and calls `GET /leads` with those query params.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Current user's saved views |
| POST | `/` | Body: `{ name, filter_json }`. Unknown filter keys are dropped. |
| DELETE | `/:id` | Owner only; 404 if missing or owned by someone else |

### Meta — `/api/meta`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/config` | Admin, Manager | Current Meta config (secrets handled server-side) |
| POST | `/config` | Admin, Manager | Save page ID, app secret, verify token, page access token, active flag |
| POST | `/test-connection` | Admin, Manager | Calls Meta Graph API with the stored page token |
| GET | `/webhook` | Public | Meta subscription challenge (`hub.mode`, `hub.verify_token`, `hub.challenge`) |
| POST | `/webhook` | Public | `leadgen` events; raw body kept for signature verify; fetches lead fields; skips duplicates |

### Admin — `/api/admin`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/features` | Public | `{ telephony_enabled, web_push_enabled }` from env |
| POST | `/run-auto-reset` | Admin | Manual 30-day reset (unassign + status New) |
| POST | `/seed-data` | Admin | Demo seed |
| GET | `/export-database` | Admin | JSON backup of core tables |
| DELETE | `/delete-database` | Admin | Wipe data |

---

## 10. Frontend

### Routing (`frontend/src/App.tsx`)

| Path | Page file | Access |
|------|-----------|--------|
| `/login` | `LoginPage.tsx` | Public; redirects if already logged in |
| `/` | `DashboardPage.tsx` | All roles |
| `/leads` | `LeadsPage.tsx` | All roles |
| `/leads/:id` | `LeadDetailPage.tsx` | All roles |
| `/pipeline` | `PipelinePage.tsx` | All roles |
| `/bookings` | `BookingsPage.tsx` | All roles |
| `/payments` | `PaymentsPage.tsx` | admin, manager, team_lead |
| `/reports` | `ReportsPage.tsx` | All roles (data scoped for reps) |
| `/team` | `TeamPage.tsx` | admin, manager, team_lead |
| `/settings` | `SettingsPage.tsx` | All roles |
| `*` | Navigate to `/` | |

Unauthenticated access to protected routes redirects to `/login`. Wrong-role access redirects to `/`.

### Shared chrome

**Sidebar** (`components/layout/Sidebar.js`)  
Role-filtered nav from `lib/nav.ts`: Dashboard, Leads, Pipeline, Bookings, Payments, Reports, Team, Settings.

**Header** (`components/layout/Header.js`)  
Opens the command palette (search button / ⌘K), notification bell (polls `/notifications`, toasts upcoming/missed follow-ups), theme toggle, profile menu, logout.

**Command palette** (`components/layout/CommandPalette.jsx`)  
Mounted once on `Layout` (not per page). `Cmd/Ctrl+K` or the header search control. Jump targets are the same role-filtered pages as the Sidebar. Typing 2+ characters debounces to `GET /leads?search=` (compact, limit 8 — sales-rep scoping is the existing list API, no `assigned_to` override) and client-filters `GET /bookings` by hotel or lead name. Selecting a lead goes to `/leads/:id`; selecting a booking goes to `/bookings?booking=:id`.

**Auth** (`contexts/AuthContext.tsx`)  
Axios instance with Bearer token; 401 → logout. Helpers: `isAdmin`, `isManager`, `isTeamLead`.

**Theme** (`contexts/ThemeContext.tsx`)  
Light/dark, persisted.

### Page behavior

#### Login

Email + password. On success, stores JWT and lands on Dashboard.

#### Dashboard

Loads `/dashboard/stats`, `/leaderboard`, `/revenue-trend`, `/pipeline-stats`, `/source-performance`, `/leads/uncontacted`, `/dashboard/overdue-followups`, `/dashboard/upcoming-followups`, and unread follow-up notifications.

Shows KPI cards, upcoming follow-ups (next 24 hours), missed follow-ups, a follow-up notification panel, charts, leaderboard, and a 1-hour countdown on new uncontacted leads (`getCountdownTime` in `lib/utils.ts`). Sales reps see only their own assigned follow-ups.

#### Leads

Paginated table with filters (status, source, campaign, assignee, search). Combinable AND filters can be saved as personal views (`Save current filter` / `Saved views`) and reapplied by setting the same filter state.

- **Create** — duplicate check on phone (`POST /leads/check-duplicate`); submit blocked if duplicate; optional merge for privileged roles
- **Assign** — single and bulk
- **Import** — CSV/Excel, 10-minute-oriented timeout messaging, template download
- **Export** — filtered CSV (path mismatch vs backend; see gaps)
- **Bulk** — status, notes, assign, delete (role-gated)
- Tabs/views for overdue follow-ups and uncontacted

#### Lead detail

- Edit contact fields, notes, source
- Status change with assignment / closed-reason / transition checks
- Assign
- **Log Call** dialog → `POST /api/calls` (not click-to-call)
- Combined timeline: activities, calls, bookings, payments

There is no recording player and no Tata live status.

#### Pipeline

Kanban columns for active stages. Per-column pagination (`compact=true&limit=50`). Drag-and-drop updates status via `PUT /leads/:id`. Quick call-outcome actions on cards. Same 1-hour countdown on new uncontacted cards. Closed-reason dialog when moving to Lost / Not Interested.

#### Bookings

List/filter bookings. Create: lead, hotel, dates, bid/final price, payment status, reason. Admin/manager can edit and delete. Command-palette jump uses `/bookings?booking=:id` to highlight and scroll to that row.

#### Payments

List payments against bookings. Create amount + notes. Admin/manager edit/delete. Hidden from sales reps in nav and route.

#### Reports

Date presets (all time, 7d, 30d, this month, last quarter, custom). Charts: revenue trend, pipeline mix, source performance. Agent performance table. Sales reps receive self-only agent metrics.

#### Team

User list + leaderboard. Admin/manager: create user, edit, change role, reset password. Deactivate control calls `POST /users/:id/toggle-status`, which **does not exist** on the backend (backend delete is `DELETE /users/:id`).

#### Settings

- Profile + change password
- Light/dark
- **Install app** — Chrome/Edge `beforeinstallprompt`; iOS Safari copy for Share → Add to Home Screen
- **Push notifications** — Web Push subscribe via the service worker (Settings toggle). iOS: only after Home Screen install, 16.4+
- **Meta Lead Ads:** page ID, app secret, verify token, page access token, activate, Test Connection
- **Admin:** export database JSON, delete all data (with confirmation)

### Progressive Web App

CRA's Workbox `InjectManifest` compiles `frontend/src/service-worker.ts` in production builds (`src/service-worker.ts` is the CRA opt-in). The SW is **not** registered in `yarn start` (dev).

- **Manifest:** `frontend/public/manifest.json` — name Bidinn Sales CRM, theme `#5C0298`, 192/512 icons, maskable 512
- **App shell:** hashed JS/CSS are precached; `index.html` is **not** precached. Navigations use NetworkFirst so a new deploy's HTML (new hashed bundles) is fetched while online. `/api/*` is NetworkOnly.
- **Updates:** a waiting worker shows a "Refresh" toast (`SKIP_WAITING` + reload). Express also `no-store`s `index.html` and `service-worker.js`.
- **Offline:** repeat visits can load the UI without a network. Creating/editing leads still requires the API.
- **Install**
  - **Android Chrome:** install banner or Settings → Install. Full Web Push after the user allows notifications.
  - **iOS Safari:** no install prompt. Share → Add to Home Screen. Service worker + standalone display work. Web Push only in the Home Screen app on iOS 16.4+ — not in a regular Safari tab. Background sync and some Android-only APIs are unavailable.
  - **Desktop Chrome/Edge:** install icon in the address bar; same service worker as Android.

### Frontend types

`frontend/src/types/index.ts` defines User, Lead, CallLog, Booking, Payment, DashboardStats, LeaderboardEntry, AgentPerformance, Activity, Notification.

Note: the `LeadStatus` TypeScript union currently omits `not_answered`, though the UI status lists and backend include it.

---

## 11. Background Jobs

Scheduled in `backend/src/index.ts` after DB connect.

| Job | Schedule | Status | Behavior |
|-----|----------|--------|----------|
| Idle lead escalation | Every 6 hours (also ~10s after boot) | **Running** | Active leads (not won/lost/not_interested) idle 5+ days → HIGH notifications to admins/managers. Same idle query as the delay report. |
| Follow-up reminders | Every 1 hour (also ~15s after boot) | **Running** | Upcoming follow-ups in next 60 minutes; missed follow-ups in last 24 hours → **assigned agent only**. Unassigned leads are skipped. Deduped (~2h) |
| 30-day auto-reset | Daily midnight | **Disabled** | Would set idle non-New/Won/Lost leads back to New and unassign. Function remains; `scheduleAutoResetJob` is a no-op. Manual trigger: `POST /api/admin/run-auto-reset` |
| Delay report email | Daily 08:00 `Asia/Kolkata` | **Running** | Combined PDF: overdue follow-ups (same query as `GET /dashboard/overdue-followups`) + idle leads (5+ days) + per-agent counts. Attached to a short boilerplate email. Recipients from `REPORT_RECIPIENT_EMAILS`. Audit row in `activities` (`user_name: System`). |
| Weekly report email | Monday 09:00 `Asia/Kolkata` | **Running** | PDF for the prior 7 days: new leads by source, won/lost, revenue, top/bottom agents (`getAgentPerformance`), overdue/idle snapshot. |
| Monthly report email | 1st 09:00 `Asia/Kolkata` | **Running** | PDF for the **completed previous calendar month** (1 Aug send → July). Won/lost/revenue use the same definitions as `GET /dashboard/stats` monthly_* via `getPeriodSummary`. |

Scheduled PDF reports are **not** in-app notifications. Failures (missing recipients, SMTP, Chromium/PDF) are logged and do not crash other jobs.

---

## 12. Caching

`backend/src/services/cache.service.ts` uses Redis. List/stats GETs use `cacheMiddleware`; mutations use `invalidateCacheMiddleware`.

Cache keys: dashboard stats, leads, users, bookings, activities, calls, notifications, payments, admin stats.

TTL: short = 1 hour for most lists (invalidation on write); time-sensitive keys can use 60 seconds.

Independently, **every** API response (`/api/*`) is sent with `Cache-Control: no-store` so browsers do not cache CRM data. Static hashed assets may be cached; `index.html` and `service-worker.js` are not.

If Redis is down, cache get/set fail soft and requests still hit MySQL.

---

## 13. Integrations

### Meta Lead Ads — implemented

**Backend:** `backend/src/routes/meta.ts`  
**Frontend:** Settings page  
**Entity:** `MetaConfig` + `leads.meta_leadgen_id`

Flow:

1. Admin/manager saves Page ID, App Secret, Verify Token, Page Access Token
2. Meta verifies `GET /api/meta/webhook`
3. On form submit, Meta `POST`s a `leadgen` event
4. Backend verifies signature (raw body captured in `index.ts` for this URL only)
5. Graph API fetch of name, email, phone using `leadgen_id` and page token
6. Duplicate skip by `meta_leadgen_id` / phone
7. New lead created as `new` for the team to work

`POST /api/meta/test-connection` validates the page access token against Graph API.

### Tata Smartflo — not implemented

The document `docs/Tata_Telephone_Integration.md` describes:

- `POST /api/tata/click-to-call`
- `POST /api/tata/webhook` (`call.started` / `answered` / `ended` / `missed`)
- `GET /api/tata/calls/:lead_id`
- `User.tata_extension` and Call recording/status columns
- Frontend `ClickToCallButton` and recording `CallHistory`

**None of that exists in source.** Calling is: dial outside the CRM, then **Log Call** on lead detail or pipeline.

`GET /api/admin/features` returns `telephony_enabled` from `TELEPHONY_ENABLED=true`, but that flag does not mount Tata routes.

---

## 14. Known Gaps and Mismatches

| Item | Expected | Actual |
|------|----------|--------|
| Tata telephony | Full click-to-call + webhooks + recordings | Spec only |
| 30-day auto-reset | PRD lists as implemented | Scheduler disabled; admin can run manually |
| Lead export URL | UI: `GET /leads/export?format=csv` | API: `GET /leads/export/csv` |
| Deactivate user | UI: `POST /users/:id/toggle-status` | API: `DELETE /users/:id` (hard delete) |
| `LeadStatus` TS type | Include `not_answered` | Union omits it; runtime UI still has the stage |
| Hindi display | UTF-8 on new imports | Older rows may still be garbled |
| Redis dashboard cache | PRD P2 backlog | Already implemented |
| Email / SMS / WhatsApp / native app | PRD P3 | PWA install + optional Web Push. No native iOS/Android binaries. No offline lead CRUD. SMS/WhatsApp not built. |
| iOS PWA | Full Android-like install + push | Safari: Add to Home Screen only. Push: iOS 16.4+ Home Screen app, not a Safari tab. |

---

## Quick reference — frontend → API

| UI action | API |
|-----------|-----|
| Login | `POST /auth/login` |
| Session | `GET /auth/me` |
| Lead list / filters | `GET /leads?...` |
| Command palette lead jump | `GET /leads?search=&compact=true&limit=8` (same scoping as list) |
| Command palette booking jump | `GET /bookings?limit=1000` then client filter by hotel / lead name |
| Saved filter views | `GET/POST/DELETE /saved-filters` |
| Create lead | `POST /leads` |
| Edit lead / stage | `PUT /leads/:id` |
| Assign | `POST /leads/:id/assign` |
| Import | `POST /leads/import` |
| Log call | `POST /calls` |
| Call history | `GET /calls?lead_id=` or `GET /calls/lead/:id` |
| Pipeline drop | `PUT /leads/:id` `{ status }` |
| Booking CRUD | `/bookings` |
| Payment CRUD | `/payments` |
| Dashboard widgets | `/dashboard/*` |
| Notifications | `/notifications` |
| Meta setup | `GET/POST /meta/config`, `POST /meta/test-connection` |
| DB backup / wipe | `GET /admin/export-database`, `DELETE /admin/delete-database` |

---

*Generated from the Bidinn-CRM codebase (Express/TypeORM backend + React frontend). Spec-only features are called out explicitly so this file does not overstate production capability.*
