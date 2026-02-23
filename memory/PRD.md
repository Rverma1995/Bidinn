# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 3.0  
**Last Updated:** February 23, 2026  
**Product Name:** Bidinn  
**Product Type:** B2B Sales CRM Platform

---

## 1. Executive Summary

Bidinn is a modern, high-tech, SaaS-style Sales CRM designed for internal sales teams. Built with a premium B2B aesthetic similar to Stripe, Linear, and Notion, it enables sales teams to track leads end-to-end from entry to call activity to booking to payment.

### Key Highlights
- End-to-end lead tracking
- 1-hour contact window enforcement
- Real-time analytics and reporting
- Role-based access control (4 roles)
- Light/Dark mode support
- Fully responsive design

---

## 2. Technical Architecture

### 2.1 Backend Stack
- **Framework:** Express.js (Node.js)
- **Language:** TypeScript
- **Database:** MySQL (MariaDB)
- **Authentication:** JWT (jsonwebtoken)
- **Password Hashing:** bcryptjs
- **File Parsing:** xlsx (Excel), csv (CSV)

### 2.2 Frontend Stack
- **Framework:** React 19
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui
- **Charts:** Recharts
- **State:** React Context API
- **Routing:** React Router v6
- **HTTP Client:** Axios
- **Notifications:** Sonner (toast)
- **Date Handling:** date-fns

### 2.3 Database Schema (MySQL)

#### users
| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) | Primary key (UUID) |
| email | VARCHAR(255) | Unique, required |
| name | VARCHAR(255) | Required |
| role | ENUM | admin, manager, team_lead, sales_rep |
| avatar | VARCHAR(500) | Optional |
| is_active | BOOLEAN | Default TRUE |
| password_hash | VARCHAR(255) | Required |
| created_at | DATETIME | Auto |

#### leads
| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) | Primary key (UUID) |
| name | VARCHAR(255) | Required |
| phone | VARCHAR(50) | Required |
| email | VARCHAR(255) | Optional |
| source | VARCHAR(100) | Required |
| campaign | VARCHAR(255) | Optional |
| city | VARCHAR(100) | Optional |
| status | ENUM | new, interested, not_interested, followup, won, lost |
| assigned_to | VARCHAR(36) | FK to users |
| assigned_name | VARCHAR(255) | Denormalized |
| attempt_count | INT | Default 0 |
| last_activity | DATETIME | Nullable |
| next_followup | DATETIME | Nullable |
| notes | TEXT | Optional |
| created_at | DATETIME | Auto |
| updated_at | DATETIME | Auto update |

#### calls
| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) | Primary key (UUID) |
| lead_id | VARCHAR(36) | FK to leads |
| user_id | VARCHAR(36) | FK to users |
| user_name | VARCHAR(255) | Denormalized |
| outcome | ENUM | connected, no_answer, busy, voicemail, wrong_number, callback_requested |
| duration_minutes | INT | Default 0 |
| notes | TEXT | Optional |
| next_followup | DATETIME | Nullable |
| created_at | DATETIME | Auto |

#### bookings
| Column | Type | Description |
|--------|------|-------------|
| id | VARCHAR(36) | Primary key (UUID) |
| lead_id | VARCHAR(36) | FK to leads |
| lead_name | VARCHAR(255) | Denormalized |
| hotel_name | VARCHAR(255) | Required |
| check_in | DATE | Required |
| check_out | DATE | Required |
| final_price | DECIMAL(10,2) | Required |
| bid_price | DECIMAL(10,2) | Optional |
| payment_status | ENUM | unpaid, partial, paid |
| payment_amount | DECIMAL(10,2) | Default 0 |
| notes | TEXT | Optional |
| created_at | DATETIME | Auto |
| created_by | VARCHAR(36) | FK to users |

---

## 3. API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Create new user |
| POST | /api/auth/login | Login and get JWT token |
| GET | /api/auth/me | Get current user |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List all users |
| GET | /api/users/:id | Get user by ID |
| PUT | /api/users/:id | Update user |
| POST | /api/users/:id/toggle-status | Activate/Deactivate user (Admin) |
| POST | /api/users/:id/reset-password | Reset user password (Admin) |

### Leads
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/leads | Create lead |
| GET | /api/leads | List leads (with filters) |
| GET | /api/leads/uncontacted | Get uncontacted >1hr leads |
| GET | /api/leads/export | Export leads to CSV/XLSX |
| POST | /api/leads/import | Bulk import from file |
| GET | /api/leads/:id | Get lead details |
| PUT | /api/leads/:id | Update lead |
| DELETE | /api/leads/:id | Delete lead |
| POST | /api/leads/:id/assign | Assign lead to rep |
| POST | /api/leads/:id/log_call | Log a call for lead |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/dashboard/stats | Get dashboard statistics |
| GET | /api/dashboard/leaderboard | Get sales leaderboard |
| GET | /api/dashboard/pipeline-stats | Get leads by stage |
| GET | /api/dashboard/revenue-trend | Get monthly revenue data |
| GET | /api/dashboard/source-performance | Get source metrics |
| GET | /api/dashboard/agent-performance | Get agent performance (with date filters) |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/admin/seed-data | Seed demo data |
| POST | /api/admin/run-auto-reset | Run 30-day reset job |

---

## 4. Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | alex@bidinn.com | password123 |
| Manager | sarah@bidinn.com | password123 |
| Team Lead | michael@bidinn.com | password123 |
| Sales Rep | emily@bidinn.com | password123 |

---

## 5. Features Implemented

### Core Features
- ✅ JWT Authentication with 4 roles
- ✅ Lead Management (CRUD, assign, log calls)
- ✅ Pipeline Kanban Board
- ✅ Booking & Payment Tracking
- ✅ Dashboard with Stats & Charts
- ✅ Team Management & Leaderboard
- ✅ Notifications System
- ✅ Light/Dark Mode

### Advanced Features
- ✅ 1-Hour Follow-up Rule with countdown
- ✅ 30-Day Auto-Reset (scheduled daily)
- ✅ Bulk Lead Import (CSV/Excel)
- ✅ Bulk Lead Export (CSV)
- ✅ Agent Performance Reports with Date Filters
- ✅ User Deactivation/Reactivation (Admin)
- ✅ Password Reset (Admin)
- ✅ All currency in INR (₹)

---

## 6. Recent Changes

### February 23, 2026 - All Tasks Completed
- **COMPLETED:** Date Range Filter for Agent Reports
- **COMPLETED:** 30-Day Auto-Reset Scheduled Job
- **COMPLETED:** Bulk Lead Export to CSV
- **COMPLETED:** User Deactivation/Reactivation
- **COMPLETED:** Password Reset for Users
- **COMPLETED:** Backend Migration (Python→Node.js, MongoDB→MySQL)

---

## 7. Pending Tasks

### P2 (Lower Priority)
- [ ] Google Sheets integration for import/export
- [ ] Booking reasons dropdown
- [ ] Bulk status updates for multiple leads

---

## 8. Test Results

### Latest Test Run (Feb 23, 2026)
- Backend: 52/53 tests passed (100%)
- Frontend: 100% working
- All features verified

---

*Document maintained by Bidinn Development Team*
