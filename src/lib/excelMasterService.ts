import * as XLSX from 'xlsx';
import {
  Department,
  Program,
  Course,
  Faculty,
  Room,
  StudentSection,
  SubSection,
  CourseAllocation,
  AcademicYearConfig,
  DayOfWeek,
  SessionType
} from '../types';

export interface ExcelImportPreview {
  sheetCounts: {
    departments: number;
    programs: number;
    courses: number;
    faculty: number;
    rooms: number;
    groups: number;
    subgroups: number;
    allocations: number;
    students: number;
  };
  totalRows: number;
  validRows: number;
  warningCount: number;
  errorCount: number;
  warnings: string[];
  errors: string[];
  parsedData: {
    departments: Array<Omit<Department, 'id'> & { code: string; id?: string }>;
    programs: Array<Omit<Program, 'id'> & { code: string; departmentCode: string; id?: string }>;
    courses: Array<Omit<Course, 'id'> & { code: string; departmentCode: string; primaryFacultyEmail?: string; id?: string }>;
    faculty: Array<Omit<Faculty, 'id'> & { email: string; departmentCode: string; id?: string }>;
    rooms: Array<Omit<Room, 'id'> & { name: string; id?: string }>;
    groups: Array<Omit<StudentSection, 'id' | 'subSections'> & { code: string; programCode?: string; id?: string }>;
    subgroups: Array<{ groupCode: string; name: string; studentCount: number; type?: 'Lab' | 'Tutorial' | 'Practical' | 'General' }>;
    allocations: Array<{
      courseCode: string;
      facultyEmail: string;
      groupCode: string;
      subgroupName?: string;
      sessionType: SessionType;
      hoursPerWeek: number;
      roomName?: string;
    }>;
    students: Array<{
      studentId: string;
      name: string;
      email: string;
      programCode?: string;
      batchYear?: number;
      groupCode: string;
      subgroupName?: string;
    }>;
  };
}

/**
 * Generates an official, well-formatted downloadable Excel template for Thapar Timetable Master Setup
 */
