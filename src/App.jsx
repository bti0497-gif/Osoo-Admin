import React, { lazy, useState } from 'react';
import { DEFAULT_TAB, MENU_ITEMS, getMenuLabel, validateMenuRegistry } from './core/constants';
import { useAuthViewModel, LoginView } from './features/auth';
import AppShell from './components/AppShell';
import WorkspaceAdapter from './components/WorkspaceAdapter';

const MemberManagementView = lazy(() => import('./features/members').then((module) => ({ default: module.MemberManagementView })));
const BoardView = lazy(() => import('./features/board').then((module) => ({ default: module.BoardView })));
const CertificateView = lazy(() => import('./features/certificate').then((module) => ({ default: module.CertificateView })));

const WORKSPACE_REGISTRY = {
    members: {
        render: ({ currentUser }) => <MemberManagementView currentUser={currentUser} />,
        helpText: '회원 및 현장 정보를 조회, 등록, 수정, 삭제합니다.'
    },
    data_admin: {
        render: ({ currentUser }) => <div>데이터관리 워크스페이스</div>,
        helpText: 'BigQuery 운영 테이블을 조회, 필터링, 수정, 삭제합니다.'
    },
    board: {
        render: ({ currentUser }) => <BoardView currentUser={currentUser} />,
        helpText: '공지사항 및 소통 게시판을 관리합니다.'
    },
    certificate: {
        render: ({ currentUser }) => <CertificateView currentUser={currentUser} />,
        helpText: '성적서를 조회, 업로드, 다운로드합니다.'
    },
};

const getWorkspace = (workspaceId) => WORKSPACE_REGISTRY[workspaceId] || WORKSPACE_REGISTRY[DEFAULT_TAB];

const getWorkspaceMenuMeta = (workspaceId) => MENU_ITEMS.find((menu) => menu.workspaceId === workspaceId || menu.id === workspaceId) || null;

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

const validateWorkspaceRegistry = () => {
    const menuErrors = validateMenuRegistry();
    const missingWorkspaceErrors = MENU_ITEMS
        .filter((menu) => menu.workspaceId && !WORKSPACE_REGISTRY[menu.workspaceId])
        .map((menu) => `workspaceId 연결 누락: ${menu.id} -> ${menu.workspaceId}`);
    const missingMenuMetaErrors = Object.keys(WORKSPACE_REGISTRY)
        .filter((workspaceId) => !getWorkspaceMenuMeta(workspaceId) && workspaceId !== 'myinfo')
        .map((workspaceId) => `workspace 메타데이터 연결 누락: ${workspaceId}`);

    return [...menuErrors, ...missingWorkspaceErrors, ...missingMenuMetaErrors];
};

const registryErrors = validateWorkspaceRegistry();
if (registryErrors.length > 0) {
    console.warn('[Registry]', registryErrors.join('\n'));
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
    const renderContent = () => renderWorkspace(activeTab, activeWorkspace, { currentUser: user });

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
