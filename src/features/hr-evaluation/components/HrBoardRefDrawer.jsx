import React from 'react';

/**
 * 소통게시판 사유글 참고 패널 컴포넌트
 */
export function HrBoardRefDrawer({
  year,
  month,
  currentWorkerEvaluation,
  boardReasonPosts = [],
  selectedDate,
  onSelectBoardPostDate,
  onClose,
}) {
  return (
    <section style={styles.boardDrawer}>
      <div style={styles.boardDrawerHeader}>
        <div style={styles.boardDrawerTitleRow}>
          <span style={styles.boardDrawerBadge}>
            💬 {currentWorkerEvaluation?.siteName} · {currentWorkerEvaluation?.workerName} 작성글 ({year}년 {month}월)
          </span>
          <span style={styles.boardDrawerTitle}>
            현장관리자가 소통게시판에 자유양식으로 남긴 게시글입니다. 내용을 확인한 뒤 날짜를 선택하여 달력/목록에서 휴무 종류와 사유를 직접 기록하세요.
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={styles.boardCloseBtn}
        >
          닫기 ✕
        </button>
      </div>

      {boardReasonPosts.length === 0 ? (
        <div style={styles.emptyBoardState}>
          <span style={styles.emptyBoardIcon}>📭</span>
          <span>해당 월에 작성된 소통게시판 게시글이 없습니다.</span>
        </div>
      ) : (
        <div style={styles.boardCardsGrid}>
          {boardReasonPosts.map((post) => {
            const isDateActive = selectedDate === post.targetDate;
            const monthDayLabel = `${String(month).padStart(2, '0')}/${String(post.day).padStart(2, '0')}`;
            return (
              <div
                key={post.id}
                style={{
                  ...styles.boardCard,
                  borderColor: isDateActive ? '#2563eb' : '#bfdbfe',
                  boxShadow: isDateActive ? '0 0 0 2px rgba(37, 99, 235, 0.15)' : 'none',
                }}
              >
                <div style={styles.boardCardTop}>
                  <strong style={styles.boardSiteText}>
                    ✍️ {post.siteName} · {post.author}
                  </strong>
                  <span style={styles.boardDateText}>작성일: {post.writtenAt}</span>
                </div>
                <div style={styles.boardTitleText}>{post.title}</div>
                <div style={styles.boardBodyText}>{post.content}</div>
                <div style={styles.boardBottomRow}>
                  <button
                    type="button"
                    onClick={() => onSelectBoardPostDate(post)}
                    style={{
                      ...styles.selectDateBtn,
                      backgroundColor: isDateActive ? '#0f172a' : '#2563eb',
                    }}
                  >
                    {isDateActive
                      ? `✅ 해당 날짜(${monthDayLabel}) 선택됨 — 달력/목록에서 기록`
                      : `📅 해당 날짜(${monthDayLabel}) 선택하여 기록`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>

  );
}

const styles = {
  boardDrawer: {
    backgroundColor: '#eff6ff',
    border: '1px solid #93c5fd',
    borderRadius: '10px',
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flexShrink: 0,
  },
  boardDrawerHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  boardDrawerTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  boardDrawerBadge: {
    backgroundColor: '#1d4ed8',
    color: '#ffffff',
    fontSize: '10.5px',
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: '999px',
  },
  boardDrawerTitle: {
    fontSize: '11.5px',
    color: '#1e3a8a',
  },
  boardCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: '#1e3a8a',
    fontSize: '11.5px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  boardCardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '6px',
  },
  boardCard: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px solid #bfdbfe',
    padding: '9px 11px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  boardCardTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    borderBottom: '1px dashed #e2e8f0',
    paddingBottom: '4px',
  },
  boardSiteText: {
    fontSize: '11.5px',
    color: '#0f172a',
  },
  boardDateText: {
    fontSize: '10px',
    color: '#64748b',
  },
  boardTitleText: {
    fontSize: '11.5px',
    fontWeight: 800,
    color: '#1e293b',
    lineHeight: 1.35,
  },
  boardBodyText: {
    fontSize: '11px',
    color: '#475569',
    lineHeight: 1.45,
    backgroundColor: '#f8fafc',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid #f1f5f9',
  },
  boardBottomRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 'auto',
    paddingTop: '2px',
  },
  selectDateBtn: {
    width: '100%',
    padding: '5px 9px',
    borderRadius: '5px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'background-color 0.15s ease',
  },
  emptyBoardState: {
    padding: '24px 16px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '12.5px',
    fontWeight: 600,
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    border: '1px dashed #cbd5e1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  emptyBoardIcon: {
    fontSize: '16px',
  },
};

