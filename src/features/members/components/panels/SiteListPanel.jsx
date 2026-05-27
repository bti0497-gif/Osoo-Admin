import React, { useMemo, useCallback, useState } from 'react';
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
const EDITABLE_SITE_COLS = new Set(['site_name', 'manager_name', 'method', 'series']);
const SITE_COL_TO_ROW_KEY = { site_name: 'siteName', manager_name: 'managerName', method: 'method', series: 'series' };

export function SiteListPanel({
  sites,
  selectedSiteId,
  onSelectSite,
  newSiteRow,
  onFieldChange,
  queuedSiteRows,
  onStartNewRow,
  onStartEdit,
  onDelete,
  onDeleteMultiple,
  onSave,
  onCancel,
  isSaving,
  isDeleting,
  isEditMode,
  loading,
  members,
}) {
  const [checkedIds, setCheckedIds] = useState(new Set());

  const allIds = useMemo(() => {
    const safe = Array.isArray(sites) ? sites.filter(Boolean) : [];
    return safe.map(s => s.id);
  }, [sites]);

  const toggleCheck = useCallback((id) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setCheckedIds(prev => {
      if (prev.size === allIds.length && allIds.length > 0) return new Set();
      return new Set(allIds);
    });
  }, [allIds]);

  const hasChecked = checkedIds.size > 0;
  const isSingleChecked = checkedIds.size === 1;

  const columns = useMemo(() => ([
    { id: '__check', label: '☐', width: 40, align: 'center' },
    { id: 'site_name', label: '현장명', width: SITE_GRID_COLUMN_WIDTHS.site_name, align: 'center' },
    { id: 'manager_name', label: '담당자', width: SITE_GRID_COLUMN_WIDTHS.manager_name, align: 'center' },
    { id: 'manager_role', label: '권한', width: 100, align: 'center' },
    { id: 'method', label: '처리방식', width: SITE_GRID_COLUMN_WIDTHS.method, align: 'center' },
    { id: 'series', label: '계열', width: SITE_GRID_COLUMN_WIDTHS.series, align: 'center' }
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
      };
    });

    if (newSiteRow) {
      if (newSiteRow.id) {
        rows = rows.map(row => (
          row.id === newSiteRow.id
            ? { ...row, ...newSiteRow }
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
        });
      }
    }

    return rows;
  }, [safeSites, safeMembers, selectedSiteId, newSiteRow]);

  const handleRowClick = (row) => {
    if (row.id === SITE_EDIT_NEW_ROW_KEY) return;
    toggleCheck(row.id);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <AdvancedDataGrid
          loading={loading}
          columns={columns}
          data={gridData}
          keyField="id"
          onRowSelect={handleRowClick}
          rowHeight={40}
          headerRowHeight={16}
          headerFontSize={12}
          isCellEditable={(row, col) => {
            if (col.id === '__check') return false;
            if (!isEditMode || !newSiteRow) return false;
            const editKey = newSiteRow.siteId || SITE_EDIT_NEW_ROW_KEY;
            return row.id === editKey && EDITABLE_SITE_COLS.has(col.id);
          }}
          onCellChange={(rowKey, colId, value) => {
            if (onFieldChange) {
              const fieldKey = SITE_COL_TO_ROW_KEY[colId] || colId;
              onFieldChange(fieldKey, value);
            }
          }}
          renderCellDisplay={(row, col, val) => {
            if (col.id === '__check') {
              if (row.id === SITE_EDIT_NEW_ROW_KEY) return null;
              return (
                <input
                  type="checkbox"
                  checked={checkedIds.has(row.id)}
                  onChange={(e) => { e.stopPropagation(); toggleCheck(row.id); }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0f766e' }}
                />
              );
            }
            return val;
          }}
          {...getLockedRowEditGridProps(isEditMode, newSiteRow?.siteId || SITE_EDIT_NEW_ROW_KEY)}
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
              onClick={() => {
                if (!isSingleChecked) return;
                const id = [...checkedIds][0];
                onStartEdit(id);
              }}
              disabled={!isSingleChecked}
              style={{ 
                height: '34px', 
                padding: '0 14px', 
                background: '#fff', 
                color: '#1f2937', 
                border: '1px solid #9ca3af',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.76rem',
                cursor: !isSingleChecked ? 'not-allowed' : 'pointer',
                opacity: !isSingleChecked ? 0.6 : 1
              }}
            >
              수정{isSingleChecked ? '' : ` (${checkedIds.size})`}
            </button>
            <button
              onClick={() => {
                if (!hasChecked) return;
                const ids = [...checkedIds];
                if (ids.length === 1) {
                  onDelete(ids[0]);
                } else if (onDeleteMultiple) {
                  onDeleteMultiple(ids);
                } else {
                  ids.forEach(id => onDelete(id));
                }
                setCheckedIds(new Set());
              }}
              disabled={!hasChecked || isDeleting}
              style={{ 
                height: '34px', 
                padding: '0 14px', 
                background: '#ef4444', 
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.76rem',
                cursor: (!hasChecked || isDeleting) ? 'not-allowed' : 'pointer',
                opacity: (!hasChecked || isDeleting) ? 0.6 : 1
              }}
            >
              {isDeleting ? '삭제 중...' : `삭제${checkedIds.size > 1 ? ` (${checkedIds.size}건)` : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default SiteListPanel;
