# Bidinn Sales CRM - Product Requirements Document (PRD)

**Version:** 1.0  
**Last Updated:** February 23, 2026  
**Product Name:** Bidinn  
**Product Type:** B2B Sales CRM Platform

---

## 1. Executive Summary

Bidinn is a modern, high-tech, SaaS-style Sales CRM designed for internal sales teams. Built with a premium B2B aesthetic similar to Stripe, Linear, and Notion, it enables sales teams to track leads end-to-end from entry to call activity to booking to payment.

### Key Highlights
- 🎯 End-to-end lead tracking
- ⏱️ 1-hour contact window enforcement
- 📊 Real-time analytics and reporting
- 👥 Role-based access control (4 roles)
- 🌙 Light/Dark mode support
- 📱 Fully responsive design

---

## 2. User Personas & Roles

### 2.1 Admin
- **Access Level:** Full system access
- **Capabilities:**
  - All Manager capabilities
  - User management (create, edit, deactivate users)
  - System settings configuration
  - Seed demo data
  - Run 30-day auto-reset job manually
  - Access all reports and analytics

### 2.2 Manager
- **Access Level:** Team oversight and reporting
- **Capabilities:**
  - All Team Lead capabilities
  - View all leads across the organization
  - Access Reports & Analytics page
  - View uncontacted leads (>1hr) alerts
  - Monitor team performance
  - View revenue trends and source ROI

### 2.3 Team Lead
- **Access Level:** Team management
- **Capabilities:**
  - All Sales Rep capabilities
  - Assign/reassign leads to team members
  - Access Payments page
  - Access Team page with leaderboard
  - Record payments for bookings
  - Change team member roles

### 2.4 Sales Rep
- **Access Level:** Individual contributor
- **Capabilities:**
  - View assigned leads and unassigned leads
  - Create new leads
  - Import leads from CSV/Excel
  - Log calls and activities
  - Update lead status
  - Create bookings
  - View personal dashboard stats

---

## 3. Core Features

### 3.1 Authentication & Security

#### 3.1.1 Login System
- **Type:** JWT-based authentication
- **Token Expiry:** 24 hours
- **Features:**
  - Email/password login
  - Demo account quick-login buttons (Admin, Manager, Team Lead, Sales Rep)
  - Show/hide password toggle
  - Persistent sessions via localStorage
  - Automatic token refresh handling
  - Logout functionality

#### 3.1.2 Security Measures
- Password hashing using bcrypt
- Role-based route protection
- API endpoint authorization
- CORS configuration
- Audit logging for activities

---

### 3.2 Dashboard

#### 3.2.1 Stats Cards
| Metric | Description |
|--------|-------------|
| Total Leads | Count of all leads (filtered by role) |
| Closed Won | Number of successfully closed deals |
| Total Revenue | Sum of all collected payments |
| Monthly Revenue | Current month's collected revenue |
| Conversion Rate | Percentage of leads converted to closed won |
| Avg Deal Size | Average revenue per closed deal |

#### 3.2.2 Alert Cards (Manager/Admin Only)
- **Uncontacted Leads (>1hr):** Red alert showing leads waiting over 1 hour without contact
- **Overdue Follow-ups:** Amber alert showing leads with past-due follow-up dates
- Quick "Review" button linking to filtered leads view

#### 3.2.3 Charts & Visualizations
- **Revenue Trend:** Line chart showing 6-month revenue history
- **Pipeline Distribution:** Pie chart showing leads by stage
- **Sales Leaderboard:** Top 5 performers with rank badges (gold/silver/bronze)
- **Source Performance:** Bar chart showing conversion rates by lead source

#### 3.2.4 Urgent Leads Section (Manager/Admin)
- Grid display of uncontacted leads over 1 hour
- Each card shows countdown timer, contact info, and status

---

### 3.3 Lead Management

