# Deployment Runbook — IntelliSchedule

**Deployment Target**: Google Cloud Run / Node.js 22 LTS  
**Port**: `3000` (Mapped via `process.env.PORT`)

---

## 1. Pre-Deployment Verification Checklist

Before triggering a production deployment, ensure all quality gates are satisfied:

1. `npm run lint`: Zero TypeScript type errors.
2. `npm test`: All 22 automated E2E, authentication, security, and constraint tests pass.
3. `npm run build`: Production assets build successfully into `dist/`.
4. Environment variables verified in `.env.example`.

---

## 2. Production Deployment Steps

1. **Build Container / Artifact**:
   ```bash
   npm run build
   ```
2. **Start Production Server**:
   ```bash
   NODE_ENV=production node server.ts
   ```
3. **Verify Liveness and Readiness**:
   ```bash
   curl -f http://localhost:3000/api/health/live
   curl -f http://localhost:3000/api/health/ready
   ```
4. **Smoke Test Login Endpoint**:
   ```bash
   curl -s -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"kn.murthy@thapar.edu","password":"Thapar2026!"}'
   ```
