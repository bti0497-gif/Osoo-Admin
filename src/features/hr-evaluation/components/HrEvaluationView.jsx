import React from 'react';
import { useHrEvaluationViewModel } from '../viewmodels/useHrEvaluationViewModel';
import { TooltipIconButton } from './TooltipIconButton';
import { HrBoardRefDrawer } from './HrBoardRefDrawer';
import { HrCalendarWorkspace } from './HrCalendarWorkspace';
import { HrListWorkspace } from './HrListWorkspace';
import { HrAnnualWorkspace } from './HrAnnualWorkspace';
import { HrRankingWorkspace } from './HrRankingWorkspace';
import { HrRightSidebarDashboard } from './HrRightSidebarDashboard';
import { HrScoringSettingsModal } from './modals/HrScoringSettingsModal';
import { HrApologyModal } from './modals/HrApologyModal';

/**
 * [근태 및 인사고과] (hr_evaluation) 메인 View
 */
export function HrEvaluationView({ currentUser }) {
  const {
    year,
    month,
    selectedWorkerId,
    setSelectedWorkerId,
    viewMode,
    setViewMode,
    selectedDate,
    setSelectedDate,
    selectedDayRecord,
    showBoardRefDrawer,
    setShowBoardRefDrawer,
    boardReasonPosts,
    selectBoardPostDate,
    currentWorkerEvaluation,
    rankedEvaluations,
    dropdownEvaluations,
    filteredRankingList,
    rankingPeriodMode,
    setRankingPeriodMode,
    annualRankedList,
    filteredAnnualRankingList,
    currentWorkerAnnualSummary,
    rankingSearch,
    setRankingSearch,
    rankingGradeFilter,
    setRankingGradeFilter,
    updateDayRecord,
    addRewardPenalty,
    removeRewardPenalty,
    updateEvaluatorComment,
    toggleConfirmEvaluation,
    resetCurrentMonthSimulation,
    updateAnnualComment,
    updateSalaryRecommendation,
    toggleConfirmAnnualEvaluation,
    showScoringSettingsModal,
    setShowScoringSettingsModal,
    selectedApologyPenalty,
    setSelectedApologyPenalty,
    scoringSettings,
    updateScoringSettings,
    updateApologyDoc,
    changeYearMonth,
  } = useHrEvaluationViewModel({ currentUser });

  const yearMonthValue = `${year}-${String(month).padStart(2, '0')}`;

  const handleMonthPickerChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const [nextYear, nextMonth] = val.split('-').map(Number);
    if (nextYear && nextMonth) {
      changeYearMonth(nextYear, nextMonth);
    }
  };

  return (
    <div style={styles.rootContainer}>
      {/* 좌측 영역: 상단 1줄 컨트롤 바 + 메인 워크스페이스 */}
      <div style={styles.leftColumn}>
        {/* 1. 상단 1줄 컴팩트 컨트롤 바 */}
        <header style={styles.headerBar}>
          {/* 대상연월 단일 데이트피커 */}
          <input
            type="month"
            value={yearMonthValue}
            onChange={handleMonthPickerChange}
            style={styles.monthPickerInput}
            aria-label="대상 연월 선택"
          />

          {/* 현장명 (이름) 간결 드롭다운 */}
          <select
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            style={styles.workerSelect}
            aria-label="평가 대상 현장 및 근무자"
          >
            {(dropdownEvaluations || rankedEvaluations).map((ev) => (
              <option key={ev.workerId} value={ev.workerId}>
                {ev.siteName} ({ev.workerName})
              </option>
            ))}
          </select>

          {/* 뷰 전환 세그먼트 아이콘 버튼 그룹 (달력 | 목록 | 연간 고과 | 순위) */}
          <div style={styles.segmentGroup}>
            <TooltipIconButton
              icon="📅"
              tooltip="월간 달력 보기"
              active={viewMode === 'calendar'}
              onClick={() => setViewMode('calendar')}
            />
            <TooltipIconButton
              icon="📋"
              tooltip="월간 목록 보기"
              active={viewMode === 'list'}
              onClick={() => setViewMode('list')}
            />
            <TooltipIconButton
              icon="📊"
              tooltip="연간 종합 고과 (연봉협상 자료)"
              active={viewMode === 'annual'}
              onClick={() => setViewMode('annual')}
            />
            <TooltipIconButton
              icon="🏆"
              tooltip="전체 현장 순위"
              active={viewMode === 'ranking'}
              onClick={() => setViewMode('ranking')}
            />
          </div>

          {/* 우측 경량 아이콘 액션 버튼: 소통게시판 참고 (배지), 기준 설정 & 초기화 */}
          <div style={styles.rightActions}>
            <TooltipIconButton
              icon="💬"
              tooltip="소통게시판 참고 글 보기"
              active={showBoardRefDrawer}
              badgeCount={boardReasonPosts.length}
              onClick={() => setShowBoardRefDrawer((prev) => !prev)}
              buttonStyle={styles.boardIconBtn}
              activeStyle={styles.boardIconBtnActive}
            />
            <TooltipIconButton
              icon="⚙️"
              tooltip="인사고과 점수 및 상벌 기준 설정"
              onClick={() => setShowScoringSettingsModal(true)}
              buttonStyle={styles.settingsIconBtn}
            />
            <TooltipIconButton
              icon="↺"
              tooltip="현재 월 데이터 초기화"
              onClick={resetCurrentMonthSimulation}
              buttonStyle={styles.resetIconBtn}
            />
          </div>
        </header>

        {/* 2. 소통게시판 사유글 참고 패널 */}
        {showBoardRefDrawer && (
          <HrBoardRefDrawer
            year={year}
            month={month}
            currentWorkerEvaluation={currentWorkerEvaluation}
            boardReasonPosts={boardReasonPosts}
            selectedDate={selectedDate}
            onSelectBoardPostDate={selectBoardPostDate}
            onClose={() => setShowBoardRefDrawer(false)}
          />
        )}

        {/* 3. 좌측 메인 워크스페이스 영역 */}
        <main style={styles.workspaceWrapper}>
          {viewMode === 'calendar' && (
            <HrCalendarWorkspace
              year={year}
              month={month}
              workerEvaluation={currentWorkerEvaluation}
              onSelectDate={setSelectedDate}
              selectedDayRecord={selectedDayRecord}
              onUpdateDayRecord={updateDayRecord}
            />
          )}

          {viewMode === 'list' && (
            <HrListWorkspace
              year={year}
              month={month}
              workerEvaluation={currentWorkerEvaluation}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              onUpdateDayRecord={updateDayRecord}
            />
          )}

          {viewMode === 'annual' && (
            <HrAnnualWorkspace
              year={year}
              month={month}
              annualSummary={currentWorkerAnnualSummary}
              onSelectMonth={(targetMonth, targetMode = 'calendar') => {
                changeYearMonth(year, targetMonth);
                if (targetMode) setViewMode(targetMode);
              }}
              onUpdateAnnualComment={updateAnnualComment}
              onUpdateSalaryRecommendation={updateSalaryRecommendation}
              onToggleConfirmAnnual={toggleConfirmAnnualEvaluation}
              onViewApology={setSelectedApologyPenalty}
            />
          )}

          {viewMode === 'ranking' && (
            <HrRankingWorkspace
              year={year}
              month={month}
              rankingPeriodMode={rankingPeriodMode}
              onChangePeriodMode={setRankingPeriodMode}
              rankedEvaluations={rankedEvaluations}
              annualRankedList={annualRankedList}
              filteredRankingList={filteredRankingList}
              filteredAnnualRankingList={filteredAnnualRankingList}
              selectedWorkerId={selectedWorkerId}
              onSelectWorker={setSelectedWorkerId}
              onSwitchViewMode={setViewMode}
              rankingSearch={rankingSearch}
              onChangeSearch={setRankingSearch}
              rankingGradeFilter={rankingGradeFilter}
              onChangeGradeFilter={setRankingGradeFilter}
            />
          )}
        </main>
      </div>

      {/* 우측 고정 사이드바 */}
      <HrRightSidebarDashboard
        year={year}
        month={month}
        workerEvaluation={currentWorkerEvaluation}
        scoringSettings={scoringSettings}
        onAddRewardPenalty={addRewardPenalty}
        onRemoveRewardPenalty={removeRewardPenalty}
        onUpdateComment={updateEvaluatorComment}
        onToggleConfirm={toggleConfirmEvaluation}
        onViewApology={setSelectedApologyPenalty}
        onUpdateApologyDoc={updateApologyDoc}
      />

      {/* 인사고과 기준 설정 모달 */}
      <HrScoringSettingsModal
        isOpen={showScoringSettingsModal}
        onClose={() => setShowScoringSettingsModal(false)}
        currentSettings={scoringSettings}
        onSaveSettings={updateScoringSettings}
      />

      {/* 시말서(경위서) 열람 및 관리 모달 */}
      <HrApologyModal
        isOpen={Boolean(selectedApologyPenalty)}
        onClose={() => setSelectedApologyPenalty(null)}
        penaltyItem={selectedApologyPenalty}
        workerEvaluation={currentWorkerEvaluation}
        onUpdateApologyDoc={updateApologyDoc}
      />
    </div>
  );
}

