import React from 'react';

/**
 * 🏆 3. 등급 기준 컷오프 설정 탭
 */
export function HrScoringGradesTab({ formData, onChangeGradeMin, styles }) {
  return (
    <div style={styles.tabContent}>
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>고과 백분율 등급 컷오프 설정 (100% 만점 기준)</h3>
        <p style={styles.sectionDesc}>
          설정된 기준 점수 이상 획득 시 해당 등급이 부여되며, 전국 순위표 및 연봉협상 추천 구분에 자동 반영됩니다.
        </p>

        <div style={styles.gradeGrid}>
          {formData.gradeCriteria.map((g) => {
            const isD = g.grade === 'D';
            return (
              <div
                key={g.grade}
                style={{
                  ...styles.gradeBox,
                  borderColor: g.border,
                  backgroundColor: g.bg,
                }}
              >
                <span style={{ ...styles.gradeTag, color: g.color }}>
                  {g.grade}등급 · {g.shortLabel}
                </span>
                <div style={styles.gradeCutoffRow}>
                  {isD ? (
                    <span style={styles.fixedD}>0% 이상 (최하위 등급)</span>
                  ) : (
                    <>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={g.min}
                        onChange={(e) => onChangeGradeMin(g.grade, e.target.value)}
                        style={styles.gradeInput}
                      />
                      <span style={styles.unitText}>% 이상</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
