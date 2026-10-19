import React from 'react';
import { SALARY_RECOMMENDATION_OPTIONS } from '../../constants/hrAnnualConstants';

/**
 * 연간 주요 상벌(포상·징계) 이력 & 연봉협상용 종합 평가 섹션 (하단 2단 구성)
 */
export function HrAnnualEvaluationSection({
  annualRewardPenaltyTimeline = [],
  annualRewardCount = 0,
  annualPenaltyCount = 0,
  salaryRecommendation,
  onUpdateSalaryRecommendation,
  annualComment,
  onUpdateAnnualComment,
  isAnnualConfirmed,
  annualConfirmedAt,
  onToggleConfirmAnnual,
  onViewApology,
}) {
  return (
    <div style={styles.bottomRow}>
      {/* 좌측: 연간 누적 상벌점(포상/징계) 타임라인 */}
      <div style={styles.timelineCard}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>📜</span>
          <div style={styles.cardHeaderTitleWrap}>
            <span style={styles.cardTitle}>연간 누적 상벌(포상·징계) 전체 타임라인</span>
            <span style={styles.cardSubTitle}>
              총 {annualRewardPenaltyTimeline.length}건 (상점 {annualRewardCount}건 / 벌점 {annualPenaltyCount}건)
            </span>
          </div>
        </div>

        <div style={styles.timelineScroll}>
          {annualRewardPenaltyTimeline.length === 0 ? (
            <div style={styles.emptyTimeline}>1년 동안 기록된 관리자 상벌점 내역이 없습니다.</div>
          ) : (
            annualRewardPenaltyTimeline.map((item, idx) => {
              const isReward = item.category === 'reward' || item.points > 0;
              const hasApology = Boolean(item.apologyDoc);

              return (
                <div key={item.id || idx} style={styles.timelineItem}>
                  <div style={styles.timelineLeft}>
                    <span
                      style={{
                        ...styles.categoryBadge,
                        backgroundColor: isReward ? '#dbeafe' : '#fee2e2',
                        color: isReward ? '#1d4ed8' : '#b91c1c',
                      }}
                    >
                      {isReward ? '포상' : '징계'} {isReward ? `+${item.points}` : item.points}점
                    </span>
                    <span style={styles.timelineDate}>{item.date}</span>
                  </div>
                  <div style={styles.timelineContent}>
                    <div style={styles.timelineTitleRow}>
                      <span style={styles.timelineTitle}>{item.title}</span>
                      {hasApology && (
                        <button
                          type="button"
                          onClick={() => onViewApology && onViewApology(item)}
                          style={styles.apologyViewBtn}
                          title="Google Drive에 보관된 시말서 스캔본 열람"
                        >
                          📄 시말서 보기
                        </button>
                      )}
                    </div>
                    <div style={styles.timelineReason}>{item.reason || '-'}</div>
                    <div style={styles.timelineAuthor}>부여자: {item.author || '관리자'}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 우측: 연말/연초 종합 평가 및 연봉협상 의견서 카드 */}
      <div style={styles.evaluationCard}>
        <div style={styles.cardHeader}>
          <span style={styles.cardIcon}>✍️</span>
          <div style={styles.cardHeaderTitleWrap}>
            <span style={styles.cardTitle}>연말/연초 종합 평가 및 연봉협상 의견서</span>
            <span style={styles.cardSubTitle}>인사위원회 및 대표이사 연봉계약 체결 시 공식 반영 자료</span>
          </div>
        </div>

        <div style={styles.evaluationBody}>
          {/* 연봉협상 권고 구분 선택 */}
          <div style={styles.recomSection}>
            <label style={styles.inputLabel}>연봉협상 권고 구분:</label>
            <div style={styles.recomGrid}>
              {SALARY_RECOMMENDATION_OPTIONS.map((opt) => {
                const isChecked = salaryRecommendation === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onUpdateSalaryRecommendation(opt.value)}
                    style={{
                      ...styles.recomBtn,
                      borderColor: isChecked ? opt.color : '#cbd5e1',
                      backgroundColor: isChecked ? opt.bg : '#ffffff',
                      boxShadow: isChecked ? `0 0 0 2px ${opt.border}` : 'none',
                    }}
                  >
                    <div style={styles.recomTop}>
                      <span style={{ ...styles.radioDot, borderColor: isChecked ? opt.color : '#94a3b8' }}>
                        {isChecked && <span style={{ ...styles.radioInner, backgroundColor: opt.color }} />}
                      </span>
                      <strong style={{ ...styles.recomLabel, color: isChecked ? opt.color : '#0f172a' }}>
                        {opt.label}
                      </strong>
                    </div>
                    <p style={styles.recomDesc}>{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 연간 종합 평가 의견 입력란 */}
          <div style={styles.commentSection}>
            <div style={styles.commentHeaderRow}>
              <label style={styles.inputLabel}>연간 종합 인사평가 총평 (연봉협상 근거):</label>
              <span style={styles.charCount}>({(annualComment || '').length}자)</span>
            </div>
            <textarea
              value={annualComment}
              onChange={(e) => onUpdateAnnualComment(e.target.value)}
              placeholder="1년간의 근태 성실도, 설비 긴급 대응, 수질 기준 준수, 상벌 이력 등을 종합하여 기록하세요..."
              style={styles.commentTextarea}
              rows={4}
            />
          </div>

          {/* 최종 확정 액션 바 */}
          <div style={styles.confirmActionRow}>
            <div style={styles.confirmInfo}>
              {isAnnualConfirmed ? (
                <span style={styles.confirmTimestamp}>
                  🔒 {annualConfirmedAt || '최종 확정됨'} · 수정 시 확정 취소 필요
                </span>
              ) : (
                <span style={styles.unconfirmedNotice}>
                  ⚠️ 아직 확정되지 않았습니다. 총평 검토 후 최종 확정 버튼을 누르세요.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onToggleConfirmAnnual}
              style={{
                ...styles.confirmToggleBtn,
                backgroundColor: isAnnualConfirmed ? '#475569' : '#15803d',
              }}
            >
              {isAnnualConfirmed ? '↩️ 연간 고과 확정 취소' : '✅ 연간 인사고과 최종 확정'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  bottomRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
    flexShrink: 0,
    paddingBottom: '8px',
  },
  timelineCard: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: '220px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  cardIcon: {
    fontSize: '15px',
  },
  cardTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#334155',
  },
  cardHeaderTitleWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  cardSubTitle: {
    fontSize: '11px',
    color: '#64748b',
  },
  timelineScroll: {
    flex: 1,
    overflowY: 'auto',
    maxHeight: '220px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    paddingRight: '4px',
  },
  emptyTimeline: {
    padding: '30px 10px',
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: '12px',
  },
  timelineItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '6px',
    backgroundColor: '#f8fafc',
    border: '1px solid #f1f5f9',
  },
  timelineLeft: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '3px',
    flexShrink: 0,
    width: '90px',
  },
  categoryBadge: {
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 800,
  },
  timelineDate: {
    fontSize: '10px',
    color: '#64748b',
  },
  timelineContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  timelineTitleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
  },
  timelineTitle: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#0f172a',
  },
  apologyViewBtn: {
    padding: '1px 6px',
    borderRadius: '4px',
    border: '1px solid #f87171',
    backgroundColor: '#ffffff',
    color: '#b91c1c',
    fontSize: '10px',
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  timelineReason: {
    fontSize: '11px',
    color: '#475569',
    lineHeight: 1.35,
  },
  timelineAuthor: {
    fontSize: '10px',
    color: '#94a3b8',
  },
  evaluationCard: {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    border: '1px solid #e2e8f0',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  evaluationBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  recomSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  inputLabel: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#1e293b',
  },
  recomGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '6px',
  },
  recomBtn: {
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1.5px solid',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    transition: 'all 0.12s ease',
  },
  recomTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  radioDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    border: '1.5px solid',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioInner: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  recomLabel: {
    fontSize: '11.5px',
  },
  recomDesc: {
    margin: 0,
    fontSize: '10px',
    color: '#64748b',
    lineHeight: 1.3,
    paddingLeft: '18px',
  },
  commentSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  commentHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  charCount: {
    fontSize: '10.5px',
    color: '#94a3b8',
  },
  commentTextarea: {
    width: '100%',
    borderRadius: '6px',
    border: '1px solid #cbd5e1',
    padding: '8px 10px',
    fontSize: '11.5px',
    color: '#0f172a',
    lineHeight: 1.45,
    resize: 'vertical',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
  },
  confirmActionRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    paddingTop: '4px',
    borderTop: '1px dashed #e2e8f0',
  },
  confirmInfo: {
    flex: 1,
  },
  confirmTimestamp: {
    fontSize: '11px',
    color: '#15803d',
    fontWeight: 700,
  },
  unconfirmedNotice: {
    fontSize: '11px',
    color: '#b45309',
    fontWeight: 600,
  },
  confirmToggleBtn: {
    padding: '7px 14px',
    borderRadius: '6px',
    border: 'none',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.15s ease',
  },
};
