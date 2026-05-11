import React from 'react';

const AccountWidget = ({ user, onLogout, onUpdatePassword, onSiteChange }) => {
    const surname = user?.name?.charAt(0) || 'U';
    const managedSites = Array.isArray(user?.managed_sites) ? user.managed_sites : [];
    const isBidirectionalUser = String(user?.site_name1 || '').trim() === '양방향';
    const managerOwnedSites = managedSites.filter((site) => String(site?.manager_name || '').trim() === String(user?.name || '').trim());
    const visibleManagedSites = isBidirectionalUser ? managerOwnedSites : [];
    const showSiteDropdown = visibleManagedSites.length > 0;
    const siteSelectValue = showSiteDropdown
        ? (visibleManagedSites.some((site) => String(site.id) === String(user?.site_id || ''))
            ? String(user?.site_id || '')
            : String(visibleManagedSites[0]?.id || ''))
        : '';

    return (
        <div className="user-group">
            <div className="user-info" style={{ cursor: 'pointer' }} onClick={onUpdatePassword} title="내 정보 수정">
                <div className="user-avatar">{surname}</div>
                <div className="user-details">
                    <span className="user-name">{user?.name}님</span>
                    <span className="user-role">{user?.notes || user?.site_name1 || '소속 미지정'}</span>
                </div>
            </div>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
                {showSiteDropdown ? (
                    <div>
                        <select
                            value={siteSelectValue}
                            onChange={(e) => onSiteChange?.(e.target.value)}
                            style={{
                                height: '32px',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                padding: '0 10px',
                                backgroundColor: '#fff',
                                color: '#1e293b',
                                fontSize: '0.75rem',
                                fontWeight: 700
                            }}
                        >
                            {visibleManagedSites.map((site) => (
                                <option key={site.id} value={site.id}>{site.site_name}</option>
                            ))}
                        </select>
                    </div>
                ) : null}
                <button className="btn-small" onClick={onLogout}>
                    <span className="material-icons" style={{ fontSize: '14px' }}>logout</span>
                    로그아웃
                </button>
            </div>
        </div>
    );
};

export default AccountWidget;
