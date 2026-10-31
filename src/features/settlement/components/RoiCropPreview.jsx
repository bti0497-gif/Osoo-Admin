import React, { useState, useEffect, useRef, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';

/**
 * RoiCropPreview.jsx
 * =====================================================================
 * 계산서 ROI 확대 미리보기 컴포넌트
 * - 기본 동작: 지정된 ROI 영역을 컨테이너 중앙에 맞춰 고화질로 확대 표출
 * - 인터랙티브 팬(Pan) 기능:
 *   스캔이 삐뚤어지거나 경계가 살짝 안 맞는 경우, 마우스 드래그로 이미지를 자유롭게
 *   이동시켜 잘려 보이지 않던 주변 영역(상호명·품목명·비고 등)을 즉시 확인 가능
 * - 마우스 휠: 확대/축소 (0.6x ~ 3.5x)
 * - 더블클릭 또는 [원래 위치] 버튼: 기본 ROI 포커스 위치로 즉시 복귀
 * - 다음 계산서(페이지 전환) 이동 시: 임의 이동값은 자동 초기화되어 다음 계산서도
 *   원래 지정된 표준 ROI 위치로 정확하게 첫 화면을 보여줌 (저장된 ROI 설정 불변)
 */
export function RoiCropPreview({ src, config = {}, kind = 'supplier' }) {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [imgNaturalSize, setImgNaturalSize] = useState({ width: 0, height: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  // 1. 컨테이너 실시간 크기 측정 (ResizeObserver)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });

    ro.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setContainerSize({ width: rect.width, height: rect.height });
    }

    return () => ro.disconnect();
  }, []);

  // 2. 이미지 원본 크기 측정
  useEffect(() => {
    if (!src) {
      setImgNaturalSize({ width: 0, height: 0 });
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgNaturalSize({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    };
    img.src = src;
  }, [src]);

  // 3. 페이지가 변경되거나 kind가 바뀔 때 팬/줌을 원래 ROI 위치로 자동 초기화
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [src, kind]);

  // 4. 마우스 드래그 이벤트 (컨테이너 밖으로 나가도 매끄럽게 추적)
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPan({
        x: panStartRef.current.x + dx,
        y: panStartRef.current.y + dy,
      });
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // 5. 마우스 휠 확대/축소
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoom((prev) => Math.min(3.5, Math.max(0.6, prev * factor)));
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // 좌클릭 드래그만 지원
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    setIsDragging(true);
  };

  const handleDoubleClick = () => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleReset = (e) => {
    e.stopPropagation();
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  // 6. ROI 포커스 위치 및 이미지 렌더링 스타일 계산
  const { renderedStyle, hasMoved } = useMemo(() => {
    const isSupplier = kind === 'supplier';
    const pctX = Number(config[`${kind}X`] ?? 2) / 100;
    let pctY = Number(config[`${kind}Y`] ?? (isSupplier ? 3 : 53)) / 100;
    const pctW = Number(config[`${kind}W`] ?? 96) / 100;
    const pctH = Number(config[`${kind}H`] ?? (isSupplier ? 26 : 24)) / 100;

    if (config[`${kind}FocusY`] !== undefined && config[`${kind}Y`] === undefined) {
      const centerY = Number(config[`${kind}FocusY`]) / 100;
      pctY = Math.max(0, centerY - pctH / 2);
    }

    if (!containerSize.width || !containerSize.height || !imgNaturalSize.width || !imgNaturalSize.height) {
      return { renderedStyle: { display: 'none' }, hasMoved: false };
    }

    const roiW = Math.max(1, pctW * imgNaturalSize.width);
    const roiH = Math.max(1, pctH * imgNaturalSize.height);

    // ROI 영역이 컨테이너에 딱 맞도록 기준 스케일 산출
    const baseScale = Math.min(
      containerSize.width / roiW,
      containerSize.height / roiH
    );
    const currentScale = baseScale * zoom;

    const renderedImgW = imgNaturalSize.width * currentScale;
    const renderedImgH = imgNaturalSize.height * currentScale;

    const roiRenderedX = pctX * renderedImgW;
    const roiRenderedY = pctY * renderedImgH;
    const roiRenderedW = pctW * renderedImgW;
    const roiRenderedH = pctH * renderedImgH;

    // ROI 영역이 컨테이너의 정중앙에 오도록 기본 Left/Top 좌표 계산
    const baseLeft = (containerSize.width - roiRenderedW) / 2 - roiRenderedX;
    const baseTop = (containerSize.height - roiRenderedH) / 2 - roiRenderedY;

    const left = baseLeft + pan.x;
    const top = baseTop + pan.y;

    const moved = Math.abs(pan.x) > 1 || Math.abs(pan.y) > 1 || Math.abs(zoom - 1) > 0.02;

    return {
      renderedStyle: {
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        width: `${renderedImgW}px`,
        height: `${renderedImgH}px`,
        maxWidth: 'none',
        maxHeight: 'none',
        userSelect: 'none',
        pointerEvents: 'none',
        imageRendering: 'auto',
      },
      hasMoved: moved,
    };
  }, [config, kind, containerSize, imgNaturalSize, pan, zoom]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      title="마우스로 드래그하여 주변 영역 확인 (더블클릭: 원래 위치, 휠: 확대/축소)"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        background: '#f8fafc',
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
    >
      {src && (
        <img
          src={src}
          alt={kind === 'supplier' ? '상호명 미리보기' : '품목명 미리보기'}
          style={renderedStyle}
          draggable={false}
        />
      )}

      {/* 살짝 움직였을 때 원클릭으로 원래 ROI 위치로 복귀할 수 있는 리셋 버튼 */}
      {hasMoved && (
        <button
          type="button"
          onClick={handleReset}
          style={{
            position: 'absolute',
            bottom: '6px',
            right: '6px',
            zIndex: 15,
            background: 'rgba(15, 23, 42, 0.78)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            padding: '3px 8px',
            fontSize: '10px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.25)',
            backdropFilter: 'blur(2px)',
          }}
          title="원래 ROI 위치로 복귀 (더블클릭 시에도 복귀됩니다)"
        >
          <RotateCcw size={11} />
          <span>원래 위치</span>
        </button>
      )}

      {/* 우측 상단 드래그 힌트 안내 텍스트 (움직이지 않았을 때 작게 표시) */}
      {!hasMoved && (
        <span
          style={{
            position: 'absolute',
            bottom: '4px',
            right: '6px',
            zIndex: 10,
            color: '#94a3b8',
            fontSize: '9px',
            fontWeight: 600,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          ↔ 드래그 이동
        </span>
      )}
    </div>
  );
}

export default RoiCropPreview;
