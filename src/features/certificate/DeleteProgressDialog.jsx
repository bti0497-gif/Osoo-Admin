import React from 'react';

const DeleteProgressDialog = ({ progress, onClose }) => {
    const { isOpen, current, total, fileName, status, errors } = progress;
    
    if (!isOpen) return null;
    
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const isCompleted = status === 'completed';
    const isError = status === 'error';
    
    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '24px',
                width: '400px',
                maxWidth: '90vw',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            }}>
                <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ 
                        margin: 0, 
                        fontSize: '18px', 
                        fontWeight: 600,
                        color: isError ? '#dc2626' : isCompleted ? '#16a34a' : '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}>
                        {isError ? (
                            <>
                                <span className="material-icons">error</span>
                                삭제 중 오류 발생
                            </>
                        ) : isCompleted ? (
                            <>
                                <span className="material-icons">check_circle</span>
                                삭제 완료
                            </>
                        ) : (
                            <>
                                <span className="material-icons" style={{ animation: 'spin 1s linear infinite' }}>refresh</span>
                                성적서 삭제 중...
                            </>
                        )}
                    </h3>
                </div>
                
                {/* 진행률 바 */}
                <div style={{ marginBottom: '16px' }}>
                    <div style={{
                        height: '8px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '4px',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${percent}%`,
                            backgroundColor: isError ? '#dc2626' : isCompleted ? '#16a34a' : '#3b82f6',
                            borderRadius: '4px',
                            transition: 'width 0.3s ease',
                        }} />
                    </div>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: '8px',
                        fontSize: '14px',
                        color: '#6b7280',
                    }}>
                        <span>{current} / {total}</span>
                        <span>{percent}%</span>
                    </div>
                </div>
                
                {/* 현재 삭제 중인 파일 */}
                {!isCompleted && !isError && fileName && (
                    <div style={{
                        padding: '12px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '8px',
                        marginBottom: '16px',
                    }}>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                            삭제 중:
                        </div>
                        <div style={{ 
                            fontSize: '14px', 
                            color: '#1f2937',
                            fontWeight: 500,
                            wordBreak: 'break-all',
                        }}>
                            {fileName}
                        </div>
                    </div>
                )}
                
                {/* 에러 목록 */}
                {isError && errors.length > 0 && (
                    <div style={{
                        maxHeight: '150px',
                        overflow: 'auto',
                        padding: '12px',
                        backgroundColor: '#fef2f2',
                        borderRadius: '8px',
                        marginBottom: '16px',
                    }}>
                        <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '8px', fontWeight: 600 }}>
                            실패한 파일:
                        </div>
                        {errors.map((err, idx) => (
                            <div key={idx} style={{ 
                                fontSize: '12px', 
                                color: '#991b1b',
                                marginBottom: '4px',
                                wordBreak: 'break-all',
                            }}>
                                • {err.fileName}: {err.error}
                            </div>
                        ))}
                    </div>
                )}
                
                {/* 닫기 버튼 */}
                {(isCompleted || isError) && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={onClose}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: isError ? '#dc2626' : '#16a34a',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                        >
                            {isError ? '확인' : '완료'}
                        </button>
                    </div>
                )}
            </div>
            
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
};

export default DeleteProgressDialog;
