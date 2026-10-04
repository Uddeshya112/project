# Public Demo Accounts & Testing Guide

> **DEMO ONLY — NOT FOR PRODUCTION AUTHENTICATION**  
> All identities, credentials, and records documented here are isolated demo fixtures for academic software review and automated verification.

---

## 1. Supported Demo Roles & Credentials

All demo accounts share the single standardized demo password:

**Password**: `Demo@2026!`  
*(Encrypted with Blowfish standard Bcrypt KDF, cost factor 12. Plaintext passwords are never stored in the database).*

| Role | Demo Identity Email | Name / Department | Workspaces | Reviewer Testing Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Coordinator** | `coordinator.demo@demo.thapar.local` | Prof. Rajesh K. Demo<br>*(CSED)* | Coordinator, Faculty | Master schedule planning, CP-SAT/DSATUR solver orchestration, conflict diagnosis, 24-72h freeze approvals, and master publishing. |
| **Faculty** | `faculty.demo@demo.thapar.local` | Dr. Neha Agarwal<br>*(CSED)* | Faculty | Weekly personal routine, teaching loads, syllabus progress, voluntary slot claim marketplace, and self-healing class cancellation. |
| **Student** | `student.demo@demo.thapar.local` | Rohan Sharma<br>*(B.Tech CSE)* | Student | Section CSE-A weekly schedule, room locations, instructor contacts, syllabus progress, and makeup slot availability polling. |
| **College Admin / Dean** | `admin.demo@demo.thapar.local` | Dr. Vikram Sengupta<br>*(Office of the Dean)* | Admin, Coordinator | UGC academic calendar enforcement, maximum teaching limits, cross-department governance, and master schedule sign-off. |
| **HOD** | `hod.demo@demo.thapar.local` | Dr. Sunita Rao<br>*(School of Mathematics)* | Coordinator, Faculty | Departmental faculty load balance, elective room allocations, syllabus pacing tracking, and departmental constraints. |

---

## 2. One-Click Demo Access on Login Page

Reviewers do not need to manually enter credentials:
1. Open the public deployment URL: [https://ais-pre-egxpyvduppft5u3vtsukj7-866986539236.asia-east1.run.app](https://ais-pre-egxpyvduppft5u3vtsukj7-866986539236.asia-east1.run.app)
2. In the **"Demo access"** panel, click any of the five dedicated role buttons:
   - **Continue as Coordinator**
   - **Continue as Faculty**
   - **Continue as Student**
   - **Continue as Admin**
   - **Continue as HOD**
3. The server validates the request against the pre-seeded demo user record, issues a cryptographic session token, and logs the reviewer directly into that role's dashboard.

---

## 3. Server-Authoritative Security & Role Integrity

- **No Client-Side Privilege Escalation**: The client never passes an arbitrary role name. The server queries `usersDatabase` by email and derives permissions strictly from the user's database `roleCode`.
- **Identical Security Pipeline**: Demo accounts pass through the same session management, RBAC route verification, rate limiting, and cookie hardening (`HttpOnly`, `SameSite=Lax`) as production accounts.
- **Production Isolation**: Demo accounts carry an internal `isDemoUser: true` flag. Demo users cannot modify institutional settings, cannot alter real user records, and cannot inspect production environment secrets.
- **Independent Google OAuth**: The Google OAuth 2.0 pipeline remains completely independent. Demo mode does not alter or intercept Google authentication.

---

## 4. Demo Academic Dataset & Solvers

The demo environment includes a realistic academic configuration:
- **Academic Year**: 2026-2027 (Odd Semester, 5 working days: Mon - Fri, 8 periods/day from 08:00 to 17:00).
- **Academic Units**:
  - Computer Science & Engineering (CSED)
  - Electronics & Communication (ECED)
  - Mechanical Engineering (MED)
  - Electrical Engineering (EED)
- **Degree Programs**: B.Tech CSE, B.Tech ECE, B.Tech Mechanical, B.Tech Electrical.
- **Courses**:
  - `UCS414` (Operating Systems) — 3L + 0T + 2P (4 credits)
  - `UCS503` (Software Engineering) — 3L + 1T + 0P (3.5 credits)
  - `UCS301` (Data Structures & Algorithms) — 3L + 1T + 2P (4.5 credits)
  - `UEC401` (Signals & Systems) — 3L + 1T + 0P (3.5 credits)
  - `UME302` (Applied Thermodynamics) — 3L + 1T + 2P (4.5 credits)
- **Facilities**:
  - Lecture Halls: `LP-101` (120 cap), `LP-102` (120 cap)
  - Classrooms: `C-204` (70 cap), `C-205` (70 cap)
  - Computing Labs: `LAB-301` (CS Software Lab, 45 cap), `LAB-302` (Hardware Lab, 40 cap)
  - Seminar Hall: `SEM-101` (90 cap)
- **Sections**: `CSE-A` (60 students), `CSE-B` (58 students), `ECE-A` (55 students), `ME-A` (52 students).
- **Constraints & Solver Integration**: Conflict-free solver rules (teacher collisions, room overlaps, student double-bookings, lunch protection 12:00-13:00, lab block continuity). The coordinator can trigger real-time timetable generation and inspect the resulting schedule.

---

## 5. Safe Demo Data Reset

If a reviewer modifies rooms, cancels classes, or generates draft schedules, the environment can be restored to its baseline state:
- **UI Reset**: Click **"Reset Demo Data"** in the top navigation bar when logged in as any demo account.
- **API Endpoint**: `POST /api/demo/reset` (requires valid demo session token). Real user records and production configurations remain untouched.

---

## 6. How to Disable or Remove Demo Mode Before Production

### To Disable Demo Mode via Configuration:
Set the environment variable:
```env
PUBLIC_DEMO_ENABLED=false
```
When set to `false`:
1. The **Demo access** section on the login page is completely hidden.
2. Direct calls to `/api/auth/demo-login` are rejected with `HTTP 403 Forbidden`.
3. Demo reset endpoints are disabled.

### To Purge Demo Fixtures Before Full Production Launch:
1. In `server.ts`, delete the `*.demo@demo.thapar.local` entries from `usersDatabase` and `PRE_AUTHORIZED_STAFF`.
2. In `src/lib/authData.ts`, remove demo identities from `USERS` and `INITIAL_MEMBERSHIPS`.
3. In `src/components/views/LoginPageView.tsx`, remove the demo panel component.