#### 3.3.1 Lead Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Name | String | Yes | Lead/Company name |
| Phone | String | Yes | Contact phone number |
| Email | String | No | Contact email |
| Source | Enum | Yes | Lead origin (Website, Referral, Google Ads, etc.) |
| Campaign | String | No | Marketing campaign name |
| City | String | No | Location/region |
| Status | Enum | Auto | Pipeline stage |
| Assigned To | Reference | No | Assigned sales rep |
| Attempt Count | Integer | Auto | Number of call attempts |
| Last Activity | DateTime | Auto | Timestamp of last action |
| Next Follow-up | DateTime | No | Scheduled follow-up date |
| Notes | Text | No | Additional information |

#### 3.3.2 Lead Statuses (Pipeline Stages)
1. **New** - Fresh lead, not yet contacted
2. **Contacted** - Initial contact made
3. **Qualified** - Lead is qualified and interested
4. **Proposal** - Proposal sent to lead
5. **Negotiation** - In negotiation phase
6. **Closed Won** - Deal successfully closed
7. **Closed Lost** - Deal lost

#### 3.3.3 Lead List Views
- **Table View:** Sortable columns with all lead details
- **Grid View:** Card-based layout with key info
- **Toggle:** Switch between views with icon buttons

#### 3.3.4 Lead Filters
- Search by name, phone, or email
- Filter by status
- Filter by source
- Filter by assigned rep (Team Lead+ only)
- Special filter: Uncontacted leads (>1hr)

#### 3.3.5 Lead Creation
- Modal form with all lead fields
- Source dropdown with predefined options
- Automatic status set to "New"
- Activity log entry created

#### 3.3.6 Lead Import (Bulk)
- **Supported Formats:** CSV, Excel (.xlsx, .xls)
- **Features:**
  - Drag & drop file upload
  - Template download with example data
  - Smart column mapping (recognizes variations)
  - Duplicate detection by phone number
  - Import results summary with error details
- **Required Columns:** name, phone
- **Optional Columns:** email, source, campaign, city, notes
- **Column Variations Recognized:**
  - name: "lead name", "full name", "customer name", "company"
  - phone: "phone number", "mobile", "contact", "telephone"
  - email: "email address", "e-mail", "mail"

#### 3.3.7 Lead Detail Page
- **Contact Information Card:** Phone, email, city, source display
- **Assignment Card:** Current assignee with reassignment dropdown
- **Notes Card:** Editable notes section
- **Call History:** List of all logged calls with outcomes
- **Stats:** Call attempts count and lead age
- **Follow-up Badge:** Next scheduled follow-up date
- **Activity Timeline:** Chronological list of all actions on lead

---

### 3.4 1-Hour Follow-up Rule

#### 3.4.1 Countdown Timer
- **Display:** Badge on lead cards showing time remaining
- **Location:** Leads table, Kanban cards, Dashboard
- **States:**
  - Normal (>15 min): Grey badge with countdown
  - Urgent (<15 min): Amber badge with pulse animation
  - Overdue (>1 hr): Red badge showing "Overdue"

#### 3.4.2 Overdue Lead Handling
- Red border/highlight on lead cards
- Appears in "Uncontacted >1hr" dashboard widget
- Manager notification (in-app)
- Separate filtered view accessible via "Review" button

#### 3.4.3 Timer Logic
- Starts from lead creation timestamp
- Resets when first call is logged (attempt_count > 0)
- Only applies to leads with status "New" and zero attempts

---

### 3.5 30-Day Auto-Reset Rule

#### 3.5.1 Trigger Conditions
Lead is reset if ALL conditions are met:
- Status is NOT: New, Closed Won, or Closed Lost
- Last activity is more than 30 days ago
- No comments/activity logged in 30 days

#### 3.5.2 Reset Actions
- Status changed to "New"
- Assigned rep removed
- Lead moved to unassigned queue
- System activity log entry added
- Manager notification created

#### 3.5.3 Manual Trigger
- Admin can manually run reset job from Settings page
- Returns count of leads reset

---

### 3.6 Call Logging

#### 3.6.1 Log Call Modal
- **Outcome Options:**
  - Connected
  - No Answer
  - Busy
  - Voicemail
  - Wrong Number
  - Callback Requested
