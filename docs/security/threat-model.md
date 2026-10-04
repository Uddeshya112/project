# Security Threat Model & Risk Analysis — IntelliSchedule

**Target Institution**: Thapar Institute of Engineering and Technology  
**Standard**: OWASP Top 10 / Application & Network Security Layer

---

## 1. Threat Matrix & Mitigations

| Threat Vector | Potential Impact | Implemented Mitigation | Verification Status |
| :--- | :--- | :--- | :--- |
| **Account Enumeration** | Attacker probes email list to identify active faculty/student accounts | Login & password reset return generic non-enumerating responses. | **VERIFIED** (Automated Test 1.3, 1.10) |
| **Credential Brute Force / DDoS** | Automated bot attempts password spraying against user endpoints | In-memory token bucket rate limiter (10 attempts/min per IP, 5 attempts/min per account). Returns HTTP 429 with `Retry-After`. | **VERIFIED** (`checkRateLimit`) |
| **OAuth CSRF & State Replay** | Attacker intercepts or replays OAuth callback requests | 256-bit cryptographic `state` generated per authorization request, stored with 10-minute expiry, and strictly deleted upon first consumption (single-use token). | **VERIFIED** (`googleOAuthStates`) |
| **Cross-Tenant / Unauthorized Workspace Access** | Student attempts to access Coordinator or Admin tools | Server-authoritative role resolution in `server.ts`. Client-side route guard renders only authorized workspaces. | **VERIFIED** (`resolveWorkspacesForUser`) |
| **Session Hijacking** | XSS steals session credentials from browser storage | Session tokens stored with `HttpOnly`, `SameSite=Lax`, `Secure` cookie flags. | **VERIFIED** (`res.cookie`) |
| **Privilege Escalation via Email Domain** | User registers with institutional email expecting elevated staff role | Email domain never implies role. Roles are resolved strictly against authoritative staff directory (`PRE_AUTHORIZED_STAFF`). | **VERIFIED** (Automated Test 1.8) |
| **Double-Booking & Resource Contention** | Room or faculty assigned to multiple classes simultaneously | Hard constraint engine (`checkHardConstraints`) rejects any simultaneous assignment. | **VERIFIED** (Automated Test 3.1, 3.2, 3.3) |

---

## 2. Security Headers

The application injects modern security headers across all HTTP responses:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
