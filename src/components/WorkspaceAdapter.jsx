import React, { Children } from 'react';

const WorkspaceAdapter = ({
    workspaceId,
    title,
    appTarget,
    currentUser,
    children,
}) => {
    return (
        <section
            className="workspace-adapter"
            data-workspace-id={workspaceId}
            data-workspace-title={title}
            data-app-target={appTarget}
            data-user-role={currentUser?.role || ''}
            style={{ width: '100%', height: '100%', minHeight: 0 }}
        >
            {children}
        </section>
    );
};

export default WorkspaceAdapter;
