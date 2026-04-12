# Tossup CRM — Complete Product Requirements Document

**Version:** 1.0
**Product Name:** Tossup
**Industry:** D2C Dog Food Ecommerce
**Team Size:** 15 sales reps
**Currency:** INR (Indian Rupees)

---

## 1. Executive Summary

Build "Tossup CRM" — a modern, high-tech, SaaS-style responsive Sales CRM for an internal team of 15 sales representatives at a D2C dog food ecommerce brand. The CRM manages leads, tracks orders and payments, provides detailed reports, supports bulk operations, and includes Meta (Facebook) Lead Ads integration for future use.

**Design Aesthetic:** Premium B2B SaaS style inspired by Stripe, Linear, and Notion. Clean typography, generous spacing, dark/light mode, smooth micro-animations.

---

## 2. Technical Stack

### Backend
- **Runtime:** Node.js
- **Framework:** Express.js
- **Language:** TypeScript
- **ORM:** TypeORM
- **Database:** MySQL (AWS RDS or local MySQL). Use environment variables for DB connection. Set `synchronize: true` initially to auto-create tables.
- **Authentication:** JWT with bcryptjs password hashing. JWT secret from environment variable `JWT_SECRET` (no fallback values).
- **File Upload:** multer (in-memory storage, 10MB limit)
- **Excel/CSV Parsing:** xlsx library
- **UUID Generation:** uuid v4

### Backend Dependencies (package.json)
```json
{
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "multer": "^1.4.5-lts.1",
    "mysql2": "^3.19.1",
    "reflect-metadata": "^0.2.2",
    "typeorm": "^0.3.28",
    "uuid": "^11.0.5",
    "xlsx": "^0.18.5"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.9",
    "@types/multer": "^1.4.13",
    "@types/node": "^25.4.0",
    "@types/uuid": "^10.0.0",
    "nodemon": "^3.1.9",
    "ts-node": "^10.9.2",
    "typescript": "^5.7.3"
  }
}
```

### Frontend
- **Framework:** React 19 (Create React App with CRACO)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 3 + shadcn/ui components
- **Charts:** Recharts
- **Icons:** lucide-react
- **HTTP Client:** axios
- **Routing:** react-router-dom v7
- **Toasts:** sonner
- **Date utilities:** date-fns

### Frontend Key Dependencies
```json
{
  "dependencies": {
    "axios": "^1.8.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "date-fns": "^4.1.0",
    "lucide-react": "^0.507.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.5.1",
    "recharts": "^3.6.0",
    "sonner": "^2.0.3",
    "tailwind-merge": "^3.2.0",
    "tailwindcss-animate": "^1.0.7"
  }
}
```

### Environment Variables

**Backend `.env`:**
```
DB_HOST=<mysql_host>
DB_PORT=3306
DB_USERNAME=<db_user>
DB_PASSWORD=<db_password>
DB_DATABASE=tossupcrm
JWT_SECRET=tossup-super-secret-jwt-key-2024
CORS_ORIGINS=*
PORT=8001
```

**Frontend `.env`:**
```
REACT_APP_BACKEND_URL=<backend_url>
```

Frontend API calls: Use `REACT_APP_BACKEND_URL` if set, otherwise use relative `/api` paths for production. All backend routes must be prefixed with `/api`.

---

## 3. Database Schema (TypeORM Entities)

### 3.1 User Entity (`users` table)
```
id: varchar(36) PK — UUID v4
email: varchar(255) UNIQUE
name: varchar(255)
password_hash: varchar(255)
role: enum('admin', 'manager', 'team_lead', 'sales_rep') DEFAULT 'sales_rep'
is_active: boolean DEFAULT true
created_at: datetime (auto)
```

**Roles:** admin, manager, team_lead, sales_rep

### 3.2 Lead Entity (`leads` table)
```
id: varchar(36) PK — UUID v4
name: varchar(255)
phone: varchar(50)
email: varchar(255) NULLABLE
source: varchar(100)
campaign: varchar(255) NULLABLE
city: varchar(100) NULLABLE
status: varchar(50) DEFAULT 'new'
assigned_to: varchar(36) NULLABLE FK → users.id
assigned_name: varchar(255) NULLABLE
attempt_count: int DEFAULT 0
last_activity: datetime NULLABLE
next_followup: datetime NULLABLE
notes: text NULLABLE
meta_leadgen_id: varchar(255) NULLABLE
closed_reason: varchar(50) NULLABLE
closed_reason_notes: text NULLABLE
created_at: datetime (auto)
updated_at: datetime (auto)
```

