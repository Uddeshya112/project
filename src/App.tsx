import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TimetableProvider } from './context/TimetableContext';
import { ThemeProvider } from './context/ThemeContext';
import { DashboardLayout } from './components/DashboardLayout';
import { LoginPageView } from './components/views/LoginPageView';
import { WorkspaceSelectionView } from './components/views/WorkspaceSelectionView';
import { WorkspaceType } from './types';

function MainLayout() {
  const { authorizedWorkspaces, switchWorkspace, logout } = useAuth();
  const [showLoginPage, setShowLoginPage] = useState(true);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);

  const handleLoginSuccess = (incomingWorkspaces?: WorkspaceType[]) => {
    setShowLoginPage(false);
    const ws = incomingWorkspaces || authorizedWorkspaces;
    if (ws && ws.length > 1) {
      setShowWorkspacePicker(true);
    } else {
      setShowWorkspacePicker(false);
    }
  };

  const handleSelectWorkspace = (ws: WorkspaceType) => {
    switchWorkspace(ws);
    setShowWorkspacePicker(false);
  };

  const handleSignOut = () => {
    logout();
    setShowWorkspacePicker(false);
    setShowLoginPage(true);
  };

  if (showLoginPage) {
    return (
      <LoginPageView
        onSuccessLogin={handleLoginSuccess}
      />
    );
  }

  if (showWorkspacePicker && authorizedWorkspaces.length > 1) {
    return (
      <WorkspaceSelectionView
        workspaces={authorizedWorkspaces}
        onSelectWorkspace={handleSelectWorkspace}
        onSignOut={handleSignOut}
      />
    );
  }

  return (
    <DashboardLayout
      onSignOutToLogin={handleSignOut}
      onOpenWorkspacePicker={() => setShowWorkspacePicker(true)}
    />
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <TimetableProvider>
          <MainLayout />
        </TimetableProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
