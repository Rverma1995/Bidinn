# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 8.0  
**Last Updated:** March 6, 2026  
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
- ✅ Login with Email/Password
- ✅ Change Password (self-service for all users)
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

## 4. Authentication Flow

### How Users Login
1. **Admin creates user account** via Team page → Sets email, name, role, initial password
2. **User logs in** at login page → Enters email + password
3. **User can change own password** via Settings page

### Password Rules
- Minimum 6 characters
- User must know current password to change it
- Admin can reset any user's password (Team page → Actions → Reset Password)

### Demo Accounts
| Role | Email | Password |
|------|-------|----------|
| Admin | alex@bidinn.com | password123 |
| Manager | sarah@bidinn.com | password123 |
| Team Lead | michael@bidinn.com | password123 |
| Sales Rep | emily@bidinn.com | password123 |

---

## 5. Recent Changes

### March 6, 2026 - Change Password Feature ✅
- Added `POST /api/auth/change-password` endpoint
- Added Change Password section in Settings page
- Fields: Current Password, New Password, Confirm New Password
- Validation: Minimum 6 characters, passwords must match
- All users can change their own password

### March 5, 2026 - Bug Fixes
- Fixed assign lead endpoint (was sending assignee_id as URL param instead of body)
- Added validation for undefined parameters

### March 5, 2026 - Currency & User Edit Features
- Changed all currency to Indian Rupees (₹)
- Added Edit User Details option for Admin/Manager

---

## 6. API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login (returns JWT token)
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/change-password` - Change own password

### Users (Admin/Manager only)
- `GET /api/users` - List all users
- `PUT /api/users/:id` - Update user (name, email, role)
- `POST /api/users/:id/toggle-status` - Activate/Deactivate
- `POST /api/users/:id/reset-password` - Reset password (Admin only)

### Leads
- `GET /api/leads` - List leads
- `POST /api/leads` - Create lead
- `PUT /api/leads/:id` - Update lead
- `POST /api/leads/:id/assign` - Assign lead to user
- `POST /api/leads/bulk-assign` - Bulk assign leads
- `POST /api/leads/bulk-update-status` - Bulk status update
- `GET /api/leads/export` - Export to CSV

---

## 7. Testing Status

All features tested and working:
- ✅ Login with correct credentials
- ✅ Login rejection with wrong password
- ✅ Login rejection with non-existent email
- ✅ Change password with correct current password
- ✅ Change password rejection with wrong current password
- ✅ Change password rejection for too-short password
- ✅ Get current user endpoint

---

## 8. Future Enhancements (Backlog)

- Google Sheets integration
- Email/SMS notifications for overdue leads
- Mobile app

---

**End of PRD**