**Indexes (critical for performance):**
- `idx_leads_assigned_to` on (assigned_to)
- `idx_leads_status` on (status)
- `idx_leads_created_at` on (created_at)
- `idx_leads_phone` on (phone)
- `idx_leads_source` on (source)
- `idx_leads_assigned_status` on (assigned_to, status)
- `idx_leads_status_created` on (status, created_at)

**Lead Statuses (enum):**
| Value | Label |
|-------|-------|
| new | New |
| not_answered | Not Answered |
| interested | Interested |
| not_interested | Not Interested |
| followup | Follow-up |
| won | Won |
| lost | Lost |

**Closed Reasons (enum — required when status = not_interested or lost):**
| Value | Label |
|-------|-------|
| price_too_high | Price Too High |
| bought_competitor | Bought from Competitor |
| not_buying_now | Not Buying Now |
| no_response | No Response |
| just_browsing | Just Browsing |
| wrong_contact | Wrong Contact |
| competitor | Went to Competitor |
| budget_issues | Budget Issues |
| timing_not_right | Timing Not Right |
| other | Other |

**Stage Transition Rules:**
- `interested` and `followup` CANNOT transition directly to `not_interested` (must go through Won or Lost first)
- `won` is a final stage (no transitions out)
- `lost` and `not_interested` can only reopen to `new`
- Stages requiring assignment before transition: `not_answered`, `interested`, `followup`
- Stages requiring closed reason: `not_interested`, `lost`

### 3.3 Order Entity (`orders` table) — equivalent to Bookings
```
id: varchar(36) PK — UUID v4
lead_id: varchar(36) FK → leads.id (CASCADE DELETE)
lead_name: varchar(255) NULLABLE
product_name: varchar(255)
order_date: date
delivery_date: date
final_price: decimal(10,2)
bid_price: decimal(10,2) NULLABLE
payment_status: enum('unpaid', 'partial', 'paid') DEFAULT 'unpaid'
payment_amount: decimal(10,2) DEFAULT 0
notes: text NULLABLE
order_category: varchar(255) NULLABLE
created_by_id: varchar(36) FK → users.id (CASCADE DELETE)
created_at: datetime (auto)
```

**Indexes:**
- `idx_orders_lead_id` on (lead_id)
- `idx_orders_payment_status` on (payment_status)
- `idx_orders_created_at` on (created_at)

**Payment Status enum:** unpaid, partial, paid

### 3.4 Payment Entity (`payments` table)
```
id: varchar(36) PK — UUID v4
order_id: varchar(36) FK → orders.id (CASCADE DELETE)
amount: decimal(10,2)
notes: text NULLABLE
created_by: varchar(36) FK → users.id (CASCADE DELETE)
created_at: datetime (auto)
```

**Indexes:**
- `idx_payments_order_id` on (order_id)
- `idx_payments_created_at` on (created_at)
- `idx_payments_created_by` on (created_by)

### 3.5 Call Entity (`calls` table)
```
id: varchar(36) PK — UUID v4
lead_id: varchar(36) FK → leads.id (CASCADE DELETE)
user_id: varchar(36) FK → users.id (CASCADE DELETE)
user_name: varchar(255)
outcome: enum('connected', 'no_answer', 'busy', 'voicemail', 'wrong_number', 'callback_requested')
duration_minutes: int DEFAULT 0
notes: text NULLABLE
next_followup: datetime NULLABLE
created_at: datetime (auto)
```

### 3.6 Activity Entity (`activities` table)
```
id: varchar(36) PK — UUID v4
user_id: varchar(36) NULLABLE FK → users.id (CASCADE DELETE) — null for system actions
user_name: varchar(255)
action: varchar(100)
target_id: varchar(36) NULLABLE
target_type: varchar(50) NULLABLE
target_name: varchar(255) NULLABLE
details: text NULLABLE
created_at: datetime (auto)
```

IMPORTANT: `user_id` MUST be nullable to support system-generated activities (idle lead escalation job, auto-reset). When creating system activities, set `user_id: null` and `user_name: "System"`.

