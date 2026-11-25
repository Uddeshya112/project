// Importing daily periods, fixed class times and students. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseAndValidateMasterWorkbook, type ExcelImportPreview } from '../src/lib/excelMasterService';
import { validateTimetableIndependently } from '../src/lib/independentValidator';
import { facultyTeachingPeriods } from '../src/lib/facultyWorkload';
import { INITIAL_ACADEMIC_YEAR } from '../src/lib/initialData';
import { supabaseStore, ImportValidationError } from '../src/server/supabaseStore';

type Rows = (string | number)[][];
const PERIODS = ['08:00', '08:50', '09:40', '10:30', '11:20', '12:10', '13:00', '13:50', '14:40', '15:30', '16:20', '17:10', '18:00', '18:50', '19:40'];
const fourteenPeriods = (lunch = 0): Rows => [
  ['period_no', 'start', 'end', 'is_lunch'],
  ...PERIODS.slice(0, 14).map((start, i) => [i + 1, start, PERIODS[i + 1], i + 1 === lunch ? 'YES' : '']),
];
const TIMETABLE: Rows = [
  ['day', 'period_no', 'periods', 'course_code', 'session_type', 'group_code', 'subgroup_code', 'faculty_email', 'room_name'],
  ['Monday', 1, 1, 'UCS503', 'Lecture', '3C2', '', 'asb@example.edu', 'LT402'],
  ['Tuesday', 2, 1, 'UCS503', 'Lecture', '3C2', '', 'asb@example.edu', 'LT402'],
  ['Wednesday', 5, 2, 'UCS503', 'Practical', '3C2', '3C21', 'anp@example.edu', 'L104'],
  ['Thursday', 12, 2, 'UCS503', 'Practical', '3C2', '3C22', 'anp@example.edu', 'L104'],
];
const student = (n: number): (string | number)[] => [`SYN-${n}`, `Student ${n}`, `syn.${n}@example.edu`, 'BTECH-COE', 2024, '3C2', n % 2 ? '3C21' : '3C22'];

function workbook(overrides: Record<string, Rows | null> = {}): File {
  const sheets: Record<string, Rows | null> = {
    Departments: [['department_code', 'department_name'], ['CSED', 'Computer Science']],
    Programs: [['program_code', 'program_name', 'department_code'], ['BTECH-COE', 'B.Tech COE', 'CSED']],
    Courses: [['course_code', 'course_name', 'department_code', 'credits', 'lecture_hours', 'tutorial_hours', 'lab_hours', 'requires_lab'], ['UCS503', 'Software Engineering', 'CSED', 3, 2, 0, 2, 'YES']],
    Faculty: [['name', 'email', 'department_code', 'designation'], ['A', 'asb@example.edu', 'CSED', 'Assistant Professor'], ['B', 'anp@example.edu', 'CSED', 'Assistant Professor']],
    Rooms: [['room_name', 'type', 'capacity'], ['LT402', 'LectureHall', 250], ['L104', 'ComputerLab', 30]],
    Groups: [['group_code', 'program_code', 'batch_year', 'semester', 'student_count'], ['3C2', 'BTECH-COE', 2024, 5, 60]],
    Subgroups: [['group_code', 'subgroup_code', 'student_count', 'type'], ['3C2', '3C21', 30, 'Lab'], ['3C2', '3C22', 30, 'Lab']],
    'Course Allocations': [
      ['course_code', 'faculty_email', 'group_code', 'subgroup_code', 'session_type', 'hours_per_week', 'preferred_room'],
      ['UCS503', 'asb@example.edu', '3C2', '', 'Lecture', 2, 'LT402'],
      ['UCS503', 'anp@example.edu', '3C2', '3C21', 'Practical', 2, 'L104'],
      ['UCS503', 'anp@example.edu', '3C2', '3C22', 'Practical', 2, 'L104'],
    ],
    Students: [['student_id', 'name', 'email', 'program_code', 'batch_year', 'group_code', 'subgroup_code'], ...Array.from({ length: 150 }, (_, i) => student(i + 1))],
    TimeSlots: fourteenPeriods(),
    Timetable: TIMETABLE,
    ...overrides,
  };
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) if (rows) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  const bytes: ArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return { arrayBuffer: async () => bytes } as unknown as File;
}
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const;
const parse = (overrides: Record<string, Rows | null> = {}, timeSlots: any[] = []) =>
  parseAndValidateMasterWorkbook(workbook(overrides), {
    departments: [], programs: [], courses: [], facultyMembers: [], rooms: [], sections: [],
    academicYear: { workingDays: [...WEEKDAYS], timeSlots },
  });
