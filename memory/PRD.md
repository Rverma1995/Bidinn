# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 4.0  
**Last Updated:** February 23, 2026  
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
- **Styling:** Tailwind CSS + shadcn/ui
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
- ✅ **Booking Reasons Dropdown** (10 options)
- ✅ **Bulk Status Updates** (select multiple leads, update status)

---

## 4. Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | alex@bidinn.com | password123 |
| Manager | sarah@bidinn.com | password123 |
| Sales Rep | emily@bidinn.com | password123 |

---

## 5. Recent Changes (Feb 23, 2026)

### Session Summary
1. **Backend Migration:** Python/FastAPI/MongoDB → Node.js/Express.js/TypeScript/MySQL
2. **Agent Performance Reports:** Filter by agent + date range
3. **30-Day Auto-Reset Job:** Scheduled daily at midnight
4. **Bulk Lead Export:** CSV export with filters
5. **User Management:** Deactivation/reactivation + password reset
6. **Booking Reasons:** 10 preset reasons dropdown
7. **Bulk Status Updates:** Select multiple leads, update together

---

## 6. API Highlights

### New Endpoints Added
- `GET /api/bookings/reasons` - List booking reasons
- `GET /api/bookings/analytics/by-reason` - Analytics by reason
- `POST /api/leads/bulk-update-status` - Bulk status update
- `POST /api/leads/bulk-assign` - Bulk assignment
- `POST /api/users/:id/toggle-status` - Activate/deactivate user
- `POST /api/users/:id/reset-password` - Reset password
- `GET /api/dashboard/agent-performance` - Agent reports with date filters

---

## 7. Future Enhancements (Optional)

- Google Sheets integration (requires OAuth setup)
- Email notifications
- SMS integration
- Mobile app

---

*All requested features have been implemented and tested.*