### 3.7 Notification Entity (`notifications` table)
```
id: varchar(36) PK — UUID v4
user_id: varchar(36) FK → users.id (CASCADE DELETE)
type: varchar(100) — values: idle_lead, duplicate_lead, lead_merged, lead_assignment, system
priority: varchar(50) DEFAULT 'medium' — values: low, medium, high
title: varchar(255)
message: text
target_id: varchar(36) NULLABLE
target_type: varchar(50) NULLABLE
metadata: json NULLABLE
is_read: boolean DEFAULT false
created_at: datetime (auto)
```

### 3.8 MetaConfig Entity (`meta_config` table)
```
id: varchar(36) PK — UUID v4
page_id: varchar(255) NULLABLE
app_secret: varchar(255) NULLABLE
verify_token: varchar(255) NULLABLE
page_access_token: text NULLABLE
is_active: boolean DEFAULT false
created_at: datetime (auto)
updated_at: datetime (auto)
```

---

## 4. API Endpoints (all prefixed with `/api`)

### 4.1 Authentication (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /login | No | Login with email + password. Returns `{ access_token, user }` |
| GET | /me | Yes | Get current authenticated user profile |
| POST | /change-password | Yes | Change own password (requires current_password + new_password) |

### 4.2 Users (`/api/users`)
| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | / | Yes | All | List all users (exclude password_hash) |
| GET | /:id | Yes | All | Get user by ID |
| POST | / | Yes | Admin, Manager | Create user. Managers cannot create admin users |
| PUT | /:id | Yes | Admin, Manager, Self | Update user. Self-update limited to name/email only. Users cannot change own role or active status |
| POST | /:id/reset-password | Yes | Admin | Reset any user's password |
| DELETE | /:id | Yes | Admin, Manager | Delete/deactivate user. Managers cannot delete admins |

### 4.3 Leads (`/api/leads`)
| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | / | Yes | All | Paginated leads (page, limit, status, source, assigned_to, search params). Sales reps see only assigned leads |
| GET | /uncontacted | Yes | All | Get leads with status=new, attempt_count=0, created >1hr ago |
| GET | /export/csv | Yes | All | Export leads as CSV. Sales reps export only own leads |
| GET | /closed-reasons | Yes | All | Get closed reason labels |
| GET | /duplicates/analyze | Yes | Admin | Analyze duplicate leads by phone |
| POST | / | Yes | All | Create lead with strict duplicate blocking by phone/email |
| PUT | /:id | Yes | All | Update lead with rule validation (notes required for stage change) |
| POST | /:id/assign | Yes | All | Assign single lead to a user |
| POST | /bulk-assign | Yes | Admin, Manager, Team Lead | Bulk assign leads |
| POST | /bulk-status | Yes | Admin, Manager, Team Lead | Bulk update status (notes required) |
| POST | /bulk-notes | Yes | Admin, Manager, Team Lead | Bulk update/append notes |
| POST | /bulk-delete | Yes | Admin, Manager | Bulk delete leads |
| POST | /bulk-update-status | Yes | Admin, Manager, Team Lead | Alias for bulk status with closed reason |
| POST | /import | Yes | Admin, Manager | Import leads from CSV/XLSX file upload (10MB max, 10-min timeout) |
| POST | /check-duplicate | Yes | All | Check if a phone/email already exists |
| POST | /merge | Yes | Admin, Manager, Team Lead | Merge two leads |
| POST | /duplicates/merge-all | Yes | Admin | Auto-merge all duplicate groups |
| DELETE | /:id | Yes | Admin | Delete single lead |
| GET | /:id | Yes | All | Get lead by ID with calls and orders relations |

### 4.4 Calls (`/api/calls`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /lead/:leadId | Yes | Get calls for a specific lead |
| POST | / | Yes | Log a call (lead_id, outcome, duration_minutes, notes, next_followup). Updates lead attempt_count and last_activity |
| GET | / | Yes | Get all calls (limited to 100) |

**Call Outcomes:** connected, no_answer, busy, voicemail, wrong_number, callback_requested

### 4.5 Orders (`/api/orders`) — equivalent to Bookings
| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | /categories | Yes | All | Get order category list |
| GET | / | Yes | All | Paginated orders |
| GET | /:id | Yes | All | Get order by ID |
| POST | / | Yes | All | Create order (lead_id, product_name, order_date, delivery_date, final_price, etc.) |
| PUT | /:id | Yes | Admin, Manager | Update order |
| DELETE | /:id | Yes | Admin, Manager | Delete order |

**Order Categories (returned by /categories):**
```
Dry Dog Food, Wet Dog Food, Puppy Food, Senior Dog Food, Grain-Free Food,
Raw/Freeze-Dried, Treats & Chews, Supplements, Subscription Box,
Bulk Order, Sample Pack, Custom Diet Plan, Other
```