const styles = {
  rootContainer: {
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    padding: '12px 16px',
    backgroundColor: '#f1f5f9',
    display: 'flex',
    flexDirection: 'row',
    gap: '12px',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  leftColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  headerBar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: '8px',
    padding: '6px 10px',
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    flexShrink: 0,
  },
  monthPickerInput: {
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    fontSize: '12.5px',
    fontWeight: 700,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    outline: 'none',
    width: '126px',
    flexShrink: 0,
  },
  workerSelect: {
    padding: '5px 8px',
    borderRadius: '6px',
    border: '1.5px solid #2563eb',
    fontSize: '12.5px',
    fontWeight: 700,
    color: '#0f172a',
    backgroundColor: '#eff6ff',
    width: '185px',
    maxWidth: '200px',
    cursor: 'pointer',
    outline: 'none',
    textOverflow: 'ellipsis',
    flexShrink: 0,
  },
  segmentGroup: {
    display: 'inline-flex',
    backgroundColor: '#f1f5f9',
    padding: '2px',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    gap: '3px',
    flexShrink: 0,
  },
  rightActions: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  boardIconBtn: {
    border: '1px solid #93c5fd',
    backgroundColor: '#eff6ff',
    color: '#1d4ed8',
  },
  boardIconBtnActive: {
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    borderColor: '#1d4ed8',
  },
  settingsIconBtn: {
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#475569',
    fontSize: '15px',
  },
  resetIconBtn: {
    border: '1px solid #cbd5e1',
    backgroundColor: '#ffffff',
    color: '#64748b',
    fontSize: '16px',
  },
  workspaceWrapper: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
};
