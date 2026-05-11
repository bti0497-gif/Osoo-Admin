import React from 'react';
import WorkspaceShell from './WorkspaceShell';

const WorkspaceArea = ({ children }) => {
    return (
        <main className="main-content">
            <WorkspaceShell>
                {children}
            </WorkspaceShell>
        </main>
    );
};

export default WorkspaceArea;
