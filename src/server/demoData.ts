// Dummy/sample dataset, seeded into the database on first start (SEED_DEMO_DATA, default on).
// Every record is ordinary data afterwards: coordinators can edit, replace or delete it
// through the app or the Excel master import.
import type { Department, Program, Faculty, Room, StudentSection, SubSection, Course, CourseAllocation, NotificationItem } from '../types';
import type { StudentRecord } from '../lib/initialData';

class SeededPRNG {
  private state: number;
  constructor(seedStr: string = 'TIET-STRESS-1000-500-V1') {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0;
    }
    this.state = Math.abs(hash) || 1337;
  }
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    return (x >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

export function buildDemoDataset() {
  const prng = new SeededPRNG('TIET-STRESS-1000-500-V1');
  // ---------------------------------------------------------------------------
  // 2. Departments & Programs
  // ---------------------------------------------------------------------------
  const DEPARTMENTS: Department[] = [
    { id: 'dept-cse', name: 'Department of Computer Science & Engineering', code: 'CSED', hodName: 'Dr. Rajesh Kumar', contactEmail: 'hod.csed@thapar.edu', status: 'Active' },
    { id: 'dept-ece', name: 'Department of Electronics & Communication Engineering', code: 'ECED', hodName: 'Dr. Alpana Agarwal', contactEmail: 'hod.eced@thapar.edu', status: 'Active' },
    { id: 'dept-med', name: 'Department of Mechanical Engineering', code: 'MED', hodName: 'Dr. S. K. Mohapatra', contactEmail: 'hod.med@thapar.edu', status: 'Active' },
    { id: 'dept-ced', name: 'Department of Civil Engineering', code: 'CED', hodName: 'Dr. Naveen Kwatra', contactEmail: 'hod.ced@thapar.edu', status: 'Active' },
    { id: 'dept-eed', name: 'Department of Electrical & Instrumentation Engineering', code: 'EED', hodName: 'Dr. R. S. Kaler', contactEmail: 'hod.eed@thapar.edu', status: 'Active' },
  ];

  const PROGRAMS: Program[] = [
    { id: 'prog-btech-cse', name: 'B.Tech in Computer Science & Engineering', code: 'BTECH-CSE', departmentId: 'dept-cse', durationYears: 4, totalSemesters: 8, status: 'Active' },
    { id: 'prog-btech-ece', name: 'B.Tech in Electronics & Communication Engineering', code: 'BTECH-ECE', departmentId: 'dept-ece', durationYears: 4, totalSemesters: 8, status: 'Active' },
    { id: 'prog-btech-me', name: 'B.Tech in Mechanical Engineering', code: 'BTECH-ME', departmentId: 'dept-med', durationYears: 4, totalSemesters: 8, status: 'Active' },
    { id: 'prog-btech-ce', name: 'B.Tech in Civil Engineering', code: 'BTECH-CE', departmentId: 'dept-ced', durationYears: 4, totalSemesters: 8, status: 'Active' },
    { id: 'prog-btech-ee', name: 'B.Tech in Electrical Engineering', code: 'BTECH-EE', departmentId: 'dept-eed', durationYears: 4, totalSemesters: 8, status: 'Active' },
  ];

  // ---------------------------------------------------------------------------
  // 3. Faculty Roster (500 Faculty Members)
  // ---------------------------------------------------------------------------
  const firstNames = ['Arvind', 'Rajesh', 'Priya', 'Vikram', 'Ananya', 'Suresh', 'Deepak', 'Neha', 'Kavita', 'Rohan', 'Amit', 'Sunil', 'Pooja', 'Meenakshi', 'Harpreet', 'Gurpreet', 'Manish', 'Sanjay', 'Tarun', 'Shweta'];
  const lastNames = ['Sharma', 'Nair', 'Seth', 'Roy', 'Kapoor', 'Gupta', 'Verma', 'Singh', 'Kaur', 'Chawla', 'Bhasin', 'Malhotra', 'Bhatia', 'Saxena', 'Joshi', 'Aggarwal', 'Bansal', 'Thapar', 'Sodhi', 'Mehta'];
  const designations: ('Professor' | 'Associate Professor' | 'Assistant Professor')[] = ['Professor', 'Associate Professor', 'Assistant Professor'];

  const FACULTY_MEMBERS: Faculty[] = [];
  for (let i = 1; i <= 500; i++) {
    const fName = prng.choice(firstNames);
    const lName = prng.choice(lastNames);
    const dept = prng.choice(DEPARTMENTS);
    const facId = `fac-${String(i).padStart(4, '0')}`;
    const email = i === 1 ? 'a.sharma@thapar.edu' : `faculty.${facId}@thapar.edu`;

    FACULTY_MEMBERS.push({
      id: facId,
      name: i === 1 ? 'Prof. Arvind Sharma' : `Dr. ${fName} ${lName}`,
      employeeId: `EMP-${2000 + i}`,
      email,
      departmentId: dept.id,
      designation: prng.choice(designations),
      subjectsQualified: ['CS301', 'CS302', 'CS303', 'CS304', 'CS305'],
      maxDirectTeachingHours: prng.choice([12, 14, 16]),
      weeklyHoursLimit: 40,
      status: 'Active',
      preferences: {
        preferredDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        preferredPeriods: [1, 2, 3, 4, 6, 7],
        protectedSlots: [],
        maxConsecutivePeriods: 2,
        availableForMakeup: true,
        availableForTutorial: true,
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Physical Infrastructure (50 Classrooms + 30 Labs = 80 Facilities)
  // ---------------------------------------------------------------------------
  const ROOMS: Room[] = [];
  for (let i = 1; i <= 50; i++) {
    ROOMS.push({
      id: `room-cr-${i}`,
      name: `LT-${100 + i}`,
      building: i <= 25 ? 'Academic Block A' : 'Academic Block B',
      floor: Math.ceil(i / 10),
      type: i % 4 === 0 ? 'SeminarRoom' : 'LectureHall',
      capacity: prng.choice([60, 80, 100, 120]),
      equipment: ['Smart Projector', 'Whiteboard', 'Surround Sound'],
      isAvailable: true,
    });
  }
  for (let i = 1; i <= 30; i++) {
    const isComp = i <= 20;
    ROOMS.push({
      id: `room-lab-${i}`,
      name: isComp ? `C-Lab ${200 + i}` : `HW-Lab ${300 + i}`,
      building: 'Computer Centre',
      floor: Math.ceil(i / 10),
      type: isComp ? 'ComputerLab' : 'HardwareLab',
      capacity: prng.choice([30, 40, 50]),
      equipment: isComp ? ['30 Workstations', 'Linux/Windows', 'Gigabit LAN', 'Smart Projector'] : ['Oscilloscopes', 'Breadboards', 'Power Supplies', 'Smart Projector'],
      isAvailable: true,
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Sections (32 Groups) & Subgroups (64 Subgroups) & Students (1,280 Students)
  // ---------------------------------------------------------------------------
  const SECTIONS: StudentSection[] = [];
  const STUDENTS: StudentRecord[] = [];

  const sectionCodes = [
    'CSE-A', 'CSE-B', 'CSE-C', 'CSE-D', 'CSE-E', 'CSE-F', 'CSE-G', 'CSE-H',
    'ECE-A', 'ECE-B', 'ECE-C', 'ECE-D', 'ECE-E', 'ECE-F',
    'ME-A', 'ME-B', 'ME-C', 'ME-D',
    'CE-A', 'CE-B', 'CE-C', 'CE-D',
    'EE-A', 'EE-B', 'EE-C', 'EE-D', 'EE-E', 'EE-F', 'EE-G', 'EE-H', 'EE-I', 'EE-J'
  ];

  let studentCounter = 1;
  sectionCodes.forEach((secName, idx) => {
    const progCode = secName.startsWith('CSE') ? 'BTECH-CSE' :
                     secName.startsWith('ECE') ? 'BTECH-ECE' :
                     secName.startsWith('ME') ? 'BTECH-ME' :
                     secName.startsWith('CE') ? 'BTECH-CE' : 'BTECH-EE';

    const letter = secName.split('-')[1];
    const sub1Name = `${letter}1`;
    const sub2Name = `${letter}2`;

    const secId = `sec-${secName.toLowerCase()}`;
    const sub1Id = `sub-${secName.toLowerCase()}-1`;
    const sub2Id = `sub-${secName.toLowerCase()}-2`;

    const sub1: SubSection = { id: sub1Id, sectionId: secId, name: sub1Name, studentCount: 20, type: 'Lab' };
    const sub2: SubSection = { id: sub2Id, sectionId: secId, name: sub2Name, studentCount: 20, type: 'Lab' };

    SECTIONS.push({
      id: secId,
      name: secName,
      departmentId: progCode === 'BTECH-CSE' ? 'dept-cse' : progCode === 'BTECH-ECE' ? 'dept-ece' : progCode === 'BTECH-ME' ? 'dept-med' : progCode === 'BTECH-CE' ? 'dept-ced' : 'dept-eed',
      program: progCode,
      batchYear: 2024,
      semester: (idx % 8) + 1,
      studentCount: 40,
      targetSize: 40,
      subSections: [sub1, sub2],
      status: 'Active',
      classRepresentative: { name: `CR ${secName}`, email: `cr.${secName.toLowerCase()}@thapar.edu`, studentId: `STU-CR-${secName}` }
    });

    // Generate 40 students per section (20 in sub1, 20 in sub2) -> 32 * 40 = 1,280 Students
    [sub1, sub2].forEach(subObj => {
      for (let s = 1; s <= 20; s++) {
        const idNum = 102300000 + studentCounter;
        const sName = `${prng.choice(firstNames)} ${prng.choice(lastNames)}`;
        STUDENTS.push({
          id: `stu-${idNum}`,
          studentId: String(idNum),
          name: sName,
          email: `student_${idNum}@thapar.edu`,
          programCode: progCode,
          batchYear: 2024,
          semester: (idx % 8) + 1,
          sectionId: secId,
          sectionName: secName,
          subSectionId: subObj.id,
          subSectionName: subObj.name
        });
        studentCounter++;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Course Catalog (80 Accredited Courses)
  // ---------------------------------------------------------------------------
  const COURSES: Course[] = [];
  const courseTopics = [
    'Data Structures', 'Database Management', 'Operating Systems', 'Computer Networks',
    'Digital Electronics', 'Signals & Systems', 'Thermodynamics', 'Fluid Mechanics',
    'Structural Analysis', 'Circuit Theory', 'Software Engineering', 'Machine Learning',
    'Embedded Systems', 'Control Systems', 'Microprocessors', 'Concrete Technology'
  ];

  for (let c = 1; c <= 80; c++) {
    const topic = courseTopics[(c - 1) % courseTopics.length];
    const dept = DEPARTMENTS[(c - 1) % DEPARTMENTS.length];
    const isLabRequired = c % 2 === 0;

    COURSES.push({
      id: `CS${300 + c}`,
      code: `CS${300 + c}`,
      name: `${topic} ${c > 16 ? `Advanced II` : 'I'}`,
      departmentId: dept.id,
      credits: 4,
      requiredLecturesPerWeek: 3,
      requiredTutorialsPerWeek: c % 3 === 0 ? 1 : 0,
      requiredLabsPerWeek: isLabRequired ? 2 : 0,
      totalSemesterHours: 45,
      completedHours: 12,
      cancelledHours: 0,
      requiresLab: isLabRequired,
      requiredEquipment: ['Smart Projector'],
      primaryFacultyId: FACULTY_MEMBERS[(c * 3) % FACULTY_MEMBERS.length].id,
      status: 'Active',
    });
  }

  // ---------------------------------------------------------------------------
  // 7. Course Allocations (288 Teaching Assignments)
  // ---------------------------------------------------------------------------
  const INITIAL_ALLOCATIONS: CourseAllocation[] = [];
  let allocCounter = 1;

  SECTIONS.forEach((sec, sIdx) => {
    // 5 courses per section
    const secCourses = [
      COURSES[(sIdx * 2) % COURSES.length],
      COURSES[(sIdx * 2 + 1) % COURSES.length],
      COURSES[(sIdx * 2 + 2) % COURSES.length],
      COURSES[(sIdx * 2 + 3) % COURSES.length],
      COURSES[(sIdx * 2 + 4) % COURSES.length]
    ];

    secCourses.forEach((crs, cIdx) => {
      const assignedFaculty = FACULTY_MEMBERS[(sIdx * 10 + cIdx * 2) % FACULTY_MEMBERS.length];

      // Lecture Allocation for Whole Group
      INITIAL_ALLOCATIONS.push({
        id: `alloc-${allocCounter++}`,
        courseId: crs.id,
        facultyId: assignedFaculty.id,
        sectionId: sec.id,
        sessionType: 'Lecture',
        hoursPerWeek: 3,
        status: 'Allocated'
      });

      // Lab Allocation for Subgroups
      if (crs.requiresLab && sec.subSections) {
        sec.subSections.forEach((sub, subIdx) => {
          const labFaculty = FACULTY_MEMBERS[(sIdx * 10 + cIdx * 2 + subIdx + 1) % FACULTY_MEMBERS.length];
          INITIAL_ALLOCATIONS.push({
            id: `alloc-${allocCounter++}`,
            courseId: crs.id,
            facultyId: labFaculty.id,
            sectionId: sec.id,
            subSectionId: sub.id,
            sessionType: 'Lab',
            hoursPerWeek: 2,
            status: 'Allocated'
          });
        });
      }
    });
  });

  return {
    departments: DEPARTMENTS,
    programs: PROGRAMS,
    facultyMembers: FACULTY_MEMBERS,
    rooms: ROOMS,
    sections: SECTIONS,
    students: STUDENTS,
    courses: COURSES,
    allocations: INITIAL_ALLOCATIONS,
  };
}

export const DEMO_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-welcome',
    recipientRole: 'Coordinator',
    title: 'Master Academic Dataset Persisted',
    message: 'Dataset TIET-STRESS-1000-500-V1 (1,280 students, 500 faculty, 288 allocations) initialized successfully.',
    type: 'system_alert',
    timestamp: 'Just now',
    read: false,
    category: 'Info'
  }
];

// Sample audit entries loaded on first start (sample content; edit freely).
export const DEMO_AUDIT_EVENTS = [
  { userName: 'Prof. Arvind Sharma', action: 'CLASS_CANCELLED', entityType: 'ClassSession', entityId: 'sess-mon-1', details: 'Cancelled DBMS lecture for CSE-A on Monday 08:00 due to accreditation symposium.' },
  { userName: 'Recovery Engine Outbox', action: 'MAKEUP_TASK_CREATED', entityType: 'MakeupTask', entityId: 'makeup-dbms-01', details: 'Calculated urgency score 96 (Exam in 21 days, syllabus completion 82%).' },
  { userName: 'Cross-Cancellation Engine', action: 'RECOVERY_OPPORTUNITY_FOUND', entityType: 'RecoveryOpportunity', entityId: 'rec-opp-01', details: 'Identified zero-conflict slot on Thursday 11:00-12:00 in Room 204 created by Dr. Gupta OS cancellation.' },
];
