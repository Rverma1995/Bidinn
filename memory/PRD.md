# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 12.0  
**Last Updated:** March 10, 2026  
**Product Name:** Bidinn  
**Status:** DEPLOYMENT READY ✅

---

## 1. Executive Summary

Bidinn is a modern, high-tech, SaaS-style Sales CRM designed for internal sales teams of 15 reps. Built with a premium B2B aesthetic similar to Stripe, Linear, and Notion.

---

## 2. Technical Stack

### Backend
- **Framework:** Express.js (Node.js)
- **Language:** TypeScript
- **ORM:** TypeORM
- **Database:** AWS RDS MySQL (External, Persistent)
- **Authentication:** JWT (secure, no fallback secrets)

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
- ✅ **Bulk Lead Import (CSV/Excel file upload)**
- ✅ Bulk Lead Export with Filters (CSV)
- ✅ Bulk Lead Assignment
- ✅ **Bulk Lead Delete (Admin only)**
- ✅ Agent Performance Reports with Date Filters
- ✅ **User Management: Create, Edit (including self-edit), Deactivate, Reset Password**
- ✅ Meta Lead Ads Integration (Facebook/Instagram webhook)

### Lead Management Rules (5 Rules)
- ✅ **Rule 1: Lead Assignment Enforcement** - Leads must be assigned before moving to certain stages
- ✅ **Rule 2: Closed Lead Reason Capture** - Required reason when marking as Lost/Not Interested
- ✅ **Rule 3: Duplicate Lead Detection** - Check phone/email with merge option
- ✅ **Rule 4: Idle Lead Escalation** - Cron job notifies managers about 5+ day inactive leads
- ✅ **Rule 5: Stage Transition Restriction** - Blocks Interested/Follow-up → Not Interested

---

## 4. Lead Statuses & Business Rules

### Lead Stages
| Status | Label |
|--------|-------|
| new | New |
| not_answered | Not Answered |
| interested | Interested |
| followup | Follow-up |
| not_interested | Not Interested |
| won | Won |
| lost | Lost |

### Closed Reasons
1. Price Too High
2. Booked Elsewhere
3. Not Travelling
4. No Response
5. Just Browsing
6. Wrong Contact
7. Went to Competitor
8. Budget Issues
9. Timing Not Right
10. Other

---

## 5. Role Permissions

| Feature | Admin | Manager | Team Lead | Sales Rep |
|---------|-------|---------|-----------|-----------|
| View All Leads | ✅ | ✅ | ✅ | Own only |
| Create Leads | ✅ | ✅ | ✅ | ✅ |
| Assign Leads | ✅ | ✅ | ✅ | ❌ |
| Bulk Delete Leads | ✅ | ❌ | ❌ | ❌ |
| Import Leads | ✅ | ✅ | ❌ | ❌ |
| Create Users | ✅ | ❌ | ❌ | ❌ |
| Edit Users | ✅ | ✅ | ❌ | Self only |
| Deactivate Users | ✅ | ❌ | ❌ | ❌ |

---

## 6. API Endpoints

### Authentication
- `POST /api/auth/login`
- `POST /api/auth/change-password`
- `GET /api/auth/me`

### Users
- `GET /api/users`
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user (admin/manager or self for name/email)
- `POST /api/users/:id/reset-password`

### Leads
- `GET /api/leads`
- `POST /api/leads` - With duplicate detection
- `PUT /api/leads/:id` - With rule validation
- `POST /api/leads/import` - File upload (CSV/Excel)
- `POST /api/leads/bulk-delete` - Admin only
- `POST /api/leads/check-duplicate`
- `POST /api/leads/merge`
- `GET /api/leads/closed-reasons`

### Notifications
- `GET /api/notifications`
- `PUT /api/notifications/:id/read`
- `PUT /api/notifications/mark-all-read`

---

## 7. Security Features

- JWT tokens with secure secret (no fallback values)
- Role-based access control
- Users cannot change their own role or active status
- Bulk delete restricted to Admin only
- Password hashing with bcrypt

---

## 8. Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | alex@bidinn.com | password123 |
| Manager | robert@bidinn.com | password123 |
| Team Lead | michael@bidinn.com | password123 |
| Sales Rep | emily@bidinn.com | password123 |

---

## 9. Deployment Notes

- **Database:** External AWS RDS MySQL (persistent)
- **File Upload:** Supports CSV, XLSX, XLS up to 10MB
- **Scheduled Jobs:**
  - 30-day auto-reset: Daily at midnight
  - Idle lead escalation: Every 6 hours

---

## 10. Future Enhancements (Backlog)

- **P1:** Google Sheets integration for lead import/export
- Email/SMS notifications for overdue leads
- Mobile app
- WhatsApp integration

---

**End of PRD**