- **Fields:**
  - Duration (minutes)
  - Notes (text area)
  - Next Follow-up (date/time picker)

#### 3.6.2 Automatic Updates on Call Log
- Increment attempt count
- Update last activity timestamp
- Update next follow-up date (if provided)
- Auto-advance status: New → Contacted (if outcome is "Connected")
- Create activity timeline entry

#### 3.6.3 Call History
- Displayed on Lead Detail page
- Shows: outcome badge, duration, notes, caller name, timestamp
- Color-coded by outcome (green for connected)

---

### 3.7 Pipeline (Kanban Board)

#### 3.7.1 Kanban Columns
5 active pipeline stages (excluding Closed Won/Lost):
1. New (Blue)
2. Contacted (Cyan)
3. Qualified (Purple)
4. Proposal (Amber)
5. Negotiation (Orange)

#### 3.7.2 Lead Cards
- Lead name and phone
- Countdown badge (for new uncontacted leads)
- City location
- Assigned rep name
- Last activity time
- Drag handle icon

#### 3.7.3 Drag & Drop
- Drag leads between columns to update status
- Visual feedback during drag (opacity, rotation)
- Drop zone highlighting
- Optimistic UI update
- Toast notification on success
- Automatic rollback on API failure

#### 3.7.4 Closed Deals Summary
- Separate section below Kanban
- Shows count of Closed Won and Closed Lost
- Color-coded cards (green/red)

---

### 3.8 Bookings

#### 3.8.1 Booking Fields
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Lead | Reference | Yes | Associated lead |
| Hotel Name | String | Yes | Hotel/property name |
| Check-in | Date | Yes | Check-in date |
| Check-out | Date | Yes | Check-out date |
| Final Price | Decimal | Yes | Agreed booking price |
| Bid Price | Decimal | No | Initial bid amount |
| Payment Status | Enum | Auto | Unpaid/Partial/Paid |
| Payment Amount | Decimal | Auto | Total collected |
| Notes | Text | No | Additional details |

#### 3.8.2 Booking Creation
- Select lead from dropdown (excludes already closed leads)
- Auto-updates lead status to "Closed Won"
- Creates activity log entry

#### 3.8.3 Bookings List
- Table view with all bookings
- Filterable by payment status
- Searchable by lead name or hotel
- Stats cards: Collected Revenue, Pending Revenue, Total Bookings

---

### 3.9 Payments

#### 3.9.1 Record Payment
- Select booking from dropdown (excludes fully paid)
- Shows booking details: total price, already paid, remaining
- "Pay full amount" quick button
- Amount input with validation
- Notes field for reference

#### 3.9.2 Payment Status Logic
- **Unpaid:** No payments recorded
- **Partial:** Some payment received, balance remaining
- **Paid:** Total payments ≥ final price

#### 3.9.3 Payments List
- Table showing all payment transactions
- Columns: Date, Booking info, Amount, Notes
- Stats: Total Collected, This Month, Total Transactions

---

### 3.10 Reports & Analytics (Manager/Admin Only)

#### 3.10.1 Key Metrics Cards
- Total Revenue with trend indicator
- Total Leads with new leads count
- Conversion Rate with deals closed
- Average Deal Size

#### 3.10.2 Revenue Trend Chart
- Line chart showing monthly revenue
- 6-month historical view
- Hover tooltips with exact values

#### 3.10.3 Sales Funnel
- Funnel visualization showing lead progression
- Stages: New → Contacted → Qualified → Proposal → Negotiation → Closed Won
- Count labels on each stage

#### 3.10.4 Source Performance Chart
- Horizontal bar chart
- Shows total leads vs closed won by source
- Easy comparison of channel effectiveness

#### 3.10.5 Pipeline Distribution
- Pie/donut chart
- Shows current leads by stage
- Legend with counts

#### 3.10.6 Source ROI Table
- Detailed breakdown by source
- Columns: Source, Total Leads, Closed Won, Conversion Rate, Performance Rating
- Performance badges: High (>20%), Medium (10-20%), Low (<10%)

