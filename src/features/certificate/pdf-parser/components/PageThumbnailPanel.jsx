import React from 'react';

export function PageThumbnailPanel({ pages, currentPageIndex, onPageClick, startFromFirstPage }) {
  const displayPages = startFromFirstPage ? pages : pages.slice(1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%', overflowY: 'auto', paddingRight: 8 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 4 }}>페이지 목록</h3>
      {displayPages.map((page, idx) => {
        const actualIndex = startFromFirstPage ? idx : idx + 1;
        const isCurrent = actualIndex === currentPageIndex;
        const isMatched = page.status === 'matched';

        return (
          <div
            key={actualIndex}
            onClick={() => onPageClick(actualIndex)}
            style={{
              border: `2px solid ${isCurrent ? '#2563eb' : isMatched ? '#22c55e' : '#e5e7eb'}`,
              borderRadius: 8,
              padding: 8,
              cursor: 'pointer',
              backgroundColor: isCurrent ? '#f0f7ff' : isMatched ? '#f0fdf4' : 'white',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ width: 48, height: 64, backgroundColor: '#f3f4f6', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {page.thumbnail ? (
                <img
                  src={page.thumbnail}
                  alt={`페이지 ${actualIndex + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: 12, color: '#888' }}>{actualIndex + 1}</span>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#333' }}>페이지 {actualIndex + 1}</div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                {isMatched ? `✓ ${page.matchedSite}` : '매칭 대기'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
