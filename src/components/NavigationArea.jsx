import React from 'react';
import Sidebar from './Sidebar';

const NavigationArea = ({
    user,
    activeTab,
    onTabChange,
    onLogout,
    onUpdatePassword,
    onSiteChange
}) => {
    return (
        <Sidebar
            user={user}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onLogout={onLogout}
            onUpdatePassword={onUpdatePassword}
            onSiteChange={onSiteChange}
        />
    );
};

export default NavigationArea;
