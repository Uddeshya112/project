import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDb, type Db } from './src/server/db';
import { createAuth, type RoleCode, type UserRow } from './src/server/auth';
import { supabaseStore } from './src/server/supabaseStore';
import { timetableJobManager } from './src/server/jobManager';
import { executeOptimizationEngine } from './src/lib/optimizationEngine';
import { INITIAL_ACADEMIC_YEAR, INITIAL_ALLOCATIONS, FACULTY_MEMBERS, ROOMS, SECTIONS, COURSES, INITIAL_CONSTRAINTS } from './src/lib/initialData';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'https://tiet-timetable-six.vercel.app,http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173')
    .split(',').map(origin => origin.trim()).filter(Boolean)
);
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => callback(null, origin === undefined || allowedOrigins.has(origin)),
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Accept','X-Requested-With','X-CSRF-Token'],
};

app.use(cookieParser());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use('/api', (_req: Request, res: Response, next: NextFunction) => { res.setHeader('Cache-Control', 'no-store'); next(); });

type LegacyAuthenticatedUser = { id:string; email:string; name:string; roleCode:RoleCode; roleName:string; department:string; isDemoUser:boolean; profile:Record<string, unknown> };
export interface AuthenticatedRequest extends Request { authenticatedUser?: LegacyAuthenticatedUser; }

let db: Db | null = null;
let authService: ReturnType<typeof createAuth> | null = null;
let authInitError: Error | null = null;
const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_CONNECTION_STRING || (process.env.NODE_ENV === 'test' ? 'pglite:memory' : '');

function mapAuthUser(user: UserRow): LegacyAuthenticatedUser {
  return { id:user.id, email:user.email, name:user.name, roleCode:user.role_code, roleName:user.role_code, department:user.department, isDemoUser:user.is_demo, profile:user.profile ?? {} };
}

app.use((req: Request, res: Response, next: NextFunction) => {
  if (['GET','HEAD','OPTIONS'].includes(req.method) || process.env.NODE_ENV === 'test') return next();
  const exempt = new Set(['/api/auth/login','/api/auth/register','/api/auth/csrf','/api/auth/forgot-password','/api/auth/reset-password','/api/auth/google/start','/api/auth/google/callback','/api/auth/logout','/api/health/live','/api/health/ready']);
  if (exempt.has(req.path)) return next();
  const cookieToken = String(req.cookies?.tt_csrf || '');
  const headerToken = String(req.get('X-CSRF-Token') || '');
  if (!cookieToken || !headerToken || cookieToken.length !== headerToken.length || !crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) return res.status(403).json({ success:false, error:'CSRF_REJECTED', message:'CSRF validation failed.' });
  next();
});

async function loadAuthenticatedUser(req: Request, res: Response): Promise<UserRow | null> {
  if (!authService) return null;
  return new Promise(resolve => { authService!.loadUser(req, res, () => resolve(req.user ?? null)); });
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!authService || !db) return res.status(503).json({ success:false, error:'AUTH_NOT_READY', message:'Authentication service is still starting.' });
  const user = req.user ?? await loadAuthenticatedUser(req, res);
  if (!user) return res.status(401).json({ success:false, error:'UNAUTHENTICATED', message:'Authentication token is missing, invalid, or expired.' });
  req.authenticatedUser = mapAuthUser(user);
  next();
}

export function requireRole(allowedRoles: RoleCode[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.authenticatedUser) return res.status(401).json({ success:false, error:'UNAUTHENTICATED', message:'Authentication required.' });
    if (!allowedRoles.includes(req.authenticatedUser.roleCode)) return res.status(403).json({ success:false, error:'FORBIDDEN', message:'Insufficient role permissions.' });
    next();
  };
}

function findStudentByEmail(email: string) {
  return supabaseStore.queryStudents(1, 1, email, '').students?.[0] ?? null;
}

function mapRoleCodeToDashboard(roleCode: RoleCode): 'Admin' | 'Coordinator' | 'HOD' | 'Faculty' | 'Student' {
  switch (roleCode) {
    case 'SUPER_ADMIN':
    case 'COLLEGE_ADMIN': return 'Admin';
    case 'COORDINATOR': return 'Coordinator';
    case 'HOD': return 'HOD';
    case 'FACULTY': return 'Faculty';
    default: return 'Student';
  }
}

app.get('/api/health/live', (_req: Request, res: Response) => res.status(200).json({ status:'LIVE', service:'intellischedule-core' }));
app.get('/api/health/ready', (_req: Request, res: Response) => {
  if (!authService || !db) return res.status(503).json({ status:'NOT_READY', message:authInitError?.message || 'Database/authentication subsystem is not ready.' });
  return res.status(200).json({ status:'READY', service:'intellischedule-core' });
});
if (process.env.NODE_ENV === 'test') app.post('/api/test/reset-rate-limits', async (_req,res) => { await db?.query('delete from intellischedule.rate_limits'); return res.json({success:true}); });

app.get('/api/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user=req.authenticatedUser!;
  const student=(user.roleCode==='STUDENT'||user.roleCode==='CLASS_REPRESENTATIVE')?findStudentByEmail(user.email):null;
  const faculty=(user.roleCode==='FACULTY'||user.roleCode==='COORDINATOR'||user.roleCode==='HOD')?(supabaseStore.getBootstrapState().facultyMembers||[]).find((f:any)=>String(f.email||'').toLowerCase()===user.email.toLowerCase()):null;
  return res.json({success:true,user:{id:user.id,name:user.name,email:user.email,department:user.department,roleCode:user.roleCode,roleName:user.roleName,program:student?.programCode??null,semester:student?.semester??null,section:student?.sectionName??student?.sectionId??null,rollNumber:student?.studentId??null,employeeId:faculty?.employeeId??null,designation:faculty?.designation??null}});
});

