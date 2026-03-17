# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 15.0  
**Last Updated:** December 16, 2025  
**Product Name:** Bidinn  
**Status:** PRODUCTION READY ✅

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
- **Performance:** Database indexes on frequently queried columns

### Frontend
- **Framework:** React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Charts:** Recharts
- **Currency:** Indian Rupees (₹)
- **Performance:** Pagination (50 records/page), React.memo optimizations

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
- ✅ **Bulk Lead Import (CSV/Excel file upload)** - With 10-minute timeout for large files (~1000 leads)
- ✅ Bulk Lead Export with Filters (CSV)
- ✅ Bulk Lead Assignment
- ✅ **Bulk Lead Delete (Admin only)**
- ✅ Agent Performance Reports with Date Filters
- ✅ **Sales Rep Self-Reports** - Sales reps can view their own performance on Reports page
- ✅ **User Management: Create, Edit (including self-edit), Deactivate, Reset Password**
- ✅ Meta Lead Ads Integration (Facebook/Instagram webhook)
- ✅ **Duplicate Lead Merge** - Admin-only tool to analyze and merge duplicate leads
- ✅ **Server-side Pagination** - For leads, users, and activities (50 per page)

### Lead Management Rules (5 Rules)
- ✅ **Rule 1: Lead Assignment Enforcement** - Leads must be assigned before moving to certain stages
- ✅ **Rule 2: Closed Lead Reason Capture** - Required reason when marking as Lost/Not Interested
- ✅ **Rule 3: Strict Duplicate Prevention** - BLOCKS duplicate leads by phone (no force create)
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
| Bulk Delete Leads | ✅ | ✅ | ❌ | ❌ |
| Import Leads | ✅ | ✅ | ❌ | ❌ |
| Analyze/Merge Duplicates | ✅ | ❌ | ❌ | ❌ |
| Create Users | ✅ | ✅ | ❌ | ❌ |
| Edit Users | ✅ | ✅ | ❌ | Self only |
| Deactivate Users | ✅ | ✅ | ❌ | ❌ |
| View Reports | ✅ | ✅ | ✅ | Own only |
| View All Agents in Reports | ✅ | ✅ | ✅ | ❌ |
| View Team Page | ✅ | ✅ | ✅ | ❌ |
| View Payments Page | ✅ | ✅ | ✅ | ❌ |
| Edit/Delete Bookings | ✅ | ✅ | ❌ | ❌ |
| Edit/Delete Payments | ✅ | ✅ | ❌ | ❌ |

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
- `GET /api/leads` - Paginated (page, limit params)
- `POST /api/leads` - With strict duplicate blocking
- `PUT /api/leads/:id` - With rule validation
- `POST /api/leads/import` - File upload (CSV/Excel)
- `POST /api/leads/bulk-delete` - Admin only
- `POST /api/leads/check-duplicate`
- `POST /api/leads/merge`
- `GET /api/leads/duplicates/analyze` - Admin only, shows duplicate groups
- `POST /api/leads/duplicates/merge-all` - Admin only, merges all duplicates
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
- UTF-8 encoding for international characters (Hindi, etc.)

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
- **Character Encoding:** UTF-8/utf8mb4 for Hindi and international characters
- **Scheduled Jobs:**
  - 30-day auto-reset: Daily at midnight
  - Idle lead escalation: Every 6 hours

---

## 10. Recent Changes (March 13-17, 2026)

### March 17, 2026
1. **Meta Integration Test Connection** - Implemented `/api/meta/test-connection` endpoint to verify Page Access Token by making a test call to Meta Graph API
2. **Test Connection Button** - Added "Test Connection" button to the Meta Lead Ads Integration settings UI

### March 16, 2026 (Previous Session)
1. **Meta & Tata Documentation** - Created `docs/Meta_integration.md` and `docs/Tata_Telephone_Integration.md`
2. **Role-Based Reports** - Sales Reps can now view their own personalized reports on the Reports page
3. **Booking/Payment Management** - Admins and Managers can edit/delete bookings and payments
4. **Performance Indexes** - Added database indexes to Lead, Booking, and Payment entities
5. **Activity Timeline** - Comprehensive activity timeline on lead detail page
6. **Lead Logic Update** - Removed stage-change restrictions; added "Not Interested" & "Lost" stages
7. **Bulk Notes** - Added bulk notes update feature for leads
8. **Data-Sync Fix** - Added no-cache headers to prevent data visibility delays
9. **Meta Integration UI** - Refactored to single-step setup process

### March 13-14, 2026
1. **Fixed Import Error** - Increased frontend timeout to 10 minutes for large file uploads (~1000 leads)
2. **Duplicate Lead Merge** - Added admin-only endpoints to analyze and merge duplicate leads
3. **Cleaned Database** - Merged 684 duplicate groups, deleted 755 duplicate leads
4. **UTF-8 Support** - New imports correctly handle Hindi and international characters
5. **Fixed Pipeline, Bookings & Payments Pages** - Updated API response handling to work with paginated endpoints
6. **Admin Database Management** - Added Export Database (JSON backup) and Delete All Data features in Admin Settings
7. **Pipeline View Improved** - Increased scroll area height for better lead card visibility
8. **Disabled Auto Features** - Removed 30-day auto-reset job and demo seed data functionality

---

## 11. Known Issues

1. **Existing Hindi Data Garbled** - Pre-existing leads with Hindi names display incorrectly. These cannot be fixed automatically and require re-import from original source file.

---

## 12. Future Enhancements (Backlog)

- **P2:** Google Sheets integration for lead import/export
- Email/SMS notifications for overdue leads
- Mobile app
- WhatsApp integration

---

**End of PRD**
