import React, { useMemo } from 'react';

const thStyle = {
  padding: '12px 14px',
  whiteSpace: 'nowrap',
  border: '1px solid #cbd5e1',
};

const tdStyle = {
  padding: '12px 14px',
  verticalAlign: 'middle',
  border: '1px solid #cbd5e1',
};

const actionBtnStyle = (bg) => ({
  padding: '4px 10px',
  borderRadius: '6px',
  fontSize: '11px',
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  background: bg,
  color: '#fff',
  transition: 'background 0.15s',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
});

export function TemplateManagerTable({
  templates,
  uploadingSiteId,
  dragOverSiteId,
  onOpenTemplate,
  onOpenFileDialog,
  onDragOver,
  onDragLeave,
  onDrop,
  onRefresh,
}) {
  const templateRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < templates.length; i++) {
      const cur = templates[i];
      const prev = templates[i - 1];
      const isSameAsPrev = prev && prev.name === cur.name;

      if (isSameAsPrev) {
        rows.push({ ...cur, rowSpan: 0 });
      } else {
        let span = 1;
        for (let j = i + 1; j < templates.length; j++) {
          if (templates[j].name === cur.name) span++;
          else break;
        }
        rows.push({ ...cur, rowSpan: span });
      }
    }
    return rows;
  }, [templates]);

  return (
    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#1e293b' }}>
          📁 현장별 기본 빈 양식 등록 목록
        </h3>
        <button
          onClick={onRefresh}
          style={{ height: '32px', padding: '0 14px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, border: '1px solid #cbd5e1', background: '#f1f5f9', color: '#334155', cursor: 'pointer' }}
        >
          🔄 새로고침
        </button>
      </div>

      <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', color: '#475569', fontWeight: 700, borderBottom: '1px solid #cbd5e1' }}>
              <th style={{ ...thStyle, width: '220px', minWidth: '200px' }}>현장 구분</th>
              <th style={{ ...thStyle, width: '90px', textAlign: 'center' }}>포맷</th>
              <th style={thStyle}>현재 등록된 빈 양식 파일</th>
              <th style={{ ...thStyle, textAlign: 'center', width: '280px' }}>양식 관리 작업</th>
            </tr>
          </thead>
          <tbody>
            {templateRows.map((tpl, idx) => {
              const isUploading = uploadingSiteId === tpl.id;
              const isDragOver = dragOverSiteId === tpl.id;
              const hasSub = Boolean(tpl.subTemplate);

              return (
                <tr
                  key={tpl.id}
                  onDragOver={(e) => onDragOver(e, tpl.id)}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => onDrop(e, tpl.id, false)}
                  style={{
                    background: isDragOver ? '#e0f2fe' : (idx % 2 === 0 ? '#ffffff' : '#fafafa'),
                    transition: 'background 0.15s ease',
                  }}
                >
                  {tpl.rowSpan > 0 && (
                    <td
                      rowSpan={tpl.rowSpan}
                      style={{
                        ...tdStyle,
                        fontWeight: 700,
                        color: '#0f172a',
                        whiteSpace: 'nowrap',
                        background: '#ffffff',
                        verticalAlign: 'middle',
                      }}
                    >
                      {tpl.name}
                    </td>
                  )}

                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                      background: tpl.type === 'hwp_excel' ? '#fee2e2' : '#e0f2fe',
                      color: tpl.type === 'hwp_excel' ? '#b91c1c' : '#0369a1',
                    }}>
                      {tpl.format ? tpl.format.toUpperCase() : 'DOC'}
                    </span>
                  </td>

                  {/* 등록 파일명 목록 (메인 + 서브) */}
                  <td style={{ ...tdStyle, color: '#334155', fontFamily: 'monospace' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {/* 메인 템플릿 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                          {hasSub ? '📄 한글:' : '📄'}
                        </span>
                        {tpl.exists ? (
                          <span
                            onClick={() => onOpenTemplate(tpl.template)}
                            style={{ color: '#2563eb', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                            title="클릭하여 파일 열기"
                          >
                            {tpl.template}
                          </span>
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠️ 미등록</span>
                        )}
                      </div>

                      {/* 서브 템플릿 (있을 경우) */}
                      {hasSub && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>
                            📊 엑셀:
                          </span>
                          {tpl.subExists ? (
                            <span
                              onClick={() => onOpenTemplate(tpl.subTemplate)}
                              style={{ color: '#059669', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                              title="클릭하여 서브 엑셀 파일 열기"
                            >
                              {tpl.subTemplate}
                            </span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>⚠️ 미등록 (서브 엑셀)</span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* 작업 버튼들 (메인 + 서브 각각 지원) */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    {isUploading ? (
                      <span style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>
                        ⏳ 파일 교체 업로드 중...
                      </span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                        {/* 메인 템플릿 작업 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {tpl.exists && (
                            <button
                              type="button"
                              onClick={() => onOpenTemplate(tpl.template)}
                              style={actionBtnStyle('#0284c7')}
                              title="기본 양식 파일을 직접 열어 편집합니다"
                            >
                              📂 {hasSub ? '한글 열기' : '양식 열기'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenFileDialog(tpl.id, false)}
                            style={actionBtnStyle('#4f46e5')}
                            title="새 양식 파일로 교체합니다"
                          >
                            🔄 {hasSub ? '한글 교체' : '양식 교체'}
                          </button>
                        </div>

                        {/* 서브 템플릿 작업 (있을 경우) */}
                        {hasSub && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {tpl.subExists && (
                              <button
                                type="button"
                                onClick={() => onOpenTemplate(tpl.subTemplate)}
                                style={actionBtnStyle('#059669')}
                                title="서브 엑셀 양식 파일을 직접 열어 편집합니다"
                              >
                                📂 엑셀 열기
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onOpenFileDialog(tpl.id, true)}
                              style={actionBtnStyle('#0d9488')}
                              title="새 서브 엑셀 파일로 교체합니다"
                            >
                              🔄 엑셀 교체
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
