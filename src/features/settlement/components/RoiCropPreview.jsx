import React, { useEffect, useRef } from 'react';

/**
 * 지정된 ROI 사각형 [X, Y, W, H]을 원본에서 잘라내어
 * 강제 확대/변형 없이 그대로(Natural Scale, object-fit: contain) 표출한다.
 */
export function RoiCropPreview({ src, config, kind }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!src || !canvasRef.current) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const isSupplier = kind === 'supplier';
      let pctX = Number(config[`${kind}X`] ?? 2) / 100;
      let pctY = Number(config[`${kind}Y`] ?? (isSupplier ? 3 : 53)) / 100;
      let pctW = Number(config[`${kind}W`] ?? 96) / 100;
      let pctH = Number(config[`${kind}H`] ?? (isSupplier ? 26 : 24)) / 100;

      // 만약 FocusY만 있는 경우 Y 보정
      if (config[`${kind}FocusY`] !== undefined && config[`${kind}Y`] === undefined) {
        const centerY = Number(config[`${kind}FocusY`]) / 100;
        pctY = Math.max(0, centerY - pctH / 2);
      }

      const cropX = Math.round(img.naturalWidth * pctX);
      const cropY = Math.round(img.naturalHeight * pctY);
      const cropW = Math.round(img.naturalWidth * pctW);
      const cropH = Math.round(img.naturalHeight * pctH);

      canvas.width = Math.max(1, cropW);
      canvas.height = Math.max(1, cropH);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    };
    img.src = src;
  }, [src, config, kind]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '2px', boxSizing: 'border-box' }}>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          borderRadius: '4px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }}
      />
    </div>
  );
}
