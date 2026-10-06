import { Worker } from 'worker_threads';
import { EngineResult } from '../lib/optimizationEngine';
import { AcademicYearConfig, CourseAllocation, Faculty, Room, StudentSection, Course, AcademicConstraint } from '../types';
import type { Db } from './db';

export interface TimetableJobRequest {
  jobId: string;
  academicYear: AcademicYearConfig;
  allocations: CourseAllocation[];
  facultyMembers: Faculty[];
  rooms: Room[];
  sections: StudentSection[];
  courses: Course[];
  constraints: AcademicConstraint[];
  options: {
    budgetMode?: 'FAST' | 'BALANCED' | 'MAXIMUM_OPTIMIZATION';
    optimizationProfile?: 'STUDENT_FOCUSED' | 'FACULTY_FOCUSED' | 'BALANCED';
    timeBudgetMs?: number;
    seed?: number;
    maxCandidates?: number;
  };
}

export type JobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface TimetableJobState {
  jobId: string;
  status: JobStatus;
  progress: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: EngineResult;
  error?: string;
}

const TABLE='intellischedule';
const MAX_RUNTIME_MS=Number(process.env.TIMETABLE_JOB_TIMEOUT_MS)||120_000;

class TimetableJobManager {
  private db: Db | null = null;
  private workers = new Map<string, Worker>();

  public init(db: Db) {
    this.db = db;
  }

  public async recover() {
    if (!this.db) throw new Error('Job manager database is not initialized.');
    await this.db.query(`update ${TABLE}.jobs set status='PENDING', error='Recovered after server restart' where status='RUNNING'`);
    const pending = await this.db.query<any>(`select job_id from ${TABLE}.jobs where status='PENDING' order by created_at asc limit 5`);
    for (const job of pending) void this.execute(job.job_id);
  }

  public async createJob(
    academicYear: AcademicYearConfig,
    allocations: CourseAllocation[],
    facultyMembers: Faculty[],
    rooms: Room[],
    sections: StudentSection[],
    courses: Course[],
    constraints: AcademicConstraint[],
    options: any = {},
    requestedBy?: string,
  ): Promise<string> {
    if (!this.db) throw new Error('Job manager database is not initialized.');
    const jobId = `job_${crypto.randomUUID()}`;
    const payload: TimetableJobRequest = { jobId, academicYear, allocations, facultyMembers, rooms, sections, courses, constraints, options };
    await this.db.query(
      `insert into ${TABLE}.jobs (job_id,status,progress,requested_by,payload) values ($1,'PENDING',0,$2,$3)`,
      [jobId, requestedBy || null, JSON.stringify(payload)],
    );
    void this.execute(jobId);
    return jobId;
  }

  private async execute(jobId: string) {
    if (!this.db) return;
    const db=this.db;
    const rows=await db.query<any>(`select * from ${TABLE}.jobs where job_id=$1`,[jobId]);
    const row=rows[0];
    if (!row || ['COMPLETED','FAILED','CANCELLED'].includes(row.status)) return;
    const claimed=await db.query<any>(
      `update ${TABLE}.jobs set status='RUNNING',started_at=coalesce(started_at,now()),progress=5 where job_id=$1 and status='PENDING' returning *`,
      [jobId],
    );
    if(!claimed[0]) return;
    const payload=(typeof row.payload==='string'?JSON.parse(row.payload):row.payload) as TimetableJobRequest;

    const worker=new Worker(new URL('./jobWorker.ts', import.meta.url), { workerData: payload, execArgv: ['--import','tsx/esm'] });
    this.workers.set(jobId,worker);
    const timeout=setTimeout(() => {
      worker.terminate().catch(()=>{});
      void db.query(`update ${TABLE}.jobs set status='FAILED',error='Timetable generation timed out',completed_at=now() where job_id=$1 and status='RUNNING'`,[jobId]);
    },MAX_RUNTIME_MS);

    worker.on('message',(message:any)=>{
      if(message?.type==='progress') void db.query(`update ${TABLE}.jobs set progress=$2 where job_id=$1 and status='RUNNING'`,[jobId,Math.max(0,Math.min(99,Number(message.value)||0))]);
      if(message?.type==='result') void db.query(`update ${TABLE}.jobs set status='COMPLETED',progress=100,completed_at=now(),result=$2 where job_id=$1 and status='RUNNING'`,[jobId,JSON.stringify(message.result)]);
      if(message?.type==='error') void db.query(`update ${TABLE}.jobs set status='FAILED',error=$2,completed_at=now() where job_id=$1 and status='RUNNING'`,[jobId,String(message.error||'Worker failed')]);
    });
    worker.once('error',(err)=>void db.query(`update ${TABLE}.jobs set status='FAILED',error=$2,completed_at=now() where job_id=$1 and status='RUNNING'`,[jobId,err.message]));
    worker.once('exit',(code)=>{
      clearTimeout(timeout);
      this.workers.delete(jobId);
      if(code!==0) void db.query(`update ${TABLE}.jobs set status='FAILED',error=coalesce(error,'Worker exited unexpectedly'),completed_at=coalesce(completed_at,now()) where job_id=$1 and status='RUNNING'`,[jobId]);
    });
  }

  public async getJob(jobId:string): Promise<TimetableJobState|undefined>{
    if(!this.db) return undefined;
    const rows=await this.db.query<any>(`select job_id,status,progress,created_at,started_at,completed_at,result,error from ${TABLE}.jobs where job_id=$1`,[jobId]);
    const row=rows[0]; if(!row) return undefined;
    return {jobId:row.job_id,status:row.status,progress:Number(row.progress||0),createdAt:new Date(row.created_at).toISOString(),startedAt:row.started_at?new Date(row.started_at).toISOString():undefined,completedAt:row.completed_at?new Date(row.completed_at).toISOString():undefined,result:row.result??undefined,error:row.error??undefined};
  }

  public async cancelJob(jobId:string): Promise<boolean>{
    if(!this.db) return false;
    const rows=await this.db.query<any>(`update ${TABLE}.jobs set status='CANCELLED',cancel_requested=true,completed_at=now() where job_id=$1 and status in ('PENDING','RUNNING') returning job_id`,[jobId]);
    const worker=this.workers.get(jobId);
    if(worker) await worker.terminate().catch(()=>{});
    return Boolean(rows[0]);
  }
}

export const timetableJobManager = new TimetableJobManager();
