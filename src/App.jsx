import React, { useState } from 'react';
import { DEFAULT_TAB, getMenuLabel, validateMenuRegistry } from './core/constants';
import { WORKSPACE_REGISTRY, getWorkspace, getWorkspaceMenuMeta, validateWorkspaceRegistry } from './core/workspaceRegistry.js';
import { useAuthViewModel, LoginView } from './features/auth';
import AppShell from './components/AppShell';
import WorkspaceAdapter from './components/WorkspaceAdapter';
import { useSiteMaster } from './features/certificate/hooks/useSiteMaster';
import { useAppUpdater } from './hooks/useAppUpdater';

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
    const [visitedTabs, setVisitedTabs] = useState(() => new Set([DEFAULT_TAB]));
    
    // 앱 구동 시 자동 업데이트 검사 및 현장 데이터 캐싱
    useAppUpdater();
    useSiteMaster();

    React.useEffect(() => {
        if (!activeTab) return;
        setVisitedTabs((prev) => {
            if (prev.has(activeTab)) return prev;
            const next = new Set(prev);
            next.add(activeTab);
            return next;
        });
    }, [activeTab]);

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
            {Array.from(visitedTabs).map((tabId) => {
                const ws = getWorkspace(tabId);
                const isCurrent = tabId === activeTab;
                return (
                    <div
                        key={tabId}
                        style={{
                            display: isCurrent ? 'block' : 'none',
                            height: '100%',
                            width: '100%',
                        }}
                    >
                        {renderWorkspace(tabId, ws, {
                            currentUser: user,
                            onTabChange: setActiveTab,
                            isActive: isCurrent,
                        })}
                    </div>
                );
            })}
        </AppShell>
    );
}

export default App;
