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
  getManagedSiteNames,
  onNavigateToSites,
}) {
  const [checkedIds, setCheckedIds] = useState(new Set());

  const allIds = useMemo(() => {
    const safe = Array.isArray(members) ? members.filter(Boolean) : [];
    return safe.map(m => m.id);
  }, [members]);

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
            if (!isEditMode || !newMemberRow) return false;
            const editKey = newMemberRow.id || MEMBER_EDIT_NEW_ROW_KEY;
            return row.id === editKey && EDITABLE_MEMBER_COLS.has(col.id);
          }}
          onCellChange={(rowKey, colId, value) => {
            if (onFieldChange) onFieldChange(colId, value);
          }}
          renderCellEditor={renderCellEditor}
          renderCellDisplay={(row, col, val) => {
            if (col.id === '__check') {
              if (row.id === MEMBER_EDIT_NEW_ROW_KEY) return null;
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
          {...getLockedRowEditGridProps(isEditMode, newMemberRow?.id || MEMBER_EDIT_NEW_ROW_KEY)}
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
              {isSaving ? '저장 중...' : (newMemberRow?.id ? '수정 저장' : '회원 저장')}
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
              회원 행 추가
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
                } else {
                  onDeleteMultiple(ids);
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

export default MemberListPanel;
