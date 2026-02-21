# Bidinn Sales CRM - Product Requirements Document

## Original Problem Statement
Build a modern, high-tech, SaaS-style responsive Sales CRM for an internal team of 15 sales reps called Bidinn. The CRM must look like a premium B2B SaaS product similar to Stripe, Linear, Notion, or Superhuman.

## User Choices
- **Authentication**: JWT-based custom auth (email/password)
- **User Roles**: Admin, Manager, Team Lead, Sales Rep (4 roles)
- **Theme**: Light mode default with optional dark mode toggle
- **Demo Data**: Comprehensive (55 leads, 15 users seeded)
- **Company Name**: Bidinn

## User Personas
1. **Admin** - Full system access, user management, settings, reports
2. **Manager** - Team oversight, reports, analytics, lead assignment
3. **Team Lead** - Team performance tracking, lead assignment within team
4. **Sales Rep** - Lead management, call logging, booking creation

## Core Requirements (Static)
1. Track leads end-to-end from entry to call activity to booking to payment
2. 1-hour follow-up rule with countdown badge for new leads
3. 30-day auto-reset rule for inactive leads
4. Role-based access control
5. Modern SaaS UI with light/dark mode
6. Revenue tracking and analytics

## Architecture
- **Frontend**: React 19 + Tailwind CSS + shadcn/ui components
- **Backend**: FastAPI (Python) with Motor (async MongoDB driver)
- **Database**: MongoDB
- **Authentication**: JWT tokens
- **Charts**: Recharts library
- **Hosting**: Deployed on Emergent platform

## What's Been Implemented (Feb 21, 2026)

### Backend API (100% Complete)
- [x] JWT Authentication (login, register, me)
- [x] User CRUD operations with role-based access
- [x] Lead Management (CRUD, assignment, status updates)
- [x] Call Logging with outcome tracking
- [x] Booking Management
- [x] Payment Recording
- [x] Activity Timeline logging
- [x] Notifications system
- [x] Dashboard statistics API
- [x] Leaderboard API
- [x] Revenue trend API
- [x] Pipeline statistics API
- [x] Source performance API
- [x] 30-day auto-reset job endpoint
- [x] Seed data endpoint
- [x] Feature flags (telephony disabled by default)

### Frontend Pages (100% Complete)
- [x] Login Page with demo account buttons
- [x] Dashboard with role-specific views
- [x] Leads Page (Table + Grid view toggle)
- [x] Lead Detail Page with activity timeline
- [x] Pipeline Kanban Board with drag-and-drop
- [x] Bookings Management
- [x] Payments Tracking
- [x] Reports & Analytics
- [x] Team Management with Leaderboard
- [x] Settings Page with dark mode toggle

### Key Features Implemented
- [x] 1-hour countdown badge for new leads
- [x] Overdue lead highlighting (red border + badge)
- [x] Live countdown timers on lead cards
- [x] Revenue trend charts (line chart)
- [x] Pipeline distribution (pie chart)
- [x] Sales funnel visualization
- [x] Source performance metrics
- [x] Leaderboard with ranking (gold/silver/bronze)
- [x] Dark mode support
- [x] Responsive sidebar navigation
- [x] Search functionality
- [x] Status filters
- [x] Source filters
- [x] Rep assignment filters

## Prioritized Backlog

### P0 - Critical (Done)
- [x] Core CRUD operations
- [x] Authentication
- [x] Dashboard
- [x] Lead management

### P1 - High Priority (Done)
- [x] Kanban board
- [x] Call logging
- [x] Bookings/Payments
- [x] Reports

### P2 - Medium Priority (Future)
- [ ] Bulk lead import/export
- [ ] Email notifications
- [ ] SMS reminders
- [ ] Calendar integration

### P3 - Nice to Have (Future)
- [ ] Smartflo telephony integration (feature flag ready)
- [ ] Advanced reporting with date range filters
- [ ] Lead scoring AI
- [ ] Mobile app

## Next Tasks
1. Add email notification integration for follow-up reminders
2. Implement scheduled job for 30-day auto-reset (currently manual)
3. Add bulk lead import via CSV
4. Consider adding logo upload functionality
5. Add audit log viewer for admins
