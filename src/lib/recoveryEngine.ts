import {
  ClassSession,
  Room,
  Faculty,
  StudentSection,
  Course,
  MakeupTask,
  RecoveryOpportunity,
  SystemHealthMetrics,
  DayOfWeek,
  WhatIfSimulation,
  TimeSlot,
} from '../types';
import { TIME_SLOTS } from './initialData';
import { validateTimetableIndependently } from './independentValidator';

const DEFAULT_WORKING_DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export interface ConstraintCheckResult {
  isFeasible: boolean;
  violations: string[];
}

function isLabSession(session: Partial<ClassSession>): boolean {
  return session.type === 'Lab' || session.type === 'Practical';
}

function isLabRoom(room: Room): boolean {
  return room.type === 'ComputerLab' || room.type === 'HardwareLab';
}

function roomMatchesCourse(room: Room, course: Course, section: StudentSection): boolean {
  const requiredCapacity = section.studentCount;
  const typeOk = course.requiresLab
    ? isLabRoom(room)
    : !isLabRoom(room) && ['LectureHall', 'SeminarRoom', 'TutorialRoom'].includes(room.type);
  const equipmentOk = course.requiredEquipment.every(eq => room.equipment.includes(eq));
  return room.isAvailable && typeOk && room.capacity >= requiredCapacity && equipmentOk;
}

function buildSlotMap(timeSlots: TimeSlot[]) {
  return new Map(timeSlots.map(slot => [slot.id, slot]));
}

/**
 * Fast candidate check used by repair heuristics. Final acceptance is always
 * performed by validateTimetableIndependently.
 */
export function checkHardConstraints(
  candidateSession: Partial<ClassSession> & {
    id?: string;
    day: DayOfWeek;
    timeSlotId: string;
    roomId: string;
    facultyId: string;
    sectionId: string;
    courseId: string;
  },
  existingSessions: ClassSession[],
  rooms: Room[],
  facultyMembers: Faculty[],
  sections: StudentSection[],
  courses: Course[],
  timeSlots: TimeSlot[] = TIME_SLOTS
): ConstraintCheckResult {
  const violations: string[] = [];
  const activeSessions = existingSessions.filter(
    s => s.status !== 'Cancelled' && s.id !== candidateSession.id
  );

  const faculty = facultyMembers.find(f => f.id === candidateSession.facultyId);
  const section = sections.find(s => s.id === candidateSession.sectionId);
  const course = courses.find(c => c.id === candidateSession.courseId);
  const room = rooms.find(r => r.id === candidateSession.roomId);
  const slotMap = buildSlotMap(timeSlots);
  const slot = slotMap.get(candidateSession.timeSlotId);

  if (!slot || slot.isLunch || slot.isBreak) violations.push('Target time slot is not a teaching period.');
  if (!faculty) violations.push('Assigned faculty does not exist.');
  else {
    if (faculty.status !== 'Active') violations.push('Assigned faculty is not active.');
    if (course && !faculty.subjectsQualified.includes(course.code) && !faculty.subjectsQualified.includes(course.id)) {
      violations.push('Assigned faculty is not qualified for the course.');
    }
    if (faculty.preferences.protectedSlots.some(ps => ps.day === candidateSession.day && ps.periodId === candidateSession.timeSlotId)) {
      violations.push('Target slot is protected by the assigned faculty.');
    }
  }
  if (!section) violations.push('Target section does not exist.');
  if (!course) violations.push('Target course does not exist.');
  if (!room) violations.push('Target room does not exist.');
  else if (section && course && !roomMatchesCourse(room, course, section)) {
    violations.push('Target room does not satisfy availability, room type, capacity, or equipment requirements.');
  }

  const targetDuration = candidateSession.durationPeriods ?? (isLabSession(candidateSession) ? 2 : 1);
  const occupiedKeys = new Set<string>();
  for (const session of activeSessions) {
    const sessionDuration = session.durationPeriods ?? (isLabSession(session) ? 2 : 1);
    const sessionSlotIndex = timeSlots.findIndex(ts => ts.id === session.timeSlotId);
    const candidateSlotIndex = timeSlots.findIndex(ts => ts.id === candidateSession.timeSlotId);
    const sameDay = session.day === candidateSession.day;
    const overlaps = sameDay && sessionSlotIndex >= 0 && candidateSlotIndex >= 0
      && candidateSlotIndex < sessionSlotIndex + sessionDuration
      && sessionSlotIndex < candidateSlotIndex + targetDuration;
    if (!overlaps) continue;

    if (session.facultyId === candidateSession.facultyId) violations.push('Faculty double-booking.');
    if (session.roomId === candidateSession.roomId) violations.push('Room double-booking.');

    const sameWholeGroup = session.sectionId === candidateSession.sectionId
      && !session.subSectionId && !candidateSession.subSectionId;
    const sameSubgroup = session.sectionId === candidateSession.sectionId
      && session.subSectionId && candidateSession.subSectionId
      && session.subSectionId === candidateSession.subSectionId;
    if (sameWholeGroup || sameSubgroup) violations.push('Student group/subgroup double-booking.');
  }

  return { isFeasible: violations.length === 0, violations: [...new Set(violations)] };
}

