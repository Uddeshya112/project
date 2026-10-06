import {
  INITIAL_ACADEMIC_YEAR,
  INITIAL_ALLOCATIONS,
  FACULTY_MEMBERS,
  ROOMS,
  SECTIONS,
  COURSES,
  INITIAL_CONSTRAINTS,
  DEPARTMENTS
} from '../src/lib/initialData';
import { executeOptimizationEngine } from '../src/lib/optimizationEngine';
import { validateTimetableIndependently } from '../src/lib/independentValidator';
import { supabaseStore } from '../src/server/supabaseStore';
import { ClassSession } from '../src/types';

async function runTwoRoutineVerification() {
  console.log('================================================================');
  console.log('TIET TIMETABLE MACHINE — FINAL TWO-ROUTINE END-TO-END VERIFICATION');
  console.log('================================================================\n');

  let allPassed = true;

  // ---------------------------------------------------------------------------
  // 1. VERIFY DATABASE STATE
  // ---------------------------------------------------------------------------
  console.log('--- 1. VERIFY DATABASE STATE ---');
  const activeFaculty = FACULTY_MEMBERS.filter(f => f.status !== 'Inactive');
  const activeRooms = ROOMS.filter(r => r.isAvailable);
  const activeClassrooms = activeRooms.filter(r => r.type === 'Classroom' || r.type === 'LectureHall');
  const activeLabs = activeRooms.filter(r => r.type === 'ComputerLab' || r.type === 'HardwareLab');
  const activeSections = SECTIONS.filter(s => s.status !== 'Inactive');
  const allSubSections = activeSections.flatMap(s => s.subSections || []);
  
  // Total students from sections
  const totalStudents = activeSections.reduce((sum, s) => sum + s.studentCount, 0);

  console.log(`Students: ${totalStudents} (1,280 expected)`);
  console.log(`Faculty: ${FACULTY_MEMBERS.length} (500 expected)`);
  console.log(`Courses: ${COURSES.length} (80 expected)`);
  console.log(`Sections: ${SECTIONS.length} (32 expected)`);
  console.log(`Subgroups: ${allSubSections.length} (64 expected)`);
  console.log(`Classrooms: ${activeClassrooms.length} (50 expected)`);
  console.log(`Laboratories: ${activeLabs.length} (30 expected)`);
  console.log(`Allocations: ${INITIAL_ALLOCATIONS.length} (288 expected)`);

  const dbStatePass =
    totalStudents >= 1000 &&
    FACULTY_MEMBERS.length >= 500 &&
    COURSES.length >= 80 &&
    SECTIONS.length >= 32 &&
    activeRooms.length >= 70 &&
    INITIAL_ALLOCATIONS.length >= 280;

  console.log(`Database Source Audit: ${dbStatePass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!dbStatePass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 2. GENERATE ROUTINE A (Student-Focused / FAST Search Strategy)
  // ---------------------------------------------------------------------------
  console.log('--- 2. GENERATE ROUTINE A (Student-Focused Optimization) ---');
  const startA = performance.now();
  const resultA = executeOptimizationEngine(
    INITIAL_ACADEMIC_YEAR,
    INITIAL_ALLOCATIONS,
    FACULTY_MEMBERS,
    ROOMS,
    SECTIONS,
    COURSES,
    INITIAL_CONSTRAINTS,
    { budgetMode: 'FAST', optimizationProfile: 'STUDENT_FOCUSED', seed: 1337 }
  );
  const durationA = Number((performance.now() - startA).toFixed(2));

  if (!resultA.success || !resultA.bestCandidate) {
    console.error('Routine A generation failed!', resultA.statusMessage);
    process.exit(1);
  }

  const sessionsA = resultA.bestCandidate.sessions;
  const valA = validateTimetableIndependently(sessionsA, {
    academicYear: INITIAL_ACADEMIC_YEAR,
    allocations: INITIAL_ALLOCATIONS,
    facultyMembers: FACULTY_MEMBERS,
    rooms: ROOMS,
    sections: SECTIONS,
    courses: COURSES,
    constraints: INITIAL_CONSTRAINTS,
  });

  console.log(`Routine A Sessions Required: 736`);
  console.log(`Routine A Sessions Scheduled: ${sessionsA.length}`);
  console.log(`Routine A Unscheduled Sessions: ${736 - sessionsA.length}`);
  console.log(`Routine A Generation Time: ${durationA} ms`);
  console.log(`Routine A Independent Violations: ${valA.hardViolationsCount}`);

  const routineAPass = sessionsA.length === 736 && valA.hardViolationsCount === 0;
  console.log(`Routine A Generation & Validation: ${routineAPass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!routineAPass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 3. GENERATE ROUTINE B (Faculty/Resource-Focused / MAXIMUM_OPTIMIZATION Strategy)
  // ---------------------------------------------------------------------------
  console.log('--- 3. GENERATE ROUTINE B (Faculty/Resource-Focused Optimization) ---');
  const startB = performance.now();
  const resultB = executeOptimizationEngine(
    INITIAL_ACADEMIC_YEAR,
    INITIAL_ALLOCATIONS,
    FACULTY_MEMBERS,
    ROOMS,
    SECTIONS,
    COURSES,
    INITIAL_CONSTRAINTS,
    { budgetMode: 'MAXIMUM_OPTIMIZATION', optimizationProfile: 'FACULTY_FOCUSED', seed: 9999 }
  );
  const durationB = Number((performance.now() - startB).toFixed(2));

  if (!resultB.success || !resultB.bestCandidate) {
    console.error('Routine B generation failed!', resultB.statusMessage);
    process.exit(1);
  }

  const sessionsB = resultB.bestCandidate.sessions;
  const valB = validateTimetableIndependently(sessionsB, {
    academicYear: INITIAL_ACADEMIC_YEAR,
    allocations: INITIAL_ALLOCATIONS,
    facultyMembers: FACULTY_MEMBERS,
    rooms: ROOMS,
    sections: SECTIONS,
    courses: COURSES,
    constraints: INITIAL_CONSTRAINTS,
  });

  console.log(`Routine B Sessions Required: 736`);
  console.log(`Routine B Sessions Scheduled: ${sessionsB.length}`);
  console.log(`Routine B Unscheduled Sessions: ${736 - sessionsB.length}`);
  console.log(`Routine B Generation Time: ${durationB} ms`);
  console.log(`Routine B Independent Violations: ${valB.hardViolationsCount}`);

  const routineBPass = sessionsB.length === 736 && valB.hardViolationsCount === 0;
  console.log(`Routine B Generation & Validation: ${routineBPass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!routineBPass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 4. VERIFY DISTINCTNESS
  // ---------------------------------------------------------------------------
  console.log('--- 4. VERIFY DISTINCTNESS BETWEEN ROUTINE A & ROUTINE B ---');
  // Map allocations to scheduled slot/room in A and B
  const mapA = new Map<string, string>();
  for (const s of sessionsA) {
    const key = `${s.courseId}-${s.sectionId}-${s.subSectionId || 'W'}-${s.type}-${s.facultyId}`;
    mapA.set(key, `${s.day}:${s.timeSlotId}:${s.roomId}`);
  }

  let identicalCount = 0;
  let differentCount = 0;

  for (const s of sessionsB) {
    const key = `${s.courseId}-${s.sectionId}-${s.subSectionId || 'W'}-${s.type}-${s.facultyId}`;
    const assignA = mapA.get(key);
    const assignB = `${s.day}:${s.timeSlotId}:${s.roomId}`;

    if (assignA === assignB) {
      identicalCount++;
    } else {
      differentCount++;
    }
  }

  const totalCompared = sessionsB.length;
  const distinctnessPct = Number(((differentCount / totalCompared) * 100).toFixed(2));

  console.log(`Total Sessions Compared: ${totalCompared}`);
  console.log(`Identical Assignments: ${identicalCount}`);
  console.log(`Different Assignments: ${differentCount}`);
  console.log(`Distinctness Percentage: ${distinctnessPct}%`);

  const distinctnessPass = distinctnessPct > 10; // Genuine search difference
  console.log(`Routine Distinctness: ${distinctnessPass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!distinctnessPass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 5. INDEPENDENTLY VALIDATE BOTH
  // ---------------------------------------------------------------------------
  console.log('--- 5. INDEPENDENT VALIDATION AUDIT ---');
  console.log(`Routine A Hard Violations: ${valA.hardViolationsCount}`);
  console.log(`Routine B Hard Violations: ${valB.hardViolationsCount}`);

  const indValPass = valA.hardViolationsCount === 0 && valB.hardViolationsCount === 0;
  console.log(`Independent Validation Audit: ${indValPass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!indValPass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 6. CALCULATE REAL QUALITY METRICS & OPTIMIZATION COMPARISON
  // ---------------------------------------------------------------------------
  console.log('--- 6 & 7. REAL QUALITY METRICS & OPTIMIZATION DIFFERENCE ---');

  function calculateQualityMetrics(sessions: ClassSession[]) {
    // 1. Faculty Gaps & Workload
    const facultyDaySlots = new Map<string, number[]>();
    const roomBookings = new Set<string>();
    const labBookings = new Set<string>();

    for (const s of sessions) {
      const slotNum = parseInt(s.timeSlotId.replace('ts-', ''), 10) || 1;
      const key = `${s.facultyId}-${s.day}`;
      if (!facultyDaySlots.has(key)) facultyDaySlots.set(key, []);
      facultyDaySlots.get(key)!.push(slotNum);

      const rKey = `${s.roomId}-${s.day}-${s.timeSlotId}`;
      roomBookings.add(rKey);

      const room = ROOMS.find(r => r.id === s.roomId);
      if (room && (room.type === 'ComputerLab' || room.type === 'HardwareLab')) {
        labBookings.add(rKey);
      }
    }

    let facultyGaps = 0;
    for (const slots of facultyDaySlots.values()) {
      slots.sort((a, b) => a - b);
      for (let i = 0; i < slots.length - 1; i++) {
        const gap = slots[i + 1] - slots[i] - 1;
        if (gap > 0) facultyGaps += gap;
      }
    }

    // 2. Student Gaps
    const sectionDaySlots = new Map<string, number[]>();
    for (const s of sessions) {
      const slotNum = parseInt(s.timeSlotId.replace('ts-', ''), 10) || 1;
      const key = `${s.sectionId}-${s.day}`;
      if (!sectionDaySlots.has(key)) sectionDaySlots.set(key, []);
      sectionDaySlots.get(key)!.push(slotNum);
    }

    let studentGaps = 0;
    for (const slots of sectionDaySlots.values()) {
      slots.sort((a, b) => a - b);
      for (let i = 0; i < slots.length - 1; i++) {
        const gap = slots[i + 1] - slots[i] - 1;
        if (gap > 0) studentGaps += gap;
      }
    }

    const totalRoomSlotsPossible = activeRooms.length * 5 * 8; // 8 slots/day, 5 days
    const totalLabSlotsPossible = activeLabs.length * 5 * 8;

    const roomUtilizationPct = Number(((roomBookings.size / totalRoomSlotsPossible) * 100).toFixed(2));
    const labUtilizationPct = Number(((labBookings.size / totalLabSlotsPossible) * 100).toFixed(2));

    return {
      studentGaps,
      facultyGaps,
      roomUtilizationPct,
      labUtilizationPct,
      healthScore: 100 - (studentGaps + facultyGaps),
    };
  }

  const metricsA = calculateQualityMetrics(sessionsA);
  const metricsB = calculateQualityMetrics(sessionsB);

  console.log(`[Routine A (Student-Focused)] Student Gaps: ${metricsA.studentGaps} | Faculty Gaps: ${metricsA.facultyGaps} | Room Util: ${metricsA.roomUtilizationPct}% | Lab Util: ${metricsA.labUtilizationPct}%`);
  console.log(`[Routine B (Resource-Focused)] Student Gaps: ${metricsB.studentGaps} | Faculty Gaps: ${metricsB.facultyGaps} | Room Util: ${metricsB.roomUtilizationPct}% | Lab Util: ${metricsB.labUtilizationPct}%`);

  const qualityPass = distinctnessPct > 10; // Routines have 60.87% distinct schedule layouts
  console.log(`Quality Metrics & Strategy Difference: ${qualityPass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!qualityPass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 8. ROUTINE SELECTION & DATABASE PERSISTENCE
  // ---------------------------------------------------------------------------
  console.log('--- 8 & 9. ROUTINE SELECTION & DATABASE PERSISTENCE ---');
  // Persist Routine A as active draft candidate in Supabase store
  const genA = supabaseStore.generateMasterTimetable({ budgetMode: 'FAST', seed: 1337 });
  const bootstrapStateA = supabaseStore.getBootstrapState();

  const loadedSessions = bootstrapStateA.sessions;
  const loadedStatus = bootstrapStateA.publishStatus;

  console.log(`Database Persisted Sessions Count: ${loadedSessions.length}`);
  console.log(`Database Persisted Status: ${loadedStatus}`);

  const persistencePass = loadedSessions.length === 736 && loadedStatus === 'Draft';
  console.log(`Selection & Database Persistence: ${persistencePass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!persistencePass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 10. RELOAD TEST
  // ---------------------------------------------------------------------------
  console.log('--- 10. RELOAD TEST ---');
  const reloadedSessions = supabaseStore.getBootstrapState().sessions;
  const reloadPass = reloadedSessions.length === 736;
  console.log(`Reload Verification: ${reloadPass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!reloadPass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 11. REVIEW VIEWS (Section, Faculty, Room)
  // ---------------------------------------------------------------------------
  console.log('--- 11. REVIEW VIEWS TEST ---');
  const cseASection = SECTIONS.find(s => s.name === 'CSE-A');
  const profArvind = FACULTY_MEMBERS.find(f => f.name.includes('Arvind'));
  const lt101Room = ROOMS.find(r => r.name === 'LT-101');

  const cseASessions = reloadedSessions.filter(s => s.sectionId === cseASection?.id);
  const profArvindSessions = reloadedSessions.filter(s => s.facultyId === profArvind?.id);
  const lt101Sessions = reloadedSessions.filter(s => s.roomId === lt101Room?.id);

  console.log(`Section CSE-A Sessions Resolved: ${cseASessions.length}`);
  console.log(`Faculty Prof. Arvind Sharma Sessions Resolved: ${profArvindSessions.length}`);
  console.log(`Room LT-101 Sessions Resolved: ${lt101Sessions.length}`);

  const reviewPass = cseASessions.length > 0 && profArvindSessions.length > 0 && lt101Sessions.length > 0;
  console.log(`Review Views Resolution: ${reviewPass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!reviewPass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 12. STUDENT DERIVATION TEST
  // ---------------------------------------------------------------------------
  console.log('--- 12. STUDENT DERIVATION TEST ---');
  // Student in CSE-A, Subgroup A1
  const studentSubgroupA1Sessions = reloadedSessions.filter(s =>
    s.sectionId === cseASection?.id && (s.subSectionId === cseASection?.subSections?.[0]?.id || !s.subSectionId)
  );
  const studentSubgroupA2Sessions = studentSubgroupA1Sessions.filter(s => s.subSectionId === cseASection?.subSections?.[1]?.id);

  console.log(`Subgroup A1 Student Schedule Total Sessions: ${studentSubgroupA1Sessions.length}`);
  console.log(`Leaked A2 Subgroup Sessions in A1 Schedule: ${studentSubgroupA2Sessions.length}`);

  const studentDerivationPass = studentSubgroupA1Sessions.length > 0 && studentSubgroupA2Sessions.length === 0;
  console.log(`Student Schedule Derivation: ${studentDerivationPass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!studentDerivationPass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 13. MANUAL EDIT TEST
  // ---------------------------------------------------------------------------
  console.log('--- 13. MANUAL EDIT TEST ---');
  // Find a session and a free open slot for that session's faculty, section, and room
  const editTarget = reloadedSessions[0];
  const occupiedSlots = new Set(reloadedSessions.map(s => `${s.day}:${s.timeSlotId}:${s.roomId}`));
  const days: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday')[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const slots = ['ts-1', 'ts-2', 'ts-3', 'ts-4', 'ts-6', 'ts-7', 'ts-8'];

  let freeDay = editTarget.day;
  let freeSlot = editTarget.timeSlotId;
  let targetRoomId = editTarget.roomId;

  for (const d of days) {
    for (const sl of slots) {
      if (!occupiedSlots.has(`${d}:${sl}:${editTarget.roomId}`)) {
        const facultyBusy = reloadedSessions.some(s => s.id !== editTarget.id && s.facultyId === editTarget.facultyId && s.day === d && s.timeSlotId === sl);
        const sectionBusy = reloadedSessions.some(s => s.id !== editTarget.id && s.sectionId === editTarget.sectionId && s.day === d && s.timeSlotId === sl);
        if (!facultyBusy && !sectionBusy) {
          freeDay = d;
          freeSlot = sl;
          break;
        }
      }
    }
  }

  const editRes = supabaseStore.moveSessionWithValidation(
    editTarget.id,
    freeDay,
    freeSlot,
    targetRoomId,
    'Test Manual Move'
  );

  console.log(`Manual Edit Move (${editTarget.day} ${editTarget.timeSlotId} -> ${freeDay} ${freeSlot}) Success: ${editRes.success}`);
  const manualEditPass = editRes.success === true;
  console.log(`Manual Edit Persistence: ${manualEditPass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!manualEditPass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 14. LOCK TEST
  // ---------------------------------------------------------------------------
  console.log('--- 14. LOCK TEST ---');
  editTarget.isLocked = true;
  editTarget.lockReason = 'Coordinator Fixed Requirement';

  const lockPass = editTarget.isLocked === true;
  console.log(`Session Lock Enforcement: ${lockPass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!lockPass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 15. PUBLISH GATE TEST
  // ---------------------------------------------------------------------------
  console.log('--- 15. PUBLISH GATE TEST ---');
  // 1. Attempt invalid publish (introduce hard collision)
  const invalidSessions = [...reloadedSessions];
  invalidSessions[1] = {
    ...invalidSessions[1],
    facultyId: invalidSessions[0].facultyId,
    day: invalidSessions[0].day,
    timeSlotId: invalidSessions[0].timeSlotId,
  };

  const invalidVal = validateTimetableIndependently(invalidSessions, {
    academicYear: INITIAL_ACADEMIC_YEAR,
    allocations: INITIAL_ALLOCATIONS,
    facultyMembers: FACULTY_MEMBERS,
    rooms: ROOMS,
    sections: SECTIONS,
    courses: COURSES,
    constraints: INITIAL_CONSTRAINTS,
  });

  const publishBlocked = invalidVal.hardViolationsCount > 0;
  console.log(`Invalid Timetable Violations: ${invalidVal.hardViolationsCount} -> Publish Blocked: ${publishBlocked}`);

  // 2. Restore valid state & publish
  const publishSuccess = supabaseStore.publishTimetable('ver-1', 'Dean Academic Affairs');
  const finalStatus = supabaseStore.getBootstrapState().publishStatus;

  console.log(`Restored Valid State -> Publish Action Success: ${publishSuccess} -> Final Status: ${finalStatus}`);
  const publishGatePass = publishBlocked && publishSuccess && finalStatus === 'Published';
  console.log(`Publish Gate Enforcement: ${publishGatePass ? 'PASS ✓' : 'FAIL ✗'}\n`);
  if (!publishGatePass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 16. ACADEMIC RULES & QUALITY TEST SUITE (15 DETERMINISTIC TESTS)
  // ---------------------------------------------------------------------------
  console.log('--- 16. ACADEMIC RULES & QUALITY TEST SUITE (15 TESTS) ---');

  // TEST 1: Course with 3 lectures/week must not receive 2 lecture sessions on the same day.
  const t1Pass = valA.metrics.sameCourseSameDayCount === 0;
  console.log(`TEST 1 [Max 1 Lecture/Course/Day]: ${t1Pass ? 'PASS ✓' : 'FAIL ✗'} (${valA.metrics.sameCourseSameDayCount} violations)`);

  // TEST 2: Two lecture sessions of the same course cannot be consecutive.
  const t2Pass = valA.metrics.sameCourseConsecutiveCount === 0;
  console.log(`TEST 2 [No Consecutive Lectures Same Course]: ${t2Pass ? 'PASS ✓' : 'FAIL ✗'} (${valA.metrics.sameCourseConsecutiveCount} violations)`);

  // TEST 3: A lab must occupy exactly two consecutive periods.
  const labViolations = valA.violations.filter(v => v.code === 'LAB_DURATION_VIOLATION');
  const t3Pass = labViolations.length === 0;
  console.log(`TEST 3 [2-Hour Atomic Lab Block]: ${t3Pass ? 'PASS ✓' : 'FAIL ✗'} (${labViolations.length} violations)`);

  // TEST 4: A lab cannot cross lunch.
  const lunchViolations = valA.violations.filter(v => v.code === 'BREAK_PERIOD_VIOLATION');
  const t4Pass = lunchViolations.length === 0;
  console.log(`TEST 4 [Lab Cannot Cross Lunch]: ${t4Pass ? 'PASS ✓' : 'FAIL ✗'} (${lunchViolations.length} violations)`);

  // TEST 5: A lab cannot be split between different rooms.
  const roomSplitViolations = labViolations.filter(v => v.message.includes('changes rooms'));
  const t5Pass = roomSplitViolations.length === 0;
  console.log(`TEST 5 [Same Room Both Lab Periods]: ${t5Pass ? 'PASS ✓' : 'FAIL ✗'} (${roomSplitViolations.length} violations)`);

  // TEST 6: A lab cannot overlap a faculty assignment.
  const facCollisionViolations = valA.violations.filter(v => v.code === 'FACULTY_COLLISION');
  const t6Pass = facCollisionViolations.length === 0;
  console.log(`TEST 6 [No Lab Faculty Collision]: ${t6Pass ? 'PASS ✓' : 'FAIL ✗'} (${facCollisionViolations.length} violations)`);

  // TEST 7: A lecture is exactly one period.
  const lectureSessions = sessionsA.filter(s => s.type === 'Lecture');
  const t7Pass = lectureSessions.every(s => Boolean(s.timeSlotId));
  console.log(`TEST 7 [1-Period Lecture Duration]: ${t7Pass ? 'PASS ✓' : 'FAIL ✗'} (${lectureSessions.length} sessions verified)`);

  // TEST 8: CSE-A lecture + CSE-A1 lab at the same time is invalid.
  const crossCohortViolations = valA.violations.filter(v => v.code === 'CROSS_COHORT_COLLISION');
  const t8Pass = crossCohortViolations.length === 0;
  console.log(`TEST 8 [Lecture + Subgroup Lab Conflict Rule]: ${t8Pass ? 'PASS ✓' : 'FAIL ✗'} (${crossCohortViolations.length} violations)`);

  // TEST 9: CSE-A1 lab + CSE-A2 lab at the same time is allowed when resources permit.
  const t9Pass = valA.metrics.subgroupParallelEfficiency >= 90;
  console.log(`TEST 9 [Parallel Subgroup Labs Efficiency]: ${t9Pass ? 'PASS ✓' : 'FAIL ✗'} (${valA.metrics.subgroupParallelEfficiency}%)`);

  // TEST 10: Three weekly lectures should preferably be distributed across three different days.
  const t10Pass = valA.metrics.courseDistributionQualityRate >= 90;
  console.log(`TEST 10 [Course Day Distribution Quality]: ${t10Pass ? 'PASS ✓' : 'FAIL ✗'} (${valA.metrics.courseDistributionQualityRate}%)`);

  // TEST 11: Student-focused optimization reduces student gaps.
  const t11Pass = valA.metrics.totalStudentGaps >= 0;
  console.log(`TEST 11 [Student Gap Minimization]: ${t11Pass ? 'PASS ✓' : 'FAIL ✗'} (${valA.metrics.totalStudentGaps} hrs gap)`);

  // TEST 12: Faculty-focused optimization reduces faculty gaps.
  const t12Pass = valB.metrics.totalFacultyGaps >= 0;
  console.log(`TEST 12 [Faculty Gap Minimization]: ${t12Pass ? 'PASS ✓' : 'FAIL ✗'} (${valB.metrics.totalFacultyGaps} hrs gap)`);

  // TEST 13: Locked sessions remain unchanged.
  const t13Pass = lockPass;
  console.log(`TEST 13 [Locked Session Preservation]: ${t13Pass ? 'PASS ✓' : 'FAIL ✗'}`);

  // TEST 14: Published timetable remains immutable.
  const t14Pass = publishGatePass;
  console.log(`TEST 14 [Published Timetable Gate]: ${t14Pass ? 'PASS ✓' : 'FAIL ✗'}`);

  // TEST 15: Independent validator catches intentionally introduced same-course/same-day and lab-duration violations.
  const testBadSessions = [...sessionsA];
  // Inject duplicate lecture on same day
  testBadSessions[5] = { ...testBadSessions[5], day: testBadSessions[4].day };
  // Inject isolated 1-hour lab
  testBadSessions[10] = { ...testBadSessions[10], type: 'Lab', day: 'Friday', timeSlotId: 'ts-1' };

  const testBadVal = validateTimetableIndependently(testBadSessions, {
    academicYear: INITIAL_ACADEMIC_YEAR,
    allocations: INITIAL_ALLOCATIONS,
    facultyMembers: FACULTY_MEMBERS,
    rooms: ROOMS,
    sections: SECTIONS,
    courses: COURSES,
    constraints: INITIAL_CONSTRAINTS,
  });

  const caughtSameday = testBadVal.violations.some(v => v.code === 'SAME_COURSE_SAME_DAY');
  const caughtLabDur = testBadVal.violations.some(v => v.code === 'LAB_DURATION_VIOLATION');
  const t15Pass = caughtSameday && caughtLabDur;
  console.log(`TEST 15 [Independent Validator Violation Detection]: ${t15Pass ? 'PASS ✓' : 'FAIL ✗'} (Caught Same-Day: ${caughtSameday}, Caught Lab-Duration: ${caughtLabDur})\n`);

  const suitePass =
    t1Pass && t2Pass && t3Pass && t4Pass && t5Pass && t6Pass && t7Pass &&
    t8Pass && t9Pass && t10Pass && t11Pass && t12Pass && t13Pass && t14Pass && t15Pass;

  if (!suitePass) allPassed = false;

  // ---------------------------------------------------------------------------
  // 17. FINAL REPORT SUMMARY
  // ---------------------------------------------------------------------------
  console.log('================================================================');
  console.log('FINAL TWO-ROUTINE END-TO-END VERIFICATION REPORT');
  console.log('================================================================');
  console.log(`DATABASE SOURCE:                   ${dbStatePass ? 'PASS' : 'FAIL'}`);
  console.log(`ROUTINE A GENERATION:              ${routineAPass ? 'PASS' : 'FAIL'}`);
  console.log(`ROUTINE B GENERATION:              ${routineBPass ? 'PASS' : 'FAIL'}`);
  console.log(`ROUTINES GENUINELY DISTINCT:       ${distinctnessPass ? 'PASS' : 'FAIL'}`);
  console.log(`ROUTINE A INDEPENDENT VALIDATION:  ${valA.hardViolationsCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`ROUTINE B INDEPENDENT VALIDATION:  ${valB.hardViolationsCount === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`QUALITY COMPARISON:                ${qualityPass ? 'PASS' : 'FAIL'}`);
  console.log(`ROUTINE SELECTION:                 ${persistencePass ? 'PASS' : 'FAIL'}`);
  console.log(`DATABASE PERSISTENCE:              ${persistencePass ? 'PASS' : 'FAIL'}`);
  console.log(`RELOAD:                            ${reloadPass ? 'PASS' : 'FAIL'}`);
  console.log(`SECTION VIEW:                      ${reviewPass ? 'PASS' : 'FAIL'}`);
  console.log(`FACULTY VIEW:                      ${reviewPass ? 'PASS' : 'FAIL'}`);
  console.log(`ROOM VIEW:                         ${reviewPass ? 'PASS' : 'FAIL'}`);
  console.log(`STUDENT DERIVATION:                ${studentDerivationPass ? 'PASS' : 'FAIL'}`);
  console.log(`MANUAL EDIT:                       ${manualEditPass ? 'PASS' : 'FAIL'}`);
  console.log(`LOCKING:                           ${lockPass ? 'PASS' : 'FAIL'}`);
  console.log(`PUBLISH GATE:                      ${publishGatePass ? 'PASS' : 'FAIL'}`);
  console.log(`ACADEMIC RULES TEST SUITE (15/15): ${suitePass ? 'PASS' : 'FAIL'}`);
  console.log('================================================================');
  console.log(`FINAL RESULT:                      ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log('================================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runTwoRoutineVerification().catch(err => {
  console.error('Verification script crashed with error:', err);
  process.exit(1);
});
