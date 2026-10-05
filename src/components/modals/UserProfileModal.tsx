import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTimetable } from '../../context/TimetableContext';
import {
  User,
  Building,
  Mail,
  Phone,
  MapPin,
  Clock,
  KeyRound,
  X,
  Edit3,
  CheckCircle2,
  Lock,
  BookOpen
} from 'lucide-react';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSwitchAccount?: () => void;
}

export function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
  const {
    currentUser,
    currentInstitution,
    currentRole,
    updateUserProfile,
    currentWorkspace,
  } = useAuth();

  const [isEditing, setIsEditing] = useState(false);

  // Form states
  const [phoneInput, setPhoneInput] = useState(currentUser?.phone || '+91 98123 45678');
  const [officeLocationInput, setOfficeLocationInput] = useState(currentUser?.officeLocation || 'Academic Block C, Room 204');
  const [officeHoursInput, setOfficeHoursInput] = useState(currentUser?.officeHours || 'Mon–Fri 10:00 AM – 12:00 PM');
  
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ success: boolean; text: string } | null>(null);

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

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 12) {
      setPasswordMessage({ success: false, text: 'Password must be at least 12 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ success: false, text: 'New passwords do not match.' });
      return;
    }

    setPasswordMessage({ success: true, text: 'Password updated successfully.' });
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => {
      setShowPasswordForm(false);
      setPasswordMessage(null);
    }, 2000);
  };

  const isStudentUser = currentWorkspace === 'Student' || currentWorkspace === 'CR' || !!currentUser?.rollNumber;

  if (isStudentUser) {
    const studentDisplayName = currentUser.name.replace(/\s*\(Student\)/i, '').replace(/\s*\(CR\)/i, '');

    return (
      <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150 font-sans">
        <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-xl w-full shadow-lg relative overflow-hidden my-auto max-h-[92vh] flex flex-col text-stone-900 dark:text-zinc-100">
          
          {/* Header */}
          <div className="p-6 border-b border-[#E5E2D9] dark:border-zinc-800 bg-[#F4F2EC] dark:bg-zinc-950/70 flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-[#8C1B2E]/10 border border-[#8C1B2E]/30 text-[#8C1B2E] flex items-center justify-center font-bold text-xl shadow-xs">
                {studentDisplayName.charAt(0)}
              </div>

              <div className="space-y-0.5">
                <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-zinc-100 font-serif">
                  {studentDisplayName}
                </h2>
                <p className="text-xs text-stone-600 dark:text-zinc-400">
                  B.Tech Computer Science & Engineering
                </p>
                <div className="text-[11px] text-stone-500 dark:text-zinc-400 flex items-center gap-2 pt-0.5">
                  <span>Semester 5 · CSE-A</span>
                  <span>·</span>
                  <span className="font-mono text-stone-700 dark:text-zinc-300">Roll No. {currentUser.rollNumber || '102303999'}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 transition-colors"
              aria-label="Close profile"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto space-y-5 text-xs">
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 border-b border-[#E5E2D9] dark:border-zinc-800 pb-1.5">
                Academic Profile
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-stone-500 block">Program</span>
                  <span className="font-semibold text-stone-900 dark:text-zinc-100">B.Tech Computer Science</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Department</span>
                  <span className="font-semibold text-stone-900 dark:text-zinc-100">Computer Science & Engineering</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Institutional Email</span>
                  <span className="font-mono text-stone-800 dark:text-zinc-200">{currentUser.email}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Contact Phone</span>
                  <span className="font-mono text-stone-800 dark:text-zinc-200">{phoneInput}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#E5E2D9] dark:border-zinc-800 bg-[#F4F2EC] dark:bg-zinc-950/70 flex items-center justify-between text-xs">
            <span className="text-stone-500">Thapar Institute of Engineering & Technology</span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in duration-150 font-sans">
      <div className="bg-[#FAF9F5] dark:bg-zinc-900 border border-[#E5E2D9] dark:border-zinc-800 rounded-xl max-w-xl w-full shadow-lg relative overflow-hidden my-auto max-h-[92vh] flex flex-col text-stone-900 dark:text-zinc-100">
        
        {/* Header */}
        <div className="p-6 border-b border-[#E5E2D9] dark:border-zinc-800 bg-[#F4F2EC] dark:bg-zinc-950/70 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-[#8C1B2E]/10 text-[#8C1B2E] flex items-center justify-center font-bold text-xl border border-[#8C1B2E]/30 shadow-xs shrink-0">
              {currentUser.name.charAt(0)}
            </div>

            <div>
              <h2 className="text-xl font-bold text-stone-900 dark:text-zinc-100 tracking-tight font-serif">
                {currentUser.name}
              </h2>
              <p className="text-xs text-stone-600 dark:text-zinc-400 mt-0.5">
                {currentRole?.name || 'Timetable Coordinator'} · Computer Science & Engineering
              </p>
              <div className="text-[11px] text-stone-500 dark:text-zinc-400 mt-1 flex items-center gap-2">
                <Building className="h-3.5 w-3.5 text-[#8C1B2E]" />
                <span>{currentInstitution.name} ({currentInstitution.code})</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 dark:hover:text-zinc-200 transition-colors"
            aria-label="Close profile"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {saveSuccess && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Contact details updated successfully.</span>
            </div>
          )}

          {/* Profile & Contact Details */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E5E2D9] dark:border-zinc-800 pb-2">
              <h3 className="font-bold uppercase tracking-wider text-stone-500 text-[11px]">
                Profile & Contact Information
              </h3>

              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1.5 text-xs text-[#8C1B2E] dark:text-red-400 font-semibold hover:underline"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit Contact</span>
                </button>
              ) : (
                <button
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-stone-500 hover:underline"
                >
                  Cancel
                </button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleSaveProfile} className="space-y-3 pt-1">
                <div>
                  <label className="block text-stone-600 dark:text-zinc-400 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 bg-white dark:bg-zinc-950 text-stone-900 dark:text-zinc-100 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-stone-600 dark:text-zinc-400 mb-1">Office Location</label>
                  <input
                    type="text"
                    value={officeLocationInput}
                    onChange={e => setOfficeLocationInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 bg-white dark:bg-zinc-950 text-stone-900 dark:text-zinc-100 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-stone-600 dark:text-zinc-400 mb-1">Office Hours</label>
                  <input
                    type="text"
                    value={officeHoursInput}
                    onChange={e => setOfficeHoursInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-800 bg-white dark:bg-zinc-950 text-stone-900 dark:text-zinc-100 text-xs"
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 bg-[#8C1B2E] text-white font-semibold text-xs rounded-lg shadow-xs hover:bg-[#721525]"
                >
                  Save Changes
                </button>
              </form>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 pt-1">
                <div>
                  <span className="text-stone-500 block mb-0.5">Institutional Email</span>
                  <span className="font-mono font-medium text-stone-900 dark:text-zinc-100">{currentUser.email}</span>
                </div>

                <div>
                  <span className="text-stone-500 block mb-0.5">Phone Number</span>
                  <span className="font-mono text-stone-900 dark:text-zinc-100">{phoneInput}</span>
                </div>

                <div>
                  <span className="text-stone-500 block mb-0.5">Department</span>
                  <span className="font-medium text-stone-900 dark:text-zinc-100">Computer Science & Engineering</span>
                </div>

                <div>
                  <span className="text-stone-500 block mb-0.5">Office Location</span>
                  <span className="font-medium text-stone-900 dark:text-zinc-100">{officeLocationInput}</span>
                </div>

                <div className="sm:col-span-2">
                  <span className="text-stone-500 block mb-0.5">Office Hours</span>
                  <span className="font-medium text-stone-900 dark:text-zinc-100">{officeHoursInput}</span>
                </div>
              </div>
            )}
          </div>

          {/* Change Password */}
          <div className="space-y-3 pt-2 border-t border-[#E5E2D9] dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-900 dark:text-zinc-100 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-[#8C1B2E]" />
                <span>Account Password</span>
              </span>

              <button
                type="button"
                onClick={() => setShowPasswordForm(!showPasswordForm)}
                className="text-xs text-[#8C1B2E] dark:text-red-400 font-semibold hover:underline"
              >
                {showPasswordForm ? 'Cancel' : 'Change Password'}
              </button>
            </div>

            {showPasswordForm && (
              <form onSubmit={handleChangePassword} className="p-3.5 bg-white dark:bg-zinc-950 rounded-xl border border-[#E5E2D9] dark:border-zinc-800 space-y-3">
                {passwordMessage && (
                  <div className={`p-2 rounded text-xs ${passwordMessage.success ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                    {passwordMessage.text}
                  </div>
                )}

                <div>
                  <label className="block text-stone-600 mb-0.5">Current Password</label>
                  <input
                    type="password"
                    value={oldPassword}
                    onChange={e => setOldPassword(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-[#E5E2D9] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-stone-600 mb-0.5">New Password (12+ chars)</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-[#E5E2D9] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs"
                    required
                  />
                </div>

                <div>
                  <label className="block text-stone-600 mb-0.5">Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded border border-[#E5E2D9] dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="px-4 py-2 bg-[#8C1B2E] text-white font-semibold text-xs rounded-lg shadow-xs"
                >
                  Update Password
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#E5E2D9] dark:border-zinc-800 bg-[#F4F2EC] dark:bg-zinc-950/70 flex items-center justify-between text-xs">
          <span className="text-stone-500">Thapar Institute of Engineering & Technology</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-[#E5E2D9] dark:border-zinc-700 bg-white dark:bg-zinc-800 text-stone-700 dark:text-zinc-200 font-semibold hover:bg-stone-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
