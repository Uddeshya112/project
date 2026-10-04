import {
  ClassSession,
  Room,
  Faculty,
  StudentSection,
  Course,
  CourseAllocation,
  AcademicConstraint,
  AcademicYearConfig,
  TimeSlot,
  DayOfWeek,
  ValidationReport,
  ValidationItem
} from '../types';

/**
 * Validates the academic setup data before timetable generation.
 */
export function validateAcademicSetup(
  academicYear: AcademicYearConfig,
  departments: any[],
  programs: any[],
  courses: Course[],
  facultyMembers: Faculty[],
  rooms: Room[],
  sections: StudentSection[],
  allocations: CourseAllocation[],
  constraints: AcademicConstraint[]
): ValidationReport {
  const items: ValidationItem[] = [];

  // 1. Check Working Days & Time Slots
  if (!academicYear.workingDays || academicYear.workingDays.length === 0) {
    items.push({
      id: 'val-workdays',
      title: 'Working Days Configuration',
      category: 'Academic Year',
      status: 'Error',
      message: 'No active working days defined for the semester.',
      fixTab: 'academic_year',
    });
  } else {
    items.push({
      id: 'val-workdays-ok',
      title: 'Working Days Active',
      category: 'Academic Year',
      status: 'Passed',
      message: `${academicYear.workingDays.length} working days configured (${academicYear.workingDays.join(', ')}).`,
    });
  }

  const activeSlots = (academicYear.timeSlots || []).filter(ts => !ts.isLunch && !ts.isBreak);
  if (activeSlots.length === 0) {
    items.push({
      id: 'val-slots',
      title: 'Teaching Periods',
      category: 'Academic Year',
      status: 'Error',
      message: 'No teaching time slots defined.',
      fixTab: 'academic_year',
    });
  } else {
    items.push({
      id: 'val-slots-ok',
      title: 'Teaching Periods Defined',
      category: 'Academic Year',
      status: 'Passed',
      message: `${activeSlots.length} active lecture periods per day configured.`,
    });
  }

  // 2. Check Faculty
  const activeFaculty = facultyMembers.filter(f => f.status !== 'Inactive');
  if (activeFaculty.length === 0) {
    items.push({
      id: 'val-faculty-empty',
      title: 'Faculty Roster',
      category: 'Faculty',
      status: 'Error',
      message: 'No active faculty members registered in the institution.',
      fixTab: 'faculty',
    });
  } else {
    items.push({
      id: 'val-faculty-ok',
      title: 'Faculty Configured',
      category: 'Faculty',
      status: 'Passed',
      message: `${activeFaculty.length} faculty instructors available with defined workload caps.`,
    });
  }

  // 3. Check Courses
  const activeCourses = courses.filter(c => c.status !== 'Archived');
  if (activeCourses.length === 0) {
    items.push({
      id: 'val-courses-empty',
      title: 'Course Catalog',
      category: 'Courses',
      status: 'Error',
      message: 'No active courses configured for this academic semester.',
      fixTab: 'courses',
    });
  } else {
    items.push({
      id: 'val-courses-ok',
      title: 'Courses Configured',
      category: 'Courses',
      status: 'Passed',
      message: `${activeCourses.length} accredited courses configured in catalog.`,
    });
  }

  // 4. Check Rooms & Labs
  const availableRooms = rooms.filter(r => r.isAvailable);
  const labs = availableRooms.filter(r => r.type === 'ComputerLab' || r.type === 'HardwareLab');
  const lectureHalls = availableRooms.filter(r => r.type === 'LectureHall' || r.type === 'SeminarRoom' || r.type === 'TutorialRoom');

  if (availableRooms.length === 0) {
    items.push({
      id: 'val-rooms-empty',
      title: 'Physical Infrastructure',
      category: 'Rooms & Labs',
      status: 'Error',
      message: 'No physical rooms or laboratories available for scheduling.',
      fixTab: 'rooms',
    });
  } else {
    items.push({
      id: 'val-rooms-ok',
      title: 'Physical Classrooms & Labs',
      category: 'Rooms & Labs',
      status: 'Passed',
      message: `${lectureHalls.length} lecture halls and ${labs.length} laboratories available.`,
    });
  }

  // 5. Check Sections
  const activeSections = sections.filter(s => s.status !== 'Inactive');
  if (activeSections.length === 0) {
    items.push({
      id: 'val-sections-empty',
      title: 'Student Cohort Sections',
      category: 'Sections',
      status: 'Error',
      message: 'No student cohort sections defined.',
      fixTab: 'sections',
    });
  } else {
    items.push({
      id: 'val-sections-ok',
      title: 'Student Sections Registered',
      category: 'Sections',
      status: 'Passed',
      message: `${activeSections.length} cohort sections registered with student strengths.`,
    });
  }

  // 6. Check Course Allocations
  if (allocations.length === 0) {
    items.push({
      id: 'val-alloc-empty',
      title: 'Course-to-Faculty Allocations',
      category: 'Allocations',
      status: 'Error',
      message: 'No courses have been allocated to faculty and student sections.',
      fixTab: 'allocations',
    });
  } else {
    const unassignedCourses = activeCourses.filter(c => !allocations.some(a => a.courseId === c.id));
    if (unassignedCourses.length > 0) {
      items.push({
        id: 'val-alloc-unassigned',
        title: 'Unallocated Courses in Catalog',
        category: 'Allocations',
        status: 'Warning',
        message: `${unassignedCourses.length} course(s) (${unassignedCourses.map(c => c.code).join(', ')}) have not been allocated to any faculty/section.`,
        fixTab: 'allocations',
      });
    } else {
      items.push({
        id: 'val-alloc-ok',
        title: 'Course Allocations Complete',
        category: 'Allocations',
        status: 'Passed',
        message: `All ${activeCourses.length} active courses have faculty and section mappings.`,
      });
    }
  }

  // 7. Check Capacity Compatibility
  let capacityMismatchCount = 0;
  for (const alloc of allocations) {
    const section = sections.find(s => s.id === alloc.sectionId);
    if (!section) continue;
    const requiredCap = alloc.subSectionId ? Math.ceil(section.studentCount / 2) : section.studentCount;
    const maxCapableRoom = Math.max(...availableRooms.map(r => r.capacity), 0);
    if (requiredCap > maxCapableRoom) {
      capacityMismatchCount++;
    }
  }

  if (capacityMismatchCount > 0) {
    items.push({
      id: 'val-cap-error',
      title: 'Room Capacity Shortage',
      category: 'Infrastructure',
      status: 'Error',
      message: `${capacityMismatchCount} allocation(s) exceed the largest available room capacity.`,
      fixTab: 'rooms_mgmt',
    });
  } else {
    items.push({
      id: 'val-cap-ok',
      title: 'Room Capacity Compliance',
      category: 'Infrastructure',
      status: 'Passed',
      message: 'All section student counts fit within available physical rooms.',
    });
  }

  // 8. Check Lab Requirements vs Lab Availability
  const labAllocations = allocations.filter(a => a.sessionType === 'Lab');
  if (labAllocations.length > 0 && labs.length === 0) {
    items.push({
      id: 'val-lab-missing',
      title: 'Lab Allocation Without Laboratory Rooms',
      category: 'Infrastructure',
      status: 'Error',
      message: `${labAllocations.length} lab session(s) required, but 0 Computer/Hardware Labs are configured.`,
      fixTab: 'rooms_mgmt',
    });
  }

  // 9. Check Faculty Workload Caps
  const facultyHoursMap: Record<string, number> = {};
  allocations.forEach(a => {
    facultyHoursMap[a.facultyId] = (facultyHoursMap[a.facultyId] || 0) + a.hoursPerWeek;
  });

  let workloadOverloadedFaculty = 0;
  for (const fac of activeFaculty) {
    const assignedHours = facultyHoursMap[fac.id] || 0;
    if (assignedHours > fac.maxDirectTeachingHours) {
      workloadOverloadedFaculty++;
    }
  }

  if (workloadOverloadedFaculty > 0) {
    items.push({
      id: 'val-workload-warn',
      title: 'UGC Faculty Workload Overload',
      category: 'Workload',
      status: 'Warning',
      message: `${workloadOverloadedFaculty} faculty member(s) assigned hours exceed their UGC direct teaching limit.`,
      fixTab: 'faculty_mgmt',
    });
  } else {
    items.push({
      id: 'val-workload-ok',
      title: 'Faculty Workload Balance',
      category: 'Workload',
      status: 'Passed',
      message: 'All faculty teaching loads are within UGC limits.',
    });
  }

  const errorCount = items.filter(i => i.status === 'Error').length;
  const warningCount = items.filter(i => i.status === 'Warning').length;
  const passedCount = items.filter(i => i.status === 'Passed').length;

  return {
    isReadyForGeneration: errorCount === 0,
    passedCount,
    warningCount,
    errorCount,
    items,
  };
}

