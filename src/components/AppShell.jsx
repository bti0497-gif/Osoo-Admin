import React from 'react';
import NavigationArea from './NavigationArea';
import StatusBar from './StatusBar';
import WorkspaceArea from './WorkspaceArea';

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
