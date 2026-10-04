# API Conventions & REST Specifications — IntelliSchedule

**Protocol**: HTTPS  
**Content-Type**: `application/json`  
**Authentication**: Bearer Token (`Authorization: Bearer jwt_live_*`) or `HttpOnly` cookie (`intellischedule_session`)

---

## 1. Standard Endpoints

### Health & Monitoring
- `GET /api/health/live`: Lightweight liveness check confirming the HTTP process is responsive.
- `GET /api/health/ready`: Readiness check inspecting database and rate-limiter operational readiness.

### Authentication & Identity
- `POST /api/auth/login`: Authenticate with institutional email and password. Returns user object, session token, and authorized workspaces.
- `GET /api/auth/me`: Verifies active session token and returns authenticated principal context.
- `POST /api/auth/logout`: Revokes active cryptographic session and clears session cookie.
- `POST /api/auth/register`: Onboards new user with server-determined role resolution.
- `POST /api/auth/forgot-password`: Generates secure single-use 15-minute password reset token (with anti-enumeration response).
- `GET /api/auth/validate-token`: Verifies status, expiration, and single-use state of reset token.
- `POST /api/auth/reset-password`: Updates password and invalidates all active sessions for the user.

### Google OAuth 2.0
- `GET /api/auth/google/status`: Returns provider status and configuration state.
- `GET /api/auth/google/authorize`: Initiates OAuth authorization code flow with 256-bit CSRF state token.
- `GET /api/auth/google/callback`: Validates state, exchanges authorization code, verifies ID token, links user identity, and issues authenticated session.
- `GET /api/auth/google/debug`: Diagnostic inspection endpoint for redirect URIs and scopes.

---

## 2. Standard Error Format

All error responses return a standardized JSON structure with appropriate HTTP status codes:

```json
{
  "success": false,
  "message": "Clear, non-technical explanation of the failure reason.",
  "retryAfter": 60
}
```

### HTTP Status Code Guidelines
- `200 OK`: Request succeeded.
- `201 Created`: Resource created successfully.
- `400 Bad Request`: Input validation failed or required field missing.
- `401 Unauthorized`: Missing or invalid authentication token.
- `403 Forbidden`: Authenticated user lacks permission or account is locked.
- `404 Not Found`: Requested resource does not exist.
- `409 Conflict`: Unique constraint violation (e.g. email already registered).
- `429 Too Many Requests`: Rate limit threshold exceeded.
- `500 Internal Server Error`: Safe unexpected error message.