### 4.6 Payments (`/api/payments`)
| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| POST | / | Yes | All | Record payment for an order. Auto-updates order payment_status |
| GET | / | Yes | All | Get payments (optionally filtered by order_id) |
| GET | /:id | Yes | All | Get payment by ID |
| PUT | /:id | Yes | Admin, Manager | Update payment amount/notes. Recalculates order totals |
| DELETE | /:id | Yes | Admin, Manager | Delete payment. Recalculates order totals |

### 4.7 Dashboard (`/api/dashboard`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /stats | Yes | Dashboard stats: total_leads, new_leads, closed_won, closed_lost, overdue_followups, uncontacted_over_1hr, total_revenue, monthly_revenue, conversion_rate, avg_deal_size. Sales reps see only their own stats |
| GET | /leaderboard | Yes | Team leaderboard sorted by revenue |
| GET | /activities | Yes | Recent 20 activities |
| GET | /pipeline | Yes | Lead counts by status |
| GET | /pipeline-stats | Yes | Same as pipeline (alternate endpoint) |
| GET | /overdue-followups | Yes | Leads with next_followup in the past, excluding won/lost |
| GET | /agent-performance | Yes | Agent performance with all lead stages, calls, revenue. Supports agent_id, start_date, end_date filters. Includes "System (Unassigned)" row |
| GET | /revenue-trend | Yes | Last 30 days revenue by day |
| GET | /source-performance | Yes | Leads and wins grouped by source |
| GET | /lead-counts | Yes | Daily/weekly/monthly/yearly new lead counts with status breakdown. Supports start_date, end_date, group_by params |

### 4.8 Activities (`/api/activities`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | Yes | Get activities. If `lead_id` param provided, returns comprehensive timeline (activities + calls + orders + payments) sorted by date |
| GET | /target/:targetId | Yes | Get activities for a specific target entity |

### 4.9 Notifications (`/api/notifications`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | / | Yes | Get current user's notifications with unread_count |
| PUT | /:id/read | Yes | Mark notification as read |
| PUT | /mark-all-read | Yes | Mark all notifications as read |
| DELETE | /:id | Yes | Delete a notification |

### 4.10 Meta Integration (`/api/meta`) — Future
| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| GET | /config | Yes | Admin, Manager | Get Meta config (secrets masked) |
| POST | /config | Yes | Admin, Manager | Save Meta config (page_id, app_secret, verify_token, page_access_token) |
| POST | /test-connection | Yes | Admin, Manager | Test Meta Graph API connection with page access token |
| GET | /webhook | No | — | Webhook verification (hub.mode, hub.verify_token, hub.challenge) |
| POST | /webhook | No | — | Webhook handler. Receives leadgen events, fetches full lead details from Meta Graph API using leadgen_id, creates new lead with source "Meta Lead Ads" |

### 4.11 Admin (`/api/admin`)
| Method | Path | Auth | Roles | Description |
|--------|------|------|-------|-------------|
| POST | /run-auto-reset | Yes | Admin | Manually trigger 30-day auto-reset job |
| POST | /seed-data | Yes | Admin | Seed demo data |
| GET | /features | No | — | Get feature flags |
| GET | /export-database | Yes | Admin | Export entire database as JSON backup |
| DELETE | /delete-database | Yes | Admin | Delete all data (DANGEROUS) |

### 4.12 Health & Root
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/ | Returns `{ message: "Tossup CRM API", version: "1.0.0" }` |
| GET | /api/health | Health check with DB connection status |

---

## 5. Business Rules (5 Rules)

### Rule 1: Lead Assignment Enforcement
Leads must be assigned to a user before moving to stages: not_answered, interested, followup.

### Rule 2: Closed Lead Reason Capture
A `closed_reason` is REQUIRED when marking a lead as `lost` or `not_interested`. The user must select from the predefined list.

### Rule 3: Strict Duplicate Prevention
When creating a new lead, the system checks for existing leads with the same phone number (normalized, whitespace/dashes removed). If a duplicate exists, creation is BLOCKED with a 409 error. No "force create" option. Admin can access the Duplicate Analysis tool.

### Rule 4: Idle Lead Escalation (Background Job)
A cron job runs every 6 hours. It finds leads with no activity for 5+ days (excluding won, lost, not_interested statuses). It creates HIGH priority notifications for all admins and managers listing the idle leads.