---

### 3.11 Team Management

#### 3.11.1 Team Stats
- Total Members count
- Sales Reps count
- Team Revenue total
- Total Calls made

#### 3.11.2 Sales Leaderboard
- Ranked list of sales reps
- Rank badges: 🏆 Gold (1st), 🥈 Silver (2nd), 🥉 Bronze (3rd)
- Metrics per rep: Leads closed, Calls made, Revenue, Conversion rate
- Visual rank backgrounds (gradient effects)

#### 3.11.3 Team Members Table
- Avatar, name, email, role, status
- Role dropdown for changing roles (Manager+ only)
- Active/Inactive status badge

#### 3.11.4 Add Team Member (Manager/Admin)
- Modal form with fields:
  - Full Name
  - Email
  - Password (with show/hide toggle)
  - Role dropdown (Sales Rep, Team Lead, Manager, Admin)
- Password validation (min 6 characters)
- Duplicate email prevention

---

### 3.12 Settings

#### 3.12.1 Profile Section
- Display avatar, name, email, role
- Read-only profile information

#### 3.12.2 Appearance
- Dark Mode toggle switch
- Persists preference to localStorage

#### 3.12.3 Notifications (UI Only)
- Email Notifications toggle
- Lead Assignment Alerts toggle
- Follow-up Reminders toggle

#### 3.12.4 Admin Actions (Admin Only)
- **Seed Demo Data:** Populate database with sample data
- **Run 30-Day Auto Reset:** Manually trigger inactive lead reset

#### 3.12.5 Feature Flags
- Telephony Integration status (disabled, future feature)

---

### 3.13 Notifications System

#### 3.13.1 Notification Types
- Lead Assignment
- Auto-Reset alerts
- System notifications

#### 3.13.2 Notification Bell
- Located in header
- Badge showing unread count
- Dropdown panel with notification list

#### 3.13.3 Notification Actions
- Click to mark as read
- "Mark all read" button
- Visual indicator for unread (blue dot)

---

### 3.14 Activity Timeline

#### 3.14.1 Tracked Activities
- Lead created
- Lead updated
- Lead assigned
- Call logged
- Booking created
- Payment recorded
- Auto-reset triggered

#### 3.14.2 Activity Entry Format
- Action type with icon
- Details/description
- User who performed action
- Timestamp (relative format)

---

## 4. User Interface

### 4.1 Design System

