import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TimetableProvider } from './context/TimetableContext';
import { ThemeProvider } from './context/ThemeContext';
import { DashboardLayout } from './components/DashboardLayout';
import { LoginPageView } from './components/views/LoginPageView';
import { WorkspaceSelectionView } from './components/views/WorkspaceSelectionView';
import type { WorkspaceType } from './types';

function MainLayout() {
  const { isLoading, isAuthenticated, authorizedWorkspaces, switchWorkspace, logout } = useAuth();
  // Users with several workspaces pick one after signing in.
  const [pickerOpen, setPickerOpen] = useState(true);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F6F2] dark:bg-[#0c0c0e]" role="status" aria-label="Loading">
        <Loader2 className="h-6 w-6 animate-spin text-[#8C1B2E]" />
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPageView />;

  const signOut = async () => {
    await logout();
    setPickerOpen(true);
  };

  if (pickerOpen && authorizedWorkspaces.length > 1) {
    return (
      <WorkspaceSelectionView
        workspaces={authorizedWorkspaces}
        onSelectWorkspace={(ws: WorkspaceType) => {
          switchWorkspace(ws);
          setPickerOpen(false);
        }}
        onSignOut={signOut}
      />
    );
  }

  return (
    <TimetableProvider>
      <DashboardLayout onSignOutToLogin={signOut} onOpenWorkspacePicker={() => setPickerOpen(true)} />
    </TimetableProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <MainLayout />
      </AuthProvider>
    </ThemeProvider>
  );
}
