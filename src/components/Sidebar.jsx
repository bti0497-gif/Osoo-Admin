import React from 'react';
import { MENU_REGISTRY } from '../core/constants';
import AccountWidget from './AccountWidget';

const Sidebar = ({ user, activeTab, onTabChange, onLogout, onUpdatePassword, onSiteChange }) => {

    const [expandedMenus, setExpandedMenus] = React.useState([]);
    const fieldMenus = MENU_REGISTRY;

    const toggleMenu = (menuId) => {
        setExpandedMenus(prev =>
            prev.includes(menuId) ? prev.filter(id => id !== menuId) : [...prev, menuId]
        );
    };

    const handleMenuClick = (menu) => {
        if (menu.children) {
            toggleMenu(menu.id);
        } else {
            onTabChange(menu.id);
        }
    };

    return (
        <aside className="sidebar">
            <AccountWidget
                user={user}
                onLogout={onLogout}
                onUpdatePassword={onUpdatePassword}
                onSiteChange={onSiteChange}
            />

            {/* 관리자 앱 메뉴 영역 */}
            <nav className="nav-menu-text">
                {fieldMenus.map((menu) => (
                    <React.Fragment key={menu.id}>
                        <button
                            className={`nav-text-item ${activeTab === menu.id ? 'active' : ''}`}
                            onClick={() => handleMenuClick(menu)}
                        >
                            <span className="material-icons nav-text-icon">{menu.icon}</span><span className="nav-text-label">{menu.label}</span>
                            {menu.children && (
                                <span className={`material-icons nav-text-expand-icon ${expandedMenus.includes(menu.id) ? 'expanded' : ''}`}>
                                    chevron_right
                                </span>
                            )}
                        </button>
                        {menu.children && expandedMenus.includes(menu.id) && (
                            <div className="nav-submenu-container">
                                {menu.children.map(sub => (
                                    <button
                                        key={sub.id}
                                        className={`nav-submenu-item ${activeTab === sub.id ? 'active' : ''}`}
                                        onClick={() => onTabChange(sub.id)}
                                    >
                                        {sub.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </nav>

        </aside>
    );
};

export default Sidebar;
