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
const EDITABLE_SITE_COLS = new Set(['site_name', 'manager_name', 'method', 'series']);
const SITE_COL_TO_ROW_KEY = { site_name: 'siteName', manager_name: 'managerName', method: 'method', series: 'series' };

export function SiteListPanel({
  sites,
  selectedSiteId,
  onSelectSite,
  newSiteRow,
  onFieldChange,
  isEditMode,
  loading,
  members,
}) {
  const columns = useMemo(() => ([
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

  const gridData = useMemo(() => {
    const getManagedSiteNamesByManager = (managerName) => {
      const normalizedManager = String(managerName || '').trim();
      if (!normalizedManager) return [];
      return safeSites
        .filter((site) => String(site?.manager_name || '').trim() === normalizedManager)
        .map((site) => String(site?.site_name || '').trim())
        .filter(Boolean);
    };

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
      if (newSiteRow.siteId) {
        rows = rows.map(row => (
          String(row.id) === String(newSiteRow.siteId)
            ? { 
                ...row, 
                site_name: newSiteRow.siteName,
                manager_name: newSiteRow.managerName,
                method: newSiteRow.method,
                series: newSiteRow.series
              }
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
  }, [safeSites, safeMembers, newSiteRow]);

  const handleRowClick = (row) => {
    if (row.id === SITE_EDIT_NEW_ROW_KEY) return;
    if (onSelectSite) onSelectSite(row.id);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <AdvancedDataGrid
          height="100%"
          loading={loading}
          columns={columns}
          data={gridData}
          keyField="id"
          onRowSelect={handleRowClick}
          rowHeight={32}
          headerRowHeight={28}
          headerFontSize={12}
          isCellEditable={(row, col) => {
            if (!isEditMode || !newSiteRow) return false;
            const editKey = newSiteRow.siteId || SITE_EDIT_NEW_ROW_KEY;
            return String(row.id) === String(editKey) && EDITABLE_SITE_COLS.has(col.id);
          }}
          onCellChange={(rowKey, colId, value) => {
            if (onFieldChange) {
              const fieldKey = SITE_COL_TO_ROW_KEY[colId] || colId;
              onFieldChange(fieldKey, value);
            }
          }}
          selectionMode="row"
          highlightSelectionRow={true}
          selectedRowKey={selectedSiteId}
          {...getLockedRowEditGridProps(isEditMode, newSiteRow?.siteId || SITE_EDIT_NEW_ROW_KEY)}
        />
      </div>
    </div>
  );
}

export default SiteListPanel;
