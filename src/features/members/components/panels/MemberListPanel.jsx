import React, { useMemo } from 'react';
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
export function MemberListPanel({
  members,
  selectedMemberId,
  onSelectMember,
  newMemberRow,
  onStartNewRow,
  onStartEdit,
  onDelete,
  onSave,
  onCancel,
  isSaving,
  isDeleting,
  isEditMode,
  loading,
  getManagedSiteNames,
}) {
  const columns = useMemo(() => ([
    { id: 'name', label: '회원명', width: MEMBER_GRID_COLUMN_WIDTHS.name, align: 'center' },
    { id: 'password', label: '비밀번호', width: MEMBER_GRID_COLUMN_WIDTHS.password, align: 'center' },
    { id: 'role', label: '권한', width: MEMBER_GRID_COLUMN_WIDTHS.role, align: 'center' },
    { id: 'phone', label: '연락처', width: MEMBER_GRID_COLUMN_WIDTHS.phone, align: 'center' },
    { id: 'site_name1', label: '소속 현장', width: MEMBER_GRID_COLUMN_WIDTHS.site_name1, align: 'center' },
    { id: 'selected_label', label: '선택 상태', width: MEMBER_GRID_COLUMN_WIDTHS.selected_label, align: 'center' }
  ]), []);

  const safeMembers = useMemo(() => 
    Array.isArray(members) ? members.filter(Boolean) : [], 
    [members]
  );

  const gridData = useMemo(() => {
    let rows = safeMembers.map(member => ({
      ...member,
      password: member.password || '',
      role: member.role || 'user',
      role_display: ROLE_LABEL_MAP[member.role] || member.role,
      phone: member.phone || '',
      selected_label: selectedMemberId === member.id ? '선택됨' : ''
    }));

    if (newMemberRow) {
      if (newMemberRow.id) {
        rows = rows.map(row => (
          row.id === newMemberRow.id
            ? { ...row, ...newMemberRow, role_display: ROLE_LABEL_MAP[newMemberRow.role] || newMemberRow.role, selected_label: '편집중' }
            : row
        ));
      } else {
        rows.push({
          id: MEMBER_EDIT_NEW_ROW_KEY,
          name: newMemberRow.name || '',
          password: newMemberRow.password || '',
          role: newMemberRow.role || 'user',
          role_display: ROLE_LABEL_MAP[newMemberRow.role || 'user'] || '현장관리자',
          phone: newMemberRow.phone || '',
          site_name1: newMemberRow.site_name1 || '',
          selected_label: '신규'
        });
      }
    }

    return rows;
  }, [safeMembers, selectedMemberId, newMemberRow]);

  const handleRowClick = (row) => {
    if (row.id === MEMBER_EDIT_NEW_ROW_KEY) return;
    onSelectMember(row.id === selectedMemberId ? null : row.id);
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
          headerRowHeight={MEMBER_GRID_COLUMN_WIDTHS.name}
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
              onClick={onStartEdit}
              disabled={!selectedMemberId}
              style={{ 
                height: '34px', 
                padding: '0 14px', 
                background: '#fff', 
                color: '#1f2937', 
                border: '1px solid #9ca3af',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.76rem',
                cursor: !selectedMemberId ? 'not-allowed' : 'pointer',
                opacity: !selectedMemberId ? 0.6 : 1
              }}
            >
              수정
            </button>
            <button
              onClick={onDelete}
              disabled={!selectedMemberId || isDeleting}
              style={{ 
                height: '34px', 
                padding: '0 14px', 
                background: '#ef4444', 
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '0.76rem',
                cursor: (!selectedMemberId || isDeleting) ? 'not-allowed' : 'pointer',
                opacity: (!selectedMemberId || isDeleting) ? 0.6 : 1
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

export default MemberListPanel;
