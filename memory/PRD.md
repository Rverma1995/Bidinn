# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 7.0  
**Last Updated:** March 5, 2026  
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
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Charts:** Recharts
- **Currency:** Indian Rupees (₹)

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
- ✅ User Management: Create, Edit, Deactivate, Reset Password
- ✅ All currency in INR (₹) - Indian Rupees
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

### March 5, 2026 - Currency & User Edit Features ✅

**1. Currency Changed to Indian Rupees (₹)**
- All revenue, prices, and amounts now display in INR with Indian locale formatting
- Example: ₹3,00,000 (3 Lakh), ₹1.25L on login page
- Chart Y-axis updated to show ₹ symbol
- formatCurrency function uses `en-IN` locale with `INR` currency

**2. Edit User Details (Admin/Manager)**
- Added "Edit Details" option in team member dropdown menu
- Admin and Manager can edit:
  - Full Name
  - Email Address
- Edit dialog pre-populates with current user data
- Backend PUT /api/users/:id endpoint supports name and email updates

### February 26, 2026 - P2 Features
- Export Leads with Filters (Status, Source, Assigned To)
- Bulk Lead Assignment (Team Lead/Manager)
- Sales Rep Dashboard with Uncontacted/Overdue Leads

---

## 6. Code Architecture

```
/app/
├── backend/
│   ├── src/
│   │   ├── config/database.ts     # MySQL connection pool
│   │   ├── middleware/auth.ts     # JWT authentication
│   │   ├── routes/                # API routes
│   │   ├── types/index.ts         # TypeScript types
│   │   └── index.ts               # Express server
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/ui/         # Shadcn components
│   │   ├── contexts/              # Auth, Theme contexts
│   │   ├── lib/utils.ts           # formatCurrency (INR)
│   │   ├── pages/                 # Page components
│   │   └── types/index.ts         # Frontend types
│   └── package.json
└── memory/PRD.md
```

---

## 7. API Endpoints

### Users
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user (name, email, role) - Admin/Manager only
- `POST /api/users/:id/toggle-status` - Activate/Deactivate user - Admin only
- `POST /api/users/:id/reset-password` - Reset password - Admin only

### Other Endpoints
- Authentication: `/api/auth/register`, `/api/auth/login`, `/api/auth/me`
- Leads: `/api/leads`, `/api/leads/import`, `/api/leads/export`, `/api/leads/bulk-status`, `/api/leads/bulk-assign`
- Dashboard: `/api/dashboard/stats`, `/api/dashboard/overdue-followups`
- Admin: `/api/admin/seed-data`

---

## 8. Testing Status

### Test Reports
- `/app/test_reports/iteration_5.json` - P2 features (100% pass)
- `/app/test_reports/iteration_6.json` - Currency & Edit User (100% pass after fixes)

All features tested and working correctly.

---

## 9. Future Enhancements (Backlog)

- Google Sheets integration
- Email/SMS notifications for overdue leads
- Mobile app

---

**End of PRD**
