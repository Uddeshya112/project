import type { Request, Response, NextFunction } from 'express';

export type RoleCode = 'SUPER_ADMIN' | 'COLLEGE_ADMIN' | 'COORDINATOR' | 'HOD' | 'FACULTY' | 'CLASS_REPRESENTATIVE' | 'STUDENT';

export interface AuthenticatedRequest extends Request {
  authenticatedUser?: { id:string; email:string; name:string; roleCode:RoleCode; department?:string };
}

export const STAFF_ROLES: RoleCode[] = ['SUPER_ADMIN','COLLEGE_ADMIN','COORDINATOR','HOD','FACULTY'];
export const ADMIN_OR_COORD: RoleCode[] = ['SUPER_ADMIN','COLLEGE_ADMIN','COORDINATOR'];
export const MANAGEMENT_ROLES: RoleCode[] = ['SUPER_ADMIN','COLLEGE_ADMIN','COORDINATOR','HOD'];

export function requireRole(allowedRoles: RoleCode[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user=req.authenticatedUser;
    if(!user) return res.status(401).json({success:false,message:'Authentication required.'});
    if(!allowedRoles.includes(user.roleCode)) return res.status(403).json({success:false,message:'Forbidden: Insufficient role permissions.'});
    next();
  };
}