#### 4.1.1 Colors
- **Primary:** Deep Blue/Indigo (#4F46E5)
- **Success:** Emerald Green (#10B981)
- **Warning:** Amber (#F59E0B)
- **Destructive:** Red (#EF4444)
- **Neutral:** Slate grays

#### 4.1.2 Typography
- **Font Family:** Inter (Google Fonts)
- **Headings:** Semibold, tight tracking
- **Body:** Regular weight

#### 4.1.3 Components
- Soft shadows
- Rounded corners (8-12px)
- Subtle hover states
- Micro-interactions
- Glass-morphism effects

### 4.2 Layout

#### 4.2.1 Sidebar Navigation
- Collapsible (expanded/collapsed states)
- Company logo at top
- Navigation links with icons
- Role-based menu filtering
- Active state highlighting
- Settings link at bottom

#### 4.2.2 Header
- Search bar
- Theme toggle (sun/moon icon)
- Notifications bell with badge
- User menu dropdown (profile, settings, logout)

#### 4.2.3 Main Content Area
- Responsive padding
- Page title and description
- Content cards and sections

### 4.3 Responsive Design
- Mobile-first approach
- Collapsible sidebar on mobile
- Stacked layouts for small screens
- Touch-friendly tap targets

### 4.4 Dark Mode
- Full dark theme support
- Automatic color adjustments
- Persisted user preference
- Toggle in header and settings

---

## 5. Technical Architecture

### 5.1 Frontend
- **Framework:** React 19
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui
- **Charts:** Recharts
- **State:** React Context API
- **Routing:** React Router v6
- **HTTP Client:** Axios
- **Notifications:** Sonner (toast)

### 5.2 Backend
- **Framework:** FastAPI (Python)
- **Database:** MongoDB
- **ODM:** Motor (async driver)
- **Auth:** JWT (PyJWT)
- **Password Hashing:** bcrypt
- **File Parsing:** openpyxl (Excel), csv (CSV)

### 5.3 API Structure
- Base URL: `/api`
- Authentication: Bearer token
- Response format: JSON
- Error handling: HTTP status codes with detail messages

### 5.4 Database Collections
- users
- leads
- calls
- bookings
- payments
- activities
- notifications

### 5.5 Indexes
- users: id (unique), email (unique)
- leads: id (unique), status, assigned_to, created_at, source
- calls: lead_id
- bookings: lead_id
- activities: lead_id
- notifications: user_id

---

## 6. API Endpoints Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Create new user |
| POST | /api/auth/login | Login and get token |
| GET | /api/auth/me | Get current user |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List all users |
| GET | /api/users/{id} | Get user by ID |
| PUT | /api/users/{id} | Update user |

### Leads
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/leads | Create lead |
| GET | /api/leads | List leads (with filters) |
| GET | /api/leads/uncontacted | Get uncontacted >1hr leads |
| POST | /api/leads/import | Bulk import from file |
| GET | /api/leads/import/template | Get import template info |
| GET | /api/leads/{id} | Get lead details |
| PUT | /api/leads/{id} | Update lead |
| DELETE | /api/leads/{id} | Delete lead |
| POST | /api/leads/{id}/assign | Assign lead to rep |

### Calls
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/calls | Log a call |
| GET | /api/calls | List calls (filter by lead/user) |

### Bookings
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/bookings | Create booking |
| GET | /api/bookings | List bookings |
| GET | /api/bookings/{id} | Get booking details |
| PUT | /api/bookings/{id} | Update booking |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/payments | Record payment |
| GET | /api/payments | List payments |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/dashboard/stats | Get dashboard statistics |
| GET | /api/dashboard/leaderboard | Get sales leaderboard |
| GET | /api/dashboard/pipeline-stats | Get leads by stage |
| GET | /api/dashboard/revenue-trend | Get monthly revenue data |
| GET | /api/dashboard/source-performance | Get source metrics |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/admin/seed-data | Seed demo data |
| POST | /api/admin/run-auto-reset | Run 30-day reset job |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/activities | Get activity log |
| GET | /api/notifications | Get user notifications |
| PUT | /api/notifications/{id}/read | Mark as read |
| PUT | /api/notifications/read-all | Mark all as read |
| GET | /api/config/features | Get feature flags |

---

## 7. Future Roadmap

### Phase 2 (Planned)
- [ ] Lead export to CSV
- [ ] Google Sheets direct integration
- [ ] Email notifications (SendGrid/Resend)
- [ ] SMS reminders (Twilio)
- [ ] Calendar integration (Google Calendar)
- [ ] Scheduled auto-reset cron job

### Phase 3 (Planned)
- [ ] Smartflo telephony integration
- [ ] Click-to-call functionality
- [ ] Call recording playback
- [ ] Advanced reporting with date filters
- [ ] Custom dashboard widgets
- [ ] Bulk lead assignment

### Phase 4 (Future)
- [ ] AI-powered lead scoring
- [ ] Predictive analytics
- [ ] Mobile app (React Native)
- [ ] WhatsApp integration
- [ ] Multi-language support

---

## 8. Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | alex@bidinn.com | password123 |
| Manager | sarah@bidinn.com | password123 |
| Team Lead | michael@bidinn.com | password123 |
| Sales Rep | emily@bidinn.com | password123 |

---

## 9. Deployment Information

- **Platform:** Emergent
- **Frontend Port:** 3000
- **Backend Port:** 8001
- **Database:** MongoDB (local)
- **Environment:** Production-ready

---

*Document maintained by Bidinn Development Team*