app.get('/api/me/timetable', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const user=req.authenticatedUser!;
  const state=supabaseStore.getBootstrapState();
  let sessions:any[]=[]; let sectionId:string|null=null; let subSectionId:string|null=null;
  if(user.roleCode==='STUDENT'||user.roleCode==='CLASS_REPRESENTATIVE'){
    const student=findStudentByEmail(user.email); sectionId=student?.sectionId??null; subSectionId=student?.subSectionId??null;
    if(sectionId) sessions=(state.sessions||[]).filter((s:any)=>s.sectionId===sectionId && (!s.subSectionId || s.subSectionId===subSectionId));
  }else{ const faculty=(state.facultyMembers||[]).find((f:any)=>String(f.email||'').toLowerCase()===user.email.toLowerCase()); if(faculty) sessions=(state.sessions||[]).filter((s:any)=>s.facultyId===faculty.id); }
  const days=new Map((state.academicYear?.workingDays||[]).map((d:any,i:number)=>[d,i]));
  const slots=new Map((state.academicYear?.timeSlots||[]).map((s:any)=>[s.id,s.periodNumber]));
  sessions.sort((a,b)=>(days.get(a.day)??999)-(days.get(b.day)??999)||(slots.get(a.timeSlotId)??999)-(slots.get(b.timeSlotId)??999));
  const schedule=sessions.slice(0,500).map((s:any)=>{ const course=(state.courses||[]).find((x:any)=>x.id===s.courseId); const room=(state.rooms||[]).find((x:any)=>x.id===s.roomId); const fac=(state.facultyMembers||[]).find((x:any)=>x.id===s.facultyId); return {id:s.id,day:s.day,timeSlot:s.timeSlotId,courseCode:course?.code??s.courseId,courseName:course?.name??s.courseId,room:room?.name??s.roomId,faculty:fac?.name??s.facultyId,type:s.type,status:s.status??'Confirmed',subSectionId:s.subSectionId??null}; });
  return res.json({success:true,user:{id:user.id,name:user.name,roleCode:user.roleCode,sectionId,subSectionId},schedule});
});

function sanitizeAcademicState(state:any,roleCode?:string){
  if(roleCode!=='STUDENT'&&roleCode!=='CLASS_REPRESENTATIVE') return state;
  return {...state,facultyMembers:(state.facultyMembers||[]).map((f:any)=>({id:f.id,name:f.name,departmentId:f.departmentId,designation:f.designation,subjectsQualified:f.subjectsQualified,status:f.status})),students:undefined,auditLogs:[]};
}

async function initializeRuntime(){
  try {
    if(!databaseUrl){ if(process.env.NODE_ENV==='production') throw new Error('DATABASE_URL is required in production.'); throw new Error('DATABASE_URL is required. Use DATABASE_URL=pglite:memory for local tests/development.'); }
    db=await connectDb(databaseUrl);
    authService=createAuth({db,demoMode:false,googleClientId:process.env.GOOGLE_CLIENT_ID,googleClientSecret:process.env.GOOGLE_CLIENT_SECRET,googleRedirectUri:process.env.GOOGLE_REDIRECT_URI,appUrl:process.env.APP_URL,allowedDomains:(process.env.ALLOWED_EMAIL_DOMAINS||'thapar.edu').split(',').map(v=>v.trim().toLowerCase().replace(/^@/,'')).filter(Boolean),sessionTtlHours:Number(process.env.SESSION_TTL_HOURS)||24,bcryptRounds:Number(process.env.BCRYPT_ROUNDS)||12,rosterLookup:(email:string)=>{ const state=supabaseStore.getBootstrapState(); const faculty=(state.facultyMembers||[]).find((f:any)=>String(f.email||'').toLowerCase()===email); if(faculty)return {roleCode:'FACULTY',name:faculty.name,department:faculty.departmentId||'',profile:{facultyId:faculty.id}}; const student=findStudentByEmail(email); if(student)return {roleCode:'STUDENT',name:student.name,department:student.programCode||'',profile:{rollNumber:student.studentId,sectionId:student.sectionId,subSectionId:student.subSectionId}}; return null; }});
    await authService.seedUsers();
    timetableJobManager.init(db);
    await timetableJobManager.recover();
    app.use((req:Request,res:Response,next:NextFunction)=>authService!.loadUser(req,res,next));
    app.use(authService.router);
  } catch(err){ authInitError=err instanceof Error?err:new Error(String(err)); console.error('[STARTUP] Runtime initialization failed:',authInitError.message); }
  if(process.env.NODE_ENV==='production'||process.env.RENDER){
    app.use(express.static(path.join(__dirname,'dist')));
    app.get('*',(_req,res,next)=>_req.path.startsWith('/api/')?next():res.sendFile(path.join(__dirname,'dist','index.html')));
  }else{ try{ const {createServer}=await import('vite'); const vite=await createServer({server:{middlewareMode:true},appType:'spa'}); app.use(vite.middlewares); }catch{ app.use(express.static(path.join(__dirname,'dist'))); } }
}

