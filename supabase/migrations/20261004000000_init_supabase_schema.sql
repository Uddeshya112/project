-- ============================================================================
-- SUPABASE POSTGRESQL DATABASE SCHEMA MIGRATION: PRODUCTION TIMETABLE SYSTEM
-- Version: 20261004000000_init_supabase_schema.sql
-- Application: IntelliSchedule (Academic Operations & Timetable Platform)
-- Schema: public (Unified Production Application Schema)
-- ============================================================================

-- Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. IDENTITY & TENANT / WORKSPACE MODEL
-- ----------------------------------------------------------------------------

-- Institutions / Workspaces (Multi-tenancy isolation)
CREATE TABLE IF NOT EXISTS public.institutions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
    location TEXT NOT NULL DEFAULT 'Patiala, Punjab',
    established_year INTEGER NOT NULL DEFAULT 1956,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Profiles (Linked to auth.users in Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id TEXT PRIMARY KEY, -- Maps to auth.users.id
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
    department TEXT NOT NULL DEFAULT 'Computer Science and Engineering (CSED)',
    role_code TEXT NOT NULL CHECK (role_code IN ('SUPER_ADMIN', 'COLLEGE_ADMIN', 'COORDINATOR', 'HOD', 'FACULTY', 'CLASS_REPRESENTATIVE', 'STUDENT')),
    role_name TEXT NOT NULL,
    authorized_workspaces JSONB NOT NULL DEFAULT '["Student"]'::jsonb,
    is_demo_user BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'LOCKED', 'INACTIVE')),
    roll_number TEXT,
    section_id TEXT,
    batch_year INTEGER,
    avatar_url TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Roles Definition Table
CREATE TABLE IF NOT EXISTS public.roles (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace Memberships & Role Assignments
CREATE TABLE IF NOT EXISTS public.workspace_memberships (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    role_code TEXT NOT NULL REFERENCES public.roles(code) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, institution_id, role_code)
);

-- ----------------------------------------------------------------------------
-- 2. ACADEMIC STRUCTURE MODEL
-- ----------------------------------------------------------------------------