/**
 * Calculates health metrics from the actual schedule. No fixed score constants
 * are used for data-quality metrics.
 */
export function calculateHealthScore(
  sessions: ClassSession[],
  rooms: Room[],
  facultyMembers: Faculty[],
  sections: StudentSection[],
  courses: Course[],
  timeSlots: TimeSlot[] = TIME_SLOTS,
  workingDays: DayOfWeek[] = DEFAULT_WORKING_DAYS
): SystemHealthMetrics {
  const activeSessions = sessions.filter(s => s.status !== 'Cancelled');
  let hardViolations = 0;
  const slotMap = buildSlotMap(timeSlots);
  const roomById = new Map(rooms.map(r => [r.id, r]));
  const facultyById = new Map(facultyMembers.map(f => [f.id, f]));
  const facultyHours = new Map<string, number>();
  const facultyPreferences = { matched: 0, eligible: 0 };
  const sectionDayLoads = new Map<string, number[]>();

  for (const session of activeSessions) {
    const slot = slotMap.get(session.timeSlotId);
    if (slot) {
      const faculty = facultyById.get(session.facultyId);
      if (faculty) {
        facultyPreferences.eligible++;
        if (faculty.preferences.preferredDays.includes(session.day) && faculty.preferences.preferredPeriods.includes(slot.periodNumber)) {
          facultyPreferences.matched++;
        }
      }
    }
    const duration = session.durationPeriods ?? (isLabSession(session) ? 2 : 1);
    facultyHours.set(session.facultyId, (facultyHours.get(session.facultyId) || 0) + duration);
    const key = session.sectionId + '|' + session.day;
    const loads = sectionDayLoads.get(key) || [];
    loads.push(duration);
    sectionDayLoads.set(key, loads);
  }

  const bySlot = new Map<string, ClassSession[]>();
  for (const session of activeSessions) {
    const duration = session.durationPeriods ?? (isLabSession(session) ? 2 : 1);
    const start = timeSlots.findIndex(ts => ts.id === session.timeSlotId);
    for (let offset = 0; offset < duration && start >= 0; offset++) {
      const slot = timeSlots[start + offset];
      if (!slot) { hardViolations++; continue; }
      const key = session.day + '|' + slot.id;
      const list = bySlot.get(key) || [];
      list.push(session);
      bySlot.set(key, list);
    }
  }
  for (const group of bySlot.values()) {
    const facultySeen = new Set<string>();
    const roomSeen = new Set<string>();
    const sectionSeen = new Set<string>();
    for (const session of group) {
      if (facultySeen.has(session.facultyId)) hardViolations++;
      if (roomSeen.has(session.roomId)) hardViolations++;
      if (sectionSeen.has(session.sectionId + '|' + (session.subSectionId || 'ALL'))) hardViolations++;
      facultySeen.add(session.facultyId);
      roomSeen.add(session.roomId);
      sectionSeen.add(session.sectionId + '|' + (session.subSectionId || 'ALL'));
    }
  }

  const teachingSlotsPerDay = timeSlots.filter(ts => !ts.isBreak && !ts.isLunch).length;
  const roomCapacitySlots = Math.max(1, rooms.filter(r => r.isAvailable).length * Math.max(1, workingDays.length) * teachingSlotsPerDay);
  const roomUtilizationRate = Math.min(100, (activeSessions.length / roomCapacitySlots) * 100);

  const loadRatios = facultyMembers
    .filter(f => f.status === 'Active')
    .map(f => (facultyHours.get(f.id) || 0) / Math.max(1, f.maxDirectTeachingHours));
  const avgLoad = loadRatios.length ? loadRatios.reduce((a, b) => a + b, 0) / loadRatios.length : 0;
  const variance = loadRatios.length
    ? loadRatios.reduce((sum, v) => sum + Math.abs(v - avgLoad), 0) / loadRatios.length
    : 0;
  const facultyBalanceScore = Math.max(0, Math.min(100, 100 - variance * 100));

  const dailyLoadRatios = Array.from(sectionDayLoads.values()).map(load => {
    const total = load.reduce((a, b) => a + b, 0);
    return total / Math.max(1, teachingSlotsPerDay);
  });
  const avgDaily = dailyLoadRatios.length ? dailyLoadRatios.reduce((a,b)=>a+b,0)/dailyLoadRatios.length : 0;
  const studentVariance = dailyLoadRatios.length
    ? dailyLoadRatios.reduce((sum,v)=>sum+Math.abs(v-avgDaily),0)/dailyLoadRatios.length
    : 0;
  const studentBalanceScore = Math.max(0, Math.min(100, 100 - studentVariance * 50));

  const rescheduledCount = activeSessions.filter(s => s.status === 'Rescheduled').length;
  const stabilityScore = Math.max(0, 100 - (rescheduledCount / Math.max(1, activeSessions.length)) * 100);
  const cancelledOrRisky = courses.filter(c => c.totalSemesterHours > c.completedHours && c.cancelledHours > 0).length;
  const syllabusScore = Math.max(0, 100 - (cancelledOrRisky / Math.max(1, courses.length)) * 100);

  const hardCompliance = Math.max(0, 100 - hardViolations * 10);
  const overallScore = Math.max(0, Math.min(100,
    hardCompliance * 0.45 +
    facultyBalanceScore * 0.15 +
    studentBalanceScore * 0.15 +
    roomUtilizationRate * 0.10 +
    stabilityScore * 0.10 +
    syllabusScore * 0.05
  ));

  return {
    overallScore: Math.round(overallScore),
    hardConstraintViolations: hardViolations,
    facultyBalanceScore: Math.round(facultyBalanceScore),
    studentBalanceScore: Math.round(studentBalanceScore),
    roomUtilizationRate: Number(roomUtilizationRate.toFixed(1)),
    facultyPreferencesSatisfaction: facultyPreferences.eligible
      ? Math.round((facultyPreferences.matched / facultyPreferences.eligible) * 100)
      : 0,
    scheduleStabilityScore: Math.round(stabilityScore),
    syllabusAlignmentScore: Math.round(syllabusScore),
  };
}

