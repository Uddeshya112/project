# Supabase PostgreSQL Database Architecture & Migration Specification

**Platform**: IntelliSchedule (University Academic Operations & Timetable Platform)  
**Institution**: Thapar Institute of Engineering and Technology (TIET, Patiala)  
**Engine & Foundation**: Supabase PostgreSQL 16 + Express REST API Gateway + React 19 Frontend  
**Schema Model**: Unified `public` Application Schema + Supabase `auth` Schema  
**Current Status**: Production-Ready & Verified

---

## 1. High-Level System Architecture & Flow

All persistent state mutations and reads follow the strict tiered pipeline:

```
                          ┌───────────────────────────┐
                          │   Frontend React 19 SPA   │
                          └─────────────┬─────────────┘
                                        │
                                        ▼ (JSON / Bearer Token)
                          ┌───────────────────────────┐
                          │  Express REST API Gateway │
                          │ (Auth, RBAC, Validation)  │
                          └─────────────┬─────────────┘
                                        │
                         ┌──────────────┴──────────────┐
                         ▼                             ▼
         ┌───────────────────────────────┐ ┌───────────────────────────┐
         │ Bitset Constraint MRV Solver  │ │   Supabase PostgreSQL     │
         │ & Independent Validator Engine│ │   (Tables, Foreign Keys,  │
         └───────────────┬───────────────┘ │    Indexes, Triggers, RLS)│
                         │                 └─────────────┬─────────────┘
                         └───────────────────────────────┘
```

> **Security Invariant**: The browser client never executes direct privileged database queries or holds the Supabase `service_role` key. All database writes are processed through authenticated server endpoints with strict role-based access controls (RBAC) and Row Level Security (RLS) enforcement.

---

## 2. Relational Entity Domain Hierarchy

### A. Identity & Tenant Layer
- `public.institutions`: Institutional tenant registry (`inst-thapar`).
- `public.profiles`: User identity profiles linked 1:1 with `auth.users.id`.
- `public.roles`: System roles (`SUPER_ADMIN`, `COLLEGE_ADMIN`, `COORDINATOR`, `HOD`, `FACULTY`, `CLASS_REPRESENTATIVE`, `STUDENT`).
- `public.workspace_memberships`: User-to-institution role assignments supporting multi-workspace authorization (e.g. Coordinator + Faculty dual roles).

### B. Academic Structure Layer
- `public.academic_years`: Active academic calendars, operational semester numbers, working day schedules, and period definitions.
- `public.departments`: University departments (`CSED`, `ECED`, `SMAT`, etc.).
- `public.programs`: Degree offerings (`BTECH-CSE`, `BTECH-ECE`) mapped to parent departments.
- `public.batches`: Cohort graduation years (e.g. Batch 2024, Batch 2026).
- `public.groups`: Main student class sections (`CSE-A`, `CSE-B` ... `CSE-J`).
- `public.subgroups`: Laboratory and tutorial sub-sections (`A1`, `A2`, `B1`, `B2`, etc.) with dedicated student headcounts.
- `public.students`: Student directory records with roll numbers, assigned groups, and subgroups.

### C. Master Data Layer
- `public.courses`: Curriculum catalog with lecture, tutorial, and lab hour requirements, equipment flags, and credits.
- `public.faculty`: Faculty directory with UGC teaching load limits (Assoc/Prof 14 hrs, Asst Prof 16 hrs), department links, and preferences.
- `public.faculty_availability`: Day/period protected slots and availability blocks.
- `public.rooms`: Lecture halls, seminar rooms, and computer/hardware laboratories with seating capacities and equipment inventories.
- `public.academic_constraints`: Active system rules (teacher conflicts, room conflicts, lunch breaks, maximum consecutive hours).

### D. Scheduling & Timetable Layer
- `public.course_allocations`: Teaching assignments linking `course_id`, `faculty_id`, `section_id`, and optional `sub_section_id`.
- `public.timetable_versions`: Immutable version snapshots (`Master V1.0`, `Draft V2.0`) capturing generated schedule states.
- `public.timetable_entries`: Schedulable class session assignments with `day`, `time_slot_id`, `room_id`, `faculty_id`, `section_id`, and `sub_section_id`.