### Rule 5: Stage Transition Restriction
Leads in `interested` or `followup` status CANNOT be moved directly to `not_interested`. They must go through `won` or `lost` first.

### Additional Rule: Notes Required for Stage Changes
Notes are required when changing any lead's status. If the lead has no existing notes and no new notes are provided, the update is rejected.

---

## 6. Role Permissions Matrix

| Feature | Admin | Manager | Team Lead | Sales Rep |
|---------|-------|---------|-----------|-----------|
| View All Leads | Yes | Yes | Yes | Own only |
| Create Leads | Yes | Yes | Yes | Yes |
| Assign Leads | Yes | Yes | Yes | No |
| Bulk Delete Leads | Yes | Yes | No | No |
| Import Leads (CSV/Excel) | Yes | Yes | No | No |
| Analyze/Merge Duplicates | Yes | No | No | No |
| Create Users | Yes | Yes | No | No |
| Edit Users | Yes | Yes | No | Self only (name/email) |
| Deactivate Users | Yes | Yes | No | No |
| View Reports | Yes | Yes | Yes | Own only |
| View All Agents in Reports | Yes | Yes | Yes | No |
| View Team Page | Yes | Yes | Yes | No |
| View Payments Page | Yes | Yes | Yes | No |
| Edit/Delete Orders | Yes | Yes | No | No |
| Edit/Delete Payments | Yes | Yes | No | No |
| Export Database | Yes | No | No | No |
| Delete All Data | Yes | No | No | No |

---

## 7. Frontend Pages & Navigation

### Navigation Sidebar (Left sidebar with icons):
1. **Dashboard** — `/` (all roles)
2. **Leads** — `/leads` (all roles)
3. **Pipeline** — `/pipeline` (all roles)
4. **Orders** — `/orders` (all roles) [equivalent to Bookings]
5. **Payments** — `/payments` (admin, manager, team_lead)
6. **Reports** — `/reports` (all roles, but sales reps see own data only)
7. **Team** — `/team` (admin, manager, team_lead)
8. **Settings** — `/settings` (all roles)

### 7.1 Login Page (`/login`)
- Split layout: left side has sign-in form, right side has branded hero panel
- Hero panel: Purple/indigo gradient background with tagline "Track leads from inquiry to delivery" and stats cards (Active Leads, Team Members, Conversion Rate, Monthly Revenue)
- Branding: "Tossup" logo with tagline "Sales CRM Platform"
- Email + Password fields with show/hide password toggle
- JWT token stored in localStorage as `tossup_token`

### 7.2 Dashboard Page (`/`)
- Stats cards: Total Leads, New Leads, Won, Lost, Overdue Follow-ups, Uncontacted >1hr
- Revenue stats: Total Revenue, Monthly Revenue, Conversion Rate, Avg Deal Size
- Pipeline chart (Recharts bar chart showing leads per status)
- Revenue trend line chart (last 30 days)
- Source performance chart
- Recent activities list
- Leaderboard table

### 7.3 Leads Page (`/leads`)
- **Filters:** Status dropdown, Source dropdown, Assigned To dropdown, Search input (by name/phone/email)
- **Filter persistence:** Filters stored in URL searchParams so they persist when navigating back from lead detail
- **Smart Polling:** Auto-refresh every 5 minutes. Shows "New Leads Available" badge when new leads arrive
- **Bulk actions toolbar:** Select all, Bulk Assign, Bulk Status Change, Bulk Notes, Bulk Delete
- **Lead table:** Name, Phone, Status badge, Source, Assigned To, Created date, Last Activity, 1-hour countdown timer for new uncontacted leads
- **Pagination:** Server-side, 50 per page
- **Create Lead button:** Opens modal with name, phone, email, source, campaign, city, assigned_to, notes fields
- **Import button:** File upload for CSV/XLSX (admin/manager only)
- **Export button:** Download CSV

### 7.4 Lead Detail Page (`/leads/:id`)
- **Lead info panel:** Name, Phone, Email, Source, Campaign, City, Status, Assigned To, Notes
- **Status change:** Dropdown with rule validation (assignment check, closed reason modal, notes requirement)
- **Closed reason modal:** When moving to lost/not_interested, shows dropdown of reasons + optional notes
- **Activity Timeline:** Comprehensive timeline showing all activities, calls, orders, and payments in chronological order. Each entry shows the user who made the change
- **Call Log section:** Log new calls with outcome, duration, notes, next follow-up datetime
- **Orders section:** Create and view orders for this lead
- **Payments section:** View payments linked to this lead's orders
- **Assignment:** Dropdown to assign/reassign to team members