if(!process.env.VERCEL){ const effectivePort=Number(process.env.PORT)||3000; app.listen(effectivePort,'0.0.0.0',()=>console.log('[STARTUP] HTTP SERVER LISTENING',{port:effectivePort})); initializeRuntime().catch(err=>console.error('[SETUP APP ERROR]',err)); } else initializeRuntime().catch(err=>console.error('[SETUP APP ERROR]',err));

export default app;
// PROTECTED ACADEMIC & TIMETABLE APIS WITH SERVER-SIDE RBAC
// -------------------------------------------------------------

// -------------------------------------------------------------
// SUPABASE-BACKED MASTER ACADEMIC & TIMETABLE API ENDPOINTS
// -------------------------------------------------------------

function sanitizeAcademicState(state: any, roleCode?: string) {
  if (roleCode !== 'STUDENT' && roleCode !== 'CLASS_REPRESENTATIVE') return state;
  return {
    ...state,
    facultyMembers: (state.facultyMembers || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      departmentId: f.departmentId,
      designation: f.designation,
      subjectsQualified: f.subjectsQualified,
      status: f.status,
    })),
  };
}

// Master Bootstrap State (Database-backed read for complete academic workspace)
app.get('/api/academic/bootstrap', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  const sanitized = sanitizeAcademicState(state, req.authenticatedUser?.roleCode);
  return res.json({
    success: true,
    ...sanitized,
    timestamp: new Date().toISOString(),
  });
});

// Paginated Students Query Endpoint
app.get('/api/students', requireAuth, requireRole(['SUPER_ADMIN', 'COLLEGE_ADMIN', 'COORDINATOR', 'HOD']), (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const search = (req.query.search as string) || '';
  const sectionId = (req.query.sectionId as string) || '';

  const result = supabaseStore.queryStudents(page, limit, search, sectionId);
  return res.json({
    success: true,
    ...result,
  });
});

// 1. Departments CRUD
app.get('/api/academic/departments', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, departments: state.departments });
});

