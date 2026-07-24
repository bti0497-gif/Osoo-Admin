import React from 'react';
import { useMonthlyPhotoViewModel } from './viewmodels/useMonthlyPhotoViewModel';
import MonthlySettlementPhotoTab from './components/MonthlySettlementPhotoTab';
import TempPlaceholderTab from './components/TempPlaceholderTab';

const TABS = ['월정산 사진받기', '임시'];

const DataAdminView = ({ currentUser }) => {
  const vm = useMonthlyPhotoViewModel(currentUser);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '1rem',
        gap: '0.75rem',
        background: '#f1f5f9',
        boxSizing: 'border-box',
      }}
    >
      {/* 워크스페이스 상단 다중 탭 헤더 */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '2px solid #e2e8f0',
          paddingBottom: '0.25rem',
        }}
      >
        {TABS.map((tab) => {
          const isActive = vm.activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => vm.setActiveTab(tab)}
              style={{
                padding: '0.65rem 1.25rem',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                fontSize: '0.95rem',
                fontWeight: isActive ? 700 : 500,
                background: isActive ? '#ffffff' : 'transparent',
                color: isActive ? '#2563eb' : '#64748b',
                boxShadow: isActive ? '0 -2px 5px rgba(0,0,0,0.03)' : 'none',
                borderBottom: isActive ? '3px solid #2563eb' : '3px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {tab === '월정산 사진받기' ? '📸 월정산 사진받기' : '📂 임시'}
            </button>
          );
        })}
      </div>

      {/* 탭 본문 영역 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {vm.activeTab === '월정산 사진받기' && <MonthlySettlementPhotoTab vm={vm} />}
        {vm.activeTab === '임시' && <TempPlaceholderTab />}
      </div>
    </div>
  );
};

export default DataAdminView;