const importOk = async (overrides: Record<string, Rows | null> = {}): Promise<ExcelImportPreview> => {
  const preview = await parse(overrides);
  assert.deepEqual(preview.errors, []);
  supabaseStore.commitMasterExcelImport(preview.parsedData, 'replace', 'tester');
  return preview;
};

test('the workbook sets the periods, class times and students, and the draft has no conflicts', async () => {
  const preview = await importOk();
  assert.deepEqual(preview.warnings, []);
  const state = supabaseStore.getBootstrapState();
  assert.deepEqual(state.academicYear.timeSlots.map((slot: any) => slot.startTime), PERIODS.slice(0, 14));
  assert.equal(state.academicYear.lunchPeriodId, '');
  assert.equal(state.publishStatus, 'Draft', 'imported classes are a draft, not published');
  const times = state.sessions.map((s: any) => `${s.day} ${s.timeSlotId} ${s.type}`).sort();
  assert.deepEqual(times, [
    'Monday ts-1 Lecture', 'Thursday ts-12 Practical', 'Thursday ts-13 Practical',
    'Tuesday ts-2 Lecture', 'Wednesday ts-5 Practical', 'Wednesday ts-6 Practical',
  ]);
  assert.ok(state.sessions.every((s: any) => s.allocationId));
  const report = supabaseStore.validateCurrentTimetable();
  assert.equal(report.hardViolationsCount, 0, JSON.stringify(report.violations.filter((v) => v.severity === 'CRITICAL')));
  assert.equal(report.canPublish, true);
  assert.equal(state.versions[0].versionLabel.startsWith('Imported V'), true);
});

test('replace swaps the student roster, and every student can be found, not only the first 100', async () => {
  await importOk();
  assert.equal(supabaseStore.queryStudents(1, 20).total, 150);
  const late = supabaseStore.findStudentByEmail('SYN.150@example.edu');
  assert.equal(late?.sectionName, '3C2');
  assert.equal(late?.subSectionName, '3C22');
  assert.equal(supabaseStore.findStudentByEmail('student.demo@demo.thapar.local'), undefined);
});

test('importing again updates students by roll number instead of adding them twice', async () => {
  await importOk();
  const preview = await parse({ Students: [['student_id', 'name', 'email', 'group_code', 'subgroup_code'], ['syn-7', 'Renamed', 'syn.7@example.edu', '3C2', '3C22']] });
  supabaseStore.commitMasterExcelImport(preview.parsedData, 'upsert', 'tester');
  assert.equal(supabaseStore.queryStudents(1, 20).total, 150);
  assert.equal(supabaseStore.findStudentByEmail('syn.7@example.edu')?.name, 'Renamed');
});

test('lunch follows the imported periods instead of always being period 5', async () => {
  await importOk();
  const state = supabaseStore.getAcademicState();
  const lab = supabaseStore.getBootstrapState().sessions.filter((s: any) => s.day === 'Wednesday');
  const check = (academicYear: any) => validateTimetableIndependently(lab, { ...state, academicYear }).violations.filter((v) => v.code === 'LAB_DURATION_VIOLATION' || v.code === 'BREAK_PERIOD_VIOLATION').length;
  assert.equal(check(state.academicYear), 0);
  assert.ok(check({ ...state.academicYear, lunchPeriodId: 'ts-6' }) > 0, 'a configured lunch is still protected');
  const lunch = await parse({ TimeSlots: fourteenPeriods(6) });
  assert.match(lunch.errors.join('\n'), /period 6 is a break/);
});

