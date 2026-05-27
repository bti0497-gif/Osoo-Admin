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
function MemberManagementView({ currentUser, passwordOnly = false }) {
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
    deleteMultipleMembers,
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
    deleteMultipleSites,
    isSavingSite,
    isDeletingSite,
    
    // Bootstrap (회원/현장 등록)
    bootstrapMember,
    setBootstrapMember,
    bootstrapLink,
    setBootstrapLink,
    isBootstrappingSiteMember,
    handleBootstrapSiteMember,
    registerBootstrapLocation,
    
    // View mode
    viewMode,
    setViewMode,
  } = useMemberViewModel({ showAlert, showConfirm });

  const [manageTab, setManageTab] = useState('site');

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
            padding: '0 1rem'
          }}>
            <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>회원/현장 관리</h1>
          </div>

          {/* Tabs */}
          <div style={{ 
            display: 'flex', 
            padding: '0.5rem 1rem', 
            gap: '0.5rem',
            background: '#fff',
            borderBottom: '1px solid #e2e8f0'
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

          {/* Content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {manageTab === 'site' ? (
              <SiteListPanel
                sites={sites}
                members={members}
                selectedSiteId={selectedSiteId}
                onSelectSite={selectSite}
                newSiteRow={newSiteRow}
                onFieldChange={updateEditingSiteField}
                queuedSiteRows={queuedSiteRows}
                onStartNewRow={startNewSiteRow}
                onStartEdit={startEditSelectedSiteRow}
                onDelete={deleteSelectedSite}
                onDeleteMultiple={deleteMultipleSites}
                onSave={saveNewSiteRow}
                onCancel={cancelNewSiteRow}
                isSaving={isSavingSite}
                isDeleting={isDeletingSite}
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
                onStartNewRow={startNewMemberRow}
                onStartEdit={startEditSelectedMemberRow}
                onDelete={deleteSelectedMember}
                onDeleteMultiple={deleteMultipleMembers}
                onSave={saveNewMemberRow}
                onCancel={cancelNewMemberRow}
                isSaving={isSavingMember}
                isDeleting={isDeletingMember}
                isEditMode={memberEditMode}
                loading={membersLoading}
                onNavigateToSites={() => setManageTab('site')}
              />
            )}
          </div>
        </div>
      </MemberViewErrorBoundary>
    );
  }

  return null;
}

export { MemberManagementView };