app.post('/api/academic/departments', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { name, code, hodName, contactEmail, status } = req.body;
  if (!name || !code) {
    return res.status(400).json({ success: false, message: 'Department name and code are required.' });
  }
  try {
    const dept = supabaseStore.createDepartment(
      {
        name: String(name).trim(),
        code: String(code).trim().toUpperCase(),
        hodName: hodName || 'Head of Department',
        contactEmail: contactEmail || `hod.${String(code).toLowerCase()}@thapar.edu`,
        status: status || 'Active',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({ success: true, message: `Department '${dept.name}' created.`, department: dept });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/departments/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const deptId = req.params.id as string;
    const dept = supabaseStore.updateDepartment(deptId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, department: dept });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/departments/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const deptId = req.params.id as string;
    supabaseStore.deleteDepartment(deptId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Department deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 2. Programs CRUD
app.get('/api/academic/programs', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, programs: state.programs });
});

app.post('/api/academic/programs', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { name, code, departmentId, durationYears, totalSemesters, status } = req.body;
  if (!name || !code) {
    return res.status(400).json({ success: false, message: 'Program name and code are required.' });
  }
  try {
    const prog = supabaseStore.createProgram(
      {
        name: String(name).trim(),
        code: String(code).trim().toUpperCase(),
        departmentId: departmentId || 'dept-cse',
        durationYears: Number(durationYears) || 4,
        totalSemesters: Number(totalSemesters) || 8,
        status: status || 'Active',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({ success: true, message: `Program '${prog.name}' created.`, program: prog });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/programs/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const progId = req.params.id as string;
    const prog = supabaseStore.updateProgram(progId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, program: prog });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/programs/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const progId = req.params.id as string;
    supabaseStore.deleteProgram(progId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Program deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 3. Courses CRUD
app.get('/api/academic/courses', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, courses: state.courses });
});

app.post('/api/academic/courses', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const {
    code,
    name,
    title,
    credits,
    departmentId,
    requiredLecturesPerWeek,
    requiredTutorialsPerWeek,
    requiredLabsPerWeek,
    requiresLab,
    requiredEquipment,
    primaryFacultyId,
  } = req.body;
  const courseCode = String(code || '').trim().toUpperCase();
  const courseName = String(name || title || '').trim();

  if (!courseCode || !courseName) {
    return res.status(400).json({ success: false, message: 'Course code and course title are required.' });
  }

  try {
    const course = supabaseStore.createCourse(
      {
        code: courseCode,
        name: courseName,
        departmentId: departmentId || 'dept-cse',
        credits: Number(credits) || 4,
        requiredLecturesPerWeek: Number(requiredLecturesPerWeek) || 3,
        requiredTutorialsPerWeek: Number(requiredTutorialsPerWeek) || 0,
        requiredLabsPerWeek: Number(requiredLabsPerWeek) || 0,
        totalSemesterHours: 45,
        completedHours: 0,
        cancelledHours: 0,
        requiresLab: Boolean(requiresLab || (Number(requiredLabsPerWeek) || 0) > 0),
        requiredEquipment: Array.isArray(requiredEquipment) ? requiredEquipment : ['Projector'],
        primaryFacultyId: primaryFacultyId || 'fac-sharma',
        status: 'Active',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({
      success: true,
      message: `Course '${course.code} - ${course.name}' added to curriculum catalog.`,
      courseId: course.id,
      course,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/courses/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const courseId = req.params.id as string;
    const course = supabaseStore.updateCourse(courseId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, course });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/courses/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const courseId = req.params.id as string;
    supabaseStore.deleteCourse(courseId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Course deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 4. Faculty CRUD
app.get('/api/academic/faculty', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, facultyMembers: state.facultyMembers });
});

app.post('/api/academic/faculty', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { name, email, departmentId, designation, subjectsQualified, maxDirectTeachingHours, preferences } = req.body;
  if (!name || !email) {
    return res.status(400).json({ success: false, message: 'Faculty name and institutional email are required.' });
  }
  try {
    const faculty = supabaseStore.createFaculty(
      {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        departmentId: departmentId || 'dept-cse',
        designation: designation || 'Assistant Professor',
        subjectsQualified: Array.isArray(subjectsQualified) ? subjectsQualified : ['CS501'],
        maxDirectTeachingHours: Number(maxDirectTeachingHours) || 14,
        weeklyHoursLimit: 40,
        preferences: preferences || {
          preferredDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          preferredPeriods: [1, 2, 3, 4],
          protectedSlots: [],
          maxConsecutivePeriods: 2,
          availableForMakeup: true,
          availableForTutorial: true,
        },
        status: 'Active',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({ success: true, message: `Faculty '${faculty.name}' registered.`, faculty });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/faculty/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const facultyId = req.params.id as string;
    const faculty = supabaseStore.updateFaculty(facultyId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, faculty });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/faculty/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const facultyId = req.params.id as string;
    supabaseStore.deleteFaculty(facultyId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Faculty removed successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 5. Rooms CRUD
app.get('/api/academic/rooms', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, rooms: state.rooms });
});

app.post('/api/academic/rooms', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { name, capacity, building, floor, type, equipment } = req.body;
  if (!name || !capacity) {
    return res.status(400).json({ success: false, message: 'Room name and capacity are required.' });
  }
  try {
    const room = supabaseStore.createRoom(
      {
        name: String(name).trim(),
        building: building || 'Turing Block',
        floor: Number(floor) || 1,
        capacity: Number(capacity),
        type: type || 'LectureHall',
        equipment: Array.isArray(equipment) ? equipment : ['Projector', 'Whiteboard'],
        isAvailable: true,
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({
      success: true,
      message: `Room '${room.name}' registered with capacity ${room.capacity}.`,
      roomId: room.id,
      room,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/rooms/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const roomId = req.params.id as string;
    const room = supabaseStore.updateRoom(roomId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, room });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/rooms/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const roomId = req.params.id as string;
    supabaseStore.deleteRoom(roomId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Room deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 6. Groups & Subgroups (Cohorts) CRUD
app.get('/api/academic/groups', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, sections: state.sections });
});

app.post('/api/academic/groups', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { name, departmentId, program, semester, batchYear, studentCount, targetSize, maxSize, classRepresentative, subSections } = req.body;
  if (!name || !studentCount) {
    return res.status(400).json({ success: false, message: 'Group name and student count are required.' });
  }
  try {
    const group = supabaseStore.createGroup(
      {
        name: String(name).trim(),
        departmentId: departmentId || 'dept-cse',
        program: program || 'B.Tech Computer Science & Engineering',
        semester: Number(semester) || 5,
        batchYear: Number(batchYear) || 2024,
        studentCount: Number(studentCount),
        targetSize: Number(targetSize) || Number(studentCount),
        maxSize: Number(maxSize) || Math.ceil(Number(studentCount) * 1.2),
        subSections: Array.isArray(subSections) ? subSections : undefined,
        classRepresentative: classRepresentative || {
          name: 'Section Representative',
          email: `cr.${String(name).toLowerCase()}@thapar.edu`,
          studentId: '102303001',
        },
        status: 'Active',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({ success: true, message: `Cohort '${group.name}' registered.`, section: group });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/groups/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    const group = supabaseStore.updateGroup(groupId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, section: group });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/groups/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupId = req.params.id as string;
    supabaseStore.deleteGroup(groupId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Cohort removed successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// Bulk Cohort Generation
app.post('/api/academic/groups/bulk', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { programName, batchYear, totalStudents, numGroups, namingPattern, numSubgroupsPerGroup, departmentId } = req.body;
  if (!totalStudents || !numGroups) {
    return res.status(400).json({ success: false, message: 'Total students and number of groups are required.' });
  }
  try {
    const groups = supabaseStore.bulkGenerateGroups(
      {
        programName: programName || 'B.Tech Computer Science & Engineering',
        batchYear: Number(batchYear) || 2024,
        totalStudents: Number(totalStudents),
        numGroups: Number(numGroups),
        namingPattern: namingPattern || 'CSE-{A}',
        numSubgroupsPerGroup: Number(numSubgroupsPerGroup) || 2,
        departmentId,
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({ success: true, message: `Generated ${groups.length} cohorts with subgroups.`, sections: groups });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// Subgroup Add & Delete
app.post('/api/academic/subgroups', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { groupId, name, studentCount, type } = req.body;
  if (!groupId || !name) {
    return res.status(400).json({ success: false, message: 'Group ID and subgroup name are required.' });
  }
  try {
    const sub = supabaseStore.addSubgroup(groupId, name, Number(studentCount) || undefined, type || 'Lab', req.authenticatedUser?.name);
    return res.status(201).json({ success: true, subgroup: sub });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/subgroups/:groupId/:subgroupId', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const groupId = req.params.groupId as string;
    const subgroupId = req.params.subgroupId as string;
    supabaseStore.deleteSubgroup(groupId, subgroupId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Subgroup removed successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 7. Course Allocations CRUD
app.get('/api/academic/allocations', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, allocations: state.allocations });
});

app.post('/api/academic/allocations', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { courseId, facultyId, sectionId, subSectionId, sessionType, hoursPerWeek, preferredRoomId } = req.body;
  if (!courseId || !facultyId || !sectionId) {
    return res.status(400).json({ success: false, message: 'Course ID, Faculty ID, and Section ID are required.' });
  }
  try {
    const alloc = supabaseStore.createAllocation(
      {
        courseId,
        facultyId,
        sectionId,
        subSectionId,
        sessionType: sessionType || 'Lecture',
        hoursPerWeek: Number(hoursPerWeek) || 3,
        preferredRoomId,
        status: 'Allocated',
      },
      req.authenticatedUser?.name
    );
    return res.status(201).json({
      success: true,
      message: 'Course-Faculty allocation created successfully.',
      allocationId: alloc.id,
      allocation: alloc,
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.put('/api/academic/allocations/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const allocId = req.params.id as string;
    const alloc = supabaseStore.updateAllocation(allocId, req.body, req.authenticatedUser?.name);
    return res.json({ success: true, allocation: alloc });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

app.delete('/api/academic/allocations/:id', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const allocId = req.params.id as string;
    supabaseStore.deleteAllocation(allocId, req.authenticatedUser?.name);
    return res.json({ success: true, message: 'Allocation deleted successfully.' });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// 8. Transactional Master Excel Import
app.post('/api/academic/import', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { parsedData, mode = 'upsert' } = req.body;
  if (!parsedData) {
    return res.status(400).json({ success: false, message: 'Parsed workbook payload is required.' });
  }
  try {
    const result = supabaseStore.commitMasterExcelImport(parsedData, mode, req.authenticatedUser?.name);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `Database import error: ${err.message}` });
  }
});

// -------------------------------------------------------------
// TIMETABLE SCHEDULING, SOLVER & VERSIONING APIS
// -------------------------------------------------------------

// Timetable Generation (Server-Side Solver + Independent Validator + Supabase Persistence)
const handleGenerateTimetable = async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const { budgetMode = 'BALANCED', timeBudgetMs = 800, routines, async: isAsync } = body;

  if (isAsync) {
    const state = supabaseStore.getAcademicState();

    const jobId = await timetableJobManager.createJob(
      state.academicYear,
      state.allocations,
      state.facultyMembers,
      state.rooms,
      state.sections,
      state.courses,
      state.constraints,
      { budgetMode, timeBudgetMs: Number(timeBudgetMs) },
      req.authenticatedUser?.id
    );

    return res.status(202).json({
      jobId,
      status: 'PENDING',
      message: 'Timetable generation job initiated in background.',
    });
  }

  const result = supabaseStore.generateDualRoutines(
    {
      budgetMode,
      timeBudgetMs: Number(timeBudgetMs),
      routines: Array.isArray(routines) ? routines : undefined,
    },
    req.authenticatedUser?.name
  );

  const jobId = `job_sync_${crypto.randomUUID()}`;

  return res.json({
    jobId,
    ...result,
    generatedBy: req.authenticatedUser?.name,
  });
};

app.post('/api/academic/generate', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);
app.post('/api/timetable/generate', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);
app.post('/api/timetables/generate', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);
app.post('/api/timetable/generate-engine', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), handleGenerateTimetable);

// Job API Endpoints
app.post('/api/timetable/jobs', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body || {};
  const { budgetMode = 'BALANCED', timeBudgetMs = 800, optimizationProfile = 'BALANCED', seed } = body;

  const state = supabaseStore.getAcademicState();

  const jobId = await timetableJobManager.createJob(
    state.academicYear,
    state.allocations,
    state.facultyMembers,
    state.rooms,
    state.sections,
    state.courses,
    state.constraints,
    { budgetMode, timeBudgetMs: Number(timeBudgetMs), optimizationProfile, seed },
    req.authenticatedUser?.id
  );

  return res.status(202).json({
    jobId,
    status: 'PENDING',
    progress: 0,
    message: 'Generation job enqueued successfully.',
  });
});

app.get('/api/timetable/jobs/:id', requireAuth, async (req: Request, res: Response) => {
  const jobId = req.params.id as string;
  const job = await timetableJobManager.getJob(jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: `Job ${jobId} not found.` });
  }
  return res.json(job);
});

app.post('/api/timetable/jobs/:id/cancel', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), async (req: Request, res: Response) => {
  const jobId = req.params.id as string;
  const success = await timetableJobManager.cancelJob(jobId);
  if (!success) {
    return res.status(400).json({ success: false, message: `Job ${jobId} could not be cancelled or has already completed.` });
  }
  return res.json({ success: true, message: `Job ${jobId} has been cancelled.` });
});

// Select Routine Version as Active Draft
app.post('/api/timetable/select-routine', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { versionNumber } = req.body;
  if (!versionNumber) {
    return res.status(400).json({ success: false, message: 'Version number is required.' });
  }

  const result = supabaseStore.selectRoutineVersion(Number(versionNumber), req.authenticatedUser?.name);
  if (!result.success) {
    return res.status(400).json({ success: false, message: result.message });
  }

  return res.json({
    success: true,
    message: result.message,
    version: result.version,
  });
});

// Controlled Manual Move with Independent Validation
app.post('/api/timetable/move', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { sessionId, targetDay, targetTimeSlotId, targetRoomId, reason } = req.body;
  if (!sessionId || !targetDay || !targetTimeSlotId || !targetRoomId) {
    return res.status(400).json({ success: false, message: 'Session ID, target day, time slot, and room ID are required.' });
  }

  const result = supabaseStore.moveSessionWithValidation(
    sessionId,
    targetDay,
    targetTimeSlotId,
    targetRoomId,
    reason || 'Manual Coordinator Adjustment',
    req.authenticatedUser?.name
  );

  if (!result.success) {
    return res.status(422).json({ success: false, error: result.error, message: result.error });
  }

  return res.json({
    success: true,
    message: 'Session moved successfully and draft version saved.',
    version: result.updatedVersion,
  });
});

// Controlled Manual Swap with Independent Validation
app.post('/api/timetable/swap', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { sessionAId, sessionBId, reason } = req.body;
  if (!sessionAId || !sessionBId) {
    return res.status(400).json({ success: false, message: 'Session A ID and Session B ID are required for swapping.' });
  }

  const result = supabaseStore.swapSessionsWithValidation(
    sessionAId,
    sessionBId,
    reason || 'Manual Coordinator Swap',
    req.authenticatedUser?.name
  );

  if (!result.success) {
    return res.status(422).json({ success: false, error: result.error, message: result.error });
  }

  return res.json({
    success: true,
    message: 'Sessions swapped successfully and draft version saved.',
    version: result.updatedVersion,
  });
});

// Timetable Approval (College Admin / Dean only)
app.post('/api/timetable/approve', requireAuth, requireRole(['COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { versionId } = req.body;
  supabaseStore.approveTimetable(versionId || 'V1.0', req.authenticatedUser?.name);
  return res.json({
    success: true,
    message: `Timetable version ${versionId || 'V1.0'} has been officially approved by Academic Dean.`,
    approvedBy: req.authenticatedUser?.name,
    timestamp: new Date().toISOString(),
  });
});

// Timetable Publish (College Admin / Dean only)
const handlePublishTimetable = (req: AuthenticatedRequest, res: Response) => {
  const { versionId } = req.body;
  supabaseStore.publishTimetable(versionId || 'V1.0', req.authenticatedUser?.name);
  return res.json({
    success: true,
    message: `Timetable version ${versionId || 'V1.0'} is now officially published for institutional access.`,
    publishedBy: req.authenticatedUser?.name,
    timestamp: new Date().toISOString(),
  });
};

app.post('/api/timetable/publish', requireAuth, requireRole(['COLLEGE_ADMIN']), handlePublishTimetable);
app.post('/api/timetables/publish', requireAuth, requireRole(['COLLEGE_ADMIN']), handlePublishTimetable);

// Timetable Versions List & Restore
app.get('/api/timetable/versions', requireAuth, (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  return res.json({ success: true, versions: state.versions });
});

app.post('/api/timetable/versions/:versionNumber/restore', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const verNum = Number(req.params.versionNumber);
  const restored = supabaseStore.restoreVersion(verNum, req.authenticatedUser?.name);
  if (!restored) {
    return res.status(404).json({ success: false, message: `Version ${verNum} not found.` });
  }
  return res.json({ success: true, message: `Restored timetable to ${restored.versionLabel}`, version: restored });
});

// Timetable Benchmark Endpoint
app.get('/api/timetable/benchmark', requireAuth, requireRole(['SUPER_ADMIN', 'COLLEGE_ADMIN', 'COORDINATOR']), async (req: AuthenticatedRequest, res: Response) => {
  const wait = authService ? await authService.persistentRateLimit(`benchmark:${req.authenticatedUser?.id || req.ip}`, 2, 60_000) : 0;
  if (wait) return res.status(429).setHeader('Retry-After', String(wait)).json({ success: false, message: 'Too many benchmark requests. Max 2 per minute.' });
  const benchmarkState = supabaseStore.getAcademicState();
  const resultFast = executeOptimizationEngine(
    benchmarkState.academicYear,
    benchmarkState.allocations,
    benchmarkState.facultyMembers,
    benchmarkState.rooms,
    benchmarkState.sections,
    benchmarkState.courses,
    benchmarkState.constraints,
    { budgetMode: 'FAST', timeBudgetMs: 200, seed: 101, maxCandidates: 1 }
  );

  const resultOpt = executeOptimizationEngine(
    benchmarkState.academicYear,
    benchmarkState.allocations,
    benchmarkState.facultyMembers,
    benchmarkState.rooms,
    benchmarkState.sections,
    benchmarkState.courses,
    benchmarkState.constraints,
    { budgetMode: 'MAXIMUM_OPTIMIZATION', timeBudgetMs: 500, seed: 101, maxCandidates: 3 }
  );

  return res.json({
    engineVersion: '2.0.0-BitsetMRV',
    fastMode: {
      isFeasible: resultFast.isFeasible,
      totalTimeMs: resultFast.metrics.totalTimeMs,
      candidatesEvaluated: resultFast.metrics.candidatesEvaluated,
      candidatesPruned: resultFast.metrics.candidatesPruned,
      healthScore: resultFast.bestCandidate?.healthScore || 0,
    },
    optimizationMode: {
      isFeasible: resultOpt.isFeasible,
      totalTimeMs: resultOpt.metrics.totalTimeMs,
      candidatesEvaluated: resultOpt.metrics.candidatesEvaluated,
      candidatesPruned: resultOpt.metrics.candidatesPruned,
      healthScore: resultOpt.bestCandidate?.healthScore || 0,
      candidatesCount: resultOpt.allCandidates.length,
    },
  });
});

// -------------------------------------------------------------
// RECOVERY, NOTIFICATIONS & REPLACEMENT VOTING APIS
// -------------------------------------------------------------

// Cancel Class (Faculty, Coordinator, Admin)
app.post('/api/recovery/cancel-class', requireAuth, requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN', 'HOD', 'SUPER_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { sessionId, reason } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, message: 'Session ID is required.' });
  }

  const user = req.authenticatedUser;
  const state = supabaseStore.getBootstrapState();
  const session = (state.sessions || []).find((s: any) => s.id === sessionId);
  if (!session) {
    return res.status(404).json({ success: false, message: 'Session not found.' });
  }

  if (user?.roleCode === 'FACULTY') {
    const faculty = (state.facultyMembers || []).find((f: any) => f.email.toLowerCase() === user.email.toLowerCase() || f.id === (user as any).facultyId);
    if (!faculty || session.facultyId !== faculty.id) {
      return res.status(403).json({ success: false, message: 'Forbidden: Faculty can only cancel classes they teach.' });
    }
  } else if (user?.roleCode === 'HOD') {
    const faculty = (state.facultyMembers || []).find((f: any) => f.id === session.facultyId);
    if (!faculty || faculty.departmentId !== user.department) {
      return res.status(403).json({ success: false, message: 'Forbidden: HOD can only cancel classes within their department.' });
    }
  }

  const result = supabaseStore.cancelClassSession(sessionId, reason || 'Unforeseen conflict', user?.name);
  if (!result.success) {
    return res.status(404).json({ success: false, message: 'Session not found.' });
  }
  return res.json({
    success: true,
    message: `Class session ${sessionId} cancelled and queued for autonomous self-healing recovery.`,
    task: result.task,
    cancelledBy: req.authenticatedUser?.name,
  });
});

// Schedule Makeup Session (Validates target entities, pending state, and hard conflict freedom)
app.post('/api/recovery/schedule-makeup', requireAuth, requireRole(['FACULTY', 'COORDINATOR', 'COLLEGE_ADMIN']), (req: AuthenticatedRequest, res: Response) => {
  const { opportunityId } = req.body;
  if (!opportunityId) {
    return res.status(400).json({ success: false, message: 'Opportunity ID is required.' });
  }

  const state = supabaseStore.getBootstrapState();
  const opp = (state.recoveryOpportunities || []).find((o: any) => o.id === opportunityId);
  if (!opp) {
    return res.status(404).json({ success: false, message: 'Recovery opportunity not found.' });
  }

  // Verify opportunity is in PENDING/Proposed state
  const statusUpper = String(opp.status || '').toUpperCase();
  if (statusUpper !== 'PROPOSED' && statusUpper !== 'PENDING') {
    return res.status(400).json({
      success: false,
      message: `Recovery opportunity is already ${opp.status}. Only PENDING or Proposed opportunities can be scheduled.`,
    });
  }

  // Verify referenced cancellation task exists
  const makeupTask = (state.makeupTasks || []).find((t: any) => t.id === opp.makeupTaskId);
  if (!makeupTask) {
    return res.status(400).json({ success: false, message: 'Referenced cancellation task not found.' });
  }

  // Validate target room, faculty, time slot, and date/day are present
  const roomId = req.body.roomId || opp.roomId;
  const facultyId = req.body.facultyId || opp.facultyId;
  const timeSlotId = req.body.timeSlotId || opp.timeSlotId;
  const targetDay = req.body.targetDay || req.body.date || opp.targetDay;

  if (!roomId || !facultyId || !timeSlotId || !targetDay) {
    return res.status(400).json({
      success: false,
      message: 'Target room, faculty, time slot, and date are required to schedule makeup session.',
    });
  }

  // Verify no conflicts in schedule before creating the makeup class
  const activeSessions = (state.sessions || []).filter((s: any) => s.status !== 'Cancelled');

  const facultyConflict = activeSessions.find(
    (s: any) => s.facultyId === facultyId && s.day === targetDay && s.timeSlotId === timeSlotId
  );
  if (facultyConflict) {
    return res.status(409).json({
      success: false,
      message: `Faculty collision: Faculty member is already scheduled for session ${facultyConflict.id} at ${targetDay} ${timeSlotId}.`,
    });
  }

  const roomConflict = activeSessions.find(
    (s: any) => s.roomId === roomId && s.day === targetDay && s.timeSlotId === timeSlotId
  );
  if (roomConflict) {
    return res.status(409).json({
      success: false,
      message: `Room collision: Room ${roomId} is already occupied by session ${roomConflict.id} at ${targetDay} ${timeSlotId}.`,
    });
  }

  const sectionConflict = activeSessions.find(
    (s: any) => s.sectionId === makeupTask.sectionId && s.day === targetDay && s.timeSlotId === timeSlotId
  );
  if (sectionConflict) {
    return res.status(409).json({
      success: false,
      message: `Section collision: Student section ${makeupTask.sectionId} is already in session ${sectionConflict.id} at ${targetDay} ${timeSlotId}.`,
    });
  }

  const result = supabaseStore.scheduleMakeupSession(opportunityId, req.authenticatedUser?.name);
  if (!result.success) {
    return res.status(400).json({ success: false, message: 'Unable to schedule recovery makeup slot.' });
  }
  return res.json({ success: true, message: 'Makeup session scheduled successfully.', session: result.session });
});

// Decline Opportunity
app.post('/api/recovery/decline', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { opportunityId } = req.body;
  supabaseStore.declineOpportunity(opportunityId, req.authenticatedUser?.name);
  return res.json({ success: true, message: 'Opportunity marked declined.' });
});

// Replacement Poll Voting (Enforces 1-vote constraint per student)
app.post('/api/voting/vote', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const { pollId, optionId } = req.body;
  const studentId = req.authenticatedUser?.id || req.authenticatedUser?.email || 'student';

  if (!pollId || !optionId) {
    return res.status(400).json({ success: false, message: 'Poll ID and option ID are required.' });
  }

  const result = supabaseStore.castReplacementVote(pollId, studentId, optionId);
  if (!result.success) {
    return res.status(409).json({ success: false, message: result.message });
  }
  return res.json(result);
});

// Notifications (Authenticated & Filtered by User Identity / Target Role)
app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  const user = req.authenticatedUser;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  const userRole = user.roleCode;
  const userDashboardRole = mapRoleCodeToDashboard(user.roleCode);
  const userId = user.id;

  const filtered = state.notifications.filter((n: any) => {
    if (n.userId && n.userId === userId) return true;
    if (!n.recipientRole || n.recipientRole === 'ALL' || n.recipientRole === '*') return true;
    if (n.recipientRole === userRole || n.recipientRole === userDashboardRole) return true;
    if (Array.isArray(n.recipientRoles) && (n.recipientRoles.includes(userRole) || n.recipientRoles.includes(userDashboardRole))) return true;
    return false;
  });

  return res.json({ success: true, notifications: filtered });
});

app.post('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const notifId = req.params.id as string;
  const success = supabaseStore.markNotificationRead(notifId);
  return res.json({ success });
});

// Redaction helpers for sensitive audit logging & telemetry
function redactSensitiveText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    // Redact bcrypt/scrypt/legacy hashes
    .replace(/\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_HASH]')
    .replace(/scrypt:[a-f0-9]+:[a-f0-9]+/gi, '[REDACTED_HASH]')
    .replace(/sha256:[a-f0-9]+:[a-f0-9]+/gi, '[REDACTED_HASH]')
    // Redact JWT or hex session tokens
    .replace(/jwt_[a-zA-Z0-9_\-\.]+/g, '[REDACTED_TOKEN]')
    .replace(/sb_[a-zA-Z0-9_\-]+/g, '[REDACTED_TOKEN]')
    // Redact explicit password/secret key-value patterns in JSON or text
    .replace(/(["']?(?:password|passwd|pwd|secret|token|apiKey|authHeader)["']?\s*[:=]\s*["'])([^"'\s]+)(["'])/gi, '$1[REDACTED]$3')
    // Redact email addresses to masked format (e.g. j***@thapar.edu)
    .replace(/([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '$1***@$2');
}

function redactSensitiveValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    return redactSensitiveText(val);
  }
  if (Array.isArray(val)) {
    return val.map(redactSensitiveValue);
  }
  if (typeof val === 'object') {
    const sanitized: Record<string, any> = {};
    const sensitiveKeyRegex = /password|secret|token|hash|key|auth|credential|session/i;
    for (const [k, v] of Object.entries(val)) {
      if (sensitiveKeyRegex.test(k)) {
        sanitized[k] = '[REDACTED]';
      } else if (k.toLowerCase().includes('email') && typeof v === 'string') {
        sanitized[k] = redactSensitiveText(v);
      } else {
        sanitized[k] = redactSensitiveValue(v);
      }
    }
    return sanitized;
  }
  return val;
}

function redactAuditLog(log: any): any {
  if (!log) return log;
  return {
    ...log,
    userId: log.userId ? (log.userId.includes('@') ? redactSensitiveText(log.userId) : log.userId) : log.userId,
    userName: log.userName ? redactSensitiveText(log.userName) : log.userName,
    details: typeof log.details === 'string' ? redactSensitiveText(log.details) : redactSensitiveValue(log.details),
    payload: log.payload ? redactSensitiveValue(log.payload) : undefined,
  };
}

// Immutable Audit Events (Redacted for Security & Privacy)
app.get('/api/audit', requireAuth, requireRole(['COORDINATOR', 'COLLEGE_ADMIN', 'HOD']), (_req: Request, res: Response) => {
  const state = supabaseStore.getBootstrapState();
  const sanitizedLogs = (state.auditLogs || []).map(redactAuditLog);
  return res.json({ success: true, auditLogs: sanitizedLogs });
});

// -------------------------------------------------------------
// Vite middleware in dev or static files in production
// -------------------------------------------------------------
async function setupApp() {
  if (process.env.NODE_ENV === 'production' || process.env.RENDER) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res, next) => {
      if (_req.path.startsWith('/api/')) {
        return next();
      }
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    try {
      const { createServer } = await import('vite');
      const vite = await createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch {
      app.use(express.static(path.join(__dirname, 'dist')));
    }
  }

  // Synchronize baseline users into Supabase Auth Authority in background non-blocking
  if (process.env.NODE_ENV !== 'production') {
    ensureSupabaseAuthUsers().catch(err => console.error('[SUPABASE AUTH SETUP ERROR]:', err));
  }
}

if (!process.env.VERCEL) {
  const effectivePort = Number(process.env.PORT) || 3000;
  console.log("[STARTUP] About to bind HTTP server", {
    port: effectivePort,
    host: "0.0.0.0"
  });

  const server = app.listen(effectivePort, "0.0.0.0", () => {
    console.log("[STARTUP] HTTP SERVER LISTENING", {
      port: effectivePort,
      address: "0.0.0.0"
    });
  });

  setupApp().catch(err => console.error('[SETUP APP ERROR]:', err));
} else {
  if (process.env.NODE_ENV !== 'production') {
    ensureSupabaseAuthUsers().catch(() => {});
  }
}

export default app;
