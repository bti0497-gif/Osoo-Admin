import React from 'react';
import { Crop, Calendar, List, CheckSquare, MapPin, CloudUpload, Loader2 } from 'lucide-react';

const fieldIcons = {
  date: Calendar,
  items: List,
  results: CheckSquare,
  location: MapPin,
};

/**
 * ROI 필드 선택 툴바
 */
export function RoiToolbar({
  fieldLabels,
  fieldBorderColors,
  globalBoxes,
  activeField,
  onFieldToggle,
  onProcess,
  processing,
  batchActive,
  hasTemplate,
  uploadStatus,
  styles,
}) {
  return (
    <div style={styles.toolbar}>
      <div>
        <div style={styles.toolbarLabel}>
          <Crop size={14} /> 분석 영역 지정:
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {Object.keys(fieldLabels).map((field) => {
            const isActive = activeField === field;
            const hasBox = !!globalBoxes[field];
            const Icon = fieldIcons[field] || Crop;
            
            return (
              <button 
                key={field} 
                onClick={() => onFieldToggle(field)}
                style={isActive ? styles.fieldBtnActive : styles.fieldBtnInactive}
              >
                <Icon size={14} color={isActive ? '#2563eb' : '#94a3b8'} />
                {fieldLabels[field]}
                {hasBox && (
                  <span style={{ 
                    width: '8px', 
                    height: '8px', 
                    borderRadius: '50%', 
                    background: fieldBorderColors[field], 
                    display: 'inline-block',
                    marginLeft: '4px',
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
      
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button 
          onClick={onProcess} 
          disabled={processing || batchActive || !hasTemplate} 
          style={(processing || batchActive || !hasTemplate) ? styles.btnPrimaryDisabled : styles.btnPrimary}
        >
          {batchActive ? (
            <>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              처리 중...
            </>
          ) : (
            <>
              <CloudUpload size={16} />
              전체 파싱 후 전송
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default RoiToolbar;
