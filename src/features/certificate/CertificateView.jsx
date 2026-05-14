import React, { useState } from 'react';
import { useDialog } from '../../components/common/DialogContext';
import { BatchProgressDialog } from '../../components/common/BatchProgressDialog';
import { useCertificateViewModel } from './useCertificateViewModel.jsx';
import DeleteProgressDialog from './DeleteProgressDialog';
import PdfParserView from './pdf-parser/PdfParserView';

const headerWrapStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '12px',
};

const selectStyle = {
    height: '34px',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    padding: '0 10px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#334155',
    background: '#ffffff',
    outline: 'none',
};

const CertificateFilterWidget = ({
    isPrivileged,
    selectedSite,
    setSelectedSite,
    siteOptions,
    visibleRecordsCount,
}) => (
    <div style={headerWrapStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="material-icons" style={{ fontSize: '18px', color: '#475569' }}>description</span>
            <strong style={{ color: '#1e293b', fontSize: '14px' }}>성적서 목록</strong>
            <span style={{ 
                fontSize: '12px', 
                color: '#64748b', 
                background: '#f1f5f9', 
                padding: '2px 8px', 
                borderRadius: '12px',
                fontWeight: 600
            }}>
                총 {visibleRecordsCount}개
            </span>
        </div>
        {isPrivileged && (
            <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                style={{ ...selectStyle, minWidth: '180px' }}
            >
                {siteOptions.map((name) => (
                    <option key={name} value={name}>
                        {name === 'ALL' ? '전체 현장' : name}
                    </option>
                ))}
            </select>
        )}
    </div>
);

const CertificateListWidget = ({
    isLoading,
    visibleRecords,
    selectedId,
    setSelectedId,
    selectedIds,
    isAllSelected,
    isIndeterminate,
    toggleSelectAll,
    toggleSelectItem,
}) => (
    <div style={{
        flex: 1,
        minHeight: 0,
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
    }}>
        <div style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            fontSize: '12px',
            fontWeight: 800,
            color: '#475569',
            padding: '10px 12px',
            alignItems: 'center',
        }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => {
                        if (el) el.indeterminate = isIndeterminate;
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    title="전체 선택"
                />
            </div>
            <div>파일명</div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
            {visibleRecords.length === 0 ? (
                <div style={{
                    height: '100%',
                    minHeight: '220px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                    fontWeight: 700,
                    fontSize: '13px',
                }}>
                    {isLoading ? '성적서 목록을 불러오는 중...' : '표시할 성적서가 없습니다.'}
                </div>
            ) : (
                visibleRecords.map((item) => {
                    const selected = item.id === selectedId;
                    const isChecked = selectedIds.has(item.id);
                    return (
                        <div
                            key={item.id}
                            onClick={() => setSelectedId(item.id)}
                            style={{
                                width: '100%',
                                border: 'none',
                                background: selected ? '#eff6ff' : '#ffffff',
                                borderBottom: '1px solid #f1f5f9',
                                padding: '10px 12px',
                                display: 'grid',
                                gridTemplateColumns: '40px 1fr',
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontSize: '12px',
                                color: '#1e293b',
                                alignItems: 'center',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={() => toggleSelectItem(item.id)}
                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontWeight: 700 }}>{item.fileName}</span>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    </div>
);

const CertificateActionWidget = ({
    isPrivileged,
    selectedRecord,
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    yearOptions,
    monthOptions,
    moveMonth,
    handleDownload,
    handleDownloadSelected,
    openFileDialog,
    selectedCount,
    hasSelection,
    handleDeleteSelected,
    isDeleting,
    onOpenPdfParser,
}) => (
    <div style={{
        borderTop: '1px solid #e2e8f0',
        paddingTop: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
    }}>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
                type="button"
                onClick={() => moveMonth(-1)}
                style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
                aria-label="이전 달"
            >
                <span className="material-icons" style={{ fontSize: '18px' }}>chevron_left</span>
            </button>

            <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{ ...selectStyle, minWidth: '96px' }}
            >
                {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}년</option>
                ))}
            </select>

            <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                style={{ ...selectStyle, minWidth: '88px' }}
            >
                {monthOptions.map((m) => (
                    <option key={m} value={m}>{m}월</option>
                ))}
            </select>

            <button
                type="button"
                onClick={() => moveMonth(1)}
                style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
                aria-label="다음 달"
            >
                <span className="material-icons" style={{ fontSize: '18px' }}>chevron_right</span>
            </button>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
            <button
                type="button"
                onClick={selectedCount > 1 ? handleDownloadSelected : handleDownload}
                disabled={!hasSelection}
                style={{
                    height: '34px',
                    minWidth: selectedCount > 1 ? '120px' : '96px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '0 14px',
                    backgroundColor: hasSelection ? '#3b82f6' : '#94a3b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: hasSelection ? 'pointer' : 'not-allowed',
                    opacity: hasSelection ? 1 : 0.6,
                }}
            >
                <span className="material-icons" style={{ fontSize: '16px' }}>
                    {selectedCount > 1 ? 'merge_type' : 'download'}
                </span>
                {selectedCount > 1 ? '통합 다운로드' : '다운로드'}
            </button>
            <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={!hasSelection || isDeleting}
                style={{
                    height: '34px',
                    minWidth: '80px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '0 14px',
                    backgroundColor: hasSelection ? '#dc2626' : '#94a3b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: hasSelection && !isDeleting ? 'pointer' : 'not-allowed',
                    opacity: hasSelection && !isDeleting ? 1 : 0.6,
                }}
            >
                {isDeleting ? (
                    <span className="material-icons" style={{ fontSize: '16px', animation: 'spin 1s linear infinite' }}>refresh</span>
                ) : (
                    <span className="material-icons" style={{ fontSize: '16px' }}>delete</span>
                )}
                {isDeleting ? '삭제 중...' : '삭제'}
            </button>
            {isPrivileged && (
                <button
                    type="button"
                    onClick={onOpenPdfParser}
                    style={{
                        height: '34px',
                        minWidth: '110px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#1e293b',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                    }}
                >
                    성적서 올리기
                </button>
            )}
        </div>
    </div>
);

const CertificateBatchProgressWidget = ({ batchProcess }) => (
    <BatchProgressDialog
        isOpen={batchProcess.tasks.length > 0}
        title="성적서 ZIP 일괄 업로드"
        tasks={batchProcess.tasks}
        progress={batchProcess.progress}
        isProcessing={batchProcess.isProcessing}
        isFinished={batchProcess.isFinished}
        onClose={() => batchProcess.resetBatch()}
    />
);

const CertificateView = ({ currentUser }) => {
    const { showToast, showAlert } = useDialog();
    const [pdfParserOpen, setPdfParserOpen] = useState(false);
    
    const handleOpenPdfParser = () => setPdfParserOpen(true);
    
    const {
        isPrivileged,
        isLoading,
        visibleRecords,
        selectedId,
        setSelectedId,
        selectedSite,
        setSelectedSite,
        selectedYear,
        setSelectedYear,
        selectedMonth,
        setSelectedMonth,
        yearOptions,
        monthOptions,
        moveMonth,
        siteOptions,
        fileInputRef,
        openFileDialog,
        handleUploadFiles,
        handleDownload,
        batchProcess,
        selectedRecord,
        // 선택 관련
        selectedIds,
        isAllSelected,
        isIndeterminate,
        toggleSelectAll,
        toggleSelectItem,
        handleDownloadSelected,
        hasSelection,
        handleDeleteSelected,
        isDeleting,
        deleteProgress,
        closeDeleteProgress,
    } = useCertificateViewModel(currentUser, { showToast, showAlert });

    return (
        <div style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#ffffff',
            padding: '1.25rem',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            position: 'relative',
        }}>
            <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                multiple
                style={{ display: 'none' }}
                onChange={handleUploadFiles}
            />

            <CertificateFilterWidget
                isPrivileged={isPrivileged}
                selectedSite={selectedSite}
                setSelectedSite={setSelectedSite}
                siteOptions={siteOptions}
                visibleRecordsCount={visibleRecords.length}
            />

            <CertificateListWidget
                isLoading={isLoading}
                visibleRecords={visibleRecords}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                selectedIds={selectedIds}
                isAllSelected={isAllSelected}
                isIndeterminate={isIndeterminate}
                toggleSelectAll={toggleSelectAll}
                toggleSelectItem={toggleSelectItem}
            />

            <CertificateActionWidget
                isPrivileged={isPrivileged}
                selectedRecord={selectedRecord}
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
                selectedMonth={selectedMonth}
                setSelectedMonth={setSelectedMonth}
                yearOptions={yearOptions}
                monthOptions={monthOptions}
                moveMonth={moveMonth}
                handleDownload={handleDownload}
                handleDownloadSelected={handleDownloadSelected}
                openFileDialog={openFileDialog}
                selectedCount={selectedIds.size}
                hasSelection={hasSelection}
                handleDeleteSelected={handleDeleteSelected}
                isDeleting={isDeleting}
                onOpenPdfParser={handleOpenPdfParser}
            />

            <CertificateBatchProgressWidget batchProcess={batchProcess} />
            
            <DeleteProgressDialog 
                progress={deleteProgress} 
                onClose={closeDeleteProgress} 
            />

            {pdfParserOpen && (
                <PdfParserView onClose={() => setPdfParserOpen(false)} />
            )}
        </div>
    );
};

export default CertificateView;
