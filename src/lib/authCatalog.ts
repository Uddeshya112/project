import type { Institution, Role, Permission, RoleCode, WorkspaceType } from '../types';

export const CURRENT_INSTITUTION: Institution = {
  id: 'inst-thapar',
  name: 'Thapar Institute of Engineering and Technology',
  code: 'TIET',
  domain: 'thapar.edu',
  status: 'ACTIVE',
  location: 'Patiala, Punjab, India',
  establishedYear: 1956,
};

export const ROLES: Role[] = [
  { id: 'role-superadmin', code: 'SUPER_ADMIN', name: 'Super Admin', description: 'System administration' },
  { id: 'role-admin', code: 'COLLEGE_ADMIN', name: 'College Admin / Dean', description: 'Institution administration' },
  { id: 'role-coordinator', code: 'COORDINATOR', name: 'Timetable Coordinator', description: 'Timetable operations' },
  { id: 'role-hod', code: 'HOD', name: 'Head of Department', description: 'Department operations' },
  { id: 'role-faculty', code: 'FACULTY', name: 'Faculty Member', description: 'Faculty operations' },
  { id: 'role-cr', code: 'CLASS_REPRESENTATIVE', name: 'Class Representative', description: 'Class representative operations' },
  { id: 'role-student', code: 'STUDENT', name: 'Student', description: 'Student operations' },
];

export const ROLE_WORKSPACES: Record<RoleCode, WorkspaceType[]> = {
  SUPER_ADMIN: ['Admin', 'Coordinator'],
  COLLEGE_ADMIN: ['Admin', 'Coordinator'],
  COORDINATOR: ['Coordinator', 'Faculty'],
  HOD: ['Coordinator', 'Faculty'],
  FACULTY: ['Faculty'],
  CLASS_REPRESENTATIVE: ['Student', 'CR'],
  STUDENT: ['Student'],
};

export const PERMISSIONS: Permission[] = [
  { id: 'perm-tt-view', code: 'timetable.view', name: 'View Timetables', module: 'TIMETABLE', description: 'Read timetable data' },
  { id: 'perm-tt-create', code: 'timetable.create', name: 'Generate Timetables', module: 'TIMETABLE', description: 'Generate timetable drafts' },
  { id: 'perm-tt-edit', code: 'timetable.edit', name: 'Edit Timetables', module: 'TIMETABLE', description: 'Edit draft sessions' },
  { id: 'perm-tt-publish', code: 'timetable.publish', name: 'Publish Master Version', module: 'TIMETABLE', description: 'Publish the master timetable' },
  { id: 'perm-tt-lock', code: 'timetable.lock', name: 'Lock & Pin Sessions', module: 'TIMETABLE', description: 'Lock timetable sessions' },
  { id: 'perm-rec-view', code: 'recovery.view', name: 'View Recovery Queue', module: 'RECOVERY', description: 'View recovery operations' },
  { id: 'perm-rec-schedule', code: 'recovery.schedule', name: 'Schedule Makeups', module: 'RECOVERY', description: 'Schedule makeups' },
  { id: 'perm-rec-auto', code: 'recovery.automatch', name: 'Batch Auto-Match', module: 'RECOVERY', description: 'Run recovery matching' },
  { id: 'perm-appr-manage', code: 'approval.manage', name: 'Manage Approvals', module: 'POLICY', description: 'Manage approval workflow' },
  { id: 'perm-whatif-sim', code: 'whatif.simulate', name: 'Run What-If Simulation', module: 'POLICY', description: 'Run simulations' },
  { id: 'perm-whatif-apply', code: 'whatif.apply', name: 'Apply Simulation', module: 'POLICY', description: 'Apply simulations' },
  { id: 'perm-avail-manage', code: 'availability.manage', name: 'Manage Protected Time', module: 'FACULTY', description: 'Manage faculty protected time' },
  { id: 'perm-market-claim', code: 'marketplace.claim', name: 'Claim Free Slots', module: 'FACULTY', description: 'Claim open slots' },
  { id: 'perm-cancel', code: 'cancellation.trigger', name: 'Cancel Own Class', module: 'FACULTY', description: 'Cancel own class' },
  { id: 'perm-poll-vote', code: 'poll.vote', name: 'Vote in Class Polls', module: 'STUDENT', description: 'Vote in polls' },
  { id: 'perm-demand', code: 'demand.request', name: 'Launch CR Makeup Demand', module: 'STUDENT', description: 'Request makeups' },
  { id: 'perm-auth', code: 'auth.manage', name: 'User & Membership Governance', module: 'AUTH', description: 'Manage users' },
  { id: 'perm-audit', code: 'audit.view', name: 'View Audit Logs', module: 'AUDIT', description: 'View audit records' },
];

export const ROLE_PERMISSIONS_MAP: Record<RoleCode, string[]> = {
  SUPER_ADMIN: PERMISSIONS.map((p) => p.code),
  COLLEGE_ADMIN: PERMISSIONS.map((p) => p.code),
  COORDINATOR: ['timetable.view','timetable.create','timetable.edit','timetable.lock','recovery.view','recovery.schedule','recovery.automatch','approval.manage','whatif.simulate','whatif.apply','audit.view'],
  HOD: ['timetable.view','recovery.view','approval.manage','availability.manage','audit.view'],
  FACULTY: ['timetable.view','availability.manage','marketplace.claim','cancellation.trigger','recovery.view'],
  CLASS_REPRESENTATIVE: ['timetable.view','poll.vote','demand.request'],
  STUDENT: ['timetable.view','poll.vote'],
};

export const ROLE_NAMES = Object.fromEntries(ROLES.map((role) => [role.code, role.name])) as Record<RoleCode, string>;
