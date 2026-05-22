import React, { useMemo } from 'react';
import AdvancedDataGrid from '../../../../components/common/AdvancedDataGrid';
import { getLockedRowEditGridProps } from '../../../../components/common/advancedDataGridPresets';
import { 
  SITE_GRID_COLUMN_WIDTHS, 
  ROLE_LABEL_MAP, 
  SITE_EDIT_NEW_ROW_KEY,
  getAutoSiteTextForManager,
} from '../../constants';

/**
 * 현장 목록 패널
 */
export function SiteListPanel({
  sites,
  selectedSiteId,
  onSelectSite,
  newSiteRow,
  queuedSiteRows,
  onStartNewRow,
  onStartEdit,
  onDelete,
  onSave,
  onCancel,
  isSaving,
  isDeleting,
  isEditMode,
  loading,
  members,
}) {
  const columns = useMemo(() => ([
    { id: 'site_name', label: '현장명', width: SITE_GRID_COLUMN_WIDTHS.site_name, align: 'center' },
    { id: 'manager_name', label: '담당자', width: SITE_GRID_COLUMN_WIDTHS.manager_name, align: 'center' },
    { id: 'manager_role', label: '권한', width: 100, align: 'center' },
    { id: 'method', label: '처리방식', width: SITE_GRID_COLUMN_WIDTHS.method, align: 'center' },
    { id: 'series', label: '계열', width: SITE_GRID_COLUMN_WIDTHS.series, align: 'center' },
    { id: 'selected_label', label: '선택 상태', width: SITE_GRID_COLUMN_WIDTHS.selected_label, align: 'center' }
  ]), []);

  const safeSites = useMemo(() => 
    Array.isArray(sites) ? sites.filter(Boolean) : [], 
    [sites]
  );

  const safeMembers = useMemo(() => 
    Array.isArray(members) ? members.filter(Boolean) : [], 
    [members]
  );

  const getManagedSiteNamesByManager = (managerName) => {
    const normalizedManager = String(managerName || '').trim();
    if (!normalizedManager) return [];
    return safeSites
      .filter((site) => String(site?.manager_name || '').trim() === normalizedManager)
      .map((site) => String(site?.site_name || '').trim())
      .filter(Boolean);
  };

  const gridData = useMemo(() => {
    let rows = safeSites.map(site => {
      const managerName = String(site?.manager_name || '').trim();
      const managedSites = getManagedSiteNamesByManager(managerName);
      const isBidirectional = managedSites.length > 1;

      return {
        ...site,
        manager_name: managerName || '(미지정)',
        manager_role: (() => {
          const member = safeMembers.find(m => String(m.name || '').trim() === managerName);
          return member ? (ROLE_LABEL_MAP[member.role] || member.role) : '-';
        })(),
        manager_note: isBidirectional ? '양방향' : getAutoSiteTextForManager(managedSites),
        selected_label: selectedSiteId === site.id ? '선택됨' : ''
      };
    });

    if (newSiteRow) {
      if (newSiteRow.id) {
        rows = rows.map(row => (
          row.id === newSiteRow.id
            ? { ...row, ...newSiteRow, selected_label: '편집중' }
            : row
        ));
      } else {
        rows.push({
          id: SITE_EDIT_NEW_ROW_KEY,
          site_name: newSiteRow.siteName || '',
          manager_name: newSiteRow.managerName || '(미지정)',
          manager_role: '-',
          method: newSiteRow.method || '',
          series: newSiteRow.series || '',
          selected_label: '신규'
        });
      }
    }

    return rows;
  }, [safeSites, safeMembers, selectedSiteId, newSiteRow]);

  const handleRowClick = (row) => {
    if (row.id === SITE_EDIT_NEW_ROW_KEY) return;
    onSelectSite(row.id === selectedSiteId ? null : row.id);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <AdvancedDataGrid
          loading={loading}
          columns={columns}
          rows={gridData}
          getRowId={(r) => r.id}
          isRowLocked={null}
          onRowClick={handleRowClick}
          rowHeight={40}
          headerRowHeight={16}
          {...getLockedRowEditGridProps({ headerFontSize: 12 })}
        />
      </div>

      {/* Toolbar */}
      <div style={{ 
        padding: '0.75rem 1.25rem', 
        borderTop: '1px solid #e2e8f0', 
        display: 'flex', 
        gap: '0.5rem',
        background: '#fff'
      }}>
        {isEditMode ? (
          <>
            <button
              onClick={onCancel}
              style={{ 
                height: '34px', 
                padding: '0 14px', 
                background: '#fff', 
                color: '#475569', 
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.76rem',
                cursor: 'pointer'
              }}
            >
              취소
            </button>
            <button
              onClick={onSave}
              disabled={isSaving}
              style={{ 
                height: '34px', 
                padding: '0 14px', 
                background: '#0f766e', 
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.76rem',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.7 : 1
              }}
            >
              {isSaving ? '저장 중...' : `현장 저장${queuedSiteRows?.length ? ` (${queuedSiteRows.length + 1}행)` : ''}`}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onStartNewRow}
              style={{ 
                height: '34px', 
                padding: '0 14px', 
                background: '#0f766e', 
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.76rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <span style={{ fontSize: '14px' }}>+</span>
              현장 행 추가
            </button>
            <button
              onClick={onStartEdit}
              disabled={!selectedSiteId}
              style={{ 
                height: '34px', 
                padding: '0 14px', 
                background: '#fff', 
                color: '#1f2937', 
                border: '1px solid #9ca3af',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.76rem',
                cursor: !selectedSiteId ? 'not-allowed' : 'pointer',
                opacity: !selectedSiteId ? 0.6 : 1
              }}
            >
              수정
            </button>
            <button
              onClick={onDelete}
              disabled={!selectedSiteId || isDeleting}
              style={{ 
                height: '34px', 
                padding: '0 14px', 
                background: '#ef4444', 
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.76rem',
                cursor: (!selectedSiteId || isDeleting) ? 'not-allowed' : 'pointer',
                opacity: (!selectedSiteId || isDeleting) ? 0.6 : 1
              }}
            >
              {isDeleting ? '삭제 중...' : '삭제'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default SiteListPanel;
