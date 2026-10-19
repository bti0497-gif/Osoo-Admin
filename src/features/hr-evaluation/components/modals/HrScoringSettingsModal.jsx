import React, { useState } from 'react';
import { DEFAULT_SCORING_SETTINGS } from '../../constants/hrScoringConstants';
import { hrScoringModalStyles as styles } from './scoring/hrScoringModalStyles';
import { HrScoringAutoPenaltyTab } from './scoring/HrScoringAutoPenaltyTab';
import { HrScoringPresetsTab } from './scoring/HrScoringPresetsTab';
import { HrScoringGradesTab } from './scoring/HrScoringGradesTab';

/**
 * ⚙️ 인사고과 평가 기준 및 상벌 프리셋 설정 모달
 */
export function HrScoringSettingsModal({
  isOpen,
  onClose,
  currentSettings,
  onSaveSettings,
}) {
  const [activeTab, setActiveTab] = useState('autoPenalty'); // 'autoPenalty' | 'presets' | 'grades'
  const [formData, setFormData] = useState(() => {
    return currentSettings ? JSON.parse(JSON.stringify(currentSettings)) : DEFAULT_SCORING_SETTINGS;
  });

  if (!isOpen) return null;

  // 자동 감점 필드 업데이트
  const handleAutoPenaltyChange = (field, val) => {
    const num = Number(val);
    const signed = num > 0 ? -num : num;
    setFormData((prev) => ({
      ...prev,
      autoPenalty: {
        ...prev.autoPenalty,
        [field]: signed,
      },
    }));
  };

  // 등급 컷오프 업데이트
  const handleGradeMinChange = (gradeKey, val) => {
    const num = Math.max(0, Math.min(100, Number(val) || 0));
    setFormData((prev) => ({
      ...prev,
      gradeCriteria: prev.gradeCriteria.map((g) => (g.grade === gradeKey ? { ...g, min: num } : g)),
    }));
  };

  // 프리셋 항목 수정
  const handlePresetItemChange = (type, index, field, val) => {
    setFormData((prev) => {
      const list = [...(prev[type] || [])];
      if (!list[index]) return prev;
      let nextVal = val;
      if (field === 'points') {
        const num = Number(val) || 1;
        nextVal = type === 'rewardPresets' ? Math.abs(num) : -Math.abs(num);
      }
      list[index] = { ...list[index], [field]: nextVal };
      return { ...prev, [type]: list };
    });
  };

  // 프리셋 항목 추가
  const handleAddPresetItem = (type) => {
    const isReward = type === 'rewardPresets';
    const newItem = {
      id: `${isReward ? 'r' : 'p'}_custom_${Date.now()}`,
      title: isReward ? '새 가산점 항목' : '새 감점 항목',
      points: isReward ? 2 : -2,
      defaultReason: '',
    };
    setFormData((prev) => ({
      ...prev,
      [type]: [...(prev[type] || []), newItem],
    }));
  };

  // 프리셋 항목 삭제
  const handleRemovePresetItem = (type, index) => {
    setFormData((prev) => {
      const list = [...(prev[type] || [])];
      list.splice(index, 1);
      return { ...prev, [type]: list };
    });
  };

  // 기본값 복원
  const handleResetToDefault = () => {
    if (window.confirm('모든 감점·가산점 및 등급 기준을 공장 초기값으로 되돌리시겠습니까?')) {
      setFormData(JSON.parse(JSON.stringify(DEFAULT_SCORING_SETTINGS)));
    }
  };

  // 최종 저장
  const handleSave = () => {
    onSaveSettings(formData);
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 모달 헤더 */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <span style={styles.headerIcon}>⚙️</span>
            <div>
              <h2 style={styles.title}>인사고과 점수 및 상벌 기준 설정</h2>
              <p style={styles.subtitle}>
                근태 자동 감점, 관리자 상벌 프리셋 및 S~D등급 컷오프를 설정합니다. 저장 시 즉시 전체 재계산됩니다.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        </div>

        {/* 탭 네비게이션 */}
        <div style={styles.tabBar}>
          <button
            type="button"
            onClick={() => setActiveTab('autoPenalty')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'autoPenalty' ? styles.tabBtnActive : {}),
            }}
          >
            ⏱️ 자동 근태 감점 기준
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'presets' ? styles.tabBtnActive : {}),
            }}
          >
            🎖️ 상벌점(가산/감점) 프리셋
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('grades')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'grades' ? styles.tabBtnActive : {}),
            }}
          >
            🏆 등급(S~D) 기준 점수
          </button>
        </div>

        {/* 탭 컨텐츠 */}
        <div style={styles.body}>
          {activeTab === 'autoPenalty' && (
            <HrScoringAutoPenaltyTab
              formData={formData}
              onChangeAutoPenalty={handleAutoPenaltyChange}
              styles={styles}
            />
          )}

          {activeTab === 'presets' && (
            <HrScoringPresetsTab
              formData={formData}
              onPresetItemChange={handlePresetItemChange}
              onAddPresetItem={handleAddPresetItem}
              onRemovePresetItem={handleRemovePresetItem}
              styles={styles}
            />
          )}

          {activeTab === 'grades' && (
            <HrScoringGradesTab
              formData={formData}
              onChangeGradeMin={handleGradeMinChange}
              styles={styles}
            />
          )}
        </div>

        {/* 하단 액션 버튼 바 */}
        <div style={styles.footer}>
          <button type="button" onClick={handleResetToDefault} style={styles.resetBtn}>
            ↺ 기본값 복원
          </button>
          <div style={styles.footerRight}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>
              취소
            </button>
            <button type="button" onClick={handleSave} style={styles.saveBtn}>
              💾 설정 저장 및 전체 점수 재계산
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
