import React, { useState, useRef } from 'react';
import { DEFAULT_SCORING_SETTINGS } from '../../constants/hrScoringConstants';
import { hrSidebarRewardPenaltyStyles as styles } from './hrSidebarRewardPenaltyStyles';
import { HrSidebarRewardPenaltyList } from './HrSidebarRewardPenaltyList';

/**
 * 우측 사이드바 3. 관리자 상벌점 (포상 · 징계) 및 시말서 스캔본 관리 컴포넌트
 */
export function HrSidebarRewardPenaltyManager({
  workerEvaluation,
  scoringSettings,
  onAddRewardPenalty,
  onRemoveRewardPenalty,
  onViewApology,
  onUpdateApologyDoc,
}) {
  const [rpTab, setRpTab] = useState('reward'); // 'reward' | 'penalty'
  const presets = scoringSettings || DEFAULT_SCORING_SETTINGS;
  const activePresets = rpTab === 'reward' ? presets.rewardPresets : presets.penaltyPresets;

  const [selectedPresetId, setSelectedPresetId] = useState(() => activePresets[0]?.id || '');
  const [customTitle, setCustomTitle] = useState(() => activePresets[0]?.title?.replace(' (포상)', '').replace(' (징계/감점)', '') || '');
  const [customPoints, setCustomPoints] = useState(() => Math.abs(activePresets[0]?.points || 2));
  const [customReason, setCustomReason] = useState('');
  const [attachedApologyDoc, setAttachedApologyDoc] = useState(null);

  const fileInputRef = useRef(null);
  const appendFileInputRef = useRef(null);
  const [targetAppendItemId, setTargetAppendItemId] = useState(null);

  const { netRewardPenalty = 0, rewardPenaltyList = [] } = workerEvaluation || {};

  // 근무자 변경 시 사유 및 첨부 파일 자동 초기화
  React.useEffect(() => {
    setCustomReason('');
    setAttachedApologyDoc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [workerEvaluation?.workerId]);

  const handleTabSwitch = (nextTab) => {
    setRpTab(nextTab);
    const list = nextTab === 'reward' ? presets.rewardPresets : presets.penaltyPresets;
    const first = list[0];
    if (first) {
      setSelectedPresetId(first.id);
      setCustomTitle(first.title.replace(' (포상)', '').replace(' (징계/감점)', ''));
      setCustomPoints(Math.abs(first.points));
    }
    setCustomReason('');
    setAttachedApologyDoc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePresetChange = (presetId) => {
    setSelectedPresetId(presetId);
    const found = activePresets.find((p) => p.id === presetId);
    if (found) {
      setCustomTitle(found.id.includes('custom') ? '' : found.title.replace(' (포상)', '').replace(' (징계/감점)', ''));
      setCustomPoints(Math.abs(found.points));
    }
    setCustomReason('');
  };

  // 신규 등록 시 시말서 파일 선택 핸들러
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setAttachedApologyDoc({
        hasDoc: true,
        fileName: file.name,
        fileSize: `${(file.size / 1024).toFixed(0)} KB`,
        fileType: file.type,
        dataUrl: uploadEvent.target?.result,
        drivePath: `/오수처리장_인사고과/시말서/2026/${file.name}`,
        uploadedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      });
    };
    reader.readAsDataURL(file);
  };

  // 기존 내역에 추후 시말서 파일 첨부 핸들러
  const handleAppendFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file || !targetAppendItemId) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const doc = {
        hasDoc: true,
        fileName: file.name,
        fileSize: `${(file.size / 1024).toFixed(0)} KB`,
        fileType: file.type,
        dataUrl: uploadEvent.target?.result,
        drivePath: `/오수처리장_인사고과/시말서/2026/${file.name}`,
        uploadedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      };
      if (onUpdateApologyDoc) {
        onUpdateApologyDoc(targetAppendItemId, doc);
      }
      setTargetAppendItemId(null);
    };
    reader.readAsDataURL(file);
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    onAddRewardPenalty({
      category: rpTab,
      title: customTitle || (rpTab === 'reward' ? '관리자 포상' : '관리자 감점'),
      points: rpTab === 'reward' ? Math.abs(Number(customPoints) || 2) : -Math.abs(Number(customPoints) || 2),
      reason: customReason ? customReason.trim() : '-',
      apologyDoc: rpTab === 'penalty' ? attachedApologyDoc : null,
    });
    // 사유 입력창 및 첨부파일 즉시 비우기
    setCustomReason('');
    setAttachedApologyDoc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (selectedPresetId.includes('custom')) {
      setCustomTitle('');
    }
  };

  const handleTriggerAppendApology = (itemId) => {
    setTargetAppendItemId(itemId);
    appendFileInputRef.current?.click();
  };

  return (
    <section style={styles.card}>
      <div style={styles.sectionTitleRow}>
        <span style={styles.sectionTitle}>🎖️ 관리자 상벌점 (포상 · 징계)</span>
        <span style={styles.rpSumText}>
          합계:{' '}
          <strong style={{ color: netRewardPenalty >= 0 ? '#2563eb' : '#dc2626' }}>
            {netRewardPenalty > 0 ? `+${netRewardPenalty}` : netRewardPenalty}점
          </strong>
        </span>
      </div>

      {/* [+ 상점 부여] / [- 벌점 부여] 탭 */}
      <div style={styles.rpTabRow}>
        <button
          type="button"
          onClick={() => handleTabSwitch('reward')}
          style={{
            ...styles.rpTabBtn,
            ...(rpTab === 'reward' ? styles.rpTabRewardActive : {}),
          }}
        >
          + 상점 부여 (포상)
        </button>
        <button
          type="button"
          onClick={() => handleTabSwitch('penalty')}
          style={{
            ...styles.rpTabBtn,
            ...(rpTab === 'penalty' ? styles.rpTabPenaltyActive : {}),
          }}
        >
          - 벌점 부여 (징계)
        </button>
      </div>

      {/* 상벌점 입력 폼 */}
      <form onSubmit={handleAddSubmit} style={styles.rpForm}>
        <div style={styles.rpRow}>
          <select
            value={selectedPresetId}
            onChange={(e) => handlePresetChange(e.target.value)}
            style={styles.rpSelect}
          >
            {activePresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.points > 0 ? `+${p.points}` : p.points}점)
              </option>
            ))}
          </select>

          <div style={styles.pointsInputWrap}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: rpTab === 'reward' ? '#2563eb' : '#dc2626' }}>
              {rpTab === 'reward' ? '+' : '-'}
            </span>
            <input
              type="number"
              min={1}
              max={15}
              value={customPoints}
              onChange={(e) => setCustomPoints(Math.max(1, Math.min(15, Number(e.target.value) || 1)))}
              style={styles.pointsInput}
            />
            <span style={{ fontSize: '11px', color: '#475569' }}>점</span>
          </div>
        </div>

        {selectedPresetId.includes('custom') && (
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder="포상/징계 항목명 직접 입력..."
            style={styles.rpInput}
          />
        )}

        <div style={styles.rpActionRow}>
          <input
            type="text"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="상세 부여 사유 입력..."
            style={{ ...styles.rpInput, flex: 1 }}
          />
          <button
            type="submit"
            style={{
              ...styles.rpAddBtn,
              backgroundColor: rpTab === 'reward' ? '#2563eb' : '#dc2626',
            }}
          >
            추가
          </button>
        </div>

        {/* 벌점일 때 시말서 스캔본 첨부 버튼 */}
        {rpTab === 'penalty' && (
          <div style={styles.apologyAttachRow}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={styles.attachBtn}
            >
              📎 시말서 스캔본 첨부 (Drive 저장)
            </button>
            {attachedApologyDoc && (
              <span style={styles.attachedBadge}>
                📄 {attachedApologyDoc.fileName}
                <button
                  type="button"
                  onClick={() => setAttachedApologyDoc(null)}
                  style={styles.removeAttachBtn}
                >
                  ✕
                </button>
              </span>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,application/pdf"
              style={{ display: 'none' }}
            />
          </div>
        )}
      </form>

      {/* 숨김 추후첨부 파일 인풋 */}
      <input
        type="file"
        ref={appendFileInputRef}
        onChange={handleAppendFileSelect}
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
      />

      {/* 부여된 상벌점 내역 리스트 */}
      <HrSidebarRewardPenaltyList
        rewardPenaltyList={rewardPenaltyList}
        onRemoveRewardPenalty={onRemoveRewardPenalty}
        onViewApology={onViewApology}
        onTriggerAppendApology={handleTriggerAppendApology}
        styles={styles}
      />
    </section>
  );
}
