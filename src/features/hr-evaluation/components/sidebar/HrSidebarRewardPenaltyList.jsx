import React from 'react';

/**
 * 📋 부여된 상벌점 내역 리스트 (시말서 스캔본 보기/추후첨부 버튼 포함)
 */
export function HrSidebarRewardPenaltyList({
  rewardPenaltyList = [],
  onRemoveRewardPenalty,
  onViewApology,
  onTriggerAppendApology,
  styles,
}) {
  if (rewardPenaltyList.length === 0) {
    return <div style={styles.rpEmpty}>이번 달 부여된 관리자 상벌점 내역이 없습니다.</div>;
  }

  return (
    <div style={styles.rpList}>
      {rewardPenaltyList.map((item) => {
        const isReward = item.points >= 0;
        const hasApology = Boolean(item.apologyDoc);

        return (
          <div
            key={item.id}
            style={{
              ...styles.rpItem,
              backgroundColor: isReward ? '#eff6ff' : '#fef2f2',
              borderColor: isReward ? '#bfdbfe' : '#fecaca',
            }}
          >
            <div style={styles.rpItemMain}>
              <div style={styles.rpItemTitleRow}>
                <span
                  style={{
                    ...styles.rpPointsBadge,
                    backgroundColor: isReward ? '#2563eb' : '#dc2626',
                  }}
                >
                  {isReward ? `+${item.points}점` : `${item.points}점`}
                </span>
                <strong style={styles.rpItemTitle} title={item.title}>
                  {item.title}
                </strong>
                <span style={styles.rpItemDate}>{item.date?.slice(5)}</span>
              </div>
              <div style={styles.rpItemReason}>{item.reason}</div>

              {/* 시말서 스캔본 보기 or 추후첨부 버튼 */}
              {!isReward && (
                <div style={styles.apologyBadgeRow}>
                  {hasApology ? (
                    <button
                      type="button"
                      onClick={() => onViewApology(item)}
                      style={styles.viewApologyBtn}
                      title="Google Drive에 저장된 시말서 원본 스캔본 열람"
                    >
                      📄 시말서 스캔본 보기
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onTriggerAppendApology(item.id)}
                      style={styles.appendApologyBtn}
                      title="이 징계 건에 시말서 스캔본 파일 첨부"
                    >
                      + 시말서 추후첨부
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => onRemoveRewardPenalty(item.id)}
              title="삭제 시 점수와 전국 순위가 즉시 재계산됩니다"
              style={styles.rpDeleteBtn}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
