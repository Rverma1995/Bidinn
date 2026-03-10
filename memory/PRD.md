# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 11.0  
**Last Updated:** March 10, 2026  
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
- **ORM:** TypeORM
- **Database:** AWS RDS MySQL (External, Persistent)
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
- ✅ **Meta Lead Ads Integration** (Facebook/Instagram real-time webhook)

### New Lead Management Rules (March 10, 2026) 🆕
- ✅ **Rule 1: Lead Assignment Enforcement** - Leads must be assigned before moving to Interested/Not Answered/Follow-up stages
- ✅ **Rule 2: Closed Lead Reason Capture** - Required reason selection when marking lead as Lost or Not Interested (10 predefined reasons)
- ✅ **Rule 3: Duplicate Lead Detection** - Checks phone/email on new lead creation, shows merge or create-anyway options
- ✅ **Rule 4: Idle Lead Escalation** - Cron job (every 6 hours) notifies managers/admins about leads with no activity for 5+ days
- ✅ **Rule 5: Stage Transition Restriction** - Blocks direct transition from Interested/Follow-up to Not Interested (must go through Won or Lost)

---

## 4. Lead Statuses & Business Rules

### Lead Stages
| Status | Label | Description |
|--------|-------|-------------|
| new | New | Freshly created lead |
| not_answered | Not Answered | Call attempted but not answered |
| interested | Interested | Lead has shown interest |
| followup | Follow-up | Scheduled for follow-up |
| not_interested | Not Interested | Lead not interested (requires reason) |
| won | Won | Deal closed successfully |
| lost | Lost | Deal lost (requires reason) |

### Closed Reasons (for Lost/Not Interested)
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

### Stage Transition Rules
- **New** → Can go to: Not Answered, Interested, Not Interested, Follow-up, Won, Lost
- **Not Answered** → Can go to: New, Interested, Not Interested, Follow-up, Won, Lost
- **Interested** → Can go to: New, Not Answered, Follow-up, Won, Lost (❌ Cannot go to Not Interested)
- **Follow-up** → Can go to: New, Not Answered, Interested, Won, Lost (❌ Cannot go to Not Interested)
- **Not Interested** → Can go to: New (reopen only)
- **Won** → Final stage (no transitions)
- **Lost** → Can go to: New (reopen only)

---

## 5. Notifications System

### Notification Types
- `idle_lead` - Alerts for leads with no activity for 5+ days
- `duplicate_lead` - Alerts when duplicate leads are detected
- `lead_merged` - Confirmation when leads are merged
- `lead_assignment` - Assignment notifications
- `system` - General system notifications

### API Endpoints
- `GET /api/notifications` - Get notifications (with unread_count)
- `PUT /api/notifications/:id/read` - Mark single notification as read
- `PUT /api/notifications/mark-all-read` - Mark all as read
- `DELETE /api/notifications/:id` - Delete notification

---

## 6. Meta Lead Ads Integration

### How It Works
1. Admin configures Meta credentials in Settings page
2. Webhook URL is registered in Meta Business Suite
3. When someone fills a Facebook/Instagram Lead Form, Meta sends a webhook
4. Bidinn automatically creates a new lead from the form data

### Setup Requirements
- Meta App ID and App Secret from [Meta for Developers](https://developers.facebook.com/apps/)
- Page Access Token with `leads_retrieval` permission
- Facebook Page ID

---

## 7. Authentication Flow

### How Users Login
1. **Admin creates user account** via Team page → Sets email, name, role, initial password
2. **User logs in** at login page → Enters email + password
3. **User can change own password** via Settings page

### Demo Accounts
| Role | Email | Password |
|------|-------|----------|
| Admin | alex@bidinn.com | password123 |
| Manager | sarah@bidinn.com | password123 |
| Team Lead | michael@bidinn.com | password123 |
| Sales Rep | emily@bidinn.com | password123 |

---

## 8. API Endpoints Summary

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/change-password` - Change password

### Users
- `GET /api/users` - List users
- `PUT /api/users/:id` - Update user
- `POST /api/users/:id/reset-password` - Reset password

### Leads
- `GET /api/leads` - List leads
- `POST /api/leads` - Create lead (with duplicate detection)
- `GET /api/leads/:id` - Get single lead
- `PUT /api/leads/:id` - Update lead (with rule validations)
- `POST /api/leads/:id/assign` - Assign lead
- `POST /api/leads/bulk-assign` - Bulk assign
- `POST /api/leads/bulk-status` - Bulk status update
- `GET /api/leads/export/csv` - Export CSV
- `POST /api/leads/check-duplicate` - Check for duplicates
- `POST /api/leads/merge` - Merge duplicate leads
- `GET /api/leads/closed-reasons` - Get closed reason options

### Meta Integration
- `GET /api/meta/config` - Get config
- `POST /api/meta/config` - Save config
- `GET/POST /api/meta/webhook` - Webhook endpoint

---

## 9. Database Tables (TypeORM Entities)

- `users` - User accounts
- `leads` - Lead records (includes `closed_reason`, `closed_reason_notes`)
- `calls` - Call history
- `bookings` - Booking records
- `payments` - Payment records
- `activities` - Activity log
- `notifications` - User notifications (new!)
- `meta_config` - Meta API credentials

---

## 10. Future Enhancements (Backlog)

- **P1:** Google Sheets integration for lead import/export
- Email/SMS notifications for overdue leads
- Mobile app
- WhatsApp integration

---

**End of PRD**