### 7.5 Pipeline Page (`/pipeline`)
- Kanban board view with columns for each status: New, Not Answered, Interested, Follow-up, Not Interested, Lost
- Lead cards showing name, phone, assigned user, and time since creation
- Scrollable columns with adequate height

### 7.6 Orders Page (`/orders`) — equivalent to Bookings
- Paginated table of all orders
- Columns: Lead Name, Product, Order Date, Delivery Date, Amount, Payment Status, Created By
- Create Order form: Lead selection, Product Name, Order Date, Delivery Date, Final Price, Bid Price, Order Category, Notes
- Admin/Manager can edit and delete orders

### 7.7 Payments Page (`/payments`)
- Table of all payments
- Columns: Order ID, Lead Name, Amount, Notes, Created By, Date
- Record Payment form
- Admin/Manager can edit and delete payments

### 7.8 Reports Page (`/reports`)
- **Agent Performance Table:** All team members with columns for each lead stage (New, Not Answered, Interested, Follow-up, Not Interested, Won, Lost), Total Leads, Contacted, Converted, Conversion Rate, Calls Made, Revenue
- **Date range filter** for agent performance
- **Agent filter dropdown** (specific agent or all)
- **Team Summary row** at top/bottom
- **System (Unassigned/Admin) row** for unassigned leads
- **Lead Trends section:** Bar/line chart showing daily new lead counts over selected date range (from `/api/dashboard/lead-counts`)
- **Overdue Follow-ups section:** Table of leads with overdue follow-up dates
- **Sales Reps:** See only their own performance data

### 7.9 Team Page (`/team`)
- User management: Create, Edit, Deactivate users
- User list with name, email, role badge, active status
- Create User modal: name, email, password, role selection
- Edit User modal: name, email, role (admin/manager only for role changes)
- Reset Password action (admin only)
- Self-edit: users can edit own name/email from settings or team page

### 7.10 Settings Page (`/settings`)
- **Profile section:** Change own name, email
- **Password section:** Change own password (current + new)
- **Meta Lead Ads Integration section** (admin/manager only):
  - Step-by-step setup form: Facebook Page ID, App Secret, Verify Token, Page Access Token
  - Test Connection button (calls `/api/meta/test-connection`)
  - Webhook URL display for Facebook configuration
  - Toggle to enable/disable integration
- **Admin section** (admin only):
  - Export Database (JSON backup)
  - Delete All Data (with confirmation)
  - Run Auto-Reset job
  - Duplicate Lead Analysis & Merge tool

---

## 8. Background Jobs

### 8.1 Idle Lead Escalation Job
- **Frequency:** Every 6 hours (plus once 10 seconds after server startup)
- **Logic:** Find leads with status NOT IN (won, lost, not_interested) where last_activity < 5 days ago OR last_activity IS NULL, AND created_at < 5 days ago
- **Action:** Creates HIGH priority notification for all active admins and managers with list of idle leads
- **Activity log:** Creates a system activity entry with `user_id: null`, `user_name: "System"`

### 8.2 Auto-Reset Job (DISABLED by default)
- **Frequency:** Daily at midnight (currently disabled)
- **Logic:** Find leads with status NOT IN (new, won, lost) where last_activity < 30 days ago
- **Action:** Resets status to "new", removes assignment
- Can be triggered manually via `/api/admin/run-auto-reset`

---

## 9. Utility Functions (Frontend `lib/utils.ts`)

### Currency Formatting
```typescript
formatCurrency(amount) // → "₹1,25,000" (Indian Rupee format with en-IN locale)
```

### Lead Status Colors
```
new: blue, not_answered: amber, interested: emerald, not_interested: slate,
followup: amber, won: green, lost: red
```

### Lead Sources for the App
```
Website, Instagram, Facebook, Google Ads, Referral, WhatsApp,
Meta Lead Ads, Amazon, Influencer, Pet Store Partner
```

### Call Outcomes
```
connected: Connected, no_answer: No Answer, busy: Busy,
voicemail: Voicemail, wrong_number: Wrong Number, callback_requested: Callback Requested
```

### 1-Hour Follow-up Rule with Countdown Timer
New leads with attempt_count=0 show a countdown timer from creation time. After 1 hour, they show "Overdue" badge. This is the "1-Hour Follow-up Rule."

