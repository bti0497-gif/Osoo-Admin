import React, { useState } from 'react';
import { X, Save, RotateCcw, Check, Move, Building2, Package } from 'lucide-react';
import { DEFAULT_ROI_CONFIG } from '../utils/settlementRoiConfig.js';
import { RoiCropPreview } from './RoiCropPreview.jsx';

export default function RoiCalibrationModal({
  isOpen,
  onClose,
  activePage,
  currentConfig,
  profile = 'purchase',
  onProfileChange,
  onChange,
  onSave,
}) {
  const [config, setConfig] = useState(() => currentConfig || { ...DEFAULT_ROI_CONFIG });
  const [activeMode, setActiveMode] = useState('supplier'); // 'supplier' | 'item'
  const [savedSuccessToast, setSavedSuccessToast] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [dragStart, setDragStart] = useState(null);
  const [dragRect, setDragRect] = useState(null);

  if (!isOpen) return null;

  const updateConfig = (updater) => {
    const next = typeof updater === 'function' ? updater(config) : updater;
    setConfig(next);
    onChange?.(next);
  };

  const pointAt = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)), y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)) };
  };
  const handlePointerDown = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); const start = pointAt(e); setDragStart(start); setDragRect({ left: start.x, top: start.y, width: 0, height: 0 }); };
  const handlePointerMove = (e) => { if (!dragStart) return; const point = pointAt(e); setDragRect({ left: Math.min(dragStart.x, point.x), top: Math.min(dragStart.y, point.y), width: Math.abs(point.x - dragStart.x), height: Math.abs(point.y - dragStart.y) }); };
  const handlePointerUp = (e) => {
    if (!dragStart) return;
    const point = pointAt(e);
    const top = Math.round(Math.min(dragStart.y, point.y));
    const height = Math.round(Math.abs(point.y - dragStart.y));
    const left = Math.round(Math.min(dragStart.x, point.x));
    const width = Math.round(Math.abs(point.x - dragStart.x));

    const isSalesSupplier = activeMode === 'supplier' && profile === 'sales';
    const yKey = isSalesSupplier ? 'salesSupplierY' : `${activeMode}Y`;
    const hKey = isSalesSupplier ? 'salesSupplierH' : `${activeMode}H`;
    const xKey = isSalesSupplier ? 'salesSupplierX' : `${activeMode}X`;
    const wKey = isSalesSupplier ? 'salesSupplierW' : `${activeMode}W`;
    const focusXKey = isSalesSupplier ? 'salesSupplierFocusX' : `${activeMode}FocusX`;
    const focusYKey = isSalesSupplier ? 'salesSupplierFocusY' : `${activeMode}FocusY`;

    updateConfig(prev => ({
      ...prev,
      [focusXKey]: Math.round((dragStart.x + point.x) / 2),
      [focusYKey]: Math.round((dragStart.y + point.y) / 2),
      [yKey]: top,
      [hKey]: height > 3 ? height : prev[hKey] || (activeMode === 'supplier' ? 26 : 24),
      [xKey]: width > 3 ? left : prev[xKey] || 2,
      [wKey]: width > 3 ? width : prev[wKey] || 96,
    }));
    setDragStart(null);
    setDragRect(null);
  };

  const handleSave = async () => {
    setSaveError('');
    try {
      await onSave?.(config);
      setSavedSuccessToast(true);
      setTimeout(() => { setSavedSuccessToast(false); onClose(); }, 1200);
    } catch (err) {
      setSaveError(err.message || 'ROI 설정을 저장하지 못했습니다.');
    }
  };

  const handleReset = () => {
    updateConfig({ ...DEFAULT_ROI_CONFIG });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(4px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '16px',
        width: '940px',
        maxWidth: '95vw',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        overflow: 'hidden',
        border: '1px solid #cbd5e1'
      }}>
        {/* 모달 헤더 */}
        <div style={{
          padding: '16px 20px',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🛠️ 계산서 상호명 / 품목명 영역(ROI) 영구 지정 도구</span>
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
              문서 이미지에서 드래그하여 영역을 사각형으로 지정하거나 아래 슬라이더로 높이와 위치를 자유롭게 넓혀보세요.
            </p>
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button onClick={() => onProfileChange?.('purchase')} style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #2563eb', background: profile === 'purchase' ? '#2563eb' : '#fff', color: profile === 'purchase' ? '#fff' : '#2563eb', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>일반계산서(매입) ROI</button>
              <button onClick={() => onProfileChange?.('sales')} style={{ padding: '4px 8px', borderRadius: '5px', border: '1px solid #059669', background: profile === 'sales' ? '#059669' : '#fff', color: profile === 'sales' ? '#fff' : '#059669', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}>매출계산서 ROI</button>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b', padding: '4px' }}
          >
            <X size={22} />
          </button>
        </div>

        {/* 성공 저장 토스트 알림 */}
        {savedSuccessToast && (
          <div style={{
            background: '#16a34a', color: '#ffffff', padding: '10px 16px', fontSize: '13px', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}>
            <Check size={18} />
            <span>ROI 영구 영역 설정이 브라우저 메모리에 성공적으로 저장되었습니다!</span>
          </div>
        )}

        {/* 모달 바디: 좌측 (전체 계산서 + ROI 영역 오버레이) + 우측 (실시간 줌 크롭 결과 & 제어반) */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
          
          {/* 1. 좌측: 전체 계산서 이미지 & 클리커 오버레이 (500px) */}
          <div style={{
            width: '460px',
            padding: '16px',
            borderRight: '1px solid #e2e8f0',
            background: '#f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            {/* 위치 클릭 모드 버튼 */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setActiveMode('supplier')}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', border: '1.5px solid #2563eb',
                  background: activeMode === 'supplier' ? '#2563eb' : '#ffffff',
                  color: activeMode === 'supplier' ? '#ffffff' : '#2563eb',
                  fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Building2 size={15} />
                <span>🏢 상호명 영역 드래그 지정</span>
              </button>

              <button
                onClick={() => setActiveMode('item')}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', border: '1.5px solid #059669',
                  background: activeMode === 'item' ? '#059669' : '#ffffff',
                  color: activeMode === 'item' ? '#ffffff' : '#059669',
                  fontSize: '12px', fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Package size={15} />
                <span>📦 품목명 영역 드래그 지정</span>
              </button>
            </div>

            {/* 계산서 전체 문서 이미지 & 클릭 인터랙션 컨테이너 */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
              {activePage?.preview ? (
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={() => { setDragStart(null); setDragRect(null); }}
                  style={{
                    position: 'relative',
                    width: '100%',
                    maxHeight: '100%',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                    cursor: 'crosshair',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1'
                  }}
                  title="드래그하여 크롭할 영역 사각형을 지정하세요."
                >
                  <img
                    src={activePage.preview}
                    alt="전체 계산서"
                    style={{ width: '100%', display: 'block', pointerEvents: 'none' }}
                  />
                  {dragRect && <div style={{ position: 'absolute', left: `${dragRect.left}%`, top: `${dragRect.top}%`, width: `${dragRect.width}%`, height: `${dragRect.height}%`, border: activeMode === 'supplier' ? '2px solid #2563eb' : '2px solid #059669', background: activeMode === 'supplier' ? 'rgba(37,99,235,0.15)' : 'rgba(5,150,105,0.15)', pointerEvents: 'none' }} />}

                  {/* 🏢 상호명 영역 오버레이 사각형 (파란색) */}
                  <div style={{
                    position: 'absolute',
                    top: `${(profile === 'sales' ? config.salesSupplierY : config.supplierY) ?? (profile === 'sales' ? 10 : 3)}%`,
                    left: `${(profile === 'sales' ? config.salesSupplierX : config.supplierX) ?? 2}%`,
                    width: `${(profile === 'sales' ? config.salesSupplierW : config.supplierW) ?? 96}%`,
                    height: `${(profile === 'sales' ? config.salesSupplierH : config.supplierH) ?? 26}%`,
                    border: '2px solid #2563eb', borderRadius: '4px', background: 'rgba(37, 99, 235, 0.12)',
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '2px 4px'
                  }}>
                    <span style={{ background: '#2563eb', color: '#ffffff', fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px' }}>
                      🏢 상호명 영역 ({profile === 'sales' ? '매출계산서' : '일반계산서'})
                    </span>
                  </div>

                  {/* 📦 품목명 영역 오버레이 사각형 (초록색) */}
                  <div style={{
                    position: 'absolute',
                    top: `${config.itemY ?? 53}%`, left: `${config.itemX ?? 2}%`, width: `${config.itemW ?? 96}%`, height: `${config.itemH ?? 24}%`,
                    border: '2px solid #059669', borderRadius: '4px', background: 'rgba(5, 150, 105, 0.12)',
                    boxSizing: 'border-box',
                    pointerEvents: 'none',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '2px 4px'
                  }}>
                    <span style={{ background: '#059669', color: '#ffffff', fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '3px' }}>
                      📦 품목명 영역
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '40px', color: '#64748b', fontSize: '13px', textAlign: 'center' }}>
                  미리보기용 계산서 페이지 데이터가 없습니다.
                </div>
              )}
            </div>

            <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
              💡 마우스로 드래그하면 해당 영역이 사각형으로 잘라집니다.
            </div>
          </div>

          {/* 2. 우측: 슬라이더 컨트롤 & 실시간 크롭 미리보기 패널 */}
          <div style={{
            flex: 1,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            overflowY: 'auto',
            background: '#ffffff'
          }}>

            {/* 슬라이더 컨트롤 조절 패널 */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Move size={15} className="text-blue-600" />
                <span>영역 정밀 조절 컨트롤</span>
              </div>

              {/* 상호명 컨트롤 */}
              <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 800, color: '#1d4ed8', marginBottom: '4px' }}>
                  <span>🏢 상호명 영역 ({profile === 'sales' ? '매출계산서 전용' : '일반계산서/매입 전용'}) (시작: {(profile === 'sales' ? config.salesSupplierY : config.supplierY) ?? (profile === 'sales' ? 10 : 3)}% / 세로높이: {(profile === 'sales' ? config.salesSupplierH : config.supplierH) ?? 26}%)</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#475569', width: '50px' }}>시작 Y:</span>
                  <input
                    type="range" min="0" max="40" step="1"
                    value={(profile === 'sales' ? config.salesSupplierY : config.supplierY) ?? (profile === 'sales' ? 10 : 3)}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      const key = profile === 'sales' ? 'salesSupplierY' : 'supplierY';
                      updateConfig(prev => ({ ...prev, [key]: val }));
                    }}
                    style={{ flex: 1, accentColor: '#2563eb' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#475569', width: '50px' }}>높이 H:</span>
                  <input
                    type="range" min="10" max="50" step="1"
                    value={(profile === 'sales' ? config.salesSupplierH : config.supplierH) ?? 26}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      const key = profile === 'sales' ? 'salesSupplierH' : 'supplierH';
                      updateConfig(prev => ({ ...prev, [key]: val }));
                    }}
                    style={{ flex: 1, accentColor: '#2563eb' }}
                  />
                </div>
              </div>

              {/* 품목명 컨트롤 */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 800, color: '#15803d', marginBottom: '4px' }}>
                  <span>📦 품목명 영역 (시작: {config.itemY ?? 53}% / 세로높이: {config.itemH ?? 24}%)</span>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: '#475569', width: '50px' }}>시작 Y:</span>
                  <input
                    type="range" min="30" max="80" step="1"
                    value={config.itemY ?? 53}
                    onChange={(e) => updateConfig(prev => ({ ...prev, itemY: parseInt(e.target.value, 10) }))}
                    style={{ flex: 1, accentColor: '#059669' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: '#475569', width: '50px' }}>높이 H:</span>
                  <input
                    type="range" min="10" max="60" step="1"
                    value={config.itemH ?? 24}
                    onChange={(e) => updateConfig(prev => ({ ...prev, itemH: parseInt(e.target.value, 10) }))}
                    style={{ flex: 1, accentColor: '#059669' }}
                  />
                </div>
              </div>
            </div>

            {/* 실시간 줌 크롭 결과 뷰포트 미리보기 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
                🔍 실시간 크롭 미리보기 결과 ({profile === 'sales' ? '매출계산서' : '일반계산서/매입'})
              </div>

              {activePage?.preview && (
                <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', height: '140px' }}>
                  {/* 상호명 크롭 */}
                  <div style={{ flex: 1, position: 'relative', height: '100%', borderRadius: '8px', border: '1.5px solid #3b82f6', overflow: 'hidden', background: '#ffffff' }}>
                    <div style={{ position: 'absolute', top: '4px', left: '6px', zIndex: 10, background: 'rgba(37, 99, 235, 0.85)', color: '#ffffff', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
                      🏢 상호명 ({profile === 'sales' ? '매출' : '매입'})
                    </div>
                    <RoiCropPreview
                      src={activePage.preview}
                      config={profile === 'sales' ? {
                        ...config,
                        supplierY: config.salesSupplierY ?? 10,
                        supplierH: config.salesSupplierH ?? 26,
                        supplierX: config.salesSupplierX ?? 2,
                        supplierW: config.salesSupplierW ?? 96
                      } : config}
                      kind="supplier"
                    />
                  </div>

                  {/* 품목명 크롭 */}
                  <div style={{ flex: 1, position: 'relative', height: '100%', borderRadius: '8px', border: '1.5px solid #059669', overflow: 'hidden', background: '#ffffff' }}>
                    <div style={{ position: 'absolute', top: '4px', left: '6px', zIndex: 10, background: 'rgba(5, 150, 105, 0.85)', color: '#ffffff', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '3px' }}>
                      📦 품목명
                    </div>
                    <RoiCropPreview src={activePage.preview} config={config} kind="item" />
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {saveError && <div role="alert" style={{ padding: '9px 20px', background: '#fef2f2', color: '#b91c1c', fontSize: '12px', fontWeight: 700 }}>{saveError}</div>}

        {/* 모달 하단 푸터 (저장 / 초기화) */}
        <div style={{
          padding: '12px 20px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={handleReset}
            style={{
              padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
              background: '#ffffff', color: '#475569', fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <RotateCcw size={14} />
            <span>기본값 초기화</span>
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1',
                background: '#ffffff', color: '#475569', fontSize: '12px', fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              취소
            </button>

            <button
              onClick={handleSave}
              style={{
                padding: '8px 20px', borderRadius: '8px', border: 'none',
                background: '#2563eb', color: '#ffffff', fontSize: '13px', fontWeight: 800,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                boxShadow: '0 2px 4px rgba(37,99,235,0.3)'
              }}
            >
              <Save size={16} />
              <span>영구 영역 설정 저장</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function RoiDimensions({ config, updateConfig, kind, color }) {
  const fields = [['FocusX', '좌우 초점']];
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' }}>
    {fields.map(([suffix, label]) => {
      const key = `${kind}${suffix}`;
      return <label key={key} style={{ fontSize: '10px', color: '#475569', fontWeight: 700 }}>
        {label} {config[key]}%
        <input type="range" min="0" max="99" value={config[key]} onChange={(e) => updateConfig(prev => ({ ...prev, [key]: Number(e.target.value) }))} style={{ width: '100%', accentColor: color }} />
      </label>;
    })}
  </div>;
}