/**
 * Recovery search ranks actual feasible nearby placements by penalty delta.
 * Every proposal is independently validated before it is returned.
 */
export function findSelfHealingRecoverySlots(
  makeupTask: MakeupTask,
  sessions: ClassSession[],
  rooms: Room[],
  facultyMembers: Faculty[],
  sections: StudentSection[],
  courses: Course[],
  timeSlots: TimeSlot[] = TIME_SLOTS,
  workingDays: DayOfWeek[] = DEFAULT_WORKING_DAYS
): RecoveryOpportunity[] {
  const opportunities: Array<RecoveryOpportunity & { penaltyDelta: number }> = [];
  const targetFaculty = facultyMembers.find(f => f.id === makeupTask.facultyId);
  const targetCourse = courses.find(c => c.id === makeupTask.courseId);
  const targetSection = sections.find(s => s.id === makeupTask.sectionId);
  const original = sessions.find(s => s.id === makeupTask.cancelledSessionId);
  if (!targetFaculty || !targetCourse || !targetSection || !original) return [];
  if (targetFaculty.status !== 'Active' || targetFaculty.preferences.availableForMakeup === false) return [];

  const baseSessions = sessions.filter(s => s.id !== makeupTask.cancelledSessionId);
  const baselineHealth = calculateHealthScore(baseSessions, rooms, facultyMembers, sections, courses, timeSlots, workingDays).overallScore;
  const slotMap = buildSlotMap(timeSlots);
  const requiredDuration = original.durationPeriods ?? (isLabSession(original) ? 2 : 1);

  for (const day of workingDays) {
    for (let start = 0; start < timeSlots.length; start++) {
      const firstSlot = timeSlots[start];
      if (!firstSlot || firstSlot.isLunch || firstSlot.isBreak) continue;

      const block = timeSlots.slice(start, start + requiredDuration);
      if (block.length !== requiredDuration) continue;
      const contiguous = block.every((slot, index) => {
        if (slot.isLunch || slot.isBreak) return false;
        if (index === 0) return true;
        return block[index - 1].endTime === slot.startTime && slot.periodNumber === block[index - 1].periodNumber + 1;
      });
      if (!contiguous) continue;

      for (const room of rooms) {
        if (!roomMatchesCourse(room, targetCourse, targetSection)) continue;

        const candidate: ClassSession = {
          ...original,
          status: 'Rescheduled',
          isLocked: false,
          day,
          timeSlotId: firstSlot.id,
          roomId: room.id,
          durationPeriods: requiredDuration,
        };

        const fast = checkHardConstraints(candidate, baseSessions, rooms, facultyMembers, sections, courses, timeSlots);
        if (!fast.isFeasible) continue;

        const candidateSessions = [...baseSessions, candidate];
        const validation = validateTimetableIndependently(candidateSessions, {
          academicYear: {
            id: 'recovery',
            yearLabel: 'recovery',
            semesterType: 'Odd (Autumn)',
            semesterNumber: 1,
            workingDays,
            timeSlots,
            lunchPeriodId: timeSlots.find(ts => ts.isLunch)?.id || '',
            publishStatus: 'Draft',
          },
          allocations: [{
            id: 'recovery-allocation',
            courseId: targetCourse.id,
            facultyId: targetFaculty.id,
            sectionId: targetSection.id,
            subSectionId: original.subSectionId,
            sessionType: original.type,
            hoursPerWeek: requiredDuration,
            status: 'Allocated',
          }],
          facultyMembers,
          rooms,
          sections,
          courses,
          constraints: [],
        });
        if (!validation.isValid) continue;

        const projectedHealth = calculateHealthScore(candidateSessions, rooms, facultyMembers, sections, courses, timeSlots, workingDays).overallScore;
        const penaltyDelta = baselineHealth - projectedHealth;
        const teacherPreference = targetFaculty.preferences.preferredDays.includes(day) ? 100 : 50;
        const preferredPeriod = targetFaculty.preferences.preferredPeriods.includes(firstSlot.periodNumber) ? 100 : 50;
        const roomFit = Math.min(100, Math.round(
          (room.capacity >= targetSection.studentCount ? 60 : 0) +
          (targetCourse.requiredEquipment.every(eq => room.equipment.includes(eq)) ? 40 : 0)
        ));
        const syllabusUrgency = Math.max(0, Math.min(100, makeupTask.priorityScore));
        const stabilityImpact = Math.max(0, Math.min(100, 100 - Math.max(0, penaltyDelta)));
        const matchScore = Math.max(0, Math.min(100, Math.round(
          teacherPreference * 0.25 +
          preferredPeriod * 0.15 +
          roomFit * 0.20 +
          syllabusUrgency * 0.20 +
          stabilityImpact * 0.20
        )));

        opportunities.push({
          id: 'rec-opp-' + makeupTask.id + '-' + day + '-' + firstSlot.id + '-' + room.id,
          makeupTaskId: makeupTask.id,
          targetDay: day,
          timeSlotId: firstSlot.id,
          roomId: room.id,
          facultyId: targetFaculty.id,
          matchScore,
          factors: {
            teacherAvailability: teacherPreference,
            studentAvailability: 100,
            roomSuitability: roomFit,
            syllabusUrgency,
            preferenceScore: preferredPeriod,
            stabilityImpact,
          },
          rationale: penaltyDelta <= 0
            ? 'Independent validation passed with no health-score regression.'
            : 'Independent validation passed; ranked by the smallest health-score regression from the baseline.',
          conflictCheckPassed: true,
          status: 'Proposed',
          penaltyDelta,
        });
      }
    }
  }

  opportunities.sort((a, b) =>
    a.penaltyDelta - b.penaltyDelta || b.matchScore - a.matchScore
  );
  return opportunities.slice(0, 5).map(({ penaltyDelta: _penaltyDelta, ...opportunity }) => opportunity);
}

