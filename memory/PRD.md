# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 10.0  
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
- ✅ **Meta Lead Ads Integration** (Facebook/Instagram real-time webhook)

### Bug Fixes (March 6, 2026)
- ✅ Leads table view shows Name, Phone, Email, Source columns
- ✅ Booking creation fixed (added booking_reason column)
- ✅ Booking form simplified: "Amount Received (₹)" replaces bid_price/final_price
- ✅ Sales Rep visibility scoping: can only see assigned leads (not unassigned)
- ✅ Dashboard alerts (Uncontacted Leads, Overdue Follow-ups) visible to all roles

---

## 4. Meta Lead Ads Integration

### How It Works
1. Admin configures Meta credentials in Settings page
2. Webhook URL is registered in Meta Business Suite
3. When someone fills a Facebook/Instagram Lead Form, Meta sends a webhook
4. Bidinn automatically creates a new lead from the form data

### Setup Requirements
- Meta App ID and App Secret from [Meta for Developers](https://developers.facebook.com/apps/)
- Page Access Token with `leads_retrieval` permission
- Facebook Page ID

### API Endpoints
- `GET /api/meta/config` - Get Meta configuration status
- `POST /api/meta/config` - Save Meta credentials (Admin only)
- `GET /api/meta/webhook` - Webhook verification (Meta challenge)
- `POST /api/meta/webhook` - Receive lead data from Meta
- `POST /api/meta/test-connection` - Test Meta API connection
- `GET /api/meta/leads` - Get leads imported from Meta

### Webhook URL
After configuring credentials, use this webhook URL in Meta Business Suite:
```
https://your-domain.com/api/meta/webhook
```

---

## 5. Authentication Flow

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

## 6. API Endpoints Summary

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/change-password` - Change password

### Users
- `GET /api/users` - List users
- `PUT /api/users/:id` - Update user
- `POST /api/users/:id/reset-password` - Reset password

### Leads
- `GET /api/leads` - List leads
- `POST /api/leads` - Create lead
- `POST /api/leads/:id/assign` - Assign lead
- `POST /api/leads/bulk-assign` - Bulk assign
- `GET /api/leads/export` - Export CSV

### Meta Integration
- `GET /api/meta/config` - Get config
- `POST /api/meta/config` - Save config
- `GET/POST /api/meta/webhook` - Webhook endpoint

---

## 7. Database Tables

- `users` - User accounts
- `leads` - Lead records (includes `meta_leadgen_id` for Meta leads)
- `call_logs` - Call history
- `bookings` - Booking records
- `activities` - Activity log
- `notifications` - User notifications
- `meta_config` - Meta API credentials

---

## 8. Future Enhancements (Backlog)

- Google Sheets integration
- Email/SMS notifications for overdue leads
- Mobile app
- WhatsApp integration

---

**End of PRD**
