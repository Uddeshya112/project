# Architecture Decision Record (ADR) 0001: Modular Monolith Architecture & Constraint-Satisfaction Engine

**Status**: Accepted  
**Date**: 2026-10-02  
**Deciders**: Principal Engineering Agent, System Architect  
**Context**: IntelliSchedule University Operations Platform

---

## Context & Problem Statement

University academic scheduling requires managing tightly coupled relational constraints (Faculty availability, Room capacity, Lab equipment, Student cohorts, UGC teaching limits) alongside real-time operational self-healing when unexpected cancellations occur. We needed an architecture that guarantees data consistency, zero-delay feedback during manual grid adjustments, and high security without distributed transaction overhead.

---

## Decision

We chose a **Modular Monolith** architecture:
1. **Single Express 5 Full-Stack Service**: Collocates REST authentication, health monitoring, and Vite SPA static asset delivery.
2. **Deterministic Constraint-Satisfaction Engine**: Client-side / server-side solver executing combinatorial allocation mapping with zero room, faculty, or section double-booking.
3. **Server-Authoritative RBAC**: Roles resolved exclusively from backend user records and pre-authorized directories.

---

## Consequences & Trade-offs

- **Positive**:
  - Instantaneous constraint validation without network latency during timetable drag-and-drop or slot editing.
  - Simplified operational deployment (single container, low memory footprint).
  - High observability and unified logging.
- **Negative**:
  - Requires horizontal scaling of the entire monolith if request volume increases significantly (mitigated by stateless session token design).