export function generateMasterExcelTemplate(currentData?: {
  departments?: Department[];
  programs?: Program[];
  courses?: Course[];
  facultyMembers?: Faculty[];
  rooms?: Room[];
  sections?: StudentSection[];
  allocations?: CourseAllocation[];
}): Blob {
  const wb = XLSX.utils.book_new();

  // 1. README Sheet
  const readmeData = [
    ['THAPAR INSTITUTE OF ENGINEERING & TECHNOLOGY — MASTER TIMETABLE SETUP WORKBOOK'],
    ['Version: 2026.1-Unified'],
    ['Instructions for Academic Coordinators:'],
    ['1. Each worksheet represents one academic data entity.'],
    ['2. Use stable human-readable codes (e.g. CSED, CS501, CSE-A, A1) to connect rows across sheets.'],
    ['3. Do NOT rename sheets or modify column headers in row 1.'],
    ['4. All codes are case-insensitive and trimmed automatically.'],
    ['5. Subgroups belong to Groups (e.g., Group CSE-A has Subgroup A1).'],
    ['6. Save and upload this workbook directly in the Academic Setup > Import Master Data tab.'],
    [],
    ['WORKSHEETS SUMMARY:'],
    ['Sheet Name', 'Purpose', 'Key Identifier'],
    ['Departments', 'Academic Departments (e.g., CSED, ECED)', 'department_code'],
    ['Programs', 'Academic Degrees/Branches (e.g., BTECH-CSE)', 'program_code'],
    ['Courses', 'Curriculum Offerings & Lecture/Lab Hours', 'course_code'],
    ['Faculty', 'Faculty Instructors, Designations & Workload Caps', 'email / faculty_code'],
    ['Rooms', 'Classrooms, Lecture Theatres, & Computer/Hardware Labs', 'room_name / code'],
    ['Groups', 'Batch Cohort Groups (e.g. CSE-A, CSE-B ... CSE-T)', 'group_code'],
    ['Subgroups', 'Lab/Tutorial Small Cohorts (e.g. A1, A2, A3, A4)', 'group_code + subgroup_name'],
    ['Course Allocations', 'Curriculum Teaching Assignments to Groups/Subgroups', 'course_code + faculty + group'],
    ['Students', 'Optional Student Enrollment & Group Assignments', 'student_id']
  ];
  const wsReadme = XLSX.utils.aoa_to_sheet(readmeData);
  XLSX.utils.book_append_sheet(wb, wsReadme, 'README');

  // 2. Departments Sheet
  const deptData = [
    ['department_code', 'department_name', 'hod_name', 'contact_email', 'status']
  ];
  if (currentData?.departments && currentData.departments.length > 0) {
    currentData.departments.forEach(d => {
      deptData.push([d.code, d.name, d.hodName, d.contactEmail, d.status]);
    });
  } else {
    deptData.push(
      ['CSED', 'Computer Science & Engineering', 'Dr. Rajesh Kumar', 'hod.csed@thapar.edu', 'Active'],
      ['ECED', 'Electronics & Communication Engineering', 'Dr. Alpana Agarwal', 'hod.eced@thapar.edu', 'Active'],
      ['MED', 'Mechanical Engineering Department', 'Dr. S. K. Mohapatra', 'hod.med@thapar.edu', 'Active'],
      ['CED', 'Civil Engineering Department', 'Dr. Naveen Kwatra', 'hod.ced@thapar.edu', 'Active']
    );
  }
  const wsDepts = XLSX.utils.aoa_to_sheet(deptData);
  XLSX.utils.book_append_sheet(wb, wsDepts, 'Departments');

  // 3. Programs Sheet
  const progData = [
    ['program_code', 'program_name', 'department_code', 'duration_years', 'total_semesters', 'status']
  ];
  if (currentData?.programs && currentData.programs.length > 0) {
    currentData.programs.forEach(p => {
      const dept = currentData.departments?.find(d => d.id === p.departmentId);
      progData.push([p.code, p.name, dept?.code || 'CSED', String(p.durationYears), String(p.totalSemesters), p.status]);
    });
  } else {
    progData.push(
      ['BTECH-CSE', 'B.Tech Computer Science & Engineering', 'CSED', '4', '8', 'Active'],
      ['BTECH-ECE', 'B.Tech Electronics & Communication', 'ECED', '4', '8', 'Active'],
      ['BTECH-ME', 'B.Tech Mechanical Engineering', 'MED', '4', '8', 'Active']
    );
  }
  const wsProgs = XLSX.utils.aoa_to_sheet(progData);
  XLSX.utils.book_append_sheet(wb, wsProgs, 'Programs');

  // 4. Courses Sheet
  const courseData = [
    ['course_code', 'course_name', 'department_code', 'credits', 'lecture_hours', 'tutorial_hours', 'lab_hours', 'requires_lab', 'primary_faculty_email']
  ];
  if (currentData?.courses && currentData.courses.length > 0) {
    currentData.courses.forEach(c => {
      const dept = currentData.departments?.find(d => d.id === c.departmentId);
      const fac = currentData.facultyMembers?.find(f => f.id === c.primaryFacultyId);
      courseData.push([
        c.code,
        c.name,
        dept?.code || 'CSED',
        String(c.credits),
        String(c.requiredLecturesPerWeek),
        String(c.requiredTutorialsPerWeek),
        String(c.requiredLabsPerWeek),
        c.requiresLab ? 'YES' : 'NO',
        fac?.email || ''
      ]);
    });
  } else {
    courseData.push(
      ['CS501', 'Database Management Systems', 'CSED', '4', '3', '0', '2', 'YES', 'arvind.sharma@thapar.edu'],
      ['CS502', 'Operating Systems Principles', 'CSED', '4', '3', '0', '2', 'YES', 'priya.nair@thapar.edu'],
      ['CS503', 'Theory of Computation', 'CSED', '4', '3', '1', '0', 'NO', 'vikram.seth@thapar.edu'],
      ['CS504', 'Computer Networks & Security', 'CSED', '4', '3', '0', '2', 'YES', 'ananya.roy@thapar.edu'],
      ['CS505', 'Design & Analysis of Algorithms', 'CSED', '4', '3', '1', '0', 'NO', 'arvind.sharma@thapar.edu']
    );
  }
  const wsCourses = XLSX.utils.aoa_to_sheet(courseData);
  XLSX.utils.book_append_sheet(wb, wsCourses, 'Courses');

  // 5. Faculty Sheet
  const facData = [
    ['name', 'email', 'department_code', 'designation', 'max_teaching_hours_per_week', 'status']
  ];
  if (currentData?.facultyMembers && currentData.facultyMembers.length > 0) {
    currentData.facultyMembers.forEach(f => {
      const dept = currentData.departments?.find(d => d.id === f.departmentId);
      facData.push([
        f.name,
        f.email,
        dept?.code || 'CSED',
        f.designation,
        String(f.maxDirectTeachingHours || 14),
        f.status || 'Active'
      ]);
    });
  } else {
    facData.push(
      ['Prof. Arvind Sharma', 'arvind.sharma@thapar.edu', 'CSED', 'Professor', '14', 'Active'],
      ['Dr. Priya Nair', 'priya.nair@thapar.edu', 'CSED', 'Associate Professor', '14', 'Active'],
      ['Dr. Vikram Seth', 'vikram.seth@thapar.edu', 'CSED', 'Assistant Professor', '16', 'Active'],
      ['Dr. Ananya Roy', 'ananya.roy@thapar.edu', 'CSED', 'Assistant Professor', '16', 'Active'],
      ['Dr. Rajesh Kumar', 'rajesh.kumar@thapar.edu', 'CSED', 'Professor', '14', 'Active']
    );
  }
  const wsFac = XLSX.utils.aoa_to_sheet(facData);
  XLSX.utils.book_append_sheet(wb, wsFac, 'Faculty');

  // 6. Rooms Sheet
  const roomData = [
    ['room_name', 'building', 'type', 'capacity', 'equipment', 'status']
  ];
  if (currentData?.rooms && currentData.rooms.length > 0) {
    currentData.rooms.forEach(r => {
      roomData.push([
        r.name,
        r.building,
        r.type,
        String(r.capacity),
        r.equipment.join('; '),
        r.isAvailable ? 'Available' : 'Maintenance'
      ]);
    });
  } else {
    roomData.push(
      ['LT101', 'Academic Block A', 'LectureHall', '80', 'Projector; Smart Board; Audio System', 'Available'],
      ['LT102', 'Academic Block A', 'LectureHall', '80', 'Projector; Smart Board; Audio System', 'Available'],
      ['LT201', 'Academic Block B', 'LectureHall', '120', 'Projector; Tiered Seating; Surround Audio', 'Available'],
      ['C-Lab 301', 'Computer Centre', 'ComputerLab', '60', '60 Workstations; Linux/Windows; Gigabit LAN', 'Available'],
      ['C-Lab 302', 'Computer Centre', 'ComputerLab', '60', '60 Workstations; GPU Nodes; Gigabit LAN', 'Available'],
      ['TR-105', 'Academic Block A', 'TutorialRoom', '35', 'Whiteboard; Display Screen', 'Available']
    );
  }
  const wsRooms = XLSX.utils.aoa_to_sheet(roomData);
  XLSX.utils.book_append_sheet(wb, wsRooms, 'Rooms');

  // 7. Groups Sheet
  const groupData = [
    ['group_code', 'group_name', 'program_code', 'batch_year', 'semester', 'student_count', 'target_size', 'status']
  ];
  if (currentData?.sections && currentData.sections.length > 0) {
    currentData.sections.forEach(s => {
      groupData.push([
        s.name,
        s.name,
        s.program || 'BTECH-CSE',
        String(s.batchYear || 2024),
        String(s.semester || 5),
        String(s.studentCount || 50),
        String(s.targetSize || 50),
        s.status || 'Active'
      ]);
    });
  } else {
    groupData.push(
      ['CSE-A', 'CSE Section A', 'BTECH-CSE', '2024', '5', '50', '50', 'Active'],
      ['CSE-B', 'CSE Section B', 'BTECH-CSE', '2024', '5', '50', '50', 'Active'],
      ['CSE-C', 'CSE Section C', 'BTECH-CSE', '2024', '5', '50', '50', 'Active']
    );
  }
  const wsGroups = XLSX.utils.aoa_to_sheet(groupData);
  XLSX.utils.book_append_sheet(wb, wsGroups, 'Groups');

  // 8. Subgroups Sheet
  const subgroupData = [
    ['group_code', 'subgroup_code', 'subgroup_name', 'student_count', 'type']
  ];
  if (currentData?.sections && currentData.sections.length > 0) {
    currentData.sections.forEach(s => {
      (s.subSections || []).forEach(sub => {
        subgroupData.push([
          s.name,
          sub.name,
          `${s.name}-${sub.name}`,
          String(sub.studentCount || 25),
          sub.type || 'Lab'
        ]);
      });
    });
  } else {
    subgroupData.push(
      ['CSE-A', 'A1', 'CSE-A Lab Batch 1', '25', 'Lab'],
      ['CSE-A', 'A2', 'CSE-A Lab Batch 2', '25', 'Lab'],
      ['CSE-B', 'B1', 'CSE-B Lab Batch 1', '25', 'Lab'],
      ['CSE-B', 'B2', 'CSE-B Lab Batch 2', '25', 'Lab']
    );
  }
  const wsSubgroups = XLSX.utils.aoa_to_sheet(subgroupData);
  XLSX.utils.book_append_sheet(wb, wsSubgroups, 'Subgroups');

  // 9. Course Allocations Sheet
  const allocData = [
    ['course_code', 'faculty_email', 'group_code', 'subgroup_code', 'session_type', 'hours_per_week', 'preferred_room']
  ];
  if (currentData?.allocations && currentData.allocations.length > 0) {
    currentData.allocations.forEach(a => {
      const course = currentData.courses?.find(c => c.id === a.courseId);
      const fac = currentData.facultyMembers?.find(f => f.id === a.facultyId);
      const sec = currentData.sections?.find(s => s.id === a.sectionId);
      const sub = sec?.subSections?.find(sub => sub.id === a.subSectionId);
      const rm = currentData.rooms?.find(r => r.id === a.preferredRoomId);
      allocData.push([
        course?.code || 'CS501',
        fac?.email || '',
        sec?.name || 'CSE-A',
        sub?.name || '',
        a.sessionType,
        String(a.hoursPerWeek),
        rm?.name || ''
      ]);
    });
  } else {
    allocData.push(
      ['CS501', 'arvind.sharma@thapar.edu', 'CSE-A', '', 'Lecture', '3', 'LT101'],
      ['CS501', 'arvind.sharma@thapar.edu', 'CSE-A', 'A1', 'Lab', '2', 'C-Lab 301'],
      ['CS501', 'arvind.sharma@thapar.edu', 'CSE-A', 'A2', 'Lab', '2', 'C-Lab 302'],
      ['CS502', 'priya.nair@thapar.edu', 'CSE-A', '', 'Lecture', '3', 'LT102'],
      ['CS503', 'vikram.seth@thapar.edu', 'CSE-A', '', 'Lecture', '3', 'LT101'],
      ['CS504', 'ananya.roy@thapar.edu', 'CSE-A', '', 'Lecture', '3', 'LT102'],
      ['CS505', 'arvind.sharma@thapar.edu', 'CSE-A', '', 'Lecture', '3', 'LT101']
    );
  }
  const wsAlloc = XLSX.utils.aoa_to_sheet(allocData);
  XLSX.utils.book_append_sheet(wb, wsAlloc, 'Course Allocations');

  // 10. Students Sheet (Optional Enrollment)
  const studentData = [
    ['student_id', 'name', 'email', 'program_code', 'batch_year', 'group_code', 'subgroup_code'],
    ['102303999', 'Rohan Sharma', 'rsharma_be24@thapar.edu', 'BTECH-CSE', '2024', 'CSE-A', 'A1'],
    ['102303102', 'Aarav Gupta', 'agupta_be24@thapar.edu', 'BTECH-CSE', '2024', 'CSE-A', 'A1'],
    ['102303103', 'Sneha Kapoor', 'skapoor_be24@thapar.edu', 'BTECH-CSE', '2024', 'CSE-A', 'A2']
  ];
  const wsStudents = XLSX.utils.aoa_to_sheet(studentData);
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Students');

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Parses and validates an uploaded Excel workbook, generating a clean validation preview
 */
export async function parseAndValidateMasterWorkbook(
  file: File,
  existingState: {
    departments: Department[];
    programs: Program[];
    courses: Course[];
    facultyMembers: Faculty[];
    rooms: Room[];
    sections: StudentSection[];
  }
): Promise<ExcelImportPreview> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const errors: string[] = [];
  const warnings: string[] = [];

  const preview: ExcelImportPreview = {
    sheetCounts: {
      departments: 0,
      programs: 0,
      courses: 0,
      faculty: 0,
      rooms: 0,
      groups: 0,
      subgroups: 0,
      allocations: 0,
      students: 0,
    },
    totalRows: 0,
    validRows: 0,
    warningCount: 0,
    errorCount: 0,
    warnings,
    errors,
    parsedData: {
      departments: [],
      programs: [],
      courses: [],
      faculty: [],
      rooms: [],
      groups: [],
      subgroups: [],
      allocations: [],
      students: [],
    },
  };

  // Helper to extract JSON from sheet safely
  const getSheetRows = (sheetName: string): any[] => {
    const sheet = wb.Sheets[sheetName] || Object.keys(wb.Sheets).find(k => k.trim().toLowerCase() === sheetName.toLowerCase()) ? wb.Sheets[Object.keys(wb.Sheets).find(k => k.trim().toLowerCase() === sheetName.toLowerCase())!] : null;
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  };

  // Maps for cross-validation within workbook and existing database
  const validDeptCodes = new Set(existingState.departments.map(d => d.code.toUpperCase()));
  const validProgCodes = new Set(existingState.programs.map(p => p.code.toUpperCase()));
  const validCourseCodes = new Set(existingState.courses.map(c => c.code.toUpperCase()));
  const validFacultyEmails = new Set(existingState.facultyMembers.map(f => f.email.toLowerCase()));
  const validRoomNames = new Set(existingState.rooms.map(r => r.name.toUpperCase()));
  const validGroupCodes = new Set(existingState.sections.map(s => s.name.toUpperCase()));
  const validSubgroups = new Set<string>(); // "GROUP:SUBGROUP"

  existingState.sections.forEach(s => {
    (s.subSections || []).forEach(sub => {
      validSubgroups.add(`${s.name.toUpperCase()}:${sub.name.toUpperCase()}`);
    });
  });

  // --- 1. DEPARTMENTS ---
  const deptRows = getSheetRows('Departments');
  preview.sheetCounts.departments = deptRows.length;
  deptRows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const code = String(row.department_code || row.code || '').trim().toUpperCase();
    const name = String(row.department_name || row.name || '').trim();
    const hod = String(row.hod_name || row.hod || '').trim();
    const email = String(row.contact_email || row.email || '').trim();
    const status = String(row.status || 'Active').trim() === 'Inactive' ? 'Inactive' : 'Active';

    if (!code || !name) {
      errors.push(`Row ${lineNum} · Departments: Missing department_code or department_name.`);
      return;
    }

    validDeptCodes.add(code);
    preview.parsedData.departments.push({
      code,
      name,
      hodName: hod || 'Department Head',
      contactEmail: email || `contact.${code.toLowerCase()}@thapar.edu`,
      status
    });
  });

  // --- 2. PROGRAMS ---
  const progRows = getSheetRows('Programs');
  preview.sheetCounts.programs = progRows.length;
  progRows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const code = String(row.program_code || row.code || '').trim().toUpperCase();
    const name = String(row.program_name || row.name || '').trim();
    const deptCode = String(row.department_code || '').trim().toUpperCase();
    const duration = parseInt(row.duration_years || '4', 10) || 4;
    const sems = parseInt(row.total_semesters || '8', 10) || 8;

    if (!code || !name) {
      errors.push(`Row ${lineNum} · Programs: Missing program_code or program_name.`);
      return;
    }
    if (deptCode && !validDeptCodes.has(deptCode)) {
      errors.push(`Row ${lineNum} · Programs: Department code "${deptCode}" does not exist in Departments sheet or database.`);
      return;
    }

    validProgCodes.add(code);
    preview.parsedData.programs.push({
      code,
      name,
      departmentId: '', // resolved later
      departmentCode: deptCode || 'CSED',
      durationYears: duration,
      totalSemesters: sems,
      status: 'Active'
    });
  });

  // --- 3. FACULTY ---
  const facRows = getSheetRows('Faculty');
  preview.sheetCounts.faculty = facRows.length;
  facRows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const name = String(row.name || '').trim();
    const email = String(row.email || '').trim().toLowerCase();
    const deptCode = String(row.department_code || '').trim().toUpperCase();
    const designation = String(row.designation || 'Assistant Professor').trim() as any;
    const maxHours = parseInt(row.max_teaching_hours_per_week || row.max_hours || '14', 10) || 14;

    if (!name || !email) {
      errors.push(`Row ${lineNum} · Faculty: Missing faculty name or email.`);
      return;
    }
    if (deptCode && !validDeptCodes.has(deptCode)) {
      warnings.push(`Row ${lineNum} · Faculty: Department "${deptCode}" not found; defaulting to CSED.`);
    }

    validFacultyEmails.add(email);
    preview.parsedData.faculty.push({
      name,
      email,
      departmentId: '',
      departmentCode: deptCode || 'CSED',
      designation: ['Professor', 'Associate Professor', 'Assistant Professor', 'Visiting Faculty'].includes(designation) ? designation : 'Assistant Professor',
      subjectsQualified: [],
      maxDirectTeachingHours: maxHours,
      weeklyHoursLimit: 40,
      preferences: {
        preferredDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        preferredPeriods: [1, 2, 3, 4, 6, 7],
        protectedSlots: [],
        maxConsecutivePeriods: 3,
        availableForMakeup: true,
        availableForTutorial: true,
      },
      status: 'Active'
    });
  });

  // --- 4. ROOMS ---
  const roomRows = getSheetRows('Rooms');
  preview.sheetCounts.rooms = roomRows.length;
  roomRows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const name = String(row.room_name || row.name || '').trim();
    const building = String(row.building || 'Academic Block A').trim();
    const type = String(row.type || 'LectureHall').trim() as any;
    const capacity = parseInt(row.capacity || '60', 10) || 60;
    const equipStr = String(row.equipment || '').trim();

    if (!name) {
      errors.push(`Row ${lineNum} · Rooms: Missing room_name.`);
      return;
    }

    validRoomNames.add(name.toUpperCase());
    preview.parsedData.rooms.push({
      name,
      building,
      floor: 1,
      capacity,
      type: ['LectureHall', 'ComputerLab', 'HardwareLab', 'SeminarRoom', 'TutorialRoom'].includes(type) ? type : 'LectureHall',
      equipment: equipStr ? equipStr.split(/[;,]/).map(s => s.trim()).filter(Boolean) : ['Projector', 'Whiteboard'],
      isAvailable: true
    });
  });

  // --- 5. COURSES ---
  const courseRows = getSheetRows('Courses');
  preview.sheetCounts.courses = courseRows.length;
  courseRows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const code = String(row.course_code || row.code || '').trim().toUpperCase();
    const name = String(row.course_name || row.name || '').trim();
    const deptCode = String(row.department_code || '').trim().toUpperCase();
    const credits = parseInt(row.credits || '4', 10) || 4;
    const lectures = parseInt(row.lecture_hours || '3', 10) || 3;
    const tutorials = parseInt(row.tutorial_hours || '0', 10) || 0;
    const labs = parseInt(row.lab_hours || '0', 10) || 0;
    const reqLab = String(row.requires_lab || '').toUpperCase().startsWith('Y') || labs > 0;
    const facEmail = String(row.primary_faculty_email || '').trim().toLowerCase();

    if (!code || !name) {
      errors.push(`Row ${lineNum} · Courses: Missing course_code or course_name.`);
      return;
    }
    if (deptCode && !validDeptCodes.has(deptCode)) {
      warnings.push(`Row ${lineNum} · Courses: Department "${deptCode}" not found.`);
    }

    validCourseCodes.add(code);
    preview.parsedData.courses.push({
      code,
      name,
      departmentId: '',
      departmentCode: deptCode || 'CSED',
      credits,
      requiredLecturesPerWeek: lectures,
      requiredTutorialsPerWeek: tutorials,
      requiredLabsPerWeek: labs,
      totalSemesterHours: (lectures + tutorials + labs) * 14,
      completedHours: 0,
      cancelledHours: 0,
      requiresLab: reqLab,
      requiredEquipment: reqLab ? ['Workstations', 'LAN'] : ['Projector'],
      primaryFacultyId: '',
      primaryFacultyEmail: facEmail,
      status: 'Active'
    });
  });

  // --- 6. GROUPS ---
  const groupRows = getSheetRows('Groups');
  preview.sheetCounts.groups = groupRows.length;
  groupRows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const code = String(row.group_code || row.name || '').trim().toUpperCase();
    const name = String(row.group_name || code).trim();
    const progCode = String(row.program_code || 'BTECH-CSE').trim().toUpperCase();
    const batch = parseInt(row.batch_year || row.batch || '2024', 10) || 2024;
    const sem = parseInt(row.semester || '5', 10) || 5;
    const count = parseInt(row.student_count || '50', 10) || 50;

    if (!code) {
      errors.push(`Row ${lineNum} · Groups: Missing group_code.`);
      return;
    }

    validGroupCodes.add(code);
    preview.parsedData.groups.push({
      code,
      programCode: progCode,
      name: code,
      departmentId: '',
      program: progCode,
      programId: '',
      semester: sem,
      batchYear: batch,
      studentCount: count,
      targetSize: count,
      maxSize: Math.ceil(count * 1.2),
      status: 'Active',
      classRepresentative: {
        name: 'Assigned CR',
        email: `cr.${code.toLowerCase()}@thapar.edu`,
        studentId: '102303001'
      }
    });
  });

  // --- 7. SUBGROUPS ---
  const subRows = getSheetRows('Subgroups');
  preview.sheetCounts.subgroups = subRows.length;
  subRows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const groupCode = String(row.group_code || '').trim().toUpperCase();
    const subCode = String(row.subgroup_code || row.name || '').trim().toUpperCase();
    const count = parseInt(row.student_count || '25', 10) || 25;
    const type = String(row.type || 'Lab').trim() as any;

    if (!groupCode || !subCode) {
      errors.push(`Row ${lineNum} · Subgroups: Missing group_code or subgroup_code.`);
      return;
    }

    if (!validGroupCodes.has(groupCode)) {
      errors.push(`Row ${lineNum} · Subgroups: Parent group "${groupCode}" does not exist in Groups sheet or database.`);
      return;
    }

    validSubgroups.add(`${groupCode}:${subCode}`);
    preview.parsedData.subgroups.push({
      groupCode,
      name: subCode,
      studentCount: count,
      type: ['Lab', 'Tutorial', 'Practical', 'General'].includes(type) ? type : 'Lab'
    });
  });

  // --- 8. COURSE ALLOCATIONS ---
  const allocRows = getSheetRows('Course Allocations');
  preview.sheetCounts.allocations = allocRows.length;
  allocRows.forEach((row, idx) => {
    const lineNum = idx + 2;
    const cCode = String(row.course_code || '').trim().toUpperCase();
    const fEmail = String(row.faculty_email || '').trim().toLowerCase();
    const gCode = String(row.group_code || '').trim().toUpperCase();
    const subName = String(row.subgroup_code || row.subgroup || '').trim().toUpperCase();
    const sType = String(row.session_type || 'Lecture').trim() as SessionType;
    const hours = parseInt(row.hours_per_week || '3', 10) || 3;
    const roomName = String(row.preferred_room || '').trim();

    if (!cCode || !fEmail || !gCode) {
      errors.push(`Row ${lineNum} · Course Allocations: Missing course_code, faculty_email, or group_code.`);
      return;
    }

    if (!validCourseCodes.has(cCode)) {
      errors.push(`Row ${lineNum} · Course Allocations: Course "${cCode}" was not found.`);
      return;
    }

    if (!validFacultyEmails.has(fEmail)) {
      errors.push(`Row ${lineNum} · Course Allocations: Faculty "${fEmail}" was not found.`);
      return;
    }

    if (!validGroupCodes.has(gCode)) {
      errors.push(`Row ${lineNum} · Course Allocations: Group "${gCode}" was not found.`);
      return;
    }

    if (subName && !validSubgroups.has(`${gCode}:${subName}`)) {
      warnings.push(`Row ${lineNum} · Course Allocations: Subgroup "${subName}" not declared for group "${gCode}". It will be auto-created.`);
      validSubgroups.add(`${gCode}:${subName}`);
      preview.parsedData.subgroups.push({
        groupCode: gCode,
        name: subName,
        studentCount: 25,
        type: sType === 'Lab' ? 'Lab' : 'Tutorial'
      });
    }

    preview.parsedData.allocations.push({
      courseCode: cCode,
      facultyEmail: fEmail,
      groupCode: gCode,
      subgroupName: subName || undefined,
      sessionType: ['Lecture', 'Lab', 'Tutorial', 'Practical', 'Elective', 'Makeup', 'Seminar'].includes(sType) ? sType : 'Lecture',
      hoursPerWeek: hours,
      roomName: roomName || undefined
    });
  });

  // Calculate totals
  const total =
    deptRows.length +
    progRows.length +
    facRows.length +
    roomRows.length +
    courseRows.length +
    groupRows.length +
    subRows.length +
    allocRows.length;

  preview.totalRows = total;
  preview.errorCount = errors.length;
  preview.warningCount = warnings.length;
  preview.validRows = Math.max(0, total - errors.length);

  return preview;
}

export const parseMasterExcelWorkbook = parseAndValidateMasterWorkbook;