---

## 10. Auto-Seed on Startup

When the database is empty (0 users), automatically create an admin user:
```
Email: admin@tossup.com
Password: password123
Name: Admin User
Role: admin
```

### Demo Seed Data (triggered manually or on first run)

**15 Demo Users:**
| Email | Name | Role |
|-------|------|------|
| admin@tossup.com | Priya Sharma | admin |
| manager1@tossup.com | Rahul Verma | manager |
| manager2@tossup.com | Anita Desai | manager |
| teamlead1@tossup.com | Vikram Singh | team_lead |
| teamlead2@tossup.com | Neha Patel | team_lead |
| rep1@tossup.com | Arjun Kumar | sales_rep |
| rep2@tossup.com | Sneha Reddy | sales_rep |
| rep3@tossup.com | Amit Joshi | sales_rep |
| rep4@tossup.com | Pooja Nair | sales_rep |
| rep5@tossup.com | Kiran Das | sales_rep |
| rep6@tossup.com | Ravi Gupta | sales_rep |
| rep7@tossup.com | Anjali Mehta | sales_rep |
| rep8@tossup.com | Suresh Iyer | sales_rep |
| rep9@tossup.com | Meera Bhat | sales_rep |
| rep10@tossup.com | Deepak Rao | sales_rep |

All passwords: `password123`

**Demo Leads (100):**
- Names: Random Indian names
- Sources: Website, Instagram, Facebook, Google Ads, Referral, WhatsApp, Meta Lead Ads
- Campaigns: Premium Kibble Launch, Puppy Starter Kit, Senior Care Range, Grain-Free Collection, Monthly Subscription, Festive Bundle, Free Sample Drive
- Cities: Mumbai, Delhi, Bangalore, Chennai, Hyderabad, Pune, Kolkata
- Statuses: Random distribution across all stages
- Notes: "Interested in {Campaign}. Budget: ₹{random amount}"
- For won leads: Auto-create orders with products like "{Campaign} Package"

---

## 11. Lead Import (CSV/Excel)

### Supported Formats
- CSV (.csv)
- Excel (.xlsx, .xls)
- Max file size: 10MB
- Frontend timeout: 5-10 minutes (for large files ~1000 leads)

### Column Mapping (case-insensitive, supports Hindi headers)
```
name/Name/NAME → name
phone/Phone/PHONE → phone
email/Email/EMAIL → email
source/Source/SOURCE → source (defaults to "Import")
campaign/Campaign/CAMPAIGN → campaign
city/City/CITY → city
notes/Notes/NOTES → notes
```

### Import Logic
1. Read all existing phone numbers into memory (one query)
2. For each row: normalize phone, check against in-memory set
3. Skip duplicates (by phone and email)
4. Skip self-duplicates within the import batch
5. Bulk insert in batches of 500 for performance
6. Return: imported count, skipped count, duplicate details, errors

---

## 12. Webhook (Meta Lead Ads)

### Verification (GET /api/meta/webhook)
Facebook sends `hub.mode`, `hub.verify_token`, `hub.challenge`. If verify_token matches config, return challenge with 200.

