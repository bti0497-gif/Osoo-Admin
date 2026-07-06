import React, { useState, useMemo, useRef, useEffect } from 'react';

/**
 * SiteDropdownPanel - 실시간 자동완성 검색 기능이 탑재된 고급 현장 선택 컴포넌트
 */
export function SiteDropdownPanel({
  availableSites,
  usedSites,
  siteMaster,
  currentSelection,
  onSelect,
  onCancelMatch,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // 현재 선택된 현장 정보 구하기
  const selectedSite = useMemo(() => {
    return siteMaster.find(s => s.id === currentSelection);
  }, [currentSelection, siteMaster]);

  // 검색어를 반영한 남은 현장 필터링
  const filteredAvailableList = useMemo(() => {
    const list = siteMaster.filter(s => availableSites.has(s.id));
    if (!searchTerm) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(s => s.site_name.toLowerCase().includes(term));
  }, [searchTerm, availableSites, siteMaster]);

  // 검색어를 반영한 매칭된(빠진) 현장 필터링
  const filteredUsedList = useMemo(() => {
    const list = siteMaster.filter(s => usedSites.has(s.id));
    if (!searchTerm) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(s => s.site_name.toLowerCase().includes(term));
  }, [searchTerm, usedSites, siteMaster]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 선택 핸들러
  const handleSelect = (siteId) => {
    onSelect(siteId);
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', width: '100%' }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 2px 0' }}>현장 선택</h3>

      <div style={{ position: 'relative', width: '100%' }}>
        {/* 선택 트리거 영역 */}
        <div
          onClick={() => setIsOpen(prev => !prev)}
          style={{
            width: '100%',
            padding: '10px 14px',
            borderRadius: 10,
            border: isOpen ? '1.5px solid #2563eb' : '1px solid #d1d5db',
            backgroundColor: '#ffffff',
            fontSize: 13,
            color: selectedSite ? '#111827' : '#9ca3af',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: isOpen ? '0 0 0 3px rgba(37, 99, 235, 0.12)' : 'none',
            transition: 'all 0.15s ease',
            boxSizing: 'border-box',
          }}
        >
          <span style={{ fontWeight: selectedSite ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedSite ? selectedSite.site_name : '현장을 검색 또는 선택하세요'}
          </span>
          <span style={{
            fontSize: 10,
            color: '#6b7280',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
            marginLeft: 6
          }}>
            ▼
          </span>
        </div>

        {/* 자동완성 검색 드롭다운 패널 */}
        {isOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            boxShadow: '0 10px 20px -5px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
            maxHeight: 280,
            overflowY: 'auto',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            animation: 'dropdownFadeIn 0.12s ease-out',
            boxSizing: 'border-box',
          }}>
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes dropdownFadeIn {
                from { transform: translateY(-4px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}} />

            {/* 실시간 필터 검색창 */}
            <input
              type="text"
              placeholder="🔍 현장명 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()} // 검색창 클릭 시 드롭다운 닫힘 차단
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #d1d5db',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: 2,
              }}
            />

            {/* 남은 현장 목록 */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#4b5563',
                padding: '6px 8px',
                backgroundColor: '#f3f4f6',
                borderRadius: 6,
                marginBottom: 2,
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span>남은 현장</span>
                <span>{filteredAvailableList.length}개</span>
              </div>
              
              {filteredAvailableList.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: '12px 8px', textAlign: 'center' }}>
                  검색 결과가 없습니다.
                </div>
              ) : (
                filteredAvailableList.map(s => {
                  const isCurrent = s.id === currentSelection;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelect(s.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontSize: 12.5,
                        color: isCurrent ? '#2563eb' : '#374151',
                        backgroundColor: isCurrent ? '#eff6ff' : 'transparent',
                        fontWeight: isCurrent ? 700 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isCurrent ? '#eff6ff' : '#f3f4f6';
                        e.currentTarget.style.paddingLeft = '14px';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isCurrent ? '#eff6ff' : 'transparent';
                        e.currentTarget.style.paddingLeft = '12px';
                      }}
                    >
                      {s.site_name}
                    </div>
                  );
                })
              )}
            </div>

            {/* 매칭된(빠진) 현장 목록 */}
            {filteredUsedList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#4b5563',
                  padding: '6px 8px',
                  backgroundColor: '#fef2f2',
                  borderRadius: 6,
                  marginBottom: 2,
                  display: 'flex',
                  justifyContent: 'space-between'
                }}>
                  <span>매칭완료 현장</span>
                  <span>{filteredUsedList.length}개</span>
                </div>
                
                {filteredUsedList.map(s => {
                  const isCurrent = s.id === currentSelection;
                  return (
                    <div
                      key={s.id}
                      onClick={() => handleSelect(s.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontSize: 12.5,
                        color: isCurrent ? '#e11d48' : '#9ca3af',
                        backgroundColor: isCurrent ? '#fff1f2' : 'transparent',
                        textDecoration: 'line-through',
                        fontWeight: isCurrent ? 700 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.1s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isCurrent ? '#fff1f2' : '#f9fafb';
                        e.currentTarget.style.paddingLeft = '14px';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isCurrent ? '#fff1f2' : 'transparent';
                        e.currentTarget.style.paddingLeft = '12px';
                      }}
                    >
                      {s.site_name}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 매칭 취소 제어 버튼 */}
      {currentSelection && usedSites.has(currentSelection) && (
        <button
          onClick={() => {
            onCancelMatch(currentSelection);
            handleSelect('');
          }}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #fecdd3',
            backgroundColor: '#fff1f2',
            color: '#dc2626',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            transition: 'all 0.15s ease',
            marginTop: 4,
            boxSizing: 'border-box',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ffe4e6'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#fff1f2'; }}
        >
          이 현장 매칭 취소
        </button>
      )}
    </div>
  );
}
