import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTimetable } from '../../context/TimetableContext';
import { useTheme } from '../../context/ThemeContext';
import {
  User,
  ShieldCheck,
  Building,
  Mail,
  Phone,
  MapPin,
  Clock,
  KeyRound,
  GraduationCap,
  BookOpen,
  Calendar,
  Lock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  X,
  Edit3,
  Save,
  Activity,
  Layers,
  Smartphone,
  Fingerprint,
  RotateCcw,
  Bell,
  Sun,
  Moon,
  Settings
} from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSwitchAccount?: () => void;
}

export function UserProfileModal({ isOpen, onClose, onOpenSwitchAccount }: UserProfileModalProps) {
  const {
    currentUser,
    currentInstitution,
    currentMembership,
    currentRole,
    userPermissions,
    allPermissions,
    allSessions,
    updateUserProfile,
    revokeSession,
    currentWorkspace,
    authorizedWorkspaces,
    switchWorkspace,
  } = useAuth();

  const { courses, sessions, auditLogs } = useTimetable();

  const [activeTab, setActiveTab] = useState<'identity' | 'academic' | 'rbac' | 'security' | 'audit'>('identity');
  const [isEditing, setIsEditing] = useState(false);

  // Edit form state
  const [phoneInput, setPhoneInput] = useState(currentUser?.phone || '');
  const [officeLocationInput, setOfficeLocationInput] = useState(currentUser?.officeLocation || '');
  const [officeHoursInput, setOfficeHoursInput] = useState(currentUser?.officeHours || '');
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen || !currentUser) return null;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile(currentUser.id, {
      phone: phoneInput.trim(),
      officeLocation: officeLocationInput.trim(),
      officeHours: officeHoursInput.trim(),
    });
    setIsEditing(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Find user's teaching or enrolled sessions
  const userSessions = sessions.filter(
    s => s.facultyId === currentUser.id || s.facultyId === 'fac-sharma' || s.sectionId === currentUser.sectionId
  );

  // Filter audit logs initiated by this user
  const userAuditLogs = auditLogs.filter(
    l => l.userId === currentUser.id || l.userId === 'coordinator'
  ).slice(0, 6);

  const activeUserSession = allSessions.find(s => s.userId === currentUser.id && !s.isRevoked) || allSessions[0];

  const { theme, toggleTheme } = useTheme();
  const [studentTab, setStudentTab] = useState<'profile' | 'academic' | 'preferences'>('profile');
  const [studentPhone, setStudentPhone] = useState(currentUser?.phone || '+91 98712 34567');
  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);

  const isStudentUser = currentWorkspace === 'Student' || currentWorkspace === 'CR' || !!currentUser?.rollNumber;

  if (isStudentUser) {
    const studentDisplayName = currentUser.name.replace(/\s*\(Student\)/i, '').replace(/\s*\(CR\)/i, '');

    const handleSavePhone = (e: React.FormEvent) => {
      e.preventDefault();
      updateUserProfile(currentUser.id, { phone: studentPhone.trim() });
      setIsEditingPhone(false);
      setPhoneSaved(true);
      setTimeout(() => setPhoneSaved(false), 2000);
    };

    return (
      <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
        <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-xl w-full shadow-lg relative overflow-hidden my-auto max-h-[92vh] flex flex-col text-stone-900 dark:text-zinc-100">
          
          {/* Header */}
          <div className="p-6 border-b border-[#E5E2D9] dark:border-zinc-800 bg-[#F4F2EC] dark:bg-zinc-950/70 flex items-start justify-between">
            <div className="flex items-center gap-4">
              {/* Circular Avatar */}
              <div className="relative">
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={studentDisplayName}
                    className="w-14 h-14 rounded-full object-cover border border-[#8C1B2E]/30 shadow-xs"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#8C1B2E]/10 border border-[#8C1B2E]/30 text-[#8C1B2E] flex items-center justify-center font-bold text-xl shadow-xs">
                    {studentDisplayName.charAt(0)}
                  </div>
                )}
              </div>

              <div className="space-y-0.5">
                <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-zinc-100 font-serif">
                  {studentDisplayName}
                </h2>
                <p className="text-xs text-stone-600 dark:text-zinc-400">
                  B.Tech Computer Science & Engineering
                </p>
                <div className="text-[11px] text-stone-500 dark:text-zinc-400 flex items-center gap-2 pt-0.5">
                  <span>Semester 5 · CSE-A · 2024 Batch</span>
                  <span>·</span>
                  <span className="font-mono text-stone-700 dark:text-zinc-300">Roll No. {currentUser.rollNumber || '102303999'}</span>
                  <span>·</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">Enrolled</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/50 transition-colors"
              aria-label="Close profile"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-[#E5E2D9] dark:border-zinc-800 px-6 bg-[#FAF9F5] dark:bg-zinc-900">
            <button
              onClick={() => setStudentTab('profile')}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                studentTab === 'profile'
                  ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400'
                  : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>Academic Profile</span>
            </button>
            <button
              onClick={() => setStudentTab('preferences')}
              className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                studentTab === 'preferences'
                  ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400'
                  : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Preferences</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6 flex-1 overflow-y-auto space-y-6 text-xs">
            {studentTab === 'profile' && (
              <div className="space-y-6">
                {/* ACADEMIC SECTION */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 pb-2 border-b border-[#E5E2D9] dark:border-zinc-800">
                    Academic
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 pt-3">
                    <div>
                      <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Program</span>
                      <span className="font-medium text-stone-900 dark:text-zinc-100">B.Tech Computer Science & Engineering</span>
                    </div>

                    <div>
                      <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Department</span>
                      <span className="font-medium text-stone-900 dark:text-zinc-100">Computer Science and Engineering</span>
                    </div>

                    <div>
                      <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Semester</span>
                      <span className="font-medium text-stone-900 dark:text-zinc-100">5 (Autumn 2026)</span>
                    </div>

                    <div>
                      <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Section</span>
                      <span className="font-medium text-stone-900 dark:text-zinc-100">CSE-A (Lab Group A1)</span>
                    </div>

                    <div>
                      <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Batch</span>
                      <span className="font-medium text-stone-900 dark:text-zinc-100">2024</span>
                    </div>

                    <div>
                      <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Roll Number</span>
                      <span className="font-mono font-medium text-stone-900 dark:text-zinc-100">{currentUser.rollNumber || '102303999'}</span>
                    </div>
                  </div>
                </div>

                {/* CONTACT SECTION */}
                <div>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-zinc-400 pb-2 border-b border-[#E5E2D9] dark:border-zinc-800">
                    Contact
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5 pt-3">
                    <div>
                      <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Student Email</span>
                      <span className="font-mono text-stone-800 dark:text-zinc-200">{currentUser.email}</span>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[11px] text-stone-500 dark:text-zinc-400">Contact Number</span>
                        {!isEditingPhone && (
                          <button
                            onClick={() => setIsEditingPhone(true)}
                            className="text-[11px] text-[#8C1B2E] dark:text-red-400 hover:underline font-semibold"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {isEditingPhone ? (
                        <form onSubmit={handleSavePhone} className="flex items-center gap-1.5 mt-1">
                          <input
                            type="text"
                            value={studentPhone}
                            onChange={(e) => setStudentPhone(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs rounded border border-[#E5E2D9] dark:border-zinc-700 bg-white dark:bg-zinc-900 text-stone-900 dark:text-zinc-100"
                          />
                          <button
                            type="submit"
                            className="px-2 py-1 bg-[#8C1B2E] text-white rounded text-[11px] font-semibold"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingPhone(false)}
                            className="px-1.5 py-1 text-stone-400 hover:text-stone-600 text-[11px]"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-stone-800 dark:text-zinc-200">{studentPhone}</span>
                          {phoneSaved && <span className="text-[10px] text-emerald-700 font-medium">Saved</span>}
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <span className="text-[11px] text-stone-500 dark:text-zinc-400 block mb-0.5">Campus Residence</span>
                      <span className="text-stone-800 dark:text-zinc-200">Hostel J, Block B, Room 214 · Patiala Campus</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {studentTab === 'preferences' && (
              <div className="divide-y divide-[#E5E2D9] dark:divide-zinc-800">
                <div className="py-3.5 first:pt-0 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-zinc-100 block">Schedule notifications</span>
                    <span className="text-[11px] text-stone-500 dark:text-zinc-400">Receive timetable and class-change notifications</span>
                  </div>
                  <input
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 rounded border-stone-300 text-[#8C1B2E] focus:ring-[#8C1B2E]"
                  />
                </div>

                <div className="py-3.5 flex items-center justify-between gap-4">
                  <div>
                    <span className="font-semibold text-stone-900 dark:text-zinc-100 block">Default timetable view</span>
                    <span className="text-[11px] text-stone-500 dark:text-zinc-400">Choose between the weekly matrix grid and daily agenda</span>
                  </div>
                  <select
                    defaultValue="grid"
                    className="px-2.5 py-1 text-xs rounded border border-[#E5E2D9] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-stone-800 dark:text-zinc-200"
                  >
                    <option value="grid">Weekly grid</option>
                    <option value="agenda">Day view</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#E5E2D9] dark:border-zinc-800 bg-[#F4F2EC] dark:bg-zinc-950/70 flex items-center justify-between">
            <span className="text-[11px] text-stone-500 dark:text-zinc-400">
              Thapar Institute of Engineering & Technology
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-stone-100 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-3xl w-full shadow-lg relative overflow-hidden my-auto max-h-[92vh] flex flex-col text-stone-900 dark:text-zinc-100">
        {/* Institutional Banner Header */}
        <div className="relative bg-[#F4F2EC] dark:bg-zinc-950/70 p-6 border-b border-[#E5E2D9] dark:border-zinc-800 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                {currentUser.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={currentUser.name}
                    className="w-14 h-14 rounded-full object-cover border border-[#8C1B2E]/30 shadow-xs"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-[#8C1B2E]/10 text-[#8C1B2E] flex items-center justify-center font-bold text-xl border border-[#8C1B2E]/30 shadow-xs">
                    {currentUser.name.charAt(0)}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900" title="Active DPDPA Verified Session" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-stone-900 dark:text-zinc-100 tracking-tight font-serif">
                    {currentUser.name}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#8C1B2E]/10 text-[#8C1B2E] dark:text-red-300 border border-[#8C1B2E]/20">
                    {currentRole?.name || 'Institutional Member'}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="h-3 w-3" /> {currentUser.status}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-600 dark:text-zinc-400 mt-1 font-medium">
                  <span className="flex items-center gap-1">
                    <Building className="h-3.5 w-3.5 text-[#8C1B2E] dark:text-red-400" />
                    <span>{currentInstitution.name} ({currentInstitution.code})</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5 text-stone-400 dark:text-zinc-500" />
                    <span className="font-mono text-stone-700 dark:text-zinc-300">{currentUser.email}</span>
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 hover:bg-stone-200/50 transition-colors"
              aria-label="Close profile"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 mt-6 border-b border-[#E5E2D9] dark:border-zinc-800 -mb-6 overflow-x-auto text-xs">
            <button
              onClick={() => setActiveTab('identity')}
              className={`px-3.5 py-2 font-medium border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
                activeTab === 'identity'
                  ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400 font-semibold'
                  : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>Identity & Contact</span>
            </button>

            <button
              onClick={() => setActiveTab('academic')}
              className={`px-3.5 py-2 font-medium border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
                activeTab === 'academic'
                  ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400 font-semibold'
                  : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Academic & Load</span>
            </button>

            <button
              onClick={() => setActiveTab('rbac')}
              className={`px-3.5 py-2 font-medium border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
                activeTab === 'rbac'
                  ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400 font-semibold'
                  : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>RBAC Permissions ({userPermissions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('security')}
              className={`px-3.5 py-2 font-medium border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
                activeTab === 'security'
                  ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400 font-semibold'
                  : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Security & Sessions</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-2 font-medium border-b-2 transition-all shrink-0 flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'border-[#8C1B2E] text-[#8C1B2E] dark:text-red-400 font-semibold'
                  : 'border-transparent text-stone-500 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-200'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Audit Provenance</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {saveSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>Institutional profile preferences updated successfully.</span>
            </div>
          )}

          {/* TAB 1: IDENTITY & CONTACT */}
          {activeTab === 'identity' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif font-bold text-stone-900 dark:text-white text-sm">
                    Profile & Contact Information
                  </h3>
                  <p className="text-stone-500 dark:text-zinc-400 text-[11px] mt-0.5">
                    Official institutional profile for {currentUser.name}
                  </p>
                </div>

                {!isEditing ? (
                  <button
                    onClick={() => {
                      setPhoneInput(currentUser.phone || '');
                      setOfficeLocationInput(currentUser.officeLocation || '');
                      setOfficeHoursInput(currentUser.officeHours || '');
                      setIsEditing(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-stone-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-800 dark:text-zinc-200 rounded-lg text-xs font-semibold border border-[#E5E2D9] dark:border-zinc-700 transition-colors shadow-2xs"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-[#8C1B2E] dark:text-red-400" />
                    <span>Edit Contact Info</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"
                  >
                    Cancel
                  </button>
                )}
              </div>

              {!isEditing ? (
                <div className="space-y-4">
                  {authorizedWorkspaces.length > 1 && (
                    <div className="p-4 bg-white dark:bg-zinc-950/80 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 space-y-2.5 shadow-2xs">
                      <div className="text-[10px] font-mono text-stone-500 dark:text-zinc-400 font-semibold uppercase tracking-wider">
                        Authorized Workspaces ({authorizedWorkspaces.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {authorizedWorkspaces.map(ws => (
                          <button
                            key={ws}
                            onClick={() => {
                              switchWorkspace(ws);
                              onClose();
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              currentWorkspace === ws
                                ? 'bg-[#8C1B2E] text-white font-semibold shadow-2xs'
                                : 'bg-stone-100 dark:bg-zinc-900 text-stone-700 dark:text-zinc-300 hover:bg-stone-200/60 dark:hover:bg-zinc-850 border border-[#E5E2D9] dark:border-zinc-800'
                            }`}
                          >
                            <span>{ws === 'CR' ? 'Class Representative' : `${ws} Portal`}</span>
                            {currentWorkspace === ws && <span className="ml-1.5 text-[10px] opacity-80">(Active)</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 space-y-3 shadow-2xs">
                      <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">
                        Organizational Placement
                      </span>

                      <div className="space-y-2">
                        <div>
                          <span className="text-stone-500 block text-[11px]">Primary Department</span>
                          <span className="font-semibold text-stone-800 dark:text-zinc-200">
                            {currentUser.department || 'Computer Science & Engineering'}
                          </span>
                        </div>

                        <div>
                          <span className="text-stone-500 block text-[11px]">Institutional Tenant</span>
                          <span className="font-semibold text-stone-800 dark:text-zinc-200">
                            {currentInstitution.name} ({currentInstitution.code})
                          </span>
                        </div>

                        <div>
                          <span className="text-stone-500 block text-[11px]">Specialization / Domain</span>
                          <span className="font-semibold text-stone-800 dark:text-zinc-200">
                            {currentUser.specialization || 'Academic Optimization & Engineering'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 space-y-3 shadow-2xs">
                      <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider block">
                        Contact & Office Availability
                      </span>

                      <div className="space-y-2">
                        <div>
                          <span className="text-stone-500 block text-[11px]">Institutional Email</span>
                          <span className="font-semibold text-stone-800 dark:text-zinc-200 truncate block max-w-full break-all">{currentUser.email}</span>
                        </div>

                        <div>
                          <span className="text-stone-500 block text-[11px]">Contact Telephone</span>
                          <span className="font-semibold text-stone-800 dark:text-zinc-200">{currentUser.phone || '+91 175 239 3000'}</span>
                        </div>

                        <div>
                          <span className="text-stone-500 block text-[11px]">Office Room Location</span>
                          <span className="font-semibold text-stone-800 dark:text-zinc-200">{currentUser.officeLocation || 'Faculty Enclave, Block A'}</span>
                        </div>

                        <div>
                          <span className="text-stone-500 block text-[11px]">Office / Advisory Hours</span>
                          <span className="font-semibold text-[#8C1B2E] dark:text-red-400">{currentUser.officeHours || 'Mon & Wed 14:00 - 16:00'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSaveProfile} className="p-5 bg-white dark:bg-zinc-950/80 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 space-y-4 shadow-2xs">
                  <div className="font-serif font-bold text-stone-900 dark:text-white text-xs">Edit Contact & Office Information</div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[11px] text-stone-600 dark:text-zinc-300 font-medium">Telephone Number</label>
                      <input
                        type="text"
                        value={phoneInput}
                        onChange={e => setPhoneInput(e.target.value)}
                        className="w-full bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2.5 text-xs text-stone-900 dark:text-white outline-none focus:border-[#8C1B2E]"
                        placeholder="+91 98110 00000"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-stone-600 dark:text-zinc-300 font-medium">Office Room / Chamber</label>
                      <input
                        type="text"
                        value={officeLocationInput}
                        onChange={e => setOfficeLocationInput(e.target.value)}
                        className="w-full bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2.5 text-xs text-stone-900 dark:text-white outline-none focus:border-[#8C1B2E]"
                        placeholder="Block A, Room 402"
                      />
                    </div>

                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[11px] text-stone-600 dark:text-zinc-300 font-medium">Advisory / Office Hours</label>
                      <input
                        type="text"
                        value={officeHoursInput}
                        onChange={e => setOfficeHoursInput(e.target.value)}
                        className="w-full bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-lg p-2.5 text-xs text-stone-900 dark:text-white outline-none focus:border-[#8C1B2E]"
                        placeholder="Mon & Thu 14:00 - 16:00"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 text-stone-500 hover:text-stone-900 dark:text-zinc-400 dark:hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#8C1B2E] hover:bg-[#721524] text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-2xs"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>Save Updates</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Student Identification Cards if applicable */}
              {currentUser.rollNumber && (
                <div className="p-4 bg-white dark:bg-zinc-950/40 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-2 shadow-2xs">
                  <span className="text-[10px] font-mono text-[#8C1B2E] dark:text-red-400 font-bold uppercase tracking-wider">
                    Student Enrollment Credentials
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-stone-500 block text-[10px]">Roll Number</span>
                      <span className="font-mono font-bold text-stone-900 dark:text-white">{currentUser.rollNumber}</span>
                    </div>
                    <div>
                      <span className="text-stone-500 block text-[10px]">Academic Batch</span>
                      <span className="font-mono font-bold text-stone-900 dark:text-white">{currentUser.batch}</span>
                    </div>
                    <div>
                      <span className="text-stone-500 block text-[10px]">Class Section</span>
                      <span className="font-mono font-bold text-stone-900 dark:text-white">CSE-A (Semester 5)</span>
                    </div>
                    <div>
                      <span className="text-stone-500 block text-[10px]">CR Status</span>
                      <span className="font-bold text-[#8C1B2E] dark:text-red-400">
                        {currentRole?.code === 'CLASS_REPRESENTATIVE' ? 'Active CR' : 'Student'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACADEMIC & TEACHING LOAD */}
          {activeTab === 'academic' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-serif font-bold text-stone-900 dark:text-white text-sm">
                  Academic Teaching Load & Curriculum Mapping
                </h3>
                <p className="text-stone-500 dark:text-zinc-400 text-[11px] mt-0.5">
                  Real-time workload adherence compliant with UGC Regulations (Assoc. Prof 14h / Asst. Prof 16h)
                </p>
              </div>

              {/* UGC Norm Workload Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-center">
                <div className="p-4 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-2xs">
                  <span className="text-stone-500 dark:text-zinc-400 block mb-1">Direct Weekly Teaching</span>
                  <span className="text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">12 / 14 hrs</span>
                  <span className="text-[10px] text-stone-500 block mt-1">UGC Ceiling: 14 hrs/wk</span>
                </div>

                <div className="p-4 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-2xs">
                  <span className="text-stone-500 dark:text-zinc-400 block mb-1">Protected Research Free-Time</span>
                  <span className="text-2xl font-bold font-mono text-stone-800 dark:text-zinc-200">6 hrs / wk</span>
                  <span className="text-[10px] text-stone-500 block mt-1">Reserved against solver</span>
                </div>

                <div className="p-4 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 shadow-2xs">
                  <span className="text-stone-500 dark:text-zinc-400 block mb-1">Free-Slot Marketplace</span>
                  <span className="text-2xl font-bold font-mono text-[#8C1B2E] dark:text-red-400">Active</span>
                  <span className="text-[10px] text-stone-500 block mt-1">Voluntary tutorials</span>
                </div>
              </div>

              {/* Assigned Subjects / Active Timetable Sessions */}
              <div className="space-y-3">
                <span className="text-xs font-semibold text-stone-700 dark:text-zinc-300 block">
                  Assigned Course Offerings & Timetable Routine
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {courses.slice(0, 4).map(course => (
                    <div
                      key={course.id}
                      className="p-3 bg-white dark:bg-zinc-950/70 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl flex items-center justify-between shadow-2xs"
                    >
                      <div>
                        <div className="font-serif font-bold text-stone-900 dark:text-white text-xs">{course.code}: {course.name}</div>
                        <div className="text-[10px] text-stone-500 dark:text-zinc-400 mt-0.5">
                          Credits: {course.credits} · Weekly Lectures: {course.requiredLecturesPerWeek}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 dark:bg-zinc-800 dark:text-zinc-300 font-mono text-[10px]">
                        Sem 5
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: RBAC PERMISSIONS */}
          {activeTab === 'rbac' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif font-bold text-stone-900 dark:text-white text-sm">
                    Effective Role-Based Access Control (RBAC)
                  </h3>
                  <p className="text-stone-500 dark:text-zinc-400 text-[11px] mt-0.5">
                    Role: <span className="font-bold text-[#8C1B2E] dark:text-red-400">{currentRole?.name}</span> ({currentRole?.code})
                  </p>
                </div>

                <span className="text-xs font-mono text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/20 font-semibold">
                  {userPermissions.length} Active Grants
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {allPermissions.map(perm => {
                  const isGranted = userPermissions.includes(perm.code);

                  return (
                    <div
                      key={perm.id}
                      className={`p-3 rounded-xl border flex items-start justify-between gap-3 ${
                        isGranted
                          ? 'bg-white dark:bg-zinc-950/80 border-[#E5E2D9] dark:border-zinc-800 text-stone-800 dark:text-zinc-200 shadow-2xs'
                          : 'bg-stone-50 dark:bg-zinc-950/30 border-[#E5E2D9]/60 dark:border-zinc-800/40 text-stone-400 dark:text-zinc-600'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-mono text-xs font-bold ${isGranted ? 'text-stone-900 dark:text-white' : 'text-stone-400'}`}>
                            {perm.name}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 dark:text-zinc-400 leading-tight">
                          {perm.description}
                        </p>
                        <span className="text-[9px] font-mono text-stone-400 dark:text-zinc-500 block pt-0.5">
                          {perm.code}
                        </span>
                      </div>

                      <div className="shrink-0 pt-0.5">
                        {isGranted ? (
                          <span className="w-2 h-2 rounded-full bg-emerald-600 block" title="Granted" />
                        ) : (
                          <span className="w-2 h-2 rounded-full bg-stone-300 dark:bg-zinc-700 block" title="Restricted" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: SECURITY & SESSIONS */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-serif font-bold text-stone-900 dark:text-white text-sm">
                  Active Session Cache & Enterprise Security
                </h3>
                <p className="text-stone-500 dark:text-zinc-400 text-[11px] mt-0.5">
                  High-speed session validation via Redis-style fast store with instant revocation.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-white dark:bg-zinc-950/70 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-3 shadow-2xs">
                  <span className="text-[10px] font-mono text-[#8C1B2E] dark:text-red-400 uppercase font-bold block">
                    Active JWT / Session Token
                  </span>

                  <div className="space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Token ID:</span>
                      <span className="text-stone-800 dark:text-zinc-200 font-bold">{activeUserSession.token.slice(0, 16)}...</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Authentication IP:</span>
                      <span className="text-stone-800 dark:text-zinc-200">{currentUser.ipAddress || '192.168.10.45'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Created:</span>
                      <span className="text-stone-800 dark:text-zinc-200">{new Date(activeUserSession.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Status:</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                        {activeUserSession.isRevoked ? 'REVOKED' : 'VALID / ACTIVE'}
                      </span>
                    </div>
                  </div>

                  {!activeUserSession.isRevoked && (
                    <button
                      onClick={() => revokeSession(activeUserSession.id)}
                      className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30 rounded-lg text-xs font-semibold transition-colors mt-2"
                    >
                      Revoke Active Session Token
                    </button>
                  )}
                </div>

                <div className="p-4 bg-white dark:bg-zinc-950/70 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-3 shadow-2xs">
                  <span className="text-[10px] font-mono text-stone-600 dark:text-zinc-400 uppercase font-bold block">
                    Enterprise SSO & 2FA Status
                  </span>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-stone-500">Institutional SSO</span>
                      <span className="font-semibold text-stone-800 dark:text-zinc-200">
                        {currentUser.ssoProvider || 'Google Workspace SAML'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-stone-500">Two-Factor Authentication (2FA)</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <Fingerprint className="h-3.5 w-3.5" /> Enforced
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-stone-500">DPDPA 2023 Compliance</span>
                      <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notification Preferences */}
              <div className="p-4 bg-white dark:bg-zinc-950/60 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 space-y-3 shadow-2xs">
                <span className="text-xs font-semibold text-stone-800 dark:text-zinc-200 block">
                  Automated Disruption Alert Channels
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-stone-50 dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span>Email Broadcasts</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">Enabled</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-stone-50 dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span>In-App Recovery Alerts</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">Enabled</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-stone-50 dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 flex items-center justify-between">
                    <span>Urgent SMS (Freeze &lt;24h)</span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">Active</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: AUDIT PROVENANCE */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-serif font-bold text-stone-900 dark:text-white text-sm">
                  Immutable Institutional Audit Trail
                </h3>
                <p className="text-stone-500 dark:text-zinc-400 text-[11px] mt-0.5">
                  Record of changes, solver executions, and approvals committed by this account.
                </p>
              </div>

              <div className="space-y-2">
                {userAuditLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-3 bg-white dark:bg-zinc-950/70 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl space-y-1 text-xs shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#8C1B2E] dark:text-red-400 text-[11px]">
                        {log.action}
                      </span>
                      <span className="text-[10px] text-stone-500 font-mono">{log.timestamp}</span>
                    </div>
                    <p className="text-stone-600 dark:text-slate-300 text-[11px] leading-relaxed">
                      {log.details}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer Actions */}
        <div className="p-4 border-t border-[#E5E2D9] dark:border-zinc-800 bg-[#F4F2EC] dark:bg-zinc-950/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-zinc-400">
            <span>Last Login: {new Date(currentUser.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(currentUser.lastLoginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenSwitchAccount && (
              <button
                onClick={() => {
                  onClose();
                  onOpenSwitchAccount();
                }}
                className="px-3.5 py-1.5 bg-white hover:bg-stone-50 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-stone-700 dark:text-zinc-200 rounded-lg text-xs font-semibold border border-[#E5E2D9] dark:border-zinc-700 transition-colors shadow-2xs"
              >
                Switch Account / Role
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-[#8C1B2E] hover:bg-[#721524] text-white rounded-lg text-xs font-semibold transition-colors shadow-2xs"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
