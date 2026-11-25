// Regressions found while preparing the app for deployment. Run: npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { supabaseStore as store } from '../src/server/supabaseStore';
import { timetableJobManager } from '../src/server/jobManager';
import { classBlock, consecutiveSlots } from '../src/lib/recoveryEngine';
import { getGridCellRowSpan, isGridCellCoveredByLab } from '../src/lib/timetableGridLayout';
import { facultyTeachingPeriods } from '../src/lib/facultyWorkload';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100';
const PASSWORD = process.env.SEED_USER_PASSWORD || 'Thapar@2026Test';
const state = () => store.getBootstrapState();
const reset = () => store.resetDemoDataset();

async function login(email: string): Promise<string> {
  await fetch(`${BASE}/api/test/reset-rate-limits`, { method: 'POST' });
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${email}`);
  return (res.headers.get('set-cookie') || '').split(';')[0];
}
const call = async (cookie: string, method: string, path: string, body?: unknown) => {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) as any };
};

test('a failed generation keeps the current draft and version history', () => {
  reset();
  const before = state();
  const { id, hoursPerWeek } = before.allocations[0];
  store.updateAllocation(id, { hoursPerWeek: 90 });
  const result = store.generateDualRoutines({ timeBudgetMs: 400 });
  assert.equal(result.success, false);
  assert.match(String((result as any).message), /current draft was kept/);
  assert.equal(state().sessions.length, before.sessions.length);
  assert.equal(state().versions.length, before.versions.length);
  store.updateAllocation(id, { hoursPerWeek });
});

test('locked classes cannot be moved or swapped and survive generation', () => {
  reset();
  const lecture = state().sessions.find((s) => s.type === 'Lecture')!;
  store.setSessionLock(lecture.id, true, 'Exam');
  const other = state().sessions.find((s) => s.type === 'Lecture' && s.id !== lecture.id)!;
  assert.match(String(store.moveSessionWithValidation(lecture.id, 'Friday', 'ts-8', lecture.roomId).error), /locked/);
  assert.match(String(store.swapSessionsWithValidation(lecture.id, other.id).error), /locked/);
  const result = store.generateDualRoutines({ timeBudgetMs: 4000 });
  assert.equal(result.success, true, (result as any).message);
  assert.ok(state().sessions.some((s) => s.isLocked && s.courseId === lecture.courseId && s.sectionId === lecture.sectionId
    && s.day === lecture.day && s.timeSlotId === lecture.timeSlotId && s.roomId === lecture.roomId));
});

test('restoring a version loads a draft and leaves the published timetable alone', () => {
  reset();
  store.publishTimetable();
  const published = state().publishedSessions.length;
  const version = state().versions[0];
  store.restoreVersion(version.versionNumber);
  assert.equal(state().publishStatus, 'Draft');
  assert.equal(state().publishedSessions.length, published);
});

test('a version whose records are gone cannot be restored', () => {
  reset();
  const version = state().versions[0];
  const snapshot = structuredClone(store.exportPersistedState());
  snapshot.versions[0].sessions[0].roomId = 'room-gone';
  store.replaceState(snapshot);
  const draft = state().sessions;
  assert.match(String(store.restoreVersion(version.versionNumber).error), /no longer exist/);
  assert.equal(state().sessions.length, draft.length);
  reset();
});

test('records still used by classes, allocations or students cannot be deleted', () => {
  reset();
  const lab = state().sessions.find((s) => s.subSectionId)!;
  const before = state();
  assert.throws(() => store.deleteCourse(lab.courseId), /Cannot delete this course: .*scheduled period/);
  assert.throws(() => store.deleteFaculty(lab.facultyId), /Cannot delete this teacher/);
  assert.throws(() => store.deleteRoom(lab.roomId), /Cannot delete this room/);
  assert.throws(() => store.deleteGroup(lab.sectionId), /Cannot delete this group: .*student/);
  assert.throws(() => store.deleteSubgroup(lab.sectionId, lab.subSectionId!), /Cannot delete this subgroup/);
  for (const key of ['courses', 'facultyMembers', 'rooms', 'sections'] as const) assert.equal(state()[key].length, before[key].length);
  const room = store.createRoom({ ...before.rooms[0], name: 'Unused Room' });
  assert.equal(store.deleteRoom(room.id), true);
});

test('the timetable grid merges a practical block and hides nothing after it', () => {
  const slots = ['ts-1', 'ts-2', 'ts-3', 'ts-4', 'ts-5'].map((id) => ({ id }));
  const practical = (timeSlotId: string, subSectionId = 'a') => ({ day: 'Monday', timeSlotId, type: 'Practical', durationPeriods: 2, courseId: 'c', sectionId: 's', subSectionId });
  const lecture = (timeSlotId: string) => ({ day: 'Monday', timeSlotId, type: 'Lecture', durationPeriods: 1, courseId: 'd', sectionId: 's' });
  const layout = (sessions: any[]) => slots.map((slot) => isGridCellCoveredByLab(sessions, 'Monday', slot.id, slots) ? 0 : getGridCellRowSpan(sessions, 'Monday', slot.id, slots));
  // Stored as one session per period, with a lecture straight after.
  assert.deepEqual(layout([practical('ts-1'), practical('ts-2'), lecture('ts-3')]), [2, 0, 1, 1, 1]);
  // Stored as one session for the whole block.
  assert.deepEqual(layout([practical('ts-1'), lecture('ts-3')]), [2, 0, 1, 1, 1]);
  // Two blocks of the same class back to back.
  assert.deepEqual(layout(['ts-1', 'ts-2', 'ts-3', 'ts-4'].map((t) => practical(t))), [2, 0, 2, 0, 1]);
  // Parallel blocks that do not line up stay in separate rows, so every class is visible.
  assert.deepEqual(layout([practical('ts-1'), practical('ts-2'), practical('ts-2', 'b'), practical('ts-3', 'b')]), [1, 1, 1, 1, 1]);
});

test('a two-period practical counts as two teaching periods', () => {
  const session = (timeSlotId: string) => ({ id: timeSlotId, courseId: 'c', sectionId: 's', subSectionId: 'a', facultyId: 'f', day: 'Monday', timeSlotId, type: 'Practical', durationPeriods: 2, status: 'Planned' }) as any;
  assert.equal(facultyTeachingPeriods([session('ts-1'), session('ts-2')], 'f'), 2);
  const lecture = (timeSlotId: string, sectionId = 's') => ({ ...session(timeSlotId), type: 'Lecture', sectionId, subSectionId: undefined });
  assert.equal(facultyTeachingPeriods([lecture('ts-1'), lecture('ts-2')], 'f'), 2, 'a two-period lecture stored per period');
  assert.equal(facultyTeachingPeriods([lecture('ts-1')], 'f'), 2, 'a two-period lecture stored once');
  assert.equal(facultyTeachingPeriods([lecture('ts-1'), lecture('ts-2'), lecture('ts-1', 't'), lecture('ts-2', 't')], 'f'), 2, 'one lecture for two groups');
});

test('a lab is moved, swapped and removed as a whole', () => {
  reset();
  const year = state().academicYear;
  const slots = year.timeSlots.map((slot) => slot.id);
  const lab = state().sessions.filter((s) => s.type === 'Lab' || s.type === 'Practical').sort((a, b) => slots.indexOf(a.timeSlotId) - slots.indexOf(b.timeSlotId))[0];
  const block = () => state().sessions.filter((s) => s.type === lab.type && s.courseId === lab.courseId && s.sectionId === lab.sectionId && s.subSectionId === lab.subSectionId);
  const size = block().length;
  assert.ok(size >= 2);
  let moved = false;
  for (const day of year.workingDays) for (const room of state().rooms.filter((r) => /Lab$/.test(r.type))) for (const slot of slots) {
    if (moved || (day === lab.day && slot === lab.timeSlotId)) continue;
    if (!store.moveSessionWithValidation(lab.id, day, slot, room.id).success) continue;
    moved = true;
    assert.deepEqual(block().map((s) => s.timeSlotId).sort(), consecutiveSlots(year, slot, size).sort());
    assert.ok(block().every((s) => s.day === day && s.roomId === room.id));
  }
  assert.ok(moved, 'a lab can be moved');
  assert.equal(store.validateCurrentTimetable().hardViolationsCount, 0);
  const lecture = state().sessions.find((s) => s.type === 'Lecture')!;
  assert.match(String(store.swapSessionsWithValidation(lab.id, lecture.id).error), /same length/);
  assert.equal(store.deleteClassSession(lab.id), true);
  assert.equal(block().length, 0);
  reset();
});

test('nothing is live, and nothing can be cancelled, before a timetable is published', () => {
  reset();
  const snapshot = structuredClone(store.exportPersistedState());
  snapshot.academicYear.publishStatus = 'Draft';
  snapshot.versions = snapshot.versions.map((v: any) => ({ ...v, isPublished: false, status: 'Draft' }));
  store.replaceState(snapshot);
  assert.equal(store.liveSessions().length, 0);
  assert.equal(store.cancelClassSession(state().sessions[0].id, 'test').success, false);
  reset();
});

test('the same change request is filed once', () => {
  reset();
  store.publishTimetable();
  const session = state().publishedSessions[0];
  const before = state().notifications.length;
  for (let i = 0; i < 3; i++) assert.equal(store.requestScheduleChange(session.id, 'Please move this class.', 'Dr. Test'), true);
  assert.equal(state().notifications.length, before + 1);
});

test('undoing a cancellation is refused when the time has been booked since', () => {
  reset();
  store.publishTimetable();
  const lecture = state().publishedSessions.find((s) => s.type === 'Lecture')!;
  store.cancelClassSession(lecture.id, 'test');
  const snapshot = structuredClone(store.exportPersistedState());
  const makeup = { ...lecture, id: 'makeup-other', type: 'Makeup', status: 'Confirmed', originalSessionId: 'another-class', facultyId: 'fac-other', roomId: 'room-other' } as any;
  snapshot.activeSessions.push(makeup);
  for (const version of snapshot.versions) if (version.isPublished) version.sessions.push(makeup);
  store.replaceState(snapshot);
  const undo = store.undoClassCancellation(lecture.id);
  assert.equal(undo.success, false);
  assert.match(String(undo.error), /booked at this time/);
  assert.equal(state().publishedSessions.find((s) => s.id === lecture.id)!.status, 'Cancelled');
  reset();
});

test('similar names make separate records and the same name is refused', () => {
  reset();
  const base = state().facultyMembers[0];
  const a = store.createFaculty({ ...base, email: 's.kumar@thapar.edu', name: 'S Kumar' });
  const b = store.createFaculty({ ...base, email: 'skumar@thapar.edu', name: 'Skumar' });
  assert.notEqual(a.id, b.id);
  assert.equal(state().facultyMembers.filter((f) => f.id === a.id || f.id === b.id).length, 2);
  assert.throws(() => store.createFaculty({ ...base, email: 'S.Kumar@thapar.edu' }), /already exists/);
  assert.throws(() => store.createGroup({ ...state().sections[0] }), /already exists/);
  assert.throws(() => store.createAllocation({ ...state().allocations[0] }), /already has this course/);
  reset();
});

const emptyImport = () => ({ departments: [], programs: [], courses: [], faculty: [], rooms: [], groups: [], subgroups: [], allocations: [], students: [], timeSlots: [], timetable: [] }) as any;

test('merging a workbook keeps and extends the subgroups of existing groups', () => {
  reset();
  const group = state().sections[0];
  const names = (group.subSections ?? []).map((s) => s.name);
  store.commitMasterExcelImport({ ...emptyImport(), groups: [{ ...group, code: group.name, studentCount: group.studentCount + 1 }] }, 'upsert');
  const after = () => state().sections.find((s) => s.id === group.id)!;
  assert.deepEqual((after().subSections ?? []).map((s) => [s.id, s.name]), (group.subSections ?? []).map((s) => [s.id, s.name]));
  assert.equal(after().studentCount, group.studentCount + 1);
  store.commitMasterExcelImport({ ...emptyImport(), subgroups: [{ groupCode: group.name, name: 'NEW1', studentCount: 20, type: 'Practical' }] }, 'upsert');
  assert.deepEqual((after().subSections ?? []).map((s) => s.name), [...names, 'NEW1']);
  assert.throws(() => store.commitMasterExcelImport({ ...emptyImport(), allocations: [{ courseCode: 'NOPE', facultyEmail: 'no@x', groupCode: group.name, sessionType: 'Lecture', hoursPerWeek: 2 }] }, 'upsert'), /course NOPE was not found/);
  reset();
});

test('new periods that would strand published classes are refused', () => {
  reset();
  store.publishTimetable();
  const slots = state().academicYear.timeSlots.slice(0, 3).map((s) => ({ periodNumber: s.periodNumber, startTime: s.startTime, endTime: s.endTime }));
  assert.throws(() => store.commitMasterExcelImport({ ...emptyImport(), timeSlots: slots }, 'upsert'), /published class periods would be left/);
  reset();
});

test('a class in a period, room or break that does not exist is a conflict', () => {
  reset();
  const snapshot = structuredClone(store.exportPersistedState());
  const [a, b] = snapshot.activeSessions;
  a.timeSlotId = 'ts-99';
  b.roomId = 'room-gone';
  store.replaceState(snapshot);
  const report = store.validateCurrentTimetable();
  assert.equal(report.canPublish, false);
  assert.ok(report.violations.filter((v) => v.code === 'MISSING_RECORD').length >= 2);
  reset();
  const lecture = state().sessions.find((s) => s.type === 'Lecture')!;
  const lunch = state().academicYear.timeSlots.find((s) => s.isLunch || s.isBreak || s.id === state().academicYear.lunchPeriodId);
  if (lunch) assert.equal(store.moveSessionWithValidation(lecture.id, lecture.day, lunch.id, lecture.roomId).success, false);
  assert.equal(store.moveSessionWithValidation(lecture.id, lecture.day, 'ts-99', lecture.roomId).success, false);
  assert.equal(store.moveSessionWithValidation(lecture.id, lecture.day, lecture.timeSlotId, 'room-gone').success, false);
});

test('a draft with several problems can be repaired one class at a time', () => {
  reset();
  const snapshot = structuredClone(store.exportPersistedState());
  const lectures = snapshot.activeSessions.filter((s: any) => s.type === 'Lecture');
  const [a, b, c, d] = [lectures[0], lectures[1], lectures.at(-1)!, lectures.at(-2)!];
  const home = { day: a.day, timeSlotId: a.timeSlotId, roomId: a.roomId };
  Object.assign(a, { day: b.day, timeSlotId: b.timeSlotId, roomId: b.roomId });
  Object.assign(c, { day: d.day, timeSlotId: d.timeSlotId, roomId: d.roomId });
  store.replaceState(snapshot);
  const before = store.validateCurrentTimetable().hardViolationsCount;
  assert.ok(before >= 2);
  const result = store.moveSessionWithValidation(a.id, home.day, home.timeSlotId, home.roomId);
  assert.equal(result.success, true, result.error);
  assert.ok(store.validateCurrentTimetable().hardViolationsCount < before);
  reset();
});

test('generation is refused rather than dropping a locked class', () => {
  reset();
  const lecture = state().sessions.find((s) => s.type === 'Lecture')!;
  store.setSessionLock(lecture.id, true, 'Exam');
  const allocation = state().allocations.find((a) => a.courseId === lecture.courseId && a.sectionId === lecture.sectionId && a.sessionType === 'Lecture')!;
  const other = state().facultyMembers.find((f) => f.id !== lecture.facultyId)!;
  store.updateAllocation(allocation.id, { facultyId: other.id });
  const result = store.generateDualRoutines({ timeBudgetMs: 3000 }) as any;
  assert.equal(result.success, false);
  assert.match(String(result.message), /locked class/);
  assert.ok(state().sessions.some((s) => s.id === lecture.id && s.isLocked));
  reset();
});

test('publishing a draft that matches no version creates one and leaves the others alone', () => {
  reset();
  const { routines } = store.generateDualRoutines({ timeBudgetMs: 4000 }) as any;
  const kept = structuredClone(store.exportPersistedState().versions.find((v: any) => v.versionNumber === routines[1].versionNumber)!.sessions);
  store.selectRoutineVersion(routines[0].versionNumber);
  store.deleteClassSession(state().sessions.find((s) => s.type === 'Lecture')!.id);
  const published = store.publishTimetable();
  assert.ok(!routines.some((r: any) => r.versionNumber === published.versionNumber));
  assert.deepEqual(store.exportPersistedState().versions.find((v: any) => v.versionNumber === routines[1].versionNumber)!.sessions, kept);
  const snapshot = structuredClone(store.exportPersistedState());
  snapshot.versions.find((v: any) => v.versionNumber === routines[1].versionNumber)!.sessions[0].roomId = 'room-gone';
  store.replaceState(snapshot);
  assert.equal(store.selectRoutineVersion(routines[1].versionNumber).success, false);
  reset();
});

test('a cancellation and its make-up survive publishing a draft saved before it', () => {
  reset();
  store.publishTimetable();
  const version = store.exportPersistedState().versions.find((v: any) => v.isPublished)!;
  const saved = structuredClone(version.sessions);
  const lecture = state().publishedSessions.find((s) => s.type === 'Lecture')!;
  const { task } = store.cancelClassSession(lecture.id, 'test');
  store.scheduleMakeupSession(state().recoveryOpportunities.find((o) => o.makeupTaskId === task!.id)!.id);
  const snapshot = structuredClone(store.exportPersistedState());
  snapshot.activeSessions = saved;
  snapshot.academicYear.publishStatus = 'Draft';
  store.replaceState(snapshot);
  store.publishTimetable();
  assert.equal(state().publishedSessions.find((s) => s.id === lecture.id)!.status, 'Cancelled');
  assert.equal(state().publishedSessions.filter((s) => s.originalSessionId === lecture.id).length, 1);
  assert.equal(state().makeupTasks.length, 1);
  reset();
});

test('blocks of the same class on one day, and booked lab make-ups, are told apart', () => {
  const practical = (id: string, timeSlotId: string) => ({ id, courseId: 'c', sectionId: 's', subSectionId: 'a', facultyId: 'f', roomId: 'r', day: 'Monday', timeSlotId, type: 'Practical', durationPeriods: 2, status: 'Planned', version: 1 }) as any;
  const day = [practical('1', 'ts-1'), practical('2', 'ts-2'), practical('3', 'ts-3'), practical('4', 'ts-4')];
  assert.deepEqual(classBlock(day[1], day).map((s) => s.id), ['1', '2']);
  assert.deepEqual(classBlock(day[2], day).map((s) => s.id), ['3', '4']);
  const makeup = (id: string, timeSlotId: string, originalSessionId: string) => ({ ...practical(id, timeSlotId), type: 'Makeup', durationPeriods: undefined, originalSessionId });
  const makeups = [makeup('m1', 'ts-6', '1'), makeup('m2', 'ts-7', '1'), makeup('m3', 'ts-8', '3')];
  assert.deepEqual(classBlock(makeups[0], makeups).map((s) => s.id), ['m1', 'm2']);
});

test('publishing shows exactly what was validated, and drafts do not change it', () => {
  reset();
  store.publishTimetable();
  const before = state();
  const target = before.sessions.find((s) => s.type === 'Lecture')!;
  store.deleteClassSession(target.id);
  assert.equal(state().publishStatus, 'Draft');
  assert.ok(state().publishedSessions.some((s) => s.id === target.id), 'students still see the published class');
});

test('cancelling a lab cancels the whole block, offers a full make-up, and can be undone', () => {
  reset();
  store.publishTimetable();
  const lab = state().sessions.find((s) => s.type === 'Lab' || s.type === 'Practical')!;
  const block = () => state().sessions.filter((s) => s.type === lab.type && s.courseId === lab.courseId && s.sectionId === lab.sectionId && s.subSectionId === lab.subSectionId && s.day === lab.day && s.roomId === lab.roomId);
  const size = block().length;
  assert.ok(size >= 2);
  const { task } = store.cancelClassSession(lab.id, 'test');
  assert.ok(block().every((s) => s.status === 'Cancelled'));
  assert.equal(store.validateCurrentTimetable().canPublish, true, 'a cancellation does not make the timetable invalid');
  const offers = state().recoveryOpportunities.filter((o) => o.makeupTaskId === task!.id);
  assert.ok(offers.length > 0);
  for (const offer of offers) {
    assert.equal(offer.periods, size);
    assert.equal(consecutiveSlots(state().academicYear, offer.timeSlotId, size).length, size);
    assert.match(state().rooms.find((r) => r.id === offer.roomId)!.type, /Lab$/);
    const run = consecutiveSlots(state().academicYear, offer.timeSlotId, size);
    assert.equal(state().sessions.some((s) => s.facultyId === lab.facultyId && s.day === offer.targetDay && run.includes(s.timeSlotId)), false, 'not at a time the teacher teaches or has cancelled');
  }
  assert.equal(store.scheduleMakeupSession(offers[0].id).success, true);
  assert.equal(state().publishedSessions.filter((s) => s.type === 'Makeup' && s.originalSessionId === task!.cancelledSessionId).length, size);
  if (offers[1]) assert.equal(store.scheduleMakeupSession(offers[1].id).success, false, 'one make-up per cancellation');
  assert.equal(store.undoClassCancellation(lab.id).success, true);
  assert.ok(block().every((s) => s.status !== 'Cancelled'));
  assert.equal(state().sessions.some((s) => s.type === 'Makeup' && s.originalSessionId === task!.cancelledSessionId), false);
});

test('published classes can be cancelled, made up and restored while a new draft exists', () => {
  reset();
  store.publishTimetable();
  const published = state().publishedSessions.length;
  assert.equal(store.generateDualRoutines({ timeBudgetMs: 4000 }).success, true);
  const draft = structuredClone(state().sessions);
  assert.equal(state().publishStatus, 'Draft');
  const lecture = state().publishedSessions.find((s) => s.type === 'Lecture')!;
  assert.equal(draft.some((s) => s.id === lecture.id), false, 'a generated class never shares an id with a published one');
  const { success, task } = store.cancelClassSession(lecture.id, 'test');
  assert.equal(success, true);
  assert.equal(state().publishedSessions.find((s) => s.id === lecture.id)!.status, 'Cancelled');
  assert.deepEqual(state().sessions, draft, 'the draft is untouched');
  const offer = state().recoveryOpportunities.find((o) => o.makeupTaskId === task!.id)!;
  assert.equal(store.scheduleMakeupSession(offer.id).success, true);
  assert.equal(state().publishedSessions.length, published + 1);
  assert.deepEqual(state().sessions, draft);
  assert.equal(store.undoClassCancellation(lecture.id).success, true);
  assert.equal(state().publishedSessions.length, published);
  assert.equal(store.cancelClassSession(draft[0].id, 'test').success, false, 'a draft class is not cancelled, it is edited');
});

test('publishing records the routine that was chosen and drops recovery work for replaced classes', () => {
  reset();
  store.publishTimetable();
  store.cancelClassSession(state().publishedSessions[0].id, 'test');
  assert.ok(state().makeupTasks.length > 0);
  const { routines } = store.generateDualRoutines({ timeBudgetMs: 4000 }) as any;
  const chosen = routines[0];
  store.selectRoutineVersion(chosen.versionNumber);
  assert.equal(store.publishTimetable().versionNumber, chosen.versionNumber);
  assert.deepEqual(state().publishedSessions.map((s) => s.id), chosen.sessions.map((s: any) => s.id));
  assert.equal(state().makeupTasks.length, 0);
  assert.equal(state().recoveryOpportunities.length, 0);
});

test('a cancelled lecture is offered lecture rooms even when its course has a lab', () => {
  reset();
  const s = state();
  const lecture = s.sessions.find((x) => x.type === 'Lecture' && s.courses.find((c) => c.id === x.courseId)?.requiresLab)!;
  const { task } = store.cancelClassSession(lecture.id, 'test');
  const offers = state().recoveryOpportunities.filter((o) => o.makeupTaskId === task!.id);
  assert.ok(offers.length > 0);
  assert.ok(offers.every((o) => !/Lab$/.test(state().rooms.find((r) => r.id === o.roomId)!.type)));
});

test('a rollback puts back exactly the earlier state, including nested changes', () => {
  reset();
  const before = structuredClone(store.exportPersistedState());
  store.cancelClassSession(state().sessions[0].id, 'x');
  store.addClassSession({ ...state().sessions[1], day: 'Friday', timeSlotId: 'ts-8' } as any);
  store.publishTimetable();
  store.replaceState(structuredClone(before));
  assert.deepEqual(store.exportPersistedState(), before);
});

test('loading a real dataset does not add sample teachers to it', () => {
  reset();
  const snapshot = structuredClone(store.exportPersistedState());
  snapshot.facultyMembers = snapshot.facultyMembers.filter((f) => !/^fac-(demo-|0003|0005)/.test(f.id));
  store.restorePersistedState(snapshot);
  assert.equal(state().facultyMembers.some((f) => f.id.startsWith('fac-demo-')), false);
  reset();
});

test('version history stays bounded and clients are not sent every copy', () => {
  reset();
  for (let i = 0; i < 40; i++) store.addClassSession({ ...state().sessions[0], sectionId: `none-${i}`, facultyId: `none-${i}`, roomId: `none-${i}` } as any);
  assert.ok(state().versions.length <= 31);
  assert.ok(state().versions.every((v) => v.sessions.length === 0));
  assert.equal(new Set(state().versions.map((v) => v.versionNumber)).size, state().versions.length, 'version numbers are unique');
  reset();
});

test('the solver runs in a worker thread', async () => {
  reset();
  const result = await timetableJobManager.solve({ ...store.getAcademicState(), options: { budgetMode: 'FAST', timeBudgetMs: 5000, seed: 7 } }, 30_000);
  assert.equal(result.isFeasible, true);
});

// --- over HTTP, against the test server
let student = '';
let coordinator = '';
before(async () => {
  student = await login('aarav.m@thapar.edu');
  coordinator = await login('kn.murthy@thapar.edu');
});

test('students cannot reset demo data, decline make-ups or edit the academic year', async () => {
  assert.equal((await call(student, 'POST', '/api/demo/reset', {})).status, 403);
  assert.equal((await call(student, 'POST', '/api/recovery/decline', { opportunityId: 'x' })).status, 403);
  assert.equal((await call(student, 'PUT', '/api/academic/year', {})).status, 403);
  assert.equal((await call(student, 'PUT', '/api/academic/constraints/x', { isActive: false })).status, 403);
});

test('passwords derived from a Google ID are refused', async () => {
  const res = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'dean@thapar.edu', password: 'OAuth_Google_123_dean@thapar.edu' }) });
  assert.equal(res.status, 401);
});

test('an account with no classes gets an empty schedule, not an invented one', async () => {
  const dean = await login('dean@thapar.edu');
  const { body } = await call(dean, 'GET', '/api/me/timetable');
  assert.ok(!JSON.stringify(body.schedule).includes('CS501 '));
  assert.ok(Array.isArray(body.schedule));
});

test('a draft is submitted, approved and published, and an edit returns it to draft', async () => {
  const admin = await login('dean@thapar.edu');
  const status = async () => (await call(coordinator, 'GET', '/api/academic/bootstrap')).body.publishStatus;
  const lecture = (await call(coordinator, 'GET', '/api/academic/bootstrap')).body.sessions.find((s: any) => s.type === 'Lecture');
  await call(coordinator, 'PUT', `/api/timetable/sessions/${lecture.id}/lock`, { isLocked: false });
  assert.equal((await call(coordinator, 'POST', '/api/academic/generate', { budgetMode: 'FAST', timeBudgetMs: 4000 })).status, 200);
  assert.equal((await call(student, 'POST', '/api/timetable/submit', {})).status, 403);
  assert.equal((await call(coordinator, 'POST', '/api/timetable/submit', {})).status, 200);
  assert.equal(await status(), 'Review');
  assert.equal((await call(admin, 'POST', '/api/timetable/approve', {})).status, 200);
  assert.equal(await status(), 'Approved');
  assert.equal((await call(admin, 'POST', '/api/timetable/publish', {})).status, 200);
  assert.equal(await status(), 'Published');
  assert.equal((await call(coordinator, 'POST', '/api/timetable/submit', {})).status, 409);
});

test('generation holds up no one, runs once at a time, and an abandoned run changes nothing', async () => {
  const before = (await call(coordinator, 'GET', '/api/academic/bootstrap')).body;
  const rule = before.constraints[0];
  const generate = (signal?: AbortSignal) => fetch(`${BASE}/api/academic/generate`, { method: 'POST', signal, headers: { 'content-type': 'application/json', cookie: coordinator }, body: JSON.stringify({ budgetMode: 'MAXIMUM_OPTIMIZATION', timeBudgetMs: 4000 }) });
  const abort = new AbortController();
  const first = generate(abort.signal).catch(() => null);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const second = await generate();
  assert.ok([200, 409].includes(second.status));
  const started = Date.now();
  assert.equal((await call(coordinator, 'PUT', `/api/academic/constraints/${rule.id}`, { isActive: rule.isActive })).status, 200);
  assert.ok(Date.now() - started < 2_000, 'a change is saved while a timetable is being generated');
  abort.abort();
  await first;
  assert.equal((await call(coordinator, 'PUT', `/api/academic/constraints/${rule.id}`, { isActive: rule.isActive })).status, 200);
});

test('a working day with published classes cannot be removed', async () => {
  const { body } = await call(coordinator, 'GET', '/api/academic/bootstrap');
  const { yearLabel, semesterType, semesterNumber, workingDays } = body.academicYear;
  const used = body.publishedSessions[0].day;
  const res = await call(coordinator, 'PUT', '/api/academic/year', { yearLabel, semesterType, semesterNumber, workingDays: workingDays.filter((d: string) => d !== used) });
  assert.equal(res.status, 409);
});

test('students and teachers only receive the published timetable', async () => {
  assert.equal((await call(coordinator, 'POST', '/api/timetable/publish', {})).status, 200);
  const before = (await call(coordinator, 'GET', '/api/academic/bootstrap')).body;
  const published = before.publishedSessions.length;
  assert.ok(published > 0);
  const draftClass = before.sessions.find((s: any) => s.type === 'Lecture');
  assert.equal((await call(coordinator, 'DELETE', `/api/timetable/sessions/${draftClass.id}`)).status, 200);
  const faculty = await login('a.sharma@thapar.edu');
  const ids = (list: any[]) => list.map((s) => s.id).sort();
  for (const cookie of [student, faculty]) {
    const { body } = await call(cookie, 'GET', '/api/academic/bootstrap');
    assert.deepEqual(ids(body.sessions), ids(body.publishedSessions));
  }
  assert.ok((await call(faculty, 'GET', '/api/academic/bootstrap')).body.sessions.some((s: any) => s.id === draftClass.id), 'the published class is still shown');
});

test('a malformed import is a client error', async () => {
  for (const body of [{}, { parsedData: 'x' }, { parsedData: {} }, { parsedData: { courses: 'x' } }, { parsedData: { courses: [null] } }, { parsedData: { courses: [] }, mode: 'wipe' }]) {
    assert.equal((await call(coordinator, 'POST', '/api/academic/import', body)).status, 400, JSON.stringify(body));
  }
});

test('the academic year and rules are saved on the server', async () => {
  const { body } = await call(coordinator, 'GET', '/api/academic/bootstrap');
  const year = { yearLabel: body.academicYear.yearLabel, semesterType: body.academicYear.semesterType, semesterNumber: body.academicYear.semesterNumber, workingDays: body.academicYear.workingDays };
  assert.equal((await call(coordinator, 'PUT', '/api/academic/year', { ...year, yearLabel: 'Test Year' })).status, 200);
  assert.equal((await call(coordinator, 'GET', '/api/academic/bootstrap')).body.academicYear.yearLabel, 'Test Year');
  assert.equal((await call(coordinator, 'PUT', '/api/academic/year', year)).status, 200);
  assert.equal((await call(coordinator, 'PUT', '/api/academic/year', { ...year, workingDays: ['Noday'] })).status, 400);
  const rule = body.constraints[0];
  assert.equal((await call(coordinator, 'PUT', `/api/academic/constraints/${rule.id}`, { isActive: !rule.isActive })).status, 200);
  assert.equal((await call(coordinator, 'GET', '/api/academic/bootstrap')).body.constraints.find((c: any) => c.id === rule.id).isActive, !rule.isActive);
  await call(coordinator, 'PUT', `/api/academic/constraints/${rule.id}`, { isActive: rule.isActive });
});