### Lead Handler (POST /api/meta/webhook)
1. Verify signature using `x-hub-signature-256` header and app_secret (log mismatch but don't block)
2. Parse `body.entry[].changes[]` for `leadgen` field events
3. Extract `leadgen_id`, `form_id`, `page_id`
4. Check if lead with this `meta_leadgen_id` already exists (skip if so)
5. If `page_access_token` is configured:
   - Fetch lead details from `https://graph.facebook.com/v18.0/{leadgen_id}?access_token={token}`
   - Parse `field_data` array for name, email, phone fields
   - Fetch form name from `https://graph.facebook.com/v18.0/{form_id}?fields=name&access_token={token}`
6. Create lead with source "Meta Lead Ads" and campaign = form name

**Raw body capture:** Configure express.json() middleware to capture raw body buffer for webhook signature verification.

---

## 13. Security Features

- JWT tokens with 24-hour expiry, secret from env var (no fallback)
- Role-based access control (RBAC) on every endpoint
- Password hashing with bcrypt (10 salt rounds)
- Users cannot change their own role or active status
- Bulk delete restricted to Admin/Manager
- Inactive users blocked from login
- Token expiry and invalid token return 401
- CORS configured from environment variable
- No-cache headers on all API responses

---

## 14. Frontend Technical Details

### Auth Context
- Stores JWT token in localStorage as `tossup_token`
- Axios instance with automatic Bearer token header
- 401 response interceptor auto-logs out
- 5-minute timeout on axios for large file uploads
- API URL: Use `REACT_APP_BACKEND_URL/api` if env var set, otherwise relative `/api`

### Theme Support
- Light/Dark mode toggle
- Uses ThemeProvider context
- Tailwind dark: classes

### Routing
- Protected routes require authentication
- Role-based route access (e.g., payments page requires admin/manager/team_lead)
- Public routes (login) redirect to dashboard if already authenticated

### Data Tables
- Server-side pagination (50 records per page)
- Sort by created_at descending
- Search across name, phone, email

### Toast Notifications
- sonner library, top-right position
- 4-second duration with close button
- Rich colors enabled

---

## 15. Key Implementation Notes

1. **TypeORM with MySQL:** Use `synchronize: true` for initial setup, then switch to `false` in production to avoid index conflicts.

2. **UTF-8 Support:** Database charset must be `utf8mb4` with `utf8mb4_unicode_ci` collation for Hindi and international characters.

3. **Activity user_id nullable:** The Activity entity MUST have `user_id` as nullable varchar(36) to prevent foreign key constraint errors when the idle lead escalation job creates system activities.

4. **Frontend API paths:** Use relative `/api` paths (not absolute URLs) so the app works on both preview and production domains.

5. **File upload raw body:** When configuring `express.json()`, capture raw body buffer on the webhook route for signature verification.

6. **Pagination response format:**
```json
{
  "leads": [...],
  "pagination": { "page": 1, "limit": 50, "total": 1840, "totalPages": 37 }
}
```

7. **Order entity relations:** Lead has OneToMany to Orders. Order has ManyToOne to Lead (cascade delete) and ManyToOne to User (created_by).

8. **Smart Polling:** Leads page polls every 5 minutes using setInterval. Compares total count; if new leads detected, shows a badge. User clicks to refresh.

9. **Filter persistence:** Leads page stores current filters (status, source, assigned_to, search, page) in URL searchParams. When navigating back from lead detail, filters are restored from URL.

---

## 16. Ecommerce-Specific Adaptations from Generic CRM

| Generic CRM Concept | Tossup (Dog Food Ecommerce) |
|---------------------|----------------------------|
| Booking | Order |
| Hotel Name | Product Name |
| Check-in Date | Order Date |
| Check-out Date | Delivery Date |
| Booking Reason | Order Category |
| Booking Reasons List | Dry Dog Food, Wet Dog Food, Puppy Food, Senior Dog Food, Grain-Free Food, Raw/Freeze-Dried, Treats & Chews, Supplements, Subscription Box, Bulk Order, Sample Pack, Custom Diet Plan, Other |
| "Booked Elsewhere" | "Bought from Competitor" |
| "Not Travelling" | "Not Buying Now" |
| Campaign names | Premium Kibble Launch, Puppy Starter Kit, Senior Care Range, Grain-Free Collection, Monthly Subscription, Festive Bundle, Free Sample Drive |
| Lead Sources | Website, Instagram, Facebook, Google Ads, Referral, WhatsApp, Meta Lead Ads, Amazon, Influencer, Pet Store Partner |
| Export filename | tossup-backup-{date}.json |
| Login page tagline | "Track leads from inquiry to delivery" |
| Login page subtitle | "A modern CRM designed for high-performance sales teams. Manage your pipeline, track activities, and close more deals." |
| Login stats | Active Leads, Team Members, Conversion Rate, Monthly Revenue |

---

## 17. Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@tossup.com | password123 |
| Manager | manager1@tossup.com | password123 |
| Team Lead | teamlead1@tossup.com | password123 |
| Sales Rep | rep1@tossup.com | password123 |

---

## 18. Future Enhancements (Backlog)

### P1 — High Priority
- Meta (Facebook) Lead Ads Integration (webhook + Graph API lead fetching)
- WhatsApp Business API integration for customer communication

### P2 — Medium Priority
- Google Sheets integration for lead import/export
- Asynchronous Import Job with polling for large files
- Redis caching for dashboard statistics
- Shopify/WooCommerce order sync

### P3 — Lower Priority
- Email/SMS notifications for overdue leads
- Mobile-responsive PWA
- Subscription management module (recurring dog food deliveries)
- Customer loyalty/rewards tracking

---

**End of Tossup CRM PRD**
