import React from 'react';

/**
 * 🎖️ 2. 상벌점 (가산/감점) 프리셋 편집 탭
 */
export function HrScoringPresetsTab({
  formData,
  onPresetItemChange,
  onAddPresetItem,
  onRemovePresetItem,
  styles,
}) {
  return (
    <div style={styles.presetGrid}>
      {/* 가산점(포상) 목록 */}
      <div style={styles.presetColumn}>
        <div style={styles.columnHeader}>
          <strong style={{ color: '#1d4ed8' }}>+ 가산점 (포상 프리셋)</strong>
          <button
            type="button"
            onClick={() => onAddPresetItem('rewardPresets')}
            style={styles.addPresetBtn}
          >
            + 항목 추가
          </button>
        </div>
        <div style={styles.presetList}>
          {formData.rewardPresets.map((item, idx) => (
            <div key={item.id || idx} style={styles.presetRow}>
              <input
                type="text"
                value={item.title}
                onChange={(e) => onPresetItemChange('rewardPresets', idx, 'title', e.target.value)}
                placeholder="포상 항목명"
                style={styles.presetTitleInput}
              />
              <div style={styles.pointsWrap}>
                <span style={{ color: '#1d4ed8', fontWeight: 700 }}>+</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={Math.abs(item.points)}
                  onChange={(e) => onPresetItemChange('rewardPresets', idx, 'points', e.target.value)}
                  style={styles.presetPointsInput}
                />
                <span style={styles.unitText}>점</span>
              </div>
              <button
                type="button"
                onClick={() => onRemovePresetItem('rewardPresets', idx)}
                style={styles.removeBtn}
                title="항목 삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 감점(징계) 목록 */}
      <div style={styles.presetColumn}>
        <div style={styles.columnHeader}>
          <strong style={{ color: '#b91c1c' }}>- 감점 (징계 프리셋)</strong>
          <button
            type="button"
            onClick={() => onAddPresetItem('penaltyPresets')}
            style={{
              ...styles.addPresetBtn,
              backgroundColor: '#fef2f2',
              color: '#b91c1c',
              borderColor: '#fca5a5',
            }}
          >
            + 항목 추가
          </button>
        </div>
        <div style={styles.presetList}>
          {formData.penaltyPresets.map((item, idx) => (
            <div key={item.id || idx} style={styles.presetRow}>
              <input
                type="text"
                value={item.title}
                onChange={(e) => onPresetItemChange('penaltyPresets', idx, 'title', e.target.value)}
                placeholder="징계 항목명"
                style={styles.presetTitleInput}
              />
              <div style={styles.pointsWrap}>
                <span style={{ color: '#b91c1c', fontWeight: 700 }}>-</span>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={Math.abs(item.points)}
                  onChange={(e) => onPresetItemChange('penaltyPresets', idx, 'points', e.target.value)}
                  style={styles.presetPointsInput}
                />
                <span style={styles.unitText}>점</span>
              </div>
              <button
                type="button"
                onClick={() => onRemovePresetItem('penaltyPresets', idx)}
                style={styles.removeBtn}
                title="항목 삭제"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
