import React from 'react';
import {
  calcPenaltyIntervals,
  DEFAULT_SCORING_SETTINGS,
} from '../../../constants/hrScoringConstants';

/**
 * ⏱️ 1. 자동 근태 감점 기준 설정 탭 (출퇴근 지정시간 기준 동적 구간 반영)
 */
export function HrScoringAutoPenaltyTab({ formData, onChangeAutoPenalty, styles }) {
  const workHours = formData?.workHours || DEFAULT_SCORING_SETTINGS.workHours;
  const workStartTime = workHours.workStartTime || '09:00';
  const workEndTime = workHours.workEndTime || '17:00';

  const intervals = calcPenaltyIntervals(workHours);
  const auto = formData?.autoPenalty || DEFAULT_SCORING_SETTINGS.autoPenalty;

  return (
    <div style={styles.tabContent}>
      {/* 1. 출근 지각 구간별 감점 */}
      <div style={styles.sectionCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={styles.sectionTitle}>
            1. 출근(지각) 구간별 감점 (출근 지정시간: {workStartTime} 기준)
          </h3>
          <span style={tabCustomStyles.graceBadge}>
            🛡️ {workStartTime} ~ {intervals.graceLateEnd} (10분 유예 인정, 0점)
          </span>
        </div>
        <p style={styles.sectionDesc}>
          출근 지정시간 이후 10분까지는 지각으로 잡지 않고 0점 처리하며, 10분 초과 구간부터 단계별 감점을 적용합니다.
        </p>

        <div style={styles.inputGrid}>
          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>
              10분 후 [{intervals.late10Range}]
            </label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(auto.late10m ?? auto.lateMinor ?? 1)}
                onChange={(e) => onChangeAutoPenalty('late10m', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>

          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>
              30분 후 [{intervals.late30Range}]
            </label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(auto.late30m ?? auto.lateNormal ?? 2)}
                onChange={(e) => onChangeAutoPenalty('late30m', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>

          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>
              1시간 후 [{intervals.late60Start}]
            </label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(auto.late60m ?? auto.lateSevere ?? 3)}
                onChange={(e) => onChangeAutoPenalty('late60m', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 퇴근 일찍 퇴근 구간별 감점 */}
      <div style={styles.sectionCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={styles.sectionTitle}>
            2. 퇴근(일찍 퇴근) 구간별 감점 (퇴근 지정시간: {workEndTime} 기준)
          </h3>
          <span style={tabCustomStyles.graceBadge}>
            🛡️ {intervals.graceEarlyStart}부터 정상 인정 (10분 전부터 0점)
          </span>
        </div>
        <p style={styles.sectionDesc}>
          퇴근 지정시간 10분 전({intervals.graceEarlyStart})부터는 정상 퇴근으로 인정하며, 그 이전 조기 퇴근 시 구간별 벌점이 부과됩니다.
        </p>

        <div style={styles.inputGrid}>
          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>
              10분 전 퇴근 [{intervals.early10Range}]
            </label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(auto.early10m ?? 1)}
                onChange={(e) => onChangeAutoPenalty('early10m', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>

          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>
              30분 전 퇴근 [{intervals.early30Range}]
            </label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(auto.early30m ?? auto.earlyLeave ?? 2)}
                onChange={(e) => onChangeAutoPenalty('early30m', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>

          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>
              1시간 전 퇴근 [{intervals.early60End}]
            </label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(auto.early60m ?? 3)}
                onChange={(e) => onChangeAutoPenalty('early60m', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>
        </div>

        {/* 조퇴 구분 및 미체크 안내 */}
        <div style={tabCustomStyles.earlyNoticeBox}>
          <div style={tabCustomStyles.earlyNoticeRow}>
            <div style={styles.fieldBox}>
              <label style={styles.fieldLabel}>20시 자동로그아웃 (퇴근 미체크 감점)</label>
              <div style={styles.inputWrap}>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={Math.abs(auto.autoLogout ?? 2)}
                  onChange={(e) => onChangeAutoPenalty('autoLogout', e.target.value)}
                  style={styles.scoreInput}
                />
                <span style={styles.unitText}>점 감점</span>
              </div>
            </div>
            <div style={tabCustomStyles.earlyTipText}>
              💡 <strong>조퇴 신청과 일찍 퇴근 구분</strong>: 사전에 조퇴를 신청한 날은 관리자가 <code>조퇴 (신청)</code>으로 지정하며, 벌점(0점) 없이 조퇴 건수로만 집계됩니다. 사전 신청 없는 일반 근무일의 조기 퇴근은 위 퇴근 구간 감점(10분전/30분전/1시간전)이 적용됩니다.
            </div>
          </div>
        </div>
      </div>

      {/* 3. 중대 근태 위반 감점 */}
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>3. 중대 근태 위반 감점</h3>
        <div style={styles.inputGrid}>
          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>미승인 원격접속 / 근무지 이탈</label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={20}
                value={Math.abs(auto.unauthorizedRemote ?? 5)}
                onChange={(e) => onChangeAutoPenalty('unauthorizedRemote', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>
          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>무단 결근 (사전 보고 없음)</label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={30}
                value={Math.abs(auto.absent ?? 10)}
                onChange={(e) => onChangeAutoPenalty('absent', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const tabCustomStyles = {
  graceBadge: {
    backgroundColor: '#f0fdf4',
    color: '#166534',
    fontSize: '11px',
    fontWeight: 700,
    padding: '3px 8px',
    borderRadius: '4px',
    border: '1px solid #bbf7d0',
  },
  earlyNoticeBox: {
    marginTop: '6px',
    padding: '8px 10px',
    backgroundColor: '#f8fafc',
    borderRadius: '6px',
    border: '1px solid #e2e8f0',
  },
  earlyNoticeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  earlyTipText: {
    flex: 1,
    fontSize: '11px',
    color: '#475569',
    lineHeight: 1.5,
  },
};
