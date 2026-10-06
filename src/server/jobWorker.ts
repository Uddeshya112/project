import { parentPort, workerData } from 'worker_threads';
import { executeOptimizationEngine } from '../lib/optimizationEngine';

type Payload = {
  jobId: string;
  academicYear: any;
  allocations: any[];
  facultyMembers: any[];
  rooms: any[];
  sections: any[];
  courses: any[];
  constraints: any[];
  options: any;
};

if (!parentPort) throw new Error('Worker parent port is unavailable.');

const payload = workerData as Payload;
parentPort.postMessage({ type: 'progress', value: 10 });
try {
  const result = executeOptimizationEngine(
    payload.academicYear,
    payload.allocations,
    payload.facultyMembers,
    payload.rooms,
    payload.sections,
    payload.courses,
    payload.constraints,
    payload.options,
  );
  parentPort.postMessage({ type: 'progress', value: 95 });
  parentPort.postMessage({ type: 'result', result });
} catch (error) {
  parentPort.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
}
