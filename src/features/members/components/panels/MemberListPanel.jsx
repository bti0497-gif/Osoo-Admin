import React, { useMemo, useCallback, useState } from 'react';
import AdvancedDataGrid from '../../../../components/common/AdvancedDataGrid';
import { getLockedRowEditGridProps } from '../../../../components/common/advancedDataGridPresets';
import { 
  MEMBER_GRID_COLUMN_WIDTHS, 
  ROLE_LABEL_MAP, 
  MEMBER_EDIT_NEW_ROW_KEY 
} from '../../constants';

/**
 * 회원 목록 패널
 */
const EDITABLE_MEMBER_COLS = new Set(['name', 'password', 'role', 'phone', 'site_name1']);

const ROLE_OPTIONS = [
  { value: 'group_admin', label: '중앙관리자' },
  { value: 'user', label: '현장관리자' },
];
const ROLE_LABEL_TO_CODE = Object.fromEntries(
  Object.entries(ROLE_LABEL_MAP).map(([code, label]) => [label, code])
);

function DropdownEditor({ options, value, onChange, onCommit, onCancel, autoFocus }) {
  return (
    <select
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => { onChange(e.target.value); }}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit();
        if (e.key === 'Escape') onCancel();
      }}
      style={{
        width: '100%', height: '100%', border: 'none', background: 'transparent',
        outline: 'none', fontSize: 13, fontFamily: "'Inter', sans-serif", color: '#0D0D0D',
        cursor: 'pointer', textAlign: 'center', textAlignLast: 'center',
      }}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export function MemberListPanel({
  members,
  sites,
  selectedMemberId,
  onSelectMember,
  newMemberRow,
  onFieldChange,
  isEditMode,
  loading,
  onNavigateToSites,
}) {
  const columns = useMemo(() => ([
    { id: 'name', label: '회원명', width: MEMBER_GRID_COLUMN_WIDTHS.name, align: 'center' },
    { id: 'password', label: '비밀번호', width: MEMBER_GRID_COLUMN_WIDTHS.password, align: 'center' },
    { id: 'role', label: '권한', width: MEMBER_GRID_COLUMN_WIDTHS.role, align: 'center' },
    { id: 'phone', label: '연락처', width: MEMBER_GRID_COLUMN_WIDTHS.phone, align: 'center' },
    { id: 'site_name1', label: '소속 현장', width: MEMBER_GRID_COLUMN_WIDTHS.site_name1, align: 'center' }
  ]), []);

  const safeMembers = useMemo(() => 
    Array.isArray(members) ? members.filter(Boolean) : [], 
    [members]
  );

  const gridData = useMemo(() => {
    let rows = safeMembers.map(member => ({
      ...member,
      password: member.password || '',
      role: ROLE_LABEL_MAP[member.role] || member.role || '현장관리자',
      phone: member.phone || '',
    }));

    if (newMemberRow) {
      if (newMemberRow.id) {
        rows = rows.map(row => (
          row.id === newMemberRow.id
            ? { ...row, ...newMemberRow, role: ROLE_LABEL_MAP[newMemberRow.role] || newMemberRow.role }
            : row
        ));
      } else {
        rows.push({
          id: MEMBER_EDIT_NEW_ROW_KEY,
          name: newMemberRow.name || '',
          password: newMemberRow.password || '',
          role: ROLE_LABEL_MAP[newMemberRow.role || 'user'] || '현장관리자',
          phone: newMemberRow.phone || '',
          site_name1: newMemberRow.site_name1 || '',
        });
      }
    }

    return rows;
  }, [safeMembers, newMemberRow]);

  const siteOptions = useMemo(() => {
    const safeSites = Array.isArray(sites) ? sites : [];
    const opts = [{ value: '', label: '-- 현장 선택 --' }];
    safeSites
      .filter(s => s && s.site_name)
      .forEach(s => opts.push({ value: s.site_name, label: s.site_name }));
    opts.push({ value: '__navigate_to_sites__', label: '현장 추가...' });
    return opts;
  }, [sites]);

  const renderCellEditor = useCallback((row, col, val, editorProps) => {
    if (col.id === 'role') {
      const codeValue = ROLE_LABEL_TO_CODE[editorProps.value] || editorProps.value || 'user';
      return (
        <DropdownEditor
          options={ROLE_OPTIONS}
          value={codeValue}
          onChange={(v) => {
            editorProps.onChange(ROLE_LABEL_MAP[v] || v);
            if (onFieldChange) onFieldChange('role', v);
          }}
          onCommit={editorProps.onCommit}
          onCancel={editorProps.onCancel}
          autoFocus={editorProps.autoFocus}
        />
      );
    }
    if (col.id === 'site_name1') {
      return (
        <DropdownEditor
          options={siteOptions}
          value={editorProps.value || ''}
          onChange={(v) => {
            if (v === '__navigate_to_sites__') {
              editorProps.onCancel();
              if (onNavigateToSites) onNavigateToSites();
              return;
            }
            editorProps.onChange(v);
            if (onFieldChange) onFieldChange('site_name1', v);
          }}
          onCommit={editorProps.onCommit}
          onCancel={editorProps.onCancel}
          autoFocus={editorProps.autoFocus}
        />
      );
    }
    return null;
  }, [siteOptions, onFieldChange, onNavigateToSites]);

  const handleRowClick = (row) => {
    if (row.id === MEMBER_EDIT_NEW_ROW_KEY) return;
    if (onSelectMember) onSelectMember(row.id);
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
          rowHeight={40}
          headerRowHeight={16}
          headerFontSize={12}
          isCellEditable={(row, col) => {
            if (!isEditMode || !newMemberRow) return false;
            const editKey = newMemberRow.id || MEMBER_EDIT_NEW_ROW_KEY;
            return row.id === editKey && EDITABLE_MEMBER_COLS.has(col.id);
          }}
          onCellChange={(rowKey, colId, value) => {
            if (onFieldChange) onFieldChange(colId, value);
          }}
          renderCellEditor={renderCellEditor}
          highlightSelectionRow={true}
          selectedRowKey={selectedMemberId}
          {...getLockedRowEditGridProps(isEditMode, newMemberRow?.id || MEMBER_EDIT_NEW_ROW_KEY)}
        />
      </div>
    </div>
  );
}

export default MemberListPanel;
