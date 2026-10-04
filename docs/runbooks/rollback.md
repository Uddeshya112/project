# Rollback Runbook — IntelliSchedule

**Trigger Condition**: High-severity production alert (e.g. elevated 5xx error rate, auth outage, constraint engine deadlock).

---

## 1. Instant Rollback Procedure

1. **Revert Traffic to Previous Stable Revision**:
   - In Google Cloud Run / Container Registry, redirect 100% of ingress traffic to the previous healthy revision ID.
2. **Purge Client-Side Caches**:
   - If static assets were modified, invalidate CDN / edge cache tags for `index.html`.
3. **Invalidate Active Sessions (If Security Incident)**:
   - Restart the server process to clear volatile session state and force clean re-authentication.

---

## 2. Post-Rollback Diagnostics

1. Query `/api/health/live` and `/api/health/ready` on the rolled-back instance.
2. Run `npm test` against the active instance.
3. Review audit logs for unexpected modifications or exceptions.
