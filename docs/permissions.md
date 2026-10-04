# Permissions & Role-Based Access Control (RBAC) Matrix

**Standard**: ROLE × ACTION × RESOURCE  
**Authoritative Source**: Server-Side User & Role Store (`server.ts`, `authData.ts`)

---

## 1. Resource & Action Matrix

| Resource | Action | Student | Class Rep (CR) | Faculty | Coordinator | Admin / Dean |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Personal Schedule** | Read | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Academic Master Setup** | Read / Write | ✗ | ✗ | ✗ | ✓ | ✓ |
| **Departments & Programs** | Create / Update / Delete | ✗ | ✗ | ✗ | ✓ | ✓ |
| **Course Allocations** | Assign / Reallocate | ✗ | ✗ | ✗ | ✓ | ✓ |
| **Faculty Workload Limits** | Configure | ✗ | ✗ | ✗ | ✓ | ✓ |
| **Timetable Generation** | Validate & Generate | ✗ | ✗ | ✗ | ✓ | ✓ |
| **Timetable Publishing** | Draft $\rightarrow$ Approved $\rightarrow$ Published | ✗ | ✗ | ✗ | Review | **Approve / Publish** |
| **Class Cancellation** | Cancel Teaching Session | ✗ | ✗ | ✓ | ✓ | ✓ |
| **Makeup Acceptance** | Accept / Decline Slot | ✗ | ✗ | ✓ | ✓ | ✓ |
| **Student Quorum Polls** | Vote | ✓ | ✓ | ✗ | ✗ | ✗ |
| **Student Quorum Polls** | Create / Moderate | ✗ | ✓ | ✗ | ✓ | ✓ |
| **Audit Logs & Governance** | Inspect | ✗ | ✗ | ✗ | ✓ | ✓ |

---

## 2. Multi-Role Workspace Resolution

When an institutional user possesses multiple authorized roles, the backend returns the authorized workspace list in the authentication response:

- **Dr. K. N. Murthy**: `['Coordinator', 'Faculty']`
- **Prof. Sunita Roy**: `['Coordinator', 'Faculty']`
- **Dr. Vikram Sengupta (Dean)**: `['Admin', 'Coordinator']`
- **Aarav Mehta**: `['Student', 'CR']`

Users can transition between their authorized workspaces via the Workspace Selector without requiring re-authentication. Direct URL manipulation cannot grant access to unauthorized workspaces.
