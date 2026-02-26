# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 5.0  
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
- ✅ Bulk Lead Export (CSV)
- ✅ Agent Performance Reports with Date Filters
- ✅ User Deactivation/Reactivation (Admin)
- ✅ Password Reset (Admin)
- ✅ All currency in INR (₹)
- ✅ Booking Reasons Dropdown (10 options)
- ✅ Bulk Status Updates (select multiple leads, update status)

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

### February 26, 2026 - TypeScript Migration Complete ✅
1. **Frontend TypeScript Migration:** Converted all React components from JavaScript (.js/.jsx) to TypeScript (.tsx)
2. **Shadcn UI Component Conversion:** Converted key UI components to TypeScript:
   - dialog.tsx, button.tsx, card.tsx, input.tsx, label.tsx, select.tsx, table.tsx
   - checkbox.tsx, badge.tsx, avatar.tsx, separator.tsx, skeleton.tsx, textarea.tsx
   - dropdown-menu.tsx, tabs.tsx, popover.tsx, scroll-area.tsx, switch.tsx
   - alert-dialog.tsx, calendar.tsx
3. **Type Definitions:** Added comprehensive type interfaces in `/app/frontend/src/types/index.ts`
4. **Database:** Installed MariaDB and configured backend to connect to MySQL
5. **Testing:** All 31 backend API tests passed, all frontend pages working correctly

### February 23, 2026 - Backend Migration
1. **Backend Migration:** Python/FastAPI/MongoDB → Node.js/Express.js/TypeScript/MySQL
2. **Agent Performance Reports:** Filter by agent + date range
3. **30-Day Auto-Reset Job:** Scheduled daily at midnight
4. **Bulk Lead Export:** CSV export with filters
5. **User Management:** Deactivation/reactivation + password reset
6. **Booking Reasons:** 10 preset reasons dropdown
7. **Bulk Status Updates:** Select multiple leads, update together

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
- `GET /api/leads/export` - Export to CSV
- `POST /api/leads/bulk-status` - Bulk status update

### Dashboard
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/dashboard/pipeline-stats` - Pipeline distribution
- `GET /api/dashboard/revenue-trend` - Revenue trend chart data
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
- Bulk export filtering by status/source/agent
- Bulk lead assignment to specific sales rep
- SMS integration
- Mobile app

---

## 9. Known Limitations

1. **ESLint Warnings:** Some useEffect dependency warnings exist but don't affect functionality
2. **Remaining .jsx Files:** Some less-used Shadcn components are still in .jsx format (e.g., carousel, drawer, form, menubar) - can be converted as needed

---

**End of PRD**
