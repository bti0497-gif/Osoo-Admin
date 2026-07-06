import React from 'react';

export function DateSelector({ extractedDates, selectedDate, onSelect }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#666' }}>
        날짜 선택 (파일명에서 추출)
      </label>
      {extractedDates.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888' }}>파일명에서 날짜를 찾을 수 없습니다</div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          {extractedDates.map((date, idx) => (
            <button
              key={date}
              onClick={() => onSelect(date)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                border: `1px solid ${selectedDate === date ? '#2563eb' : '#ccc'}`,
                backgroundColor: selectedDate === date ? '#f0f7ff' : '#fff',
                color: '#333',
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              {date}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