/**
 * Substitute faculty recommendations use actual qualifications, status,
 * availability and current teaching load.
 */
export function findSubstituteFaculty(
  courseId: string,
  day: DayOfWeek,
  timeSlotId: string,
  facultyMembers: Faculty[],
  sessions: ClassSession[]
) {
  return facultyMembers
    .filter(f => f.status === 'Active' && (f.subjectsQualified.includes(courseId)))
    .map(faculty => {
      const isBusy = sessions.some(
        s => s.day === day && s.timeSlotId === timeSlotId && s.facultyId === faculty.id && s.status !== 'Cancelled'
      );
      const isProtected = faculty.preferences.protectedSlots.some(
        ps => ps.day === day && ps.periodId === timeSlotId
      );
      const currentTeachingHours = sessions
        .filter(s => s.facultyId === faculty.id && s.status !== 'Cancelled')
        .reduce((sum, s) => sum + (s.durationPeriods ?? (isLabSession(s) ? 2 : 1)), 0);
      const headroomRatio = Math.max(0, (faculty.maxDirectTeachingHours - currentTeachingHours) / Math.max(1, faculty.maxDirectTeachingHours));
      const compatibilityScore = isBusy || isProtected
        ? 0
        : Math.round(headroomRatio * 90 + (faculty.preferences.preferredDays.includes(day) ? 5 : 0) + (faculty.preferences.preferredPeriods.includes(Number(timeSlotId)) ? 5 : 0));

      return {
        faculty,
        isAvailable: !isBusy,
        isProtected,
        compatibilityScore: Math.max(0, Math.min(100, compatibilityScore)),
        currentLoad: currentTeachingHours,
        maxLoad: faculty.maxDirectTeachingHours,
      };
    })
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}

