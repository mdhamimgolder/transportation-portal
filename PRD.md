# PRD: Internal Transportation Management Portal

## 1. Background & Objective

Our office currently manages employee transportation using Smartsheet. We are replacing it with a custom, in-house web portal that streamlines the entire process — from employee schedule submission, to Operations approval, to Facilities route planning — with automation, historic tracking, and email notifications.

## 2. Tech Stack (decided)

- **Framework:** Next.js (App Router) with TypeScript — single codebase for frontend + backend API routes
- **Database:** SQLite for local development, via **Prisma ORM** (schema must be portable to PostgreSQL for production later)
- **UI:** Tailwind CSS + shadcn/ui components; clean admin-dashboard aesthetic; mobile-first for the Employee views
- **Auth:** Email + password login with role-based access control (RBAC); bulk-uploaded accounts get a temporary password and are forced to change it on first login
- **Email:** For local development, log email contents to the console (or Mailtrap) instead of sending real email. Production will use a real provider later.

## 3. User Roles (RBAC)

| Role | Capabilities |
|---|---|
| **Super Admin** | Full system access; user account management (individual + bulk CSV/Excel upload); views the complete audit log of all changes |
| **Employee** | Registers/logs in; submits Weekly and Ad-Hoc transport requests; views own transport details; views own profile; requests address changes (cannot edit address directly) |
| **Operations Team** | Reviews/approves/rejects weekly schedules; approves/rejects employee address-change requests; can view and directly edit any employee profile; views allocation history |
| **Facilities Team** | Plans daily routes; assigns driver/vehicle details; handles Ad-Hoc requests; can view and directly edit any employee profile; views allocation history |

## 4. Core Workflows

### 4.1 User Management & Profile Updates

- Employees can self-register, OR Super Admin bulk-uploads employee data via CSV/Excel to create accounts instantly.
- Profile fields: Name, Email, Contact Number, Address.
- **Employees cannot directly edit their Address.** Flow: Employee submits an address-change request → Operations reviews and approves/rejects → on approval, the database updates automatically and the change reflects everywhere.
- Operations and Facilities can view and directly edit any employee's profile at any time (every edit is audit-logged).
- Password reset flow, and forced password change on first login for bulk-created accounts.

### 4.2 Employee Portal — Two Request Types

**Option A: Weekly Transport**
- Employee submits office arrival schedule for the upcoming week (Monday–Friday).
- Office timings are flexible: employee selects an arrival time per day (e.g., 10:00 AM, 11:00 AM, 12:00 PM). Include a "No transport needed" option per day.
- Convenience: a "same time for all days" quick-fill button.
- **Strict deadline: submissions lock at Saturday 12:00 PM** for the following week. The system must enforce this (form disabled after the deadline) and show a live countdown to the deadline.

**Option B: Ad-Hoc Transport**
- Single-day emergency/immediate transport support.
- **Bypasses the normal approval chain**: on submission it is sent directly and simultaneously to BOTH the Operations and Facilities dashboards.

### 4.3 Operations Team Dashboard

- **Weekly Requests tab:** table of all submitted schedules with status chips (Pending / Approved / Rejected), bulk-approve checkboxes. On approval, data automatically forwards to the Facilities Team.
- Rejection requires a reason; the employee is notified and may resubmit (if before deadline) or contact Operations.
- **Ad-Hoc tab:** view active single-day requests for tracking/oversight.
- **Profile Approval Hub tab:** approve/reject employee address-change requests (badge count of pending items).
- **Allocation History:** searchable history — which driver/vehicle was allocated to which employee on any past date.

### 4.4 Facilities Team Dashboard & Route Planning

- **Weekly Route Planning:** receives Operations-approved weekly data. Facilities plans routes day by day, with a **"replicate/copy across the entire week"** action to save time, plus a "copy last week's routes" starting template.
- **Ad-Hoc Transport tab:** dedicated, visually highlighted tab showing urgent requests.
- **Data input for every request (weekly and ad-hoc):**
  - Pick-up Time
  - Driver Name
  - Driver Contact Number
  - Vehicle Number
- Maintain a **Driver & Vehicle master list** so these are dropdown selections (no repeated typing, no typos). Facilities can add/edit drivers and vehicles.
- **Automated notification:** the moment Facilities submits these details, an automated email is triggered to the respective employee containing their transport details.
- **Allocation History:** query past driver and vehicle assignments.

### 4.5 Super Admin — Audit Logs

- Master activity log of ALL system modifications: **what** changed (before → after values), **when**, and **who** made the change.
  - Examples: "Operations approved Employee X's address change", "Facilities edited Employee Y's contact number".
- Filterable by user, role, action type, and date range.
- No hard deletes anywhere in the system — use soft deletes/inactive flags so the audit trail stays intact.

## 5. Data Flow Summary

```
Weekly:  Employee Submission → Operations Verification → Facilities Route Planning → Automated Email to Employee
Ad-Hoc:  Employee Submission → (skips approval) → Operations + Facilities simultaneously → Facilities assigns → Automated Email
```

## 6. Data Retention

- All transportation schedules, ad-hoc requests, driver allocations, profile update histories, and audit logs must be stored and indexed for a **minimum of 3 years** for audit and reporting purposes.

## 7. Non-Functional Requirements

- Mobile-responsive throughout; Employee views are mobile-first.
- Role-based sidebar navigation; unauthorized routes redirect to login/403.
- Status color coding: amber = pending, green = approved/dispatched, red = rejected/urgent.
- Seed script (`prisma db seed`) creating: 1 user per role (superadmin / employee / operations / facilities with known test passwords), 10 fake employees, 2 weeks of sample schedules, 3 drivers, 3 vehicles — so dashboards can be tested with realistic data immediately.

## 8. Phase 2 (do NOT build yet — design the schema so these are easy to add)

- SMS notifications alongside email (local Bangladeshi gateways, e.g., SSL Wireless)
- In-app notification bell per role
- Area/zone grouping of employees for shared-vehicle planning; vehicle capacity vs. assigned count
- Company holiday calendar (block requests on holidays)
- No-show tracking by Facilities
- Monthly Excel/CSV reports: trips per employee, vehicle utilization, ad-hoc vs. weekly ratio
- Post-deadline change flow (late changes convert to Ad-Hoc or require Operations override)

## 9. Suggested Build Milestones

1. **M1:** Project setup, Prisma schema, seed script, login + RBAC (4 roles), role-based layouts/navigation
2. **M2:** Employee portal — weekly submission form (with deadline lock + countdown) and ad-hoc request form
3. **M3:** Operations dashboard — weekly approval flow, ad-hoc view, address-change approval hub
4. **M4:** Facilities dashboard — route planning, driver/vehicle master list, copy-across-week, assignment form, console-logged email notification
5. **M5:** Allocation history views (Operations + Facilities), Super Admin audit log, bulk CSV upload, polish + mobile responsiveness
