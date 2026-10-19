import React from 'react';

/**
 * ⏱️ 1. 자동 근태 감점 기준 설정 탭
 */
export function HrScoringAutoPenaltyTab({ formData, onChangeAutoPenalty, styles }) {
  return (
    <div style={styles.tabContent}>
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>1. 출근 지각 구간별 감점 (09:00 기준)</h3>
        <div style={styles.inputGrid}>
          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>경미 지각 (09:01 ~ 09:30)</label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(formData.autoPenalty.lateMinor)}
                onChange={(e) => onChangeAutoPenalty('lateMinor', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>
          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>일반 지각 (09:31 ~ 10:00)</label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(formData.autoPenalty.lateNormal)}
                onChange={(e) => onChangeAutoPenalty('lateNormal', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>
          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>중대 지각 (10:01 이후)</label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(formData.autoPenalty.lateSevere)}
                onChange={(e) => onChangeAutoPenalty('lateSevere', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>
        </div>
      </div>

      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>2. 퇴근 조퇴 및 미체크 자동 감점</h3>
        <div style={styles.inputGrid}>
          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>조기 퇴근 (18:00 이전 퇴근)</label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(formData.autoPenalty.earlyLeave)}
                onChange={(e) => onChangeAutoPenalty('earlyLeave', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>
          <div style={styles.fieldBox}>
            <label style={styles.fieldLabel}>20시 자동로그아웃 (퇴근 미체크)</label>
            <div style={styles.inputWrap}>
              <input
                type="number"
                min={0}
                max={10}
                value={Math.abs(formData.autoPenalty.autoLogout)}
                onChange={(e) => onChangeAutoPenalty('autoLogout', e.target.value)}
                style={styles.scoreInput}
              />
              <span style={styles.unitText}>점 감점</span>
            </div>
          </div>
        </div>
      </div>

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
                value={Math.abs(formData.autoPenalty.unauthorizedRemote)}
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
                value={Math.abs(formData.autoPenalty.absent)}
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
