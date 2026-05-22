import React, { useState } from 'react';
import { DEFAULT_TAB, getMenuLabel, validateMenuRegistry } from './core/constants';
import { WORKSPACE_REGISTRY, getWorkspace, getWorkspaceMenuMeta, validateWorkspaceRegistry } from './core/workspaceRegistry.js';
import { useAuthViewModel, LoginView } from './features/auth';
import AppShell from './components/AppShell';
import WorkspaceAdapter from './components/WorkspaceAdapter';

const renderWorkspace = (workspaceId, workspace, context) => {
    const menuMeta = getWorkspaceMenuMeta(workspaceId);
    return (
        <WorkspaceAdapter
            workspaceId={workspaceId}
            title={getMenuLabel(workspaceId)}
            appTarget={menuMeta?.appTarget || ''}
            currentUser={context.currentUser}
        >
            {workspace.render(context)}
        </WorkspaceAdapter>
    );
};

// 레지스트리 검증
const menuErrors = validateMenuRegistry();
const workspaceErrors = validateWorkspaceRegistry();
const allErrors = [...menuErrors, ...workspaceErrors];
if (allErrors.length > 0) {
    console.warn('[Registry]', allErrors.join('\n'));
}

function App() {
    const { user, loginHintName, isAuthenticated, isLoading, login, logout, switchActiveSite } = useAuthViewModel();
    const [activeTab, setActiveTab] = useState(DEFAULT_TAB);

    if (isLoading) {
        return (
            <div className="login-screen">
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                    <div className="spinner" style={{ margin: '0 auto 1rem' }} />
                    <p>세션 복원 중...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <LoginView onLogin={login} loginHintName={loginHintName} />;
    }

    const handleUpdatePassword = () => {
        setActiveTab('myinfo');
    };

    const activeWorkspace = getWorkspace(activeTab);
    const renderContent = () => renderWorkspace(activeTab, activeWorkspace, { currentUser: user, onTabChange: setActiveTab });

    return (
        <AppShell
            user={user}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onLogout={logout}
            onUpdatePassword={handleUpdatePassword}
            onSiteChange={switchActiveSite}
            title={getMenuLabel(activeTab)}
            helpText={activeWorkspace.helpText}
        >
            {renderContent()}
        </AppShell>
    );
}

export default App;
