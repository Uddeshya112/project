# Testing & Verification Strategy — IntelliSchedule

**Standard**: Proportional Verification Hierarchy & Anti-Truncation Quality Gate  
**Execution Command**: `npm test` (`tsx scripts/run_e2e_tests.ts`)

---

## 1. Test Suite Architecture

The automated test suite evaluates all layers of the platform:

```
[ Automated Test Runner (scripts/run_e2e_tests.ts) ]
  ├── 1. Authentication & Security Test Suite
  │     ├── Empty credentials validation (400)
  │     ├── Invalid credentials rejection (401)
  │     ├── Non-existent user anti-enumeration (401)
  │     ├── Coordinator multi-role resolution (Coordinator + Faculty)
  │     ├── Student multi-role resolution (Student + CR)
  │     ├── Session token verification (/api/auth/me)
  │     ├── Unauthenticated request rejection (401)
  │     ├── User registration workflow (201)
  │     ├── Duplicate registration prevention (409)
  │     ├── Password reset lifecycle (Forgot -> Validate -> Reset -> Login)
  │     └── Session logout & immediate token revocation
  │
  ├── 2. Google OAuth 2.0 Security Audit
  │     ├── Status endpoint validation
  │     └── Minimal scope enforcement (openid, email, profile only)
  │
  └── 3. Timetable Constraint & Generation Engine
        ├── Hard Constraint: Faculty simultaneous teaching collision
        ├── Hard Constraint: Room double-booking collision
        ├── Hard Constraint: Student section cohort class collision
        ├── Hard Constraint: Seating capacity exceedance check
        └── Master Timetable Generation (22 conflict-free sessions)
```

---

## 2. Verification Commands

| Command | Target Layer | Expected Result |
| :--- | :--- | :--- |
| `npm run lint` | TypeScript Type Checker | Zero errors (`tsc --noEmit`) |
| `npm test` | Automated E2E & Backend Test Suite | 22/22 tests passed |
| `npm run build` | Production Vite Bundle | Clean build output in `dist/` |
| `curl http://localhost:3000/api/health/live` | Process Liveness Check | HTTP 200 `{"status": "LIVE"}` |
| `curl http://localhost:3000/api/health/ready` | Operational Readiness Check | HTTP 200 `{"status": "READY"}` |


## 3. Solver Hardening Gate — Task 2

## 4. Solver Hardening Gate — Task 3

Generation compiles laboratory/practical activities into 2- or 3-period contiguous atomic blocks. Blocks cannot cross configured lunch/break slots and must retain the same room and faculty for every period. Non-lab activities remain 1-period by default. The independent validator verifies these block semantics.

Run: `npm run test:solver`.

## 3. Solver Hardening Gate — Task 2

The independent timetable validator is authoritative for candidate acceptance. Solver candidates are revalidated before they can be returned, and blocking violations reject the candidate. `scripts/run_solver_tests.ts` covers seeded determinism, property-based allocation sizes from 20–600, and an explicit infeasibility case.

Run: `npm run test:solver`.

## 5. Solver Hardening Gate — Task 4

Pre-generation room compatibility is a hard gate. Each allocation must have an available room whose type, capacity, and declared equipment all match the activity. Missing compatibility is surfaced as a blocking validation item with the Rooms Management fix path.

## 6. Solver Hardening Gate — Task 5

Faculty status/qualification and direct-teaching caps are hard constraints. Explicit `electiveGroupId` allows alternative elective offerings for the same section to share a slot only when the group is identical. Locked/pinned sessions are reserved before search and preserved immutably; manual move/swap validation rejects locked sessions. Soft scoring includes the student three-consecutive-period cap, course spread/repeated-period penalties, faculty preferences, and a default 10-minute inter-building travel penalty for adjacent periods.
