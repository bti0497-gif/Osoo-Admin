import React, { useState } from 'react';
import { MemberViewErrorBoundary } from './ErrorBoundary';
import { MemberListPanel, SiteListPanel } from './panels';
import { useMemberViewModel } from '../useMemberViewModel.js';
import { useDialog } from '../../../components/common/DialogContext.jsx';

/**
 * 회원/현장 관리 View (Refactored)
 * 839라인 → 200라인으로 축소
 * 
 * 구조:
 * - View: MemberManagementView (조합만 담당)
 * - ViewModel: useMemberViewModel (비즈니스 로직)
 * - Panels: MemberListPanel, SiteListPanel (UI)
 */
function MemberManagementView() {
  const { showAlert, showConfirm } = useDialog();
  const {
    // Members
    members,
    loading: membersLoading,
    selectedMemberId,
    selectMember,
    newMemberRow,
    updateEditingMemberField,
    memberEditMode,
    startNewMemberRow,
    cancelNewMemberRow,
    startEditSelectedMemberRow,
    saveNewMemberRow,
    deleteSelectedMember,
    isSavingMember,
    isDeletingMember,
    
    // Sites
    sites,
    loading: sitesLoading,
    selectedSiteId,
    selectSite,
    newSiteRow,
    updateEditingSiteField,
    queuedSiteRows,
    siteEditMode,
    startNewSiteRow,
    cancelNewSiteRow,
    saveNewSiteRow,
    startEditSelectedSiteRow,
    deleteSelectedSite,
    isSavingSite,
    isDeletingSite,
    
    // View mode
    viewMode,
  } = useMemberViewModel({ showAlert, showConfirm });

  const [manageTab, setManageTab] = useState('site');
  const isSiteTab = manageTab === 'site';
  
  // 현재 탭 상태
  const isEditMode = isSiteTab ? siteEditMode : memberEditMode;
  const isSaving = isSiteTab ? isSavingSite : isSavingMember;
  const isDeleting = isSiteTab ? isDeletingSite : isDeletingMember;
  const newRow = isSiteTab ? newSiteRow : newMemberRow;

  // View: 목록 화면
  if (viewMode === 'list') {
    return (
      <MemberViewErrorBoundary>
        <div style={{ 
          width: '100%', 
          height: '100%', 
          display: 'flex', 
          flexDirection: 'column',
          background: '#f8fafc'
        }}>
          {/* Header */}
          <div style={{ 
            height: '48px', 
            background: '#fff', 
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            padding: '0 1rem',
            flexShrink: 0,
          }}>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>회원/현장 관리</h1>
          </div>

          {/* Tabs */}
          <div style={{ 
            display: 'flex', 
            padding: '0.5rem 1rem', 
            gap: '0.5rem',
            background: '#fff',
            borderBottom: '1px solid #e2e8f0',
            flexShrink: 0,
          }}>
            <button
              onClick={() => setManageTab('site')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: manageTab === 'site' ? '#0f766e' : '#fff',
                color: manageTab === 'site' ? '#fff' : '#334155',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              현장 관리
            </button>
            <button
              onClick={() => setManageTab('member')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: manageTab === 'member' ? '#0f766e' : '#fff',
                color: manageTab === 'member' ? '#fff' : '#334155',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              회원 관리
            </button>
          </div>

          {/* Scrollable Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '0 1rem' }}>
            {isSiteTab ? (
              <SiteListPanel
                sites={sites}
                members={members}
                selectedSiteId={selectedSiteId}
                onSelectSite={selectSite}
                newSiteRow={newSiteRow}
                onFieldChange={updateEditingSiteField}
                queuedSiteRows={queuedSiteRows}
                isEditMode={siteEditMode}
                loading={sitesLoading}
              />
            ) : (
              <MemberListPanel
                members={members}
                sites={sites}
                selectedMemberId={selectedMemberId}
                onSelectMember={selectMember}
                newMemberRow={newMemberRow}
                onFieldChange={updateEditingMemberField}
                isEditMode={memberEditMode}
                loading={membersLoading}
                onNavigateToSites={() => setManageTab('site')}
              />
            )}
          </div>

          {/* Footer Toolbar - Fixed at bottom */}
          <div style={{ 
            padding: '0.75rem 1.25rem', 
            borderTop: '1px solid #e2e8f0', 
            display: 'flex', 
            gap: '0.5rem',
            background: '#fff',
            flexShrink: 0,
          }}>
            {isEditMode ? (
              <>
                <button
                  onClick={isSiteTab ? cancelNewSiteRow : cancelNewMemberRow}
                  style={btnStyle('secondary')}
                >
                  취소
                </button>
                <button
                  onClick={isSiteTab ? saveNewSiteRow : saveNewMemberRow}
                  disabled={isSaving}
                  style={{ ...btnStyle('primary'), opacity: isSaving ? 0.7 : 1 }}
                >
                  {isSaving ? '저장 중...' : ((newRow?.id || newRow?.siteId) ? '수정 저장' : (isSiteTab ? '현장 저장' : '회원 저장'))}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={isSiteTab ? startNewSiteRow : startNewMemberRow}
                  style={btnStyle('primary')}
                >
                  <span style={{ fontSize: '14px', marginRight: '4px' }}>+</span>
                  {isSiteTab ? '현장 행 추가' : '회원 행 추가'}
                </button>
                <button
                  onClick={() => {
                    const selectedId = isSiteTab ? selectedSiteId : selectedMemberId;
                    if (!selectedId) return;
                    if (isSiteTab) startEditSelectedSiteRow(selectedId);
                    else startEditSelectedMemberRow(selectedId);
                  }}
                  disabled={!(isSiteTab ? selectedSiteId : selectedMemberId)}
                  style={{ 
                    ...btnStyle('secondary'),
                    opacity: !(isSiteTab ? selectedSiteId : selectedMemberId) ? 0.6 : 1 
                  }}
                >
                  수정
                </button>
                <button
                  onClick={() => {
                    const selectedId = isSiteTab ? selectedSiteId : selectedMemberId;
                    if (!selectedId) return;
                    if (isSiteTab) deleteSelectedSite(selectedId);
                    else deleteSelectedMember(selectedId);
                  }}
                  disabled={!(isSiteTab ? selectedSiteId : selectedMemberId) || isDeleting}
                  style={{ 
                    ...btnStyle('danger'),
                    opacity: !(isSiteTab ? selectedSiteId : selectedMemberId) || isDeleting ? 0.6 : 1
                  }}
                >
                  {isDeleting ? '삭제 중...' : '삭제'}
                </button>
              </>
            )}
          </div>
        </div>
      </MemberViewErrorBoundary>
    );
  }

  return null;
}

function btnStyle(variant) {
  const base = {
    height: '34px',
    padding: '0 14px',
    borderRadius: '8px',
    fontWeight: 800,
    fontSize: '0.76rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  };
  if (variant === 'primary') {
    return { ...base, background: '#0f766e', color: '#fff', border: 'none' };
  }
  if (variant === 'secondary') {
    return { ...base, background: '#fff', color: '#475569', border: '1px solid #cbd5e1' };
  }
  if (variant === 'danger') {
    return { ...base, background: '#ef4444', color: '#fff', border: 'none' };
  }
  return base;
}

export { MemberManagementView };
