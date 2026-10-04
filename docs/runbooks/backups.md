# Database & Storage Backup Runbook — IntelliSchedule

**Scope**: Master Academic Configuration, Version Matrices, Audit Logs, and User Profiles.

---

## 1. Backup Schedule & Retention Policy

- **Frequency**: Automated daily full snapshots at 02:00 IST + hourly WAL / delta backups.
- **Retention**: 30 days for daily snapshots; 1 year for semester-end published timetable versions.
- **Location**: Multi-region encrypted object storage (AES-256).

---

## 2. Restoration Verification Procedure

1. Export current academic configuration JSON via the Coordinator Academic Setup Hub.
2. Verify integrity of serialized academic entities (Rooms, Faculty, Allocations, Constraints).
3. In a staging environment, load the backup snapshot and execute pre-generation validation (`validateAcademicSetup`).
4. Execute `generateTimetableFromConfiguration` to verify deterministic timetable reconstruction.