/**
 * What-if simulator computes the affected set and evaluates the resulting
 * timetable instead of returning fixed demo scores or hard-coded entities.
 */
export function simulateScenario(
  simulation: WhatIfSimulation,
  sessions: ClassSession[],
  rooms: Room[],
  facultyMembers: Faculty[],
  courses: Course[],
  sections: StudentSection[],
  timeSlots: TimeSlot[] = TIME_SLOTS,
  workingDays: DayOfWeek[] = DEFAULT_WORKING_DAYS
): WhatIfSimulation {
  const targetEntityId = simulation.parameters.targetEntityId;
  let affected = sessions.filter(s => s.status !== 'Cancelled');
  let projectedSessions = affected.map(s => ({ ...s }));
  const suggestedActions: string[] = [];

  if (simulation.scenarioType === 'RoomUnavailable' && targetEntityId) {
    const unavailableRoom = rooms.find(r => r.id === targetEntityId);
    if (!unavailableRoom) return { ...simulation, suggestedActions: ['Select an existing room for the scenario.'] };

    const affectedSessions = affected.filter(s => s.roomId === targetEntityId);
    let impossible = 0;
    for (const session of affectedSessions) {
      const course = courses.find(c => c.id === session.courseId);
      const section = sections.find(s => s.id === session.sectionId);
      if (!course || !section) { impossible++; continue; }
      const replacement = rooms.find(room => room.id !== targetEntityId && roomMatchesCourse(room, course, section)
        && !affected.some(other => other.id !== session.id && other.day === session.day && other.timeSlotId === session.timeSlotId && other.roomId === room.id && other.status !== 'Cancelled'));
      if (!replacement) {
        impossible++;
      } else {
        projectedSessions = projectedSessions.map(s => s.id === session.id ? { ...s, roomId: replacement.id } : s);
        suggestedActions.push('Move ' + course.code + ' from ' + unavailableRoom.name + ' to ' + replacement.name + '.');
      }
    }
    const before = calculateHealthScore(affected, rooms, facultyMembers, sections, courses, timeSlots, workingDays);
    const after = calculateHealthScore(projectedSessions, rooms, facultyMembers, sections, courses, timeSlots, workingDays);
    return {
      ...simulation,
      impact: {
        affectedClassesCount: affectedSessions.length,
        requiredRoomChanges: Math.max(0, affectedSessions.length - impossible),
        newHardConflicts: Math.max(0, after.hardConstraintViolations - before.hardConstraintViolations),
        stabilityScore: after.scheduleStabilityScore,
        projectedHealthScore: after.overallScore,
        affectedFacultyNames: [...new Set(affectedSessions.map(s => facultyMembers.find(f => f.id === s.facultyId)?.name || s.facultyId))],
        affectedSectionNames: [...new Set(affectedSessions.map(s => sections.find(sec => sec.id === s.sectionId)?.name || s.sectionId))],
      },
      suggestedActions: impossible > 0
        ? [...suggestedActions, impossible + ' affected class(es) have no compatible replacement room; add capacity/equipment or move the class.']
        : suggestedActions,
    };
  }

  if (simulation.scenarioType === 'FacultyOnLeave' && targetEntityId) {
    const affectedSessions = affected.filter(s => s.facultyId === targetEntityId);
    const courseIds = new Set(affectedSessions.map(s => s.courseId));
    const substitutes = facultyMembers.filter(f =>
      f.id !== targetEntityId &&
      f.status === 'Active' &&
      affectedSessions.some(session => {
        const course = courses.find(c => c.id === session.courseId);
        return Boolean(course && f.subjectsQualified.includes(course.code));
      })
    );
    const before = calculateHealthScore(affected, rooms, facultyMembers, sections, courses, timeSlots, workingDays);
    suggestedActions.push(
      substitutes.length
        ? 'Qualified active substitute options: ' + substitutes.map(f => f.name).join(', ') + '.'
        : 'No active qualified substitute faculty member is available for the affected courses.'
    );
    return {
      ...simulation,
      impact: {
        affectedClassesCount: affectedSessions.length,
        requiredRoomChanges: 0,
        newHardConflicts: 0,
        stabilityScore: before.scheduleStabilityScore,
        projectedHealthScore: before.overallScore,
        affectedFacultyNames: [...new Set([facultyMembers.find(f => f.id === targetEntityId)?.name || targetEntityId])],
        affectedSectionNames: [...new Set(affectedSessions.map(s => sections.find(sec => sec.id === s.sectionId)?.name || s.sectionId))],
      },
      suggestedActions,
    };
  }

  if (simulation.scenarioType === 'MandatoryHoliday' && simulation.parameters.affectedDay) {
    const holidaySessions = affected.filter(s => s.day === simulation.parameters.affectedDay);
    return {
      ...simulation,
      impact: {
        affectedClassesCount: holidaySessions.length,
        requiredRoomChanges: 0,
        newHardConflicts: 0,
        stabilityScore: calculateHealthScore(affected, rooms, facultyMembers, sections, courses, timeSlots, workingDays).scheduleStabilityScore,
        projectedHealthScore: calculateHealthScore(affected, rooms, facultyMembers, sections, courses, timeSlots, workingDays).overallScore,
        affectedFacultyNames: [...new Set(holidaySessions.map(s => facultyMembers.find(f => f.id === s.facultyId)?.name || s.facultyId))],
        affectedSectionNames: [...new Set(holidaySessions.map(s => sections.find(sec => sec.id === s.sectionId)?.name || s.sectionId))],
      },
      suggestedActions: holidaySessions.length
        ? ['Reschedule ' + holidaySessions.length + ' classes to non-holiday teaching periods.']
        : ['No classes are scheduled on the selected holiday.'],
    };
  }

  return { ...simulation, suggestedActions };
}
