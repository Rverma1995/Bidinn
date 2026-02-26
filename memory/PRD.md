# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 6.0  
**Last Updated:** February 26, 2026  
**Product Name:** Bidinn  
**Product Type:** B2B Sales CRM Platform

---

## 1. Executive Summary

Bidinn is a modern, high-tech, SaaS-style Sales CRM designed for internal sales teams. Built with a premium B2B aesthetic similar to Stripe, Linear, and Notion, it enables sales teams to track leads end-to-end from entry to call activity to booking to payment.

---

## 2. Technical Stack

### Backend
- **Framework:** Express.js (Node.js)
- **Language:** TypeScript
- **Database:** MySQL (MariaDB)
- **Authentication:** JWT

### Frontend
- **Framework:** React 19
- **Language:** TypeScript (migrated from JavaScript)
- **Styling:** Tailwind CSS + shadcn/ui (TypeScript components)
- **Charts:** Recharts

---

## 3. All Features Implemented ✅

### Core Features
- ✅ JWT Authentication with 4 roles (Admin, Manager, Team Lead, Sales Rep)
- ✅ Lead Management (CRUD, assign, log calls)
- ✅ Pipeline Kanban Board
- ✅ Booking & Payment Tracking
- ✅ Dashboard with Stats & Charts
- ✅ Team Management & Leaderboard
- ✅ Light/Dark Mode

### Advanced Features
- ✅ 1-Hour Follow-up Rule with countdown
- ✅ 30-Day Auto-Reset (scheduled daily)
- ✅ Bulk Lead Import (CSV/Excel)
- ✅ Bulk Lead Export with Filters (CSV)
- ✅ Bulk Lead Assignment (Team Lead/Manager)
- ✅ Agent Performance Reports with Date Filters
- ✅ User Deactivation/Reactivation (Admin)
- ✅ Password Reset (Admin)
- ✅ All currency in INR (₹)
- ✅ Booking Reasons Dropdown (10 options)
- ✅ Bulk Status Updates
- ✅ Sales Rep Dashboard with Uncontacted & Overdue Leads Alerts

---

## 4. Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | alex@bidinn.com | password123 |
| Manager | sarah@bidinn.com | password123 |
| Team Lead | michael@bidinn.com | password123 |
| Sales Rep | emily@bidinn.com | password123 |

---

## 5. Recent Changes

### February 26, 2026 - P2 Features Complete ✅

**1. Export Leads with Filters**
- Added export dialog with filter options (Status, Source, Assigned To)
- Users can select specific filters before exporting to CSV
- Backend supports filtered export via query parameters

**2. Bulk Lead Assignment**
- Added "Assign X Lead(s)" button when leads are selected
- Only visible for Team Lead and Manager roles
- Opens dialog with dropdown to select sales rep
- Backend endpoint: `POST /api/leads/bulk-assign`

**3. Sales Rep Dashboard Improvements**
- Removed manager-only restriction for uncontacted leads section
- Added overdue follow-ups section (amber alert card)
- Sales Reps now see their own uncontacted and overdue leads
- New backend endpoint: `GET /api/dashboard/overdue-followups`

### Earlier Changes (February 26, 2026)
- TypeScript Migration Complete
- Backend Migration (Python → Node.js/Express)
- Agent Performance Reports with Date Filters
- Bulk Lead Export/Import

---

## 6. Code Architecture

```
/app/
├── backend/
│   ├── src/
│   │   ├── config/database.ts     # MySQL connection pool
│   │   ├── middleware/auth.ts     # JWT authentication
│   │   ├── routes/                # API routes (auth, leads, users, etc.)
│   │   ├── types/index.ts         # TypeScript type definitions
│   │   ├── utils/helpers.ts       # Utility functions
│   │   └── index.ts               # Express server with cron jobs
│   ├── .env                       # Environment variables
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/ui/         # Shadcn TypeScript components
│   │   ├── contexts/              # AuthContext.tsx, ThemeContext.tsx
│   │   ├── lib/utils.ts           # Utility functions
│   │   ├── pages/                 # TypeScript page components
│   │   ├── types/index.ts         # Frontend type definitions
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── tsconfig.json
│   └── package.json
└── memory/PRD.md
```

---

## 7. API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user

### Leads
- `GET /api/leads` - List leads with filters
- `POST /api/leads` - Create lead
- `GET /api/leads/:id` - Get lead details
- `PUT /api/leads/:id` - Update lead
- `POST /api/leads/import` - Bulk import from CSV/Excel
- `GET /api/leads/export` - Export to CSV (supports status, source, assigned_to filters)
- `POST /api/leads/bulk-status` - Bulk status update
- `POST /api/leads/bulk-assign` - Bulk lead assignment
- `GET /api/leads/uncontacted` - Get uncontacted leads (>1hr)

### Dashboard
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/dashboard/pipeline-stats` - Pipeline distribution
- `GET /api/dashboard/revenue-trend` - Revenue trend chart data
- `GET /api/dashboard/overdue-followups` - Get overdue follow-up leads
- `GET /api/reports/agent-performance` - Agent performance reports

### Admin
- `POST /api/admin/seed-data` - Seed demo data (requires admin role)
- `GET /api/admin/features` - Feature flags

---

## 8. Future Enhancements (Backlog)

### P1 - Nice to Have
- Google Sheets integration for lead import/export
- Email notifications for overdue leads

### P2 - Future Consideration
- SMS integration
- Mobile app

---

## 9. Testing

### Test Reports
- `/app/test_reports/iteration_4.json` - TypeScript migration tests
- `/app/test_reports/iteration_5.json` - P2 features tests (100% pass rate)

### Test Credentials
All demo accounts use password: `password123`

---

**End of PRD**