-- Academic Years & Operational Semester Configuration
CREATE TABLE IF NOT EXISTS public.academic_years (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    year_label TEXT NOT NULL, -- e.g. "2026 - 2027"
    semester_type TEXT NOT NULL CHECK (semester_type IN ('Odd (Autumn)', 'Even (Spring)', 'Summer')),
    semester_number INTEGER NOT NULL DEFAULT 5,
    working_days JSONB NOT NULL DEFAULT '["Monday","Tuesday","Wednesday","Thursday","Friday"]'::jsonb,
    time_slots JSONB NOT NULL DEFAULT '[]'::jsonb,
    lunch_period_id TEXT NOT NULL DEFAULT 'p5',
    publish_status TEXT NOT NULL DEFAULT 'Draft' CHECK (publish_status IN ('Draft', 'Review', 'Approved', 'Published')),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Departments
CREATE TABLE IF NOT EXISTS public.departments (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE, -- e.g. "CSED", "ECED", "SMAT"
    name TEXT NOT NULL,
    hod_name TEXT NOT NULL DEFAULT 'Head of Department',
    contact_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Programs
CREATE TABLE IF NOT EXISTS public.programs (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    department_id TEXT NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    code TEXT NOT NULL UNIQUE, -- e.g. "BTECH-CSE", "BTECH-ECE"
    name TEXT NOT NULL,
    duration_years INTEGER NOT NULL DEFAULT 4,
    total_semesters INTEGER NOT NULL DEFAULT 8,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Batches
CREATE TABLE IF NOT EXISTS public.batches (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    program_id TEXT NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
    batch_year INTEGER NOT NULL, -- e.g. 2024, 2026
    name TEXT NOT NULL,
    current_semester INTEGER NOT NULL DEFAULT 5,
    total_students INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (program_id, batch_year)
);

-- Groups / Student Sections (CSE-A, CSE-B ... CSE-J)
CREATE TABLE IF NOT EXISTS public.groups (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g. "CSE-A", "CSE-B"
    department_id TEXT NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    program TEXT NOT NULL,
    program_id TEXT REFERENCES public.programs(id) ON DELETE SET NULL,
    batch_id TEXT REFERENCES public.batches(id) ON DELETE SET NULL,
    semester INTEGER NOT NULL DEFAULT 5,
    batch_year INTEGER NOT NULL DEFAULT 2024,
    student_count INTEGER NOT NULL DEFAULT 50,
    target_size INTEGER NOT NULL DEFAULT 50,
    max_size INTEGER NOT NULL DEFAULT 60,
    cr_name TEXT,
    cr_email TEXT,
    cr_student_id TEXT,
    home_room_id TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (institution_id, name)
);

-- Subgroups (Lab/Tutorial Sub-sections: A1, A2, B1, B2 ... J1, J2)
CREATE TABLE IF NOT EXISTS public.subgroups (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g. "A1", "A2", "1", "2"
    student_count INTEGER NOT NULL DEFAULT 25,
    type TEXT NOT NULL DEFAULT 'Lab' CHECK (type IN ('Lab', 'Tutorial', 'Practical', 'General')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (group_id, name)
);

-- Students Directory
CREATE TABLE IF NOT EXISTS public.students (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    profile_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    roll_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    department_id TEXT NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    program_id TEXT NOT NULL REFERENCES public.programs(id) ON DELETE RESTRICT,
    group_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
    subgroup_id TEXT REFERENCES public.subgroups(id) ON DELETE SET NULL,
    semester INTEGER NOT NULL DEFAULT 5,
    batch_year INTEGER NOT NULL DEFAULT 2024,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Alumni')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. ACADEMIC MASTER DATA MODEL
-- ----------------------------------------------------------------------------

-- Faculty Members
CREATE TABLE IF NOT EXISTS public.faculty (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    profile_id TEXT REFERENCES public.profiles(id) ON DELETE SET NULL,
    employee_id TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    department_id TEXT NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    designation TEXT NOT NULL DEFAULT 'Assistant Professor' CHECK (designation IN ('Professor', 'Associate Professor', 'Assistant Professor', 'Visiting Faculty')),
    subjects_qualified JSONB NOT NULL DEFAULT '[]'::jsonb,
    max_direct_teaching_hours INTEGER NOT NULL DEFAULT 14,
    weekly_hours_limit INTEGER NOT NULL DEFAULT 40,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'OnLeave', 'Inactive', 'Archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Faculty Availability & Protected Slots
CREATE TABLE IF NOT EXISTS public.faculty_availability (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    faculty_id TEXT NOT NULL REFERENCES public.faculty(id) ON DELETE CASCADE,
    day TEXT NOT NULL CHECK (day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
    period_id TEXT NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (faculty_id, day, period_id)
);

-- Rooms & Laboratories
CREATE TABLE IF NOT EXISTS public.rooms (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g. "LT101", "Lab-201", "Room 204"
    building TEXT NOT NULL DEFAULT 'Turing Block',
    floor INTEGER NOT NULL DEFAULT 1,
    capacity INTEGER NOT NULL DEFAULT 60,
    type TEXT NOT NULL DEFAULT 'LectureHall' CHECK (type IN ('LectureHall', 'ComputerLab', 'HardwareLab', 'SeminarRoom', 'TutorialRoom')),
    equipment JSONB NOT NULL DEFAULT '["Projector","Whiteboard"]'::jsonb,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    department_id TEXT REFERENCES public.departments(id) ON DELETE SET NULL,
    maintenance_note TEXT,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Maintenance', 'Archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (institution_id, name)
);

-- Courses Curriculum Catalog
CREATE TABLE IF NOT EXISTS public.courses (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE, -- e.g. "CS501", "CS502"
    name TEXT NOT NULL,
    department_id TEXT NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
    program_id TEXT REFERENCES public.programs(id) ON DELETE SET NULL,
    semester INTEGER DEFAULT 5,
    credits INTEGER NOT NULL DEFAULT 4,
    required_lectures_per_week INTEGER NOT NULL DEFAULT 3,
    required_tutorials_per_week INTEGER NOT NULL DEFAULT 0,
    required_labs_per_week INTEGER NOT NULL DEFAULT 0,
    total_semester_hours INTEGER NOT NULL DEFAULT 45,
    completed_hours INTEGER NOT NULL DEFAULT 0,
    cancelled_hours INTEGER NOT NULL DEFAULT 0,
    requires_lab BOOLEAN NOT NULL DEFAULT FALSE,
    required_equipment JSONB NOT NULL DEFAULT '["Smart Projector"]'::jsonb,
    primary_faculty_id TEXT REFERENCES public.faculty(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Academic Constraints (Configurable rules)
CREATE TABLE IF NOT EXISTS public.academic_constraints (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('Hard', 'Soft')),
    category TEXT NOT NULL CHECK (category IN ('Faculty', 'Room', 'Section', 'Workload', 'TimeSlot')),
    description TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    parameter_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. SCHEDULING & COURSE ALLOCATION MODEL
-- ----------------------------------------------------------------------------

-- Course Allocations (Teaching assignments)
CREATE TABLE IF NOT EXISTS public.course_allocations (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    faculty_id TEXT NOT NULL REFERENCES public.faculty(id) ON DELETE RESTRICT,
    section_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    sub_section_id TEXT REFERENCES public.subgroups(id) ON DELETE CASCADE,
    session_type TEXT NOT NULL CHECK (session_type IN ('Lecture', 'Lab', 'Tutorial', 'Practical', 'Elective', 'Makeup', 'Seminar')),
    hours_per_week INTEGER NOT NULL DEFAULT 3,
    preferred_room_id TEXT REFERENCES public.rooms(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'Allocated' CHECK (status IN ('Allocated', 'Pending', 'Conflict')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timetable Versions (Immutable snapshot lifecycle)
CREATE TABLE IF NOT EXISTS public.timetable_versions (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    academic_year_id TEXT NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL,
    version_label TEXT NOT NULL, -- e.g. "Master V1.0", "Draft V2.0"
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    health_score INTEGER NOT NULL DEFAULT 95,
    change_summary TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timetable Entries / Class Sessions
CREATE TABLE IF NOT EXISTS public.timetable_entries (
    id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL REFERENCES public.timetable_versions(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
    faculty_id TEXT NOT NULL REFERENCES public.faculty(id) ON DELETE RESTRICT,
    section_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
    sub_section_id TEXT REFERENCES public.subgroups(id) ON DELETE RESTRICT,
    room_id TEXT NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
    day TEXT NOT NULL CHECK (day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
    time_slot_id TEXT NOT NULL,
    session_type TEXT NOT NULL CHECK (session_type IN ('Lecture', 'Lab', 'Tutorial', 'Practical', 'Elective', 'Makeup', 'Seminar')),
    status TEXT NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Planned', 'Confirmed', 'Published', 'Cancelled', 'Rescheduled', 'Completed')),
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    lock_reason TEXT,
    cancellation_reason TEXT,
    cancellation_timestamp TIMESTAMPTZ,
    original_session_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. WORKFLOW, NOTIFICATIONS & RECOVERY MODEL
-- ----------------------------------------------------------------------------

-- Makeup & Recovery Tasks
CREATE TABLE IF NOT EXISTS public.replacement_tasks (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    cancelled_session_id TEXT NOT NULL,
    course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    faculty_id TEXT NOT NULL REFERENCES public.faculty(id) ON DELETE RESTRICT,
    cancelled_day TEXT NOT NULL,
    cancelled_time_slot TEXT NOT NULL,
    priority_score INTEGER NOT NULL DEFAULT 95,
    status TEXT NOT NULL DEFAULT 'ProposalsGenerated' CHECK (status IN ('Pending', 'ProposalsGenerated', 'AcceptedByFaculty', 'ApprovedByCoordinator', 'Scheduled', 'Dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Replacement Options (System-generated recovery slots)
CREATE TABLE IF NOT EXISTS public.replacement_options (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES public.replacement_tasks(id) ON DELETE CASCADE,
    target_day TEXT NOT NULL,
    time_slot_id TEXT NOT NULL,
    room_id TEXT NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
    faculty_id TEXT NOT NULL REFERENCES public.faculty(id) ON DELETE RESTRICT,
    match_score INTEGER NOT NULL,
    factors JSONB NOT NULL DEFAULT '{}'::jsonb,
    rationale TEXT NOT NULL,
    conflict_check_passed BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'Proposed' CHECK (status IN ('Proposed', 'Accepted', 'Rejected', 'Approved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Replacement Polls & Student Votes (Democratic Makeup Slot Selection)
CREATE TABLE IF NOT EXISTS public.replacement_polls (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES public.replacement_tasks(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_eligible_students INTEGER NOT NULL DEFAULT 50,
    voted_students_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.replacement_votes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    poll_id TEXT NOT NULL REFERENCES public.replacement_polls(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (poll_id, student_id) -- Enforces 1-vote constraint per student
);

-- System Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    recipient_user_id TEXT, -- NULL denotes broadcast to institutional role
    recipient_role TEXT,
    type TEXT NOT NULL CHECK (type IN ('cancellation', 'room_change', 'makeup_request', 'approval_needed', 'poll_created', 'system_alert')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Info' CHECK (category IN ('Critical', 'Warning', 'Info', 'Success')),
    read BOOLEAN NOT NULL DEFAULT FALSE,
    actionable BOOLEAN NOT NULL DEFAULT FALSE,
    action_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Immutable Institutional Audit Logs
CREATE TABLE IF NOT EXISTS public.audit_events (
    id TEXT PRIMARY KEY,
    institution_id TEXT NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. INDEXES ON CRITICAL QUERY PATHS
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_profiles_institution ON public.profiles(institution_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role_code);
CREATE INDEX IF NOT EXISTS idx_groups_institution ON public.groups(institution_id);
CREATE INDEX IF NOT EXISTS idx_groups_program ON public.groups(program_id);
CREATE INDEX IF NOT EXISTS idx_subgroups_group ON public.subgroups(group_id);
CREATE INDEX IF NOT EXISTS idx_faculty_dept ON public.faculty(department_id);
CREATE INDEX IF NOT EXISTS idx_rooms_inst ON public.rooms(institution_id);
CREATE INDEX IF NOT EXISTS idx_courses_dept ON public.courses(department_id);
CREATE INDEX IF NOT EXISTS idx_allocations_course ON public.course_allocations(course_id);
CREATE INDEX IF NOT EXISTS idx_allocations_faculty ON public.course_allocations(faculty_id);
CREATE INDEX IF NOT EXISTS idx_allocations_section ON public.course_allocations(section_id);
CREATE INDEX IF NOT EXISTS idx_tt_entries_version ON public.timetable_entries(version_id);
CREATE INDEX IF NOT EXISTS idx_tt_entries_day_slot ON public.timetable_entries(day, time_slot_id);
CREATE INDEX IF NOT EXISTS idx_tt_entries_faculty ON public.timetable_entries(faculty_id);
CREATE INDEX IF NOT EXISTS idx_tt_entries_room ON public.timetable_entries(room_id);
CREATE INDEX IF NOT EXISTS idx_tt_entries_section ON public.timetable_entries(section_id);
CREATE INDEX IF NOT EXISTS idx_notifications_inst ON public.notifications(institution_id, read);
CREATE INDEX IF NOT EXISTS idx_audit_inst_date ON public.audit_events(institution_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- Enable Row Level Security on EVERY exposed table
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subgroups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_constraints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.replacement_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Base Public Read Policies for Academic Master Data (Accessible to Authenticated Institution Members)
CREATE POLICY "Institutions read by authenticated users" ON public.institutions
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Profiles read by self or institutional staff" ON public.profiles
    FOR SELECT TO authenticated USING (
        id = auth.uid()::text OR 
        role_code IN ('COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN', 'HOD')
    );

CREATE POLICY "Departments read by authenticated users" ON public.departments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Programs read by authenticated users" ON public.programs
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Groups read by authenticated users" ON public.groups
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Subgroups read by authenticated users" ON public.subgroups
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Courses read by authenticated users" ON public.courses
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Faculty read by authenticated users" ON public.faculty
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Rooms read by authenticated users" ON public.rooms
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allocations read by authenticated users" ON public.course_allocations
    FOR SELECT TO authenticated USING (true);

-- Timetable Versions: Published versions visible to all; drafts visible only to Coordinators and Admins
CREATE POLICY "Timetable versions visible to users" ON public.timetable_versions
    FOR SELECT TO authenticated USING (
        is_published = TRUE OR 
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role_code IN ('COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN')
        )
    );

CREATE POLICY "Timetable entries visible based on version publication" ON public.timetable_entries
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.timetable_versions v
            WHERE v.id = timetable_entries.version_id
            AND (
                v.is_published = TRUE OR 
                EXISTS (
                    SELECT 1 FROM public.profiles p
                    WHERE p.id = auth.uid()::text 
                    AND p.role_code IN ('COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN')
                )
            )
        )
    );

-- Write Permissions (Restricted to Coordinators and College Admins)
CREATE POLICY "Coordinators and Admins can manage academic master data" ON public.courses
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role_code IN ('COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN')
        )
    );

CREATE POLICY "Coordinators and Admins can manage groups" ON public.groups
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role_code IN ('COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN')
        )
    );

CREATE POLICY "Coordinators and Admins can manage subgroups" ON public.subgroups
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role_code IN ('COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN')
        )
    );

CREATE POLICY "Coordinators and Admins can manage allocations" ON public.course_allocations
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role_code IN ('COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN')
        )
    );

CREATE POLICY "Coordinators and Admins can manage timetable drafts" ON public.timetable_versions
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role_code IN ('COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN')
        )
    );

CREATE POLICY "Coordinators and Admins can manage timetable entries" ON public.timetable_entries
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid()::text 
            AND profiles.role_code IN ('COORDINATOR', 'COLLEGE_ADMIN', 'SUPER_ADMIN')
        )
    );

-- Notifications: Visible to recipient or matching role
CREATE POLICY "Users read their notifications" ON public.notifications
    FOR SELECT TO authenticated USING (
        recipient_user_id = auth.uid()::text OR 
        recipient_role = (SELECT role_code FROM public.profiles WHERE id = auth.uid()::text) OR
        (recipient_user_id IS NULL AND recipient_role IS NULL)
    );

-- Replacement Voting: Students can vote once per poll
CREATE POLICY "Students insert replacement votes" ON public.replacement_votes
    FOR INSERT TO authenticated WITH CHECK (
        student_id = auth.uid()::text AND
        EXISTS (
            SELECT 1 FROM public.replacement_polls p
            WHERE p.id = replacement_votes.poll_id AND p.is_active = TRUE
        )
    );

CREATE POLICY "Users view replacement polls" ON public.replacement_polls
    FOR SELECT TO authenticated USING (true);
