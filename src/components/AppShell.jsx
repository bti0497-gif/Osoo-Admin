import React from 'react';
import NavigationArea from './NavigationArea';
import StatusBar from './StatusBar';
import WorkspaceArea from './WorkspaceArea';
import { useAppUpdater } from '../hooks/useAppUpdater';

const AppShell = ({
    user,
    activeTab,
    onTabChange,
    onLogout,
    onUpdatePassword,
    onSiteChange,
    title,
    helpText,
    children
}) => {
    // 메인 쉘 진입 시 (isAuthenticated === true) 상위 버전 체크 및 [확인] 팝업 연동
    useAppUpdater(true);

    return (
        <div className="app-shell">
            <div className="app-main-body">
                <NavigationArea
                    user={user}
                    activeTab={activeTab}
                    onTabChange={onTabChange}
                    onLogout={onLogout}
                    onUpdatePassword={onUpdatePassword}
                    onSiteChange={onSiteChange}
                />

                <WorkspaceArea>
                    {children}
                </WorkspaceArea>
            </div>

            <StatusBar title={title} helpText={helpText} />
        </div>
    );
};

export default AppShell;
