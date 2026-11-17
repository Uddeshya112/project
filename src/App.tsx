import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TimetableProvider } from './context/TimetableContext';
import { ThemeProvider } from './context/ThemeContext';
import { DashboardLayout } from './components/DashboardLayout';
import { LoginPageView } from './components/views/LoginPageView';
import { VerifyEmailView } from './components/views/VerifyEmailView';
import { WorkspaceSelectionView } from './components/views/WorkspaceSelectionView';
import { WorkspaceType } from './types';

function MainLayout() {
  const { authStatus, authorizedWorkspaces, switchWorkspace, logout } = useAuth();
  const [showLoginPage, setShowLoginPage] = useState(true);
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(() => window.location.pathname === '/verify-email');

  useEffect(() => {
    if (authStatus === 'AUTHENTICATED') {
      setShowLoginPage(false);
    }
  }, [authStatus]);

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
    window.history.replaceState(null, '', '/');
    setShowWorkspacePicker(false);
    setShowLoginPage(true);
  };

  const returnToLogin = () => {
    window.history.replaceState(null, '', '/');
    setShowEmailVerification(false);
    setShowLoginPage(true);
  };

  if (showEmailVerification) {
    return <VerifyEmailView onBackToLogin={returnToLogin} />;
  }

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
