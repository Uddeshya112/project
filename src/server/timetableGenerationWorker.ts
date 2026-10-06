import { parentPort, workerData } from 'node:worker_threads';
import { executeOptimizationEngine } from '../lib/optimizationEngine';

if (!parentPort) {
  throw new Error('Timetable generation worker must run inside worker_threads.');
}

try {
  const payload = workerData as {
    academicYear: any;
    allocations: any[];
    facultyMembers: any[];
    rooms: any[];
    sections: any[];
    courses: any[];
    constraints: any[];
    options: any;
  };
  parentPort.postMessage({ type: 'started' });
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
  parentPort.postMessage({ type: 'completed', result });
} catch (error: any) {
  parentPort.postMessage({
    type: 'failed',
    error: error?.message || 'Timetable generation worker failed.',
  });
}