test('bad periods and class rows are reported and block the import', async () => {
  const bad = await parse({
    TimeSlots: [['period_no', 'start', 'end'], [1, '08:00', '08:50'], [1, '09:00', '09:50'], [2, '10:00', '09:00'], [3, '08:30', '09:30']],
    Timetable: [TIMETABLE[0], ['Sunday', 1, 1, 'UCS503', 'Lecture', '3C2', '', 'asb@example.edu', 'LT402'], ['Monday', 99, 1, 'UCS503', 'Lecture', '3C2', '', 'asb@example.edu', 'LT402'], ['Monday', 1, 1, 'UCS503', 'Lecture', '3C2', '', 'asb@example.edu', 'NOPE'], ['Monday', 1, 1, 'UCS503', 'Lecture', '3C2', '3C29', 'asb@example.edu', 'LT402']],
  });
  const text = bad.errors.join('\n');
  for (const expected of [/appears more than once/, /start must be before end/, /starts before period/, /not a day of the week/, /period 99 does not exist/, /Room "NOPE" was not found/, /Subgroup "3C29" was not found/]) assert.match(text, expected);
});

test('a lab block counts once toward teaching hours, however it is stored', async () => {
  await importOk();
  const state = supabaseStore.getBootstrapState();
  const anp = state.facultyMembers.find((f: any) => f.email === 'anp@example.edu')!;
  const labs = state.sessions.filter((s: any) => s.facultyId === anp.id);
  assert.equal(labs.length, 4, 'two 2-period labs, one session per period');
  assert.ok(labs.every((s: any) => s.durationPeriods === 2));
  assert.equal(facultyTeachingPeriods(state.sessions, anp.id), 4);
  const single = labs.filter((s: any) => s.timeSlotId === 'ts-5' || s.timeSlotId === 'ts-12');
  assert.equal(facultyTeachingPeriods(single, anp.id), 4, 'one session per block');
  assert.equal(facultyTeachingPeriods(labs.map((s: any) => ({ ...s, status: 'Cancelled' })), anp.id), 0);
});

test('resetting the demo data restores the sample periods', async () => {
  await importOk();
  supabaseStore.resetDemoDataset();
  const year = supabaseStore.getBootstrapState().academicYear;
  assert.deepEqual(year.timeSlots, INITIAL_ACADEMIC_YEAR.timeSlots);
  assert.equal(year.lunchPeriodId, INITIAL_ACADEMIC_YEAR.lunchPeriodId);
});

test('the server rejects an inconsistent payload and changes nothing', async () => {
  await importOk();
  const before = JSON.stringify(supabaseStore.exportPersistedState());
  const { parsedData } = await parse();
  const broken = structuredClone(parsedData);
  broken.timetable[0].roomName = 'NOPE';
  broken.students[0].groupCode = 'MISSING';
  broken.timetable[1].periodNumber = 14;
  broken.timetable[1].periods = 2;
  for (const mode of ['replace', 'upsert'] as const) {
    assert.throws(() => supabaseStore.commitMasterExcelImport(broken, mode, 'tester'), (err: unknown) =>
      err instanceof ImportValidationError && /NOPE/.test(err.message) && /Students row 2/.test(err.message) && /period 15/.test(err.message));
  }
  assert.equal(JSON.stringify(supabaseStore.exportPersistedState()), before);
});

test('a workbook without the new sheets keeps the current periods and timetable', async () => {
  await importOk();
  const before = supabaseStore.getBootstrapState();
  const preview = await parse({ TimeSlots: null, Timetable: null, Students: null });
  assert.deepEqual(preview.errors, []);
  supabaseStore.commitMasterExcelImport(preview.parsedData, 'upsert', 'tester');
  const after = supabaseStore.getBootstrapState();
  assert.deepEqual(after.academicYear.timeSlots, before.academicYear.timeSlots);
  assert.deepEqual(after.sessions, before.sessions);
  assert.equal(supabaseStore.queryStudents(1, 20).total, 150);
});
