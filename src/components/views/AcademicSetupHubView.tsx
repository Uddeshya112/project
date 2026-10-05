import React, { useState } from 'react';
import { useTimetable } from '../../context/TimetableContext';
import {
  CalendarDays,
  Building2,
  GraduationCap,
  BookOpen,
  UserSquare2,
  DoorOpen,
  Users,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Plus,
  Trash2,
  Search,
  Check,
  Play,
  Eye,
  Upload,
  AlertCircle,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { DayOfWeek, SessionType } from '../../types';
import { MasterExcelHub } from './academic-setup/MasterExcelHub';
import { GroupsAndSubgroupsTab } from './academic-setup/GroupsAndSubgroupsTab';
import { CourseAllocationsTab } from './academic-setup/CourseAllocationsTab';
import { AcademicSetupOverview } from './academic-setup/AcademicSetupOverview';
import { generateMasterExcelTemplate } from '../../lib/excelMasterService';

export type SetupSubTab =
  | 'master_excel'
  | 'overview'
  | 'academic_year'
  | 'departments'
  | 'programs'
  | 'courses'
  | 'faculty'
  | 'rooms'
  | 'sections'
  | 'allocations'
  | 'constraints'
  | 'validation'
  | 'generator'
  | 'review'
  | 'bulk_import';

export function AcademicSetupHubView() {
  const {
    activeView,
    academicYear,
    updateAcademicYear,
    departments,
    addDepartment,
    deleteDepartment,
    toggleDepartmentStatus,
    programs,
    addProgram,
    deleteProgram,
    rooms,
    addRoom,
    deleteRoom,
    toggleRoomAvailability,
    facultyMembers,
    addFaculty,
    deleteFaculty,
    toggleFacultyStatus,
    sections,
    addSection,
    deleteSection,
    courses,
    addCourse,
    deleteCourse,
    allocations,
    addAllocation,
    deleteAllocation,
    constraints,
    toggleConstraint,
    validationReport,
    runValidation,
    generateDraftTimetable,
    publishStatus,
    updatePublishStatus,
    bulkImportData,
    sessions,
    selectedSectionId,
    setSelectedSectionId,
    selectedFacultyId,
    setSelectedFacultyId,
    selectedRoomId,
    setSelectedRoomId,
  } = useTimetable();

  const [activeTab, setActiveTab] = useState<SetupSubTab>('courses');

  React.useEffect(() => {
    if (activeView === 'academic_year') setActiveTab('academic_year');
    else if (activeView === 'departments') setActiveTab('departments');
    else if (activeView === 'courses_mgmt') setActiveTab('courses');
    else if (activeView === 'faculty_mgmt') setActiveTab('faculty');
    else if (activeView === 'rooms_mgmt') setActiveTab('rooms');
    else if (activeView === 'sections_mgmt') setActiveTab('sections');
    else if (activeView === 'allocations') setActiveTab('allocations');
    else if (activeView === 'availability') setActiveTab('constraints');
    else if (activeView === 'academic_setup') setActiveTab('courses');
  }, [activeView]);
  const [courseSearch, setCourseSearch] = useState('');
  const [facultySearch, setFacultySearch] = useState('');
  const [roomFilter, setRoomFilter] = useState<string>('ALL');

  // Generation status state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<{
    isSuccess: boolean;
    sessionsGenerated: number;
    conflicts: string[];
    scheduledHours: number;
    totalHours: number;
  } | null>(null);

  // Review View Angle
  const [reviewAngle, setReviewAngle] = useState<'section' | 'faculty' | 'room'>('section');
  const [reviewDay, setReviewDay] = useState<DayOfWeek>('Monday');

  // Form states
  const [showAddDept, setShowAddDept] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', code: '', hodName: '', contactEmail: '', status: 'Active' as const });

  const [showAddProg, setShowAddProg] = useState(false);
  const [progForm, setProgForm] = useState({ name: '', code: '', departmentId: departments[0]?.id || 'dept-cse', durationYears: 4, totalSemesters: 8, status: 'Active' as const });

  const [showAddCourse, setShowAddCourse] = useState(false);
  const [courseForm, setCourseForm] = useState({
    code: '',
    name: '',
    departmentId: departments[0]?.id || 'dept-cse',
    credits: 4,
    requiredLecturesPerWeek: 3,
    requiredTutorialsPerWeek: 1,
    requiredLabsPerWeek: 0,
    totalSemesterHours: 45,
    completedHours: 0,
    cancelledHours: 0,
    requiresLab: false,
    requiredEquipment: ['Smart Projector'],
    primaryFacultyId: facultyMembers[0]?.id || '',
    status: 'Active' as const,
  });

  const [showAddFaculty, setShowAddFaculty] = useState(false);
  const [facultyForm, setFacultyForm] = useState({
    name: '',
    employeeId: '',
    email: '',
    departmentId: departments[0]?.id || 'dept-cse',
    designation: 'Assistant Professor' as const,
    subjectsQualified: [] as string[],
    maxDirectTeachingHours: 14,
    weeklyHoursLimit: 40,
    status: 'Active' as const,
    preferences: {
      preferredDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as DayOfWeek[],
      preferredPeriods: [1, 2, 3, 4],
      protectedSlots: [],
      maxConsecutivePeriods: 2,
      availableForMakeup: true,
      availableForTutorial: true,
    },
  });

  const [showAddRoom, setShowAddRoom] = useState(false);
  const [roomForm, setRoomForm] = useState({
    name: '',
    building: 'Turing Block',
    floor: 2,
    capacity: 60,
    type: 'LectureHall' as const,
    equipment: ['Smart Projector', 'Whiteboard'],
    isAvailable: true,
  });

  const [showAddSection, setShowAddSection] = useState(false);
  const [sectionForm, setSectionForm] = useState({
    name: '',
    departmentId: departments[0]?.id || 'dept-cse',
    program: 'B.Tech Computer Science & Engineering',
    semester: 5,
    batchYear: 2024,
    studentCount: 50,
    classRepresentative: { name: '', email: '', studentId: '' },
  });

  const [showAddAlloc, setShowAddAlloc] = useState(false);
  const [allocForm, setAllocForm] = useState({
    courseId: courses[0]?.id || '',
    facultyId: facultyMembers[0]?.id || '',
    sectionId: sections[0]?.id || '',
    subSectionId: '',
    sessionType: 'Lecture' as SessionType,
    hoursPerWeek: 3,
    preferredRoomId: rooms[0]?.id || '',
  });

  // Bulk Import
  const [importType, setImportType] = useState<'faculty' | 'courses' | 'rooms' | 'sections' | 'allocations'>('faculty');
  const [importRaw, setImportRaw] = useState('');
  const [importFeedback, setImportFeedback] = useState<{ successCount: number; errors: string[] } | null>(null);

  const totalCoursesAllocated = new Set(allocations.map(a => a.courseId)).size;
  const activeFacultyCount = facultyMembers.filter(f => f.status !== 'Inactive').length;
  const activeCoursesCount = courses.filter(c => c.status !== 'Archived').length;
  const activeRoomsCount = rooms.filter(r => r.isAvailable).length;
  const activeSectionsCount = sections.filter(s => s.status !== 'Inactive').length;

  const handleRunGeneration = () => {
    setIsGenerating(true);
    setGenerationResult(null);
    setTimeout(() => {
      const res = generateDraftTimetable();
      setGenerationResult(res);
      setIsGenerating(false);
      if (res.isSuccess) {
        setActiveTab('review');
      }
    }, 600);
  };

  const handleBulkImport = () => {
    if (!importRaw.trim()) return;
    try {
      let parsed: any[] = [];
      if (importRaw.trim().startsWith('[') || importRaw.trim().startsWith('{')) {
        const json = JSON.parse(importRaw);
        parsed = Array.isArray(json) ? json : [json];
      } else {
        const lines = importRaw.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        parsed = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim());
          const obj: any = {};
          headers.forEach((h, i) => {
            obj[h] = values[i] || '';
          });
          return obj;
        });
      }

      const res = bulkImportData(importType, parsed);
      setImportFeedback(res);
      if (res.successCount > 0) setImportRaw('');
    } catch (err: any) {
      setImportFeedback({ successCount: 0, errors: [err?.message || 'Format error'] });
    }
  };

  const daysList: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const totalSubgroupsCount = sections.reduce((acc, s) => acc + (s.subSections?.length || 0), 0);
  const totalStudentsCount = sections.reduce((acc, s) => acc + (s.studentCount || 0), 0);

  const handleDownloadMasterTemplate = () => {
    const blob = generateMasterExcelTemplate({
      departments,
      programs,
      courses,
      facultyMembers,
      rooms,
      sections,
      allocations
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Thapar_Master_Timetable_Setup_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const navTabs = [
    { id: 'courses', label: 'Courses', icon: <BookOpen className="h-3.5 w-3.5" />, badge: courses.length },
    { id: 'faculty', label: 'Faculty', icon: <UserSquare2 className="h-3.5 w-3.5" />, badge: facultyMembers.length },
    { id: 'rooms', label: 'Rooms & Labs', icon: <DoorOpen className="h-3.5 w-3.5" />, badge: rooms.length },
    { id: 'sections', label: 'Sections & Groups', icon: <Users className="h-3.5 w-3.5" />, badge: sections.length },
    { id: 'allocations', label: 'Allocations', icon: <Layers className="h-3.5 w-3.5" />, badge: allocations.length },
    { id: 'constraints', label: 'Constraints & Rules', icon: <ShieldCheck className="h-3.5 w-3.5" />, badge: constraints.filter(c => c.isActive).length },
    { id: 'master_excel', label: 'Excel Import', icon: <FileSpreadsheet className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E5E2D9] dark:border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-serif text-stone-900 dark:text-zinc-100 tracking-tight">
            Academic Setup & Master Data
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-zinc-400 mt-1">
            Institutional coordinator workspace for curriculum, cohort groups/subgroups, and Excel master sync.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDownloadMasterTemplate}
            title="Download complete academic database as Excel workbook"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 hover:border-stone-400 rounded-lg text-xs font-semibold text-stone-700 dark:text-zinc-300 transition-colors shadow-2xs"
          >
            <Download className="h-3.5 w-3.5 text-[#8C1B2E] dark:text-red-400" />
            <span>Download Master Excel (.xlsx)</span>
          </button>

          <button
            onClick={() => setActiveTab('master_excel')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#8C1B2E] hover:bg-[#731625] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Import Master Data</span>
          </button>

          <div className="flex items-center gap-1.5 pl-1">
            <span className="text-xs text-stone-500 dark:text-zinc-400">Status:</span>
            <span className="px-2.5 py-1 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-md text-xs font-semibold text-stone-800 dark:text-zinc-200 shadow-2xs">
              {publishStatus}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Sub-navigation: Horizontal Pill Bar + Mobile Dropdown */}
      <div className="space-y-2">
        {/* Horizontal Scrollable Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full no-scrollbar">
          {navTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs'
                  : 'bg-[#FAF9F5] dark:bg-zinc-900 hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300 border border-[#E5E2D9] dark:border-zinc-800'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-semibold ${
                    activeTab === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-stone-200 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Mobile Dropdown fallback for narrow viewports */}
        <div className="flex sm:hidden items-center gap-2 pt-1">
          <span className="text-xs text-stone-500 font-medium">Jump to:</span>
          <select
            value={activeTab}
            onChange={e => setActiveTab(e.target.value as any)}
            className="flex-1 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-stone-800 dark:text-zinc-200 font-medium focus:outline-none focus:border-[#8C1B2E] shadow-2xs"
          >
            {navTabs.map(tab => (
              <option key={tab.id} value={tab.id}>
                {tab.label} {tab.badge !== undefined ? `(${tab.badge})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Subtab Content */}

      {/* MASTER EXCEL SETUP HUB */}
      {activeTab === 'master_excel' && (
        <MasterExcelHub onNavigateToTab={tab => setActiveTab(tab as any)} />
      )}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <AcademicSetupOverview
            academicYearLabel={academicYear.yearLabel}
            semesterType={academicYear.semesterType}
            workingDays={academicYear.workingDays}
            periodsRange={`${academicYear.timeSlots[0]?.startTime || '08:00'} – ${academicYear.timeSlots[academicYear.timeSlots.length - 1]?.endTime || '17:30'}`}
            counts={{
              departments: departments.length,
              programs: programs.length,
              courses: courses.length,
              faculty: facultyMembers.length,
              rooms: rooms.length,
              sections: sections.length,
              subgroups: totalSubgroupsCount,
              allocations: allocations.length,
            }}
          />

          <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl p-5 shadow-xs">
            <h2 className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">
              Academic Setup Checklist
            </h2>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">
              Review current institutional setup prior to timetable generation. Click any item to inspect.
            </p>

            <div className="mt-4 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl divide-y divide-[#E5E2D9] dark:divide-zinc-800/80 text-xs overflow-hidden shadow-2xs">
              <div onClick={() => setActiveTab('academic_year')} className="p-3.5 bg-white dark:bg-zinc-950/60 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                <div>
                  <span className="font-semibold text-stone-900 dark:text-zinc-100">Academic year</span>
                  <span className="text-stone-500 dark:text-zinc-400 ml-2">{academicYear.yearLabel} · Semester {academicYear.semesterNumber}</span>
                </div>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">Complete</span>
              </div>

              <div onClick={() => setActiveTab('departments')} className="p-3.5 bg-white dark:bg-zinc-950/60 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                <span className="font-semibold text-stone-900 dark:text-zinc-100">Departments</span>
                <span className="font-medium text-stone-700 dark:text-zinc-300">{departments.length} departments</span>
              </div>

              <div onClick={() => setActiveTab('programs')} className="p-3.5 bg-white dark:bg-zinc-950/60 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                <span className="font-semibold text-stone-900 dark:text-zinc-100">Programs</span>
                <span className="font-medium text-stone-700 dark:text-zinc-300">{programs.length} programs</span>
              </div>

              <div onClick={() => setActiveTab('courses')} className="p-3.5 bg-white dark:bg-zinc-950/60 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                <span className="font-semibold text-stone-900 dark:text-zinc-100">Courses</span>
                <span className="font-medium text-stone-700 dark:text-zinc-300">{activeCoursesCount} active courses</span>
              </div>

              <div onClick={() => setActiveTab('faculty')} className="p-3.5 bg-white dark:bg-zinc-950/60 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                <span className="font-semibold text-stone-900 dark:text-zinc-100">Faculty</span>
                <span className="font-medium text-stone-700 dark:text-zinc-300">{activeFacultyCount} active members</span>
              </div>

              <div onClick={() => setActiveTab('rooms')} className="p-3.5 bg-white dark:bg-zinc-950/60 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                <span className="font-semibold text-stone-900 dark:text-zinc-100">Rooms & labs</span>
                <span className="font-medium text-stone-700 dark:text-zinc-300">{activeRoomsCount} available rooms</span>
              </div>

              <div onClick={() => setActiveTab('sections')} className="p-3.5 bg-white dark:bg-zinc-950/60 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                <span className="font-semibold text-stone-900 dark:text-zinc-100">Sections</span>
                <span className="font-medium text-stone-700 dark:text-zinc-300">{activeSectionsCount} student sections</span>
              </div>

              <div onClick={() => setActiveTab('allocations')} className="p-3.5 bg-white dark:bg-zinc-950/60 flex items-center justify-between hover:bg-stone-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-colors">
                <span className="font-semibold text-stone-900 dark:text-zinc-100">Course allocations</span>
                <span className={`font-semibold ${totalCoursesAllocated >= activeCoursesCount ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                  {totalCoursesAllocated} / {activeCoursesCount} allocated
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ACADEMIC YEAR */}
      {activeTab === 'academic_year' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-5 shadow-xs">
          <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <h3 className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">Academic Year & Semester Calendar</h3>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">Configure working schedule, teaching period duration, and protected lunch slots</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-stone-600 dark:text-zinc-400 font-medium">Academic Year Label</label>
              <input
                type="text"
                value={academicYear.yearLabel}
                onChange={e => updateAcademicYear({ yearLabel: e.target.value })}
                className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2.5 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-stone-600 dark:text-zinc-400 font-medium">Semester Type</label>
              <select
                value={academicYear.semesterType}
                onChange={e => updateAcademicYear({ semesterType: e.target.value as any })}
                className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2.5 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
              >
                <option value="Odd (Autumn)">Odd (Autumn)</option>
                <option value="Even (Spring)">Even (Spring)</option>
                <option value="Summer">Summer Term</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-stone-600 dark:text-zinc-400 font-medium">Semester Level</label>
              <input
                type="number"
                value={academicYear.semesterNumber}
                onChange={e => updateAcademicYear({ semesterNumber: Number(e.target.value) || 1 })}
                className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2.5 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E5E2D9] dark:border-zinc-800">
            <label className="text-xs font-semibold text-stone-800 dark:text-zinc-300">Active Working Days</label>
            <div className="flex flex-wrap gap-2">
              {(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as DayOfWeek[]).map(day => {
                const isSelected = academicYear.workingDays.includes(day);
                return (
                  <button
                    key={day}
                    onClick={() => {
                      const next = isSelected
                        ? academicYear.workingDays.filter(d => d !== day)
                        : [...academicYear.workingDays, day];
                      updateAcademicYear({ workingDays: next });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-[#8C1B2E] text-white font-semibold shadow-2xs'
                        : 'bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#E5E2D9] dark:border-zinc-800">
            <label className="text-xs font-semibold text-stone-800 dark:text-zinc-300">Daily Teaching Periods</label>
            <div className="border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800 shadow-2xs">
              {academicYear.timeSlots.map(slot => (
                <div key={slot.id} className="p-3 bg-white dark:bg-zinc-950/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-stone-500 dark:text-zinc-400 font-semibold w-16">Period {slot.periodNumber}</span>
                    <span className="font-medium text-stone-900 dark:text-zinc-200">{slot.label}</span>
                    {slot.isLunch && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20">
                        Campus Lunch Break
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-stone-500 dark:text-zinc-500 font-mono">{slot.startTime} – {slot.endTime}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DEPARTMENTS */}
      {activeTab === 'departments' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <div>
              <h3 className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">Academic Departments</h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">Manage departmental leadership and faculty placement</p>
            </div>
            <button
              onClick={() => setShowAddDept(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8C1B2E] hover:bg-[#721525] text-white rounded-lg text-xs font-semibold transition-all self-start sm:self-auto shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Department</span>
            </button>
          </div>

          <div className="border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800 shadow-2xs">
            {departments.map(dept => (
              <div key={dept.id} className="p-3.5 bg-white dark:bg-zinc-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900 dark:text-zinc-100">{dept.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#FAF9F5] dark:bg-zinc-900 text-[#8C1B2E] dark:text-red-400 border border-[#E5E2D9] dark:border-zinc-800 font-semibold">
                      {dept.code}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      dept.status === 'Active' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40' : 'bg-stone-100 text-stone-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}>
                      {dept.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                    HOD: <span className="text-stone-800 dark:text-zinc-200 font-medium">{dept.hodName}</span> · Contact: <span className="font-mono text-stone-600 dark:text-zinc-400">{dept.contactEmail}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleDepartmentStatus(dept.id)}
                    className="px-2.5 py-1 rounded bg-[#FAF9F5] dark:bg-zinc-900 hover:bg-stone-100 dark:hover:bg-zinc-850 text-stone-700 dark:text-zinc-300 border border-[#E5E2D9] dark:border-zinc-800 text-[11px] transition-colors"
                  >
                    {dept.status === 'Active' ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => deleteDepartment(dept.id)}
                    className="p-1.5 text-stone-400 hover:text-[#8C1B2E] dark:hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showAddDept && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!deptForm.name || !deptForm.code) return;
                addDepartment(deptForm);
                setShowAddDept(false);
                setDeptForm({ name: '', code: '', hodName: '', contactEmail: '', status: 'Active' });
              }}
              className="p-4 bg-white dark:bg-zinc-950 border border-[#8C1B2E]/40 rounded-xl space-y-3 shadow-2xs"
            >
              <div className="text-xs font-semibold text-stone-900 dark:text-zinc-200">New Department</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Department Name"
                  value={deptForm.name}
                  onChange={e => setDeptForm(d => ({ ...d, name: e.target.value }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                  required
                />
                <input
                  type="text"
                  placeholder="Code (e.g. CSED)"
                  value={deptForm.code}
                  onChange={e => setDeptForm(d => ({ ...d, code: e.target.value }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                  required
                />
                <input
                  type="text"
                  placeholder="HOD Name"
                  value={deptForm.hodName}
                  onChange={e => setDeptForm(d => ({ ...d, hodName: e.target.value }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={deptForm.contactEmail}
                  onChange={e => setDeptForm(d => ({ ...d, contactEmail: e.target.value }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddDept(false)} className="px-3 py-1 text-xs text-stone-500">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 bg-[#8C1B2E] text-white rounded-lg text-xs font-semibold">Save Department</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 4: PROGRAMS */}
      {activeTab === 'programs' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <div>
              <h3 className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">Degree Programs</h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">Programs offered across academic departments</p>
            </div>
            <button
              onClick={() => setShowAddProg(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8C1B2E] hover:bg-[#721525] text-white rounded-lg text-xs font-semibold transition-all self-start sm:self-auto shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Program</span>
            </button>
          </div>

          <div className="border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800 shadow-2xs">
            {programs.map(prog => {
              const dept = departments.find(d => d.id === prog.departmentId);
              return (
                <div key={prog.id} className="p-3.5 bg-white dark:bg-zinc-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900 dark:text-zinc-100">{prog.name}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#FAF9F5] dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 border border-[#E5E2D9] dark:border-zinc-800">
                        {prog.code}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                      Dept: <span className="text-stone-800 dark:text-zinc-200 font-medium">{dept?.name || prog.departmentId}</span> · Duration: {prog.durationYears} Years
                    </div>
                  </div>
                  <button onClick={() => deleteProgram(prog.id)} className="p-1.5 text-stone-400 hover:text-[#8C1B2E] dark:hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {showAddProg && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!progForm.name || !progForm.code) return;
                addProgram(progForm);
                setShowAddProg(false);
                setProgForm({ name: '', code: '', departmentId: departments[0]?.id || '', durationYears: 4, totalSemesters: 8, status: 'Active' });
              }}
              className="p-4 bg-white dark:bg-zinc-950 border border-[#8C1B2E]/40 rounded-xl space-y-3 shadow-2xs"
            >
              <div className="text-xs font-semibold text-stone-900 dark:text-zinc-200">New Degree Program</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Program Name"
                  value={progForm.name}
                  onChange={e => setProgForm(p => ({ ...p, name: e.target.value }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                  required
                />
                <input
                  type="text"
                  placeholder="Code (e.g. BTECH-CSE)"
                  value={progForm.code}
                  onChange={e => setProgForm(p => ({ ...p, code: e.target.value }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                  required
                />
                <select
                  value={progForm.departmentId}
                  onChange={e => setProgForm(p => ({ ...p, departmentId: e.target.value }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                >
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Duration (Years)"
                  value={progForm.durationYears}
                  onChange={e => setProgForm(p => ({ ...p, durationYears: Number(e.target.value) || 4 }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddProg(false)} className="px-3 py-1 text-xs text-stone-500">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 bg-[#8C1B2E] text-white rounded-lg text-xs font-semibold">Save Program</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 5: COURSES */}
      {activeTab === 'courses' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <div>
              <h3 className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">Course & Subject Catalog</h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">Accredited subjects, lecture/tutorial/lab requirements, and credit hours</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-stone-400 dark:text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search code / title..."
                  value={courseSearch}
                  onChange={e => setCourseSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E] w-44 sm:w-56"
                />
              </div>
              <button
                onClick={() => setShowAddCourse(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8C1B2E] hover:bg-[#721525] text-white rounded-lg text-xs font-semibold transition-all shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Course</span>
              </button>
            </div>
          </div>

          <div className="border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800 shadow-2xs">
            {courses
              .filter(c =>
                c.code.toLowerCase().includes(courseSearch.toLowerCase()) ||
                c.name.toLowerCase().includes(courseSearch.toLowerCase())
              )
              .map(course => {
                const isAllocated = allocations.some(a => a.courseId === course.id);
                return (
                  <div key={course.id} className="p-3.5 bg-white dark:bg-zinc-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#8C1B2E] dark:text-red-400">{course.code}</span>
                        <span className="font-semibold text-stone-900 dark:text-zinc-100">{course.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#FAF9F5] dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 border border-[#E5E2D9] dark:border-zinc-800">
                          {course.credits} Credits
                        </span>
                        {course.requiresLab && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20">
                            Lab
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-zinc-400 flex flex-wrap items-center gap-x-3">
                        <span>L-T-P: <strong className="text-stone-800 dark:text-zinc-200 font-mono">{course.requiredLecturesPerWeek}-{course.requiredTutorialsPerWeek}-{course.requiredLabsPerWeek}</strong></span>
                        <span>·</span>
                        <span className={isAllocated ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-amber-700 dark:text-amber-400 font-medium'}>
                          {isAllocated ? 'Allocated' : 'Unallocated'}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => deleteCourse(course.id)} className="p-1.5 text-stone-400 hover:text-[#8C1B2E] dark:hover:text-red-400 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
          </div>

          {showAddCourse && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!courseForm.code || !courseForm.name) return;
                addCourse(courseForm);
                setShowAddCourse(false);
              }}
              className="p-4 bg-white dark:bg-zinc-950 border border-[#8C1B2E]/40 rounded-xl space-y-3 shadow-2xs"
            >
              <div className="text-xs font-semibold text-stone-900 dark:text-zinc-200">New Course Specification</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Code (e.g. CS504)"
                  value={courseForm.code}
                  onChange={e => setCourseForm(c => ({ ...c, code: e.target.value }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                  required
                />
                <input
                  type="text"
                  placeholder="Title (e.g. Machine Learning)"
                  value={courseForm.name}
                  onChange={e => setCourseForm(c => ({ ...c, name: e.target.value }))}
                  className="sm:col-span-2 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                  required
                />
                <input
                  type="number"
                  placeholder="Credits"
                  value={courseForm.credits}
                  onChange={e => setCourseForm(c => ({ ...c, credits: Number(e.target.value) || 4 }))}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 outline-none focus:border-red-600"
                />
                <input
                  type="number"
                  placeholder="Lec / wk"
                  value={courseForm.requiredLecturesPerWeek}
                  onChange={e => setCourseForm(c => ({ ...c, requiredLecturesPerWeek: Number(e.target.value) || 3 }))}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 outline-none focus:border-red-600"
                />
                <input
                  type="number"
                  placeholder="Lab / wk"
                  value={courseForm.requiredLabsPerWeek}
                  onChange={e => setCourseForm(c => ({ ...c, requiredLabsPerWeek: Number(e.target.value) || 0, requiresLab: Number(e.target.value) > 0 }))}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 outline-none focus:border-red-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddCourse(false)} className="px-3 py-1 text-xs text-zinc-400">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold">Save Course</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 6: FACULTY */}
      {activeTab === 'faculty' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <div>
              <h3 className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">Faculty & Instructional Roster</h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">Manage instructors, designations, and UGC direct workload limits</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-stone-400 dark:text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search faculty..."
                  value={facultySearch}
                  onChange={e => setFacultySearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E] w-44 shadow-2xs"
                />
              </div>
              <button
                onClick={() => setShowAddFaculty(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8C1B2E] hover:bg-[#721525] text-white rounded-lg text-xs font-semibold transition-all shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Faculty</span>
              </button>
            </div>
          </div>

          <div className="border border-[#E5E2D9] dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800 shadow-2xs">
            {facultyMembers
              .filter(f => f.name.toLowerCase().includes(facultySearch.toLowerCase()) || f.email.toLowerCase().includes(facultySearch.toLowerCase()))
              .map(fac => {
                const assignedHours = allocations
                  .filter(a => a.facultyId === fac.id)
                  .reduce((acc, a) => acc + a.hoursPerWeek, 0);

                return (
                  <div key={fac.id} className="p-3.5 bg-white dark:bg-zinc-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900 dark:text-zinc-100">{fac.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#FAF9F5] dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 border border-[#E5E2D9] dark:border-zinc-800">
                          {fac.designation}
                        </span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          assignedHours > fac.maxDirectTeachingHours
                            ? 'bg-rose-50 text-rose-800 dark:bg-red-500/10 dark:text-red-300 border-rose-200 dark:border-red-500/20'
                            : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/20'
                        }`}>
                          Load: {assignedHours}/{fac.maxDirectTeachingHours} hrs/wk
                        </span>
                      </div>
                      <div className="text-[11px] text-stone-500 dark:text-zinc-400 font-mono">{fac.email}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleFacultyStatus(fac.id)}
                        className="px-2.5 py-1 rounded bg-[#FAF9F5] dark:bg-zinc-900 hover:bg-stone-100 text-stone-700 dark:text-zinc-300 border border-[#E5E2D9] dark:border-zinc-800 text-[11px] transition-colors"
                      >
                        {fac.status === 'Active' ? 'On-Leave' : 'Active'}
                      </button>
                      <button onClick={() => deleteFaculty(fac.id)} className="p-1.5 text-stone-400 hover:text-[#8C1B2E] dark:hover:text-red-400 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>

          {showAddFaculty && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!facultyForm.name || !facultyForm.email) return;
                addFaculty(facultyForm);
                setShowAddFaculty(false);
              }}
              className="p-4 bg-white dark:bg-zinc-950 border border-[#8C1B2E]/40 rounded-xl space-y-3 shadow-2xs"
            >
              <div className="text-xs font-semibold text-stone-900 dark:text-zinc-200">New Faculty Member</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={facultyForm.name}
                  onChange={e => setFacultyForm(f => ({ ...f, name: e.target.value }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={facultyForm.email}
                  onChange={e => setFacultyForm(f => ({ ...f, email: e.target.value }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                  required
                />
                <select
                  value={facultyForm.designation}
                  onChange={e => setFacultyForm(f => ({ ...f, designation: e.target.value as any }))}
                  className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2 text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
                >
                  <option value="Professor">Professor (14h cap)</option>
                  <option value="Associate Professor">Associate Professor (14h cap)</option>
                  <option value="Assistant Professor">Assistant Professor (16h cap)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddFaculty(false)} className="px-3 py-1 text-xs text-stone-500">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 bg-[#8C1B2E] text-white rounded-lg text-xs font-semibold">Save Faculty</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 7: ROOMS */}
      {activeTab === 'rooms' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <div>
              <h3 className="text-base font-bold font-serif text-stone-900 dark:text-zinc-100">Physical Rooms & Labs</h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1">Manage lecture halls, computer labs, and capacities</p>
            </div>
            <button
              onClick={() => setShowAddRoom(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8C1B2E] hover:bg-[#721525] text-white rounded-lg text-xs font-semibold transition-all self-start sm:self-auto shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Facility</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {rooms.map(room => (
              <div key={room.id} className="p-3.5 bg-white dark:bg-zinc-950/70 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-2 shadow-2xs">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-stone-900 dark:text-zinc-100 text-xs sm:text-sm">{room.name}</div>
                    <div className="text-[11px] text-stone-500 dark:text-zinc-400">{room.building}</div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#FAF9F5] dark:bg-zinc-900 text-[#8C1B2E] dark:text-red-400 border border-[#E5E2D9] dark:border-zinc-800 font-semibold">
                    {room.type}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1 border-t border-[#E5E2D9] dark:border-zinc-800/80">
                  <span className="text-stone-500 dark:text-zinc-400">Capacity: <strong className="font-mono text-stone-800 dark:text-zinc-200">{room.capacity}</strong></span>
                  <button
                    onClick={() => toggleRoomAvailability(room.id)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      room.isAvailable ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-rose-50 text-rose-800 border-rose-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                    }`}
                  >
                    {room.isAvailable ? 'Available' : 'Maintenance'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showAddRoom && (
            <form
              onSubmit={e => {
                e.preventDefault();
                if (!roomForm.name) return;
                addRoom(roomForm);
                setShowAddRoom(false);
              }}
              className="p-4 bg-zinc-950 border border-red-800/40 rounded-xl space-y-3"
            >
              <div className="text-xs font-semibold text-zinc-200">New Physical Facility</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Facility Name (e.g. Lab 304)"
                  value={roomForm.name}
                  onChange={e => setRoomForm(r => ({ ...r, name: e.target.value }))}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 outline-none focus:border-red-600"
                  required
                />
                <select
                  value={roomForm.type}
                  onChange={e => setRoomForm(r => ({ ...r, type: e.target.value as any }))}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 outline-none focus:border-red-600"
                >
                  <option value="LectureHall">Lecture Hall</option>
                  <option value="ComputerLab">Computer Lab</option>
                  <option value="HardwareLab">Hardware Lab</option>
                  <option value="TutorialRoom">Tutorial Room</option>
                </select>
                <input
                  type="number"
                  placeholder="Capacity"
                  value={roomForm.capacity}
                  onChange={e => setRoomForm(r => ({ ...r, capacity: Number(e.target.value) || 60 }))}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 outline-none focus:border-red-600"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddRoom(false)} className="px-3 py-1 text-xs text-zinc-400">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 bg-red-700 text-white rounded-lg text-xs font-semibold">Save Facility</button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB 8: SECTIONS (GROUPS & SUBGROUPS) */}
      {activeTab === 'sections' && <GroupsAndSubgroupsTab />}

      {/* TAB 9: ALLOCATIONS */}
      {activeTab === 'allocations' && <CourseAllocationsTab />}

      {/* TAB 10: CONSTRAINTS */}
      {activeTab === 'constraints' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-4 shadow-xs">
          <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-zinc-100">Timetabling Constraints</h3>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">Active constraint rules enforced by the scheduling solver</p>
          </div>

          <div className="border border-[#E5E2D9] dark:border-zinc-800 rounded-lg overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800">
            {constraints.map(item => (
              <div key={item.id} className="p-3.5 bg-white dark:bg-zinc-950/60 flex items-start justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-stone-900 dark:text-zinc-100">{item.name}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      item.type === 'Hard' ? 'bg-red-50 text-[#8C1B2E] dark:bg-red-500/10 dark:text-red-300 border border-red-200 dark:border-red-500/20 font-bold' : 'bg-stone-100 text-stone-600 dark:bg-zinc-900 dark:text-zinc-400 border border-[#E5E2D9] dark:border-zinc-800'
                    }`}>
                      {item.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">{item.description}</p>
                </div>
                <button
                  onClick={() => toggleConstraint(item.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium shrink-0 transition-colors ${
                    item.isActive ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' : 'bg-stone-100 text-stone-500 dark:bg-zinc-900 dark:text-zinc-500 border border-[#E5E2D9] dark:border-zinc-800'
                  }`}
                >
                  {item.isActive ? 'Active' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 11: VALIDATION */}
      {activeTab === 'validation' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <div>
              <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-zinc-100">Pre-Generation Validation Report</h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">Automated readiness checks across all entities and constraint rules</p>
            </div>
            <button onClick={() => runValidation()} className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-stone-800 dark:text-zinc-200 text-xs font-medium rounded-lg border border-[#E5E2D9] dark:border-zinc-700 transition-colors">
              Re-Verify
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 bg-white dark:bg-zinc-950/80 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl shadow-xs">
              <span className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Passed Checks</span>
              <div className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">{validationReport.passedCount}</div>
            </div>
            <div className="p-3.5 bg-white dark:bg-zinc-950/80 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl shadow-xs">
              <span className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Warnings</span>
              <div className="text-2xl font-bold font-mono text-amber-700 dark:text-amber-400">{validationReport.warningCount}</div>
            </div>
            <div className="p-3.5 bg-white dark:bg-zinc-950/80 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl shadow-xs">
              <span className="text-xs text-stone-500 dark:text-zinc-400 font-medium">Blocking Errors</span>
              <div className="text-2xl font-bold font-mono text-[#8C1B2E] dark:text-red-400">{validationReport.errorCount}</div>
            </div>
          </div>

          <div className="border border-[#E5E2D9] dark:border-zinc-800 rounded-lg overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800">
            {validationReport.items.map(item => (
              <div key={item.id} className="p-3.5 bg-white dark:bg-zinc-950/60 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="pt-0.5 shrink-0">
                    {item.status === 'Passed' && <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                    {item.status === 'Warning' && <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                    {item.status === 'Error' && <AlertCircle className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" />}
                  </div>
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-zinc-100">{item.title}</span>
                    <p className="text-[11px] text-stone-500 dark:text-zinc-400 mt-0.5">{item.message}</p>
                  </div>
                </div>
                {item.fixTab && item.status !== 'Passed' && (
                  <button
                    onClick={() => setActiveTab(item.fixTab as SetupSubTab)}
                    className="px-2.5 py-1 rounded bg-[#FAF9F5] dark:bg-zinc-900 text-[#8C1B2E] dark:text-red-400 border border-[#E5E2D9] dark:border-zinc-800 text-[11px] font-medium hover:bg-stone-100 transition-colors"
                  >
                    Fix Issue →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 12: GENERATOR */}
      {activeTab === 'generator' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-5 shadow-xs">
          <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-zinc-100">Schedule Solver & Generation Pipeline</h3>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">Executes constraint-satisfaction mapping on your real configured academic entities</p>
          </div>

          <div className="p-4 bg-white dark:bg-zinc-950/80 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-800 dark:text-zinc-200">Pre-Flight Readiness</span>
              <span className={`text-[11px] font-mono px-2 py-0.5 rounded font-bold ${
                validationReport.isReadyForGeneration
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20'
                  : 'bg-red-50 text-[#8C1B2E] border border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
              }`}>
                {validationReport.isReadyForGeneration ? 'Ready for Solver' : 'Errors Detected'}
              </span>
            </div>

            <p className="text-xs text-stone-600 dark:text-zinc-400 leading-relaxed">
              Processing <strong className="text-stone-900 dark:text-zinc-200">{allocations.length} allocations</strong> across <strong className="text-stone-900 dark:text-zinc-200">{sections.length} sections</strong> and <strong className="text-stone-900 dark:text-zinc-200">{rooms.length} facilities</strong> over <strong className="text-stone-900 dark:text-zinc-200">{academicYear.workingDays.length} working days</strong>.
            </p>

            <button
              onClick={handleRunGeneration}
              disabled={isGenerating || !validationReport.isReadyForGeneration}
              className={`w-full py-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all ${
                validationReport.isReadyForGeneration
                  ? 'bg-[#8C1B2E] hover:bg-[#731625] text-white cursor-pointer active:scale-[0.99]'
                  : 'bg-stone-200 text-stone-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <>
                  <Sparkles className="h-4 w-4 animate-spin" />
                  <span>Computing Optimal Schedule Assignments...</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  <span>Generate Draft Master Timetable</span>
                </>
              )}
            </button>
          </div>

          {generationResult && (
            <div className={`p-4 rounded-xl border space-y-2 animate-in fade-in ${
              generationResult.isSuccess ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-300' : 'bg-red-50/70 border-red-200 text-[#8C1B2E] dark:bg-red-950/20 dark:border-red-800/40 dark:text-red-300'
            }`}>
              <div className="flex items-center gap-2 font-bold text-xs">
                {generationResult.isSuccess ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <AlertCircle className="h-4 w-4 text-[#8C1B2E] dark:text-red-400" />}
                <span>
                  {generationResult.isSuccess
                    ? `Generated ${generationResult.sessionsGenerated} class sessions (${generationResult.scheduledHours} weekly hours) successfully!`
                    : 'Generation encountered blocking constraint violations.'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 13: REVIEW & PUBLISH */}
      {activeTab === 'review' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-5 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <div>
              <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-zinc-100">Timetable Review & Publish</h3>
              <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">Inspect schedule matrices across Sections, Faculty, and Facilities</p>
            </div>

            <div className="flex items-center gap-2">
              {publishStatus === 'Draft' && (
                <button
                  onClick={() => updatePublishStatus('Review', 'Coordinator Submission')}
                  className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 dark:bg-zinc-800 text-stone-800 dark:text-zinc-200 rounded-lg text-xs font-medium border border-[#E5E2D9] dark:border-zinc-700 transition-colors"
                >
                  Submit for Approval
                </button>
              )}

              {publishStatus === 'Review' && (
                <button
                  onClick={() => updatePublishStatus('Approved', 'Dean Academic Affairs')}
                  className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Approve Schedule
                </button>
              )}

              {publishStatus === 'Approved' && (
                <button
                  onClick={() => updatePublishStatus('Published', 'Institutional Release')}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Publish to Campus
                </button>
              )}

              {publishStatus === 'Published' && (
                <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 font-bold flex items-center gap-1">
                  <Check className="h-3 w-3" /> Published & Live
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex bg-[#F7F6F2] dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setReviewAngle('section')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  reviewAngle === 'section' ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs' : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                }`}
              >
                By Section
              </button>
              <button
                onClick={() => setReviewAngle('faculty')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  reviewAngle === 'faculty' ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs' : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                }`}
              >
                By Faculty
              </button>
              <button
                onClick={() => setReviewAngle('room')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  reviewAngle === 'room' ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs' : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                }`}
              >
                By Room/Lab
              </button>
            </div>

            {reviewAngle === 'section' && (
              <select
                value={selectedSectionId}
                onChange={e => setSelectedSectionId(e.target.value)}
                className="bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 text-xs rounded-lg px-3 py-1.5 text-stone-800 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
              >
                {sections.map(s => (
                  <option key={s.id} value={s.id}>Section: {s.name} ({s.studentCount} Students)</option>
                ))}
              </select>
            )}

            {reviewAngle === 'faculty' && (
              <select
                value={selectedFacultyId}
                onChange={e => setSelectedFacultyId(e.target.value)}
                className="bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 text-xs rounded-lg px-3 py-1.5 text-stone-800 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
              >
                {facultyMembers.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}

            {reviewAngle === 'room' && (
              <select
                value={selectedRoomId}
                onChange={e => setSelectedRoomId(e.target.value)}
                className="bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 text-xs rounded-lg px-3 py-1.5 text-stone-800 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
              >
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex bg-[#F7F6F2] dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 p-1 rounded-lg text-xs gap-1">
            {daysList.map(d => (
              <button
                key={d}
                onClick={() => setReviewDay(d)}
                className={`flex-1 py-1.5 rounded-md text-center font-medium transition-colors ${
                  reviewDay === d ? 'bg-[#8C1B2E] text-white font-semibold shadow-xs' : 'text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="border border-[#E5E2D9] dark:border-zinc-800 rounded-lg overflow-hidden divide-y divide-[#E5E2D9] dark:divide-zinc-800">
            {academicYear.timeSlots.map(slot => {
              if (slot.isLunch) {
                return (
                  <div key={slot.id} className="p-3 bg-stone-100/70 dark:bg-zinc-950/40 flex items-center justify-between text-xs text-stone-500 dark:text-zinc-500 font-mono">
                    <span>{slot.label}</span>
                    <span>Campus Lunch Break</span>
                    <span>Protected</span>
                  </div>
                );
              }

              let matchingSession = sessions.find(s => {
                if (s.day !== reviewDay || s.timeSlotId !== slot.id) return false;
                if (reviewAngle === 'section') return s.sectionId === selectedSectionId;
                if (reviewAngle === 'faculty') return s.facultyId === selectedFacultyId;
                if (reviewAngle === 'room') return s.roomId === selectedRoomId;
                return false;
              });

              const course = matchingSession ? courses.find(c => c.id === matchingSession?.courseId) : null;
              const faculty = matchingSession ? facultyMembers.find(f => f.id === matchingSession?.facultyId) : null;
              const room = matchingSession ? rooms.find(r => r.id === matchingSession?.roomId) : null;

              return (
                <div key={slot.id} className="p-3 bg-white dark:bg-zinc-950/60 flex items-center justify-between text-xs">
                  <span className="font-mono text-stone-500 dark:text-zinc-400 w-28 shrink-0">{slot.label}</span>
                  {matchingSession ? (
                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900 dark:text-zinc-100">{course?.name || matchingSession.courseId}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-50 text-[#8C1B2E] dark:bg-zinc-900 dark:text-red-400 border border-red-200 dark:border-zinc-800">
                            {course?.code}
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                          {reviewAngle !== 'faculty' && <span>{faculty?.name} · </span>}
                          {reviewAngle !== 'room' && <span>{room?.name}</span>}
                        </div>
                      </div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                        {matchingSession.type}
                      </span>
                    </div>
                  ) : (
                    <span className="text-stone-400 dark:text-zinc-600 italic">Free Slot</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 14: BULK IMPORT */}
      {activeTab === 'bulk_import' && (
        <div className="p-5 bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-4 shadow-xs">
          <div className="border-b border-[#E5E2D9] dark:border-zinc-800 pb-3">
            <h3 className="font-serif text-base font-semibold text-stone-900 dark:text-zinc-100">Structured Bulk Import</h3>
            <p className="text-xs text-stone-500 dark:text-zinc-400 mt-0.5">Import Faculty, Courses, Rooms, or Sections via CSV or JSON</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['faculty', 'courses', 'rooms', 'sections', 'allocations'] as const).map(type => (
              <button
                key={type}
                onClick={() => {
                  setImportType(type);
                  setImportFeedback(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  importType === type ? 'bg-[#8C1B2E] text-white shadow-xs' : 'bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 text-stone-600 dark:text-zinc-400 hover:text-stone-900'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <textarea
              rows={6}
              value={importRaw}
              onChange={e => setImportRaw(e.target.value)}
              placeholder={
                importType === 'faculty'
                  ? 'name, email, designation\nDr. Maya Sengupta, maya.s@thapar.edu, Associate Professor'
                  : 'Paste JSON array or CSV records'
              }
              className="w-full bg-white dark:bg-zinc-950 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-3 font-mono text-xs text-stone-900 dark:text-zinc-200 outline-none focus:border-[#8C1B2E]"
            />
          </div>

          <button
            onClick={handleBulkImport}
            className="px-4 py-2 bg-[#8C1B2E] hover:bg-[#731625] text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            Validate & Commit Import
          </button>

          {importFeedback && (
            <div className={`p-4 rounded-xl border space-y-1 text-xs ${
              importFeedback.errors.length === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-300' : 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-800/40 dark:text-amber-300'
            }`}>
              <div className="font-bold">Imported {importFeedback.successCount} record(s).</div>
              {importFeedback.errors.map((err, i) => (
                <div key={i} className="text-[#8C1B2E] dark:text-red-300 font-mono text-[11px]">• {err}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
