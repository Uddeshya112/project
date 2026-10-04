# System Architecture — IntelliSchedule

**Architecture Style**: Clean Modular Monolith with Server-Authoritative State & Deterministic Constraint Solvers  
**Runtime Environment**: Node.js 22 LTS / Express 5 Full-Stack SPA with Vite Middlewares & React 19

---

## 1. High-Level Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER (BROWSER)                        │
│  React 19 + TypeScript + Tailwind CSS 4 + Lucide Icons                 │
│  ├─ AuthContext (Session state, Multi-Workspace routing)              │
│  ├─ TimetableContext (Academic state, Validation state, Undo/Redo)     │
│  └─ Role-Based Views (Student, CR, Faculty, Coordinator, Admin)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS (JSON API / Bearer Token)
┌───────────────────────────────────▼────────────────────────────────────┐
│                       APPLICATION BACKEND (EXPRESS 5)                  │
│  server.ts                                                             │
│  ├─ Security Headers & CORS Middleware (nosniff, SAMEORIGIN, etc.)     │
│  ├─ Multi-Layer Rate Limiting (IP & Account level)                     │
│  ├─ REST Authentication Service (/api/auth/*)                          │
│  │    ├─ Salted SHA-256 password hashing                               │
│  │    ├─ Anti-enumeration generic error responses                      │
│  │    └─ Google OAuth 2.0 PKCE / State flow (/api/auth/google/*)       │
│  ├─ Health Checks (/api/health/live, /api/health/ready)                │
│  └─ Vite SPA Static Middleware                                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    DOMAIN ENGINES & SOLVERS (SRC/LIB)                  │
│  ├─ timetableGenerator.ts: Pre-generation validator & Draft scheduler  │
│  ├─ recoveryEngine.ts: Self-healing cross-cancellation match solver    │
│  └─ initialData.ts & authData.ts: Institutional seed models & schemas  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Key Service Boundaries & Responsibilities

1. **Authentication & Session Manager (`server.ts`, `AuthContext.tsx`)**:
   - Manages user credentials, password resets, and session lifecycles.
   - Enforces server-side role resolution (roles are never inferred from email domains or client payloads).
   - Issues cryptographic session tokens (`jwt_live_*`) stored in `sessionsDatabase`.

2. **Master Academic Data Manager (`TimetableContext.tsx`)**:
   - Implements atomic CRUD operations for Academic Years, Semesters, Working Days, Time Slots, Departments, Programs, Courses, Faculty, Rooms, Labs, Sections, Subsections, and Allocations.

3. **Validation & Constraint Solver (`timetableGenerator.ts`)**:
   - Executes pre-generation verification across hard and soft constraints.
   - Computes feasibility matrices to guarantee zero faculty double-booking, zero room double-booking, and zero student section cohort conflicts.

4. **Dynamic Recovery & Self-Healing Engine (`recoveryEngine.ts`)**:
   - Cross-cancellation matching algorithm finding optimal recovery slots when classes are cancelled.
   - Computes weighted suitability score (Teacher availability, Student availability, Room suitability, Syllabus urgency, Preference score, Schedule stability).