import { executeOptimizationEngine } from './optimizationEngine';

/**
 * Generates a draft timetable using the high-performance Bitset Constraint Optimization Engine.
 */
export function generateTimetableFromConfiguration(
  academicYear: AcademicYearConfig,
  allocations: CourseAllocation[],
  facultyMembers: Faculty[],
  rooms: Room[],
  sections: StudentSection[],
  courses: Course[],
  constraints: AcademicConstraint[]
): {
  sessions: ClassSession[];
  scheduledHours: number;
  totalRequestedHours: number;
  unscheduledAllocations: CourseAllocation[];
  conflicts: string[];
} {
  const engineResult = executeOptimizationEngine(
    academicYear,
    allocations,
    facultyMembers,
    rooms,
    sections,
    courses,
    constraints,
    { budgetMode: 'FAST', timeBudgetMs: 100, seed: 1337 }
  );

  if (engineResult.isFeasible && engineResult.bestCandidate) {
    return {
      sessions: engineResult.bestCandidate.sessions,
      scheduledHours: engineResult.bestCandidate.scheduledHours,
      totalRequestedHours: engineResult.bestCandidate.totalRequestedHours,
      unscheduledAllocations: engineResult.bestCandidate.unscheduledAllocations,
      conflicts: [],
    };
  }

  return {
    sessions: [],
    scheduledHours: 0,
    totalRequestedHours: allocations.reduce((acc, a) => acc + a.hoursPerWeek, 0),
    unscheduledAllocations: allocations,
    conflicts: engineResult.infeasibilityDiagnostics || [engineResult.statusMessage],
  };
}