### E. Workflow, Recovery & Governance Layer
- `public.replacement_tasks`: Self-healing tasks created when class sessions are disrupted.
- `public.replacement_options`: System-ranked candidate makeup slots matching teacher/student availability.
- `public.replacement_polls`: Democratic student voting polls for rescheduling.
- `public.replacement_votes`: Persistent student poll votes with a database-level `UNIQUE(poll_id, student_id)` constraint.
- `public.notifications`: Push alerts and actionable notifications across roles.
- `public.audit_events`: Immutable audit trail of administrative modifications.

---

## 3. Group and Subgroup Cohort Model

The scheduling engine differentiates between whole-group sessions (Lectures) and subgroup-specific sessions (Labs and Tutorials):

```
Batch 2024 (CSE)
   │
   ├── Group: CSE-A (50 Students)
   │     ├── Subgroup A1 (25 Students) -> CS501 Lab (LT-Lab 1)
   │     └── Subgroup A2 (25 Students) -> CS501 Lab (LT-Lab 2)
   │
   ├── Group: CSE-B (50 Students)
   │     ├── Subgroup B1 (25 Students)
   │     └── Subgroup B2 (25 Students)
   ...
   └── Group: CSE-J (50 Students)
         ├── Subgroup J1 (25 Students)
         └── Subgroup J2 (25 Students)
```

In `public.course_allocations` and `public.timetable_entries`:
- **Lecture**: `section_id = 'sec-cse-a'`, `sub_section_id = NULL`
- **Subgroup Lab**: `section_id = 'sec-cse-a'`, `sub_section_id = 'sub-sec-cse-a-a1'`

---

## 4. Row Level Security (RLS) Policy Architecture

RLS is enabled on **all 24 tables** in the `public` schema.

| Table | SELECT Policy | INSERT / UPDATE / DELETE Policy |
| :--- | :--- | :--- |
| `institutions` | All authenticated users | Super Admin only |
| `profiles` | Self OR Coordinator / Admin / HOD | Self (updates) / Admin (creation) |
| `departments`, `programs`, `courses`, `rooms` | All authenticated users | Coordinator / College Admin |
| `groups`, `subgroups`, `faculty` | All authenticated users | Coordinator / College Admin |
| `course_allocations` | All authenticated users | Coordinator / College Admin |
| `timetable_versions` | Published versions visible to all; Drafts visible to Coordinators/Admins | Coordinator / College Admin |
| `timetable_entries` | Entries belonging to published versions OR Coordinator/Admin | Coordinator / College Admin |
| `replacement_votes` | Authenticated users | Students (1 vote per poll via constraint) |
| `notifications` | Recipient user OR Recipient role match | System / Coordinator |
| `audit_events` | Coordinator / Admin / HOD | System append-only |

---

## 5. Timetable Versioning & Publication Lifecycle

```
[GENERATED DRAFT] (Solver Engine / Bitset MRV)
        ↓
 [MANUAL ADJUSTMENT] (Coordinator drag-and-drop with real-time constraint validation)
        ↓
 [INDEPENDENT VALIDATION] (Independent rule verification confirms 0 hard violations)
        ↓
 [DEAN / ADMIN APPROVAL] (Dean of Academic Affairs review)
        ↓
   [PUBLISHED] (Public institutional access; triggers notifications to cohorts & faculty)
```

- When a Coordinator adjusts a published schedule, a **new draft version** is spawned.
- Students and Faculty continue viewing the last published valid version until the new version is officially approved and published.

---

## 6. Migration & Seeding Strategy

1. **Migration Script**: Stored in version control at `/supabase/migrations/20261004000000_init_supabase_schema.sql`.
2. **Deterministic Seeding**:
   - Institutional profile for Thapar Institute (`inst-thapar`).
   - Standard departments (`CSED`, `ECED`, `SMAT`, `MED`, `BTED`).
   - Degree programs (`BTECH-CSE`, `BTECH-ECE`, `BTECH-MECH`).
   - Core courses (`CS501`, `CS502`, `CS503`, `MA501`, `EC501`).
   - Full faculty directory with teaching load allocations.
   - Lecture halls, seminar halls, and computer laboratories.
   - Cohort sections (`CSE-A` through `CSE-J`) with nested subgroups.
   - Master timetable draft and published baseline matrices.
   - Demo accounts (`coordinator.demo`, `faculty.demo`, `student.demo`, `admin.demo`, `hod.demo`).
