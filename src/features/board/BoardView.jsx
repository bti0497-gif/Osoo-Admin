import React, { useState, useRef, useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useBoardViewModel } from './useBoardViewModel';
import { useDialog } from '../../components/common/DialogContext';

// ── 성능 최적화를 위한 댓글 입력 컴포넌트 분리 ──
const CommentInput = ({ onSubmit, placeholder, initialValue = '', onCancel, buttonText = '등록' }) => {
    const [text, setText] = useState(initialValue);

    const handleSubmit = () => {
        if (!text.trim()) return;
        onSubmit(text);
        setText('');
    };

    return (
        <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
            <input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={placeholder}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                style={{
                    flex: 1, border: '1.5px solid #e2e8f0', height: '34px',
                    padding: '0 10px', fontSize: '0.8125rem', fontWeight: 600,
                    outline: 'none', borderRadius: '6px'
                }}
                onFocus={e => e.target.style.borderColor = '#1e293b'}
                onBlur={e => e.target.style.borderColor = '#e2e8f0'}
            />
            <button onClick={handleSubmit}
                style={{
                    height: '34px', padding: '0 14px', backgroundColor: '#1e293b',
                    color: 'white', border: 'none', borderRadius: '6px',
                    fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                }}>
                {buttonText}
            </button>
            {onCancel && (
                <button onClick={onCancel}
                    style={{
                        height: '34px', padding: '0 10px', backgroundColor: '#f1f5f9',
                        color: '#64748b', border: 'none', borderRadius: '6px',
                        fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                    }}>
                    취소
                </button>
            )}
        </div>
    );
};

const isAdminRole = (role) => {
    if (!role) return false;
    const r = String(role).toLowerCase().trim();
    return ['admin', 'group_admin', 'central_admin', 'super_admin', '최고관리자', '중앙관리자', '관리자'].includes(r);
};

// 관리 비대상 현장 제외 판별 (상주 근무자 없음 / 시스템 가상 현장)
const isManageableSite = (name) => {
    if (!name) return false;
    const n = String(name).trim();
    if (n === '중앙' || n === '본사' || n.toLowerCase() === 'central') return false;
    if (n.includes('시화호') || n.includes('오수처리장') || n.includes('양북임시') || n.includes('낙동강')) return false;
    return true;
};

// ── 다중 대상 현장 선택 컴포넌트 (기본 전체 체크, 안 보낼 곳 체크 해제) ──
const TargetSiteSelector = ({ form, updateForm, sites }) => {
    const [searchSite, setSearchSite] = useState('');

    // 실제 관리 대상 현장 목록 (시화호, 오수처리장, 낙동강, 양북임시 등 비상주 현장 제외 및 가나다 순)
    const siteList = useMemo(() => {
        return (sites || [])
            .map(s => s.site_name || s.name || s)
            .filter(isManageableSite)
            .sort((a, b) => a.localeCompare(b, 'ko'));
    }, [sites]);

    // target_sites가 null이면 기본적으로 전체 선택 상태
    const isAllSelected = form.target_sites === null || (Array.isArray(form.target_sites) && form.target_sites.length === siteList.length);
    const selectedSites = useMemo(() => {
        if (form.target_sites === null) return siteList;
        if (Array.isArray(form.target_sites)) return form.target_sites;
        return siteList;
    }, [form.target_sites, siteList]);

    const filteredSites = useMemo(() => {
        if (!searchSite.trim()) return siteList;
        const q = searchSite.trim().toLowerCase();
        return siteList.filter(s => s.toLowerCase().includes(q));
    }, [siteList, searchSite]);

    // 전체 선택
    const handleSelectAll = () => {
        updateForm({ target_sites: null });
    };

    // 전체 해제 (특정 1~2개 현장만 콕 집어서 보낼 때 사용)
    const handleDeselectAll = () => {
        updateForm({ target_sites: [] });
    };

    // 체크 토글
    const toggleSite = (siteName) => {
        let next;
        if (selectedSites.includes(siteName)) {
            // 체크 해제 (제외)
            next = selectedSites.filter(s => s !== siteName);
        } else {
            // 체크 추가
            next = [...selectedSites, siteName];
        }

        // 전체가 다 선택된 경우 null(전체)로 정규화
        if (next.length === siteList.length) {
            updateForm({ target_sites: null });
        } else {
            updateForm({ target_sites: next });
        }
    };

    const excludedCount = Math.max(0, siteList.length - selectedSites.length);

    return (
        <div style={{ marginBottom: '1rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', backgroundColor: '#f8fafc' }}>
            {/* 상단 헤더 & 컨트롤 바 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        발송 대상 현장
                    </label>

                    {/* 발송 상태 배지 */}
                    {isAllSelected ? (
                        <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#047857', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '4px' }}>
                            ✓ 전체 발송 ({siteList.length}개소 모두 선택됨)
                        </span>
                    ) : selectedSites.length === 0 ? (
                        <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: '4px' }}>
                            ⚠ 선택된 현장 없음 (최소 1개 이상 선택 필요)
                        </span>
                    ) : (
                        <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#1d4ed8', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '2px 8px', borderRadius: '4px' }}>
                            ✓ {selectedSites.length}개소 발송 ({excludedCount}개소 제외됨)
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                        type="button"
                        onClick={handleSelectAll}
                        style={{
                            height: '24px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px',
                            backgroundColor: isAllSelected ? '#f1f5f9' : '#fff', fontSize: '0.6875rem', fontWeight: 700,
                            color: '#334155', cursor: 'pointer'
                        }}
                    >
                        전체 선택
                    </button>
                    <button
                        type="button"
                        onClick={handleDeselectAll}
                        style={{
                            height: '24px', padding: '0 8px', border: '1px solid #cbd5e1', borderRadius: '4px',
                            backgroundColor: selectedSites.length === 0 ? '#f1f5f9' : '#fff', fontSize: '0.6875rem', fontWeight: 700,
                            color: '#64748b', cursor: 'pointer'
                        }}
                    >
                        전체 해제
                    </button>

                    {/* 검색 필터 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <input
                            type="text"
                            placeholder="현장 검색..."
                            value={searchSite}
                            onChange={e => setSearchSite(e.target.value)}
                            style={{
                                height: '24px', width: '100px', padding: '0 6px', fontSize: '0.6875rem',
                                border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none', backgroundColor: '#fff'
                            }}
                        />
                        {searchSite && (
                            <button
                                type="button"
                                onClick={() => setSearchSite('')}
                                style={{ height: '24px', padding: '0 4px', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 800 }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* 안내 문구 */}
            <div style={{ fontSize: '0.625rem', color: '#64748b', marginBottom: '8px', fontWeight: 600 }}>
                * 기본으로 모든 현장이 선택되어 있습니다. <strong>보내지 않을 현장은 체크를 해제</strong>하세요. (체크된 현장에만 글과 팝업 토스트가 표시됩니다)
            </div>

            {/* 현장 체크박스 리스트 (그리드 레이아웃) */}
            <div style={{
                maxHeight: '145px',
                overflowY: 'auto',
                backgroundColor: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '6px 8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                gap: '4px'
            }}>
                {filteredSites.length === 0 ? (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '14px', color: '#94a3b8', fontSize: '0.75rem' }}>
                        검색 결과가 없습니다.
                    </div>
                ) : (
                    filteredSites.map(siteName => {
                        const isChecked = selectedSites.includes(siteName);
                        return (
                            <label
                                key={siteName}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '3px 6px',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    backgroundColor: isChecked ? '#f0fdf4' : '#f8fafc',
                                    border: isChecked ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                                    transition: 'all 0.1s'
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleSite(siteName)}
                                    style={{ cursor: 'pointer', accentColor: '#16a34a' }}
                                />
                                <span style={{
                                    fontSize: '0.6875rem',
                                    fontWeight: isChecked ? 700 : 500,
                                    color: isChecked ? '#15803d' : '#94a3b8',
                                    textDecoration: isChecked ? 'none' : 'line-through',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                }}>
                                    {siteName}
                                </span>
                            </label>
                        );
                    })
                )}
            </div>
        </div>
    );
};

const BoardView = ({ currentUser, isActive }) => {
    const { showAlert, showConfirm } = useDialog();
    const {
        posts, allPostsCount, loading, form, updateForm,
        submitPost, deletePost, viewPost, editPost,
        selectedPost, comments, submitComment, deleteComment, uploadFile,
        viewMode, setViewMode, searchTerm, setSearchTerm,
        currentPage, setCurrentPage, totalPages, resetForm, loadPosts, replyToPost,
        sites, // 현장 목록 (관리자용)
        isRefreshing, refreshPosts
    } = useBoardViewModel(currentUser, { showAlert, showConfirm, isActive });

    const [replyTo, setReplyTo] = useState(null);
    const [uploadProgress, setUploadProgress] = useState({ loading: false, percent: 0, fileName: '' });
    const fileInputRef = useRef(null);

    const isAdmin = ['admin', 'group_admin', 'central_admin', 'super_admin'].includes(currentUser?.role);
    const isAuthor = (authorName) => currentUser?.name === authorName;
    const resolveAttachmentHref = (attachment) => {
        const rawUrl = String(attachment?.url || '').trim();
        const fileName = String(attachment?.name || 'download').trim() || 'download';
        if (!rawUrl) return '#';
        // 로컬 저장 URL은 다운로드 API를 거치며 원본 파일명으로 내려받는다.
        if (rawUrl.startsWith('/uploads/')) {
            return `/api/download?url=${encodeURIComponent(rawUrl)}&name=${encodeURIComponent(fileName)}`;
        }
        return rawUrl;
    };

    // Quill modules
    const quillModules = useMemo(() => ({
        toolbar: {
            container: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline', 'strike'],
                [{ 'color': [] }, { 'background': [] }],
                [{ 'align': [] }],
                [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                ['blockquote'],
                ['link', 'image'],
                ['clean']
            ]
        }
    }), []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.title.trim()) { await showAlert('제목을 입력해주세요.'); return; }
        if (!form.content.trim() || form.content === '<p><br></p>') { await showAlert('내용을 입력해주세요.'); return; }
        submitPost();
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 50MB 용량 체크
        const maxSize = 50 * 1024 * 1024;
        if (file.size > maxSize) {
            await showAlert('파일 용량이 너무 큽니다. 최대 50MB까지 업로드 가능합니다.');
            e.target.value = '';
            return;
        }

        // 업로드 시작 - 프로그레스 표시
        setUploadProgress({ loading: true, percent: 0, fileName: file.name });

        // 프로그레스 애니메이션 (실제 진행률 추적이 어려우므로 인디터미네이트로 표시)
        const progressInterval = setInterval(() => {
            setUploadProgress(prev => ({
                ...prev,
                percent: Math.min(prev.percent + 10, 90) // 90%까지 증가, 완료 시 100%
            }));
        }, 300);

        try {
            const result = await uploadFile(file, {
                boardId: form.id || 'draft',
                date: new Date().toISOString(),
            });

            clearInterval(progressInterval);

            if (result) {
                setUploadProgress({ loading: true, percent: 100, fileName: file.name });
                const current = form.attachments ? JSON.parse(form.attachments) : [];
                current.push({ url: result.url, name: result.originalName, size: result.size });
                updateForm({ attachments: JSON.stringify(current) });
                // 잠시 후 프로그레스바 숨김
                setTimeout(() => setUploadProgress({ loading: false, percent: 0, fileName: '' }), 500);
            } else {
                setUploadProgress({ loading: false, percent: 0, fileName: '' });
            }
        } catch (err) {
            console.error('[BoardView] handleFileUpload error:', err);
            clearInterval(progressInterval);
            setUploadProgress({ loading: false, percent: 0, fileName: '' });
            await showAlert('파일 업로드 중 오류가 발생했습니다.');
        }

        e.target.value = '';
    };

    const removeAttachment = (index) => {
        const current = JSON.parse(form.attachments);
        current.splice(index, 1);
        updateForm({ attachments: current.length > 0 ? JSON.stringify(current) : '' });
    };

    const handleCommentSubmit = (text) => {
        submitComment(selectedPost.id, text, null);
    };

    const handleReplySubmit = (text, parentId) => {
        submitComment(selectedPost.id, text, parentId);
        setReplyTo(null);
    };

    const parseBoardDate = (value) => {
        if (!value) return null;

        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : value;
        }

        if (typeof value === 'string' || typeof value === 'number') {
            const d = new Date(value);
            return Number.isNaN(d.getTime()) ? null : d;
        }

        if (typeof value === 'object') {
            if (typeof value.value === 'string' || typeof value.value === 'number') {
                const d = new Date(value.value);
                return Number.isNaN(d.getTime()) ? null : d;
            }
            if (typeof value.timestampValue === 'string') {
                const d = new Date(value.timestampValue);
                return Number.isNaN(d.getTime()) ? null : d;
            }
            if (typeof value.seconds === 'number') {
                const millis = value.seconds * 1000 + Math.floor((typeof value.nanos === 'number' ? value.nanos : 0) / 1_000_000);
                const d = new Date(millis);
                return Number.isNaN(d.getTime()) ? null : d;
            }
        }

        return null;
    };

    const formatDate = (dateStr) => {
        const d = parseBoardDate(dateStr);
        if (!d) return '-';
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const minute = String(d.getMinutes()).padStart(2, '0');
        return `${month}-${day} ${hour}:${minute}`;
    };

    const formatFullDate = (dateStr) => {
        const d = parseBoardDate(dateStr);
        if (!d) return '-';
        return d.toLocaleString('ko-KR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const [nowTimestamp] = useState(() => Date.now());
    const isNewPost = (dateStr) => {
        const d = parseBoardDate(dateStr);
        if (!d) return false;
        const diffHours = (nowTimestamp - d.getTime()) / (1000 * 60 * 60);
        return diffHours >= 0 && diffHours <= 24;
    };

    const getAttachments = (attachmentsStr) => {
        if (!attachmentsStr) return [];
        try { return JSON.parse(attachmentsStr); } catch { return []; }
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
        return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
    };

    // ── 댓글 트리 구조 ──
    const topComments = comments.filter(c => !c.parent_id);
    const getReplies = (parentId) => comments.filter(c => c.parent_id === parentId);

    return (
        <div style={{
            position: 'fixed',
            top: '48px', // 상단 메뉴 높이
            left: '250px', // 왼쪽 사이드바 너비 (CSS에서 .sidebar width: 250px)
            right: 0,
            bottom: '32px', // 하단 상태바 높이 (status-bar height: 32px)
            backgroundColor: '#fff',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* ════════════════════════════════════════════ */}
            {/* ── 목록 모드 ── */}
            {/* ════════════════════════════════════════════ */}
            {viewMode === 'list' ? (
                <>
                    {/* [고정 헤더] 게시판 이름 + 총 게시물 */}
                    <div style={{ padding: '0.75rem 0', borderBottom: '2px solid #e2e8f0', flexShrink: 0, backgroundColor: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 1.5rem' }}>
                            <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#1e293b', letterSpacing: '-0.025em' }}>
                                소통게시판
                            </h1>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={refreshPosts}
                                    disabled={loading || isRefreshing}
                                    title="최신 게시글 목록 새로고침"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 10px',
                                        backgroundColor: '#f8fafc',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        color: '#334155',
                                        cursor: loading || isRefreshing ? 'default' : 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={e => { if (!loading && !isRefreshing) e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
                                    onMouseLeave={e => { if (!loading && !isRefreshing) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                                >
                                    <span
                                        className="material-icons"
                                        style={{
                                            fontSize: '15px',
                                            display: 'inline-block',
                                            animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
                                            transformOrigin: 'center'
                                        }}
                                    >
                                        refresh
                                    </span>
                                    <span>{isRefreshing ? '새로고침 중...' : '새로고침'}</span>
                                </button>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>
                                    총 {allPostsCount}건
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* [고정 헤더] 컬럼 헤더 - 모든 칼럼 가운데 정렬, 목록과 패딩 맞춤 */}
                    <div style={{
                        display: 'flex', alignItems: 'center',
                        padding: '0.5rem 1.5rem',
                        backgroundColor: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        flexShrink: 0,
                        fontSize: '0.6875rem', fontWeight: 800, color: '#94a3b8',
                        textTransform: 'uppercase', letterSpacing: '0.08em'
                    }}>
                        <span style={{ width: '40px', textAlign: 'center' }}>번호</span>
                        <span style={{ flex: 1, textAlign: 'center' }}>제목</span>
                        <span style={{ width: '90px', textAlign: 'center' }}>작성자</span>
                        <span style={{ width: '130px', textAlign: 'center' }}>대상</span>
                        <span style={{ width: '100px', textAlign: 'center' }}>일시</span>
                        <span style={{ width: '40px', textAlign: 'center' }}>조회</span>
                    </div>

                    {/* [스크롤 영역] 게시글 목록 - 패딩은 행에서만 적용 */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                            {loading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontWeight: 700, fontSize: '0.875rem' }}>
                                    데이터를 불러오는 중...
                                </div>
                            ) : posts.length === 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#cbd5e1', fontWeight: 700, fontSize: '0.875rem' }}>
                                    등록된 게시글이 없습니다.
                                </div>
                            ) : (
                                <div>
                                    {posts.map((p, index) => {
                                        const attachments = getAttachments(p.attachments);
                                        return (
                                            <div
                                                key={p.id}
                                                onClick={() => viewPost(p)}
                                                style={{
                                                    display: 'flex', alignItems: 'center',
                                                    padding: '0.4rem 1.5rem',
                                                    borderBottom: '1px solid #f1f5f9',
                                                    cursor: 'pointer',
                                                    transition: 'background-color 0.15s',
                                                    backgroundColor: p.is_notice ? '#fffbeb' : 'transparent'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = p.is_notice ? '#fef3c7' : '#f0f9ff'}
                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = p.is_notice ? '#fffbeb' : 'transparent'}
                                            >
                                                <span style={{ width: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem', fontWeight: 500 }}>
                                                    {p.is_notice ? '📌' : (p.parent_id ? '' : (p.postNo ?? ((currentPage - 1) * 10 + index + 1)))}
                                                </span>
                                                <div style={{
                                                    flex: 1, display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden',
                                                    paddingLeft: p.depth > 0 ? `${p.depth * 1.25}rem` : '8px'
                                                }}>
                                                    {p.is_notice ? (
                                                        <span style={{ fontSize: '0.5625rem', fontWeight: 900, color: '#d97706', backgroundColor: '#fef3c7', padding: '1px 5px', borderRadius: '3px', flexShrink: 0 }}>공지</span>
                                                    ) : null}
                                                    {p.is_popup ? (
                                                        <span style={{ fontSize: '0.5625rem', fontWeight: 900, color: '#7c3aed', backgroundColor: '#f3e8ff', padding: '1px 5px', borderRadius: '3px', flexShrink: 0 }}>팝업</span>
                                                    ) : null}
                                                    {p.parent_id && (
                                                        <span style={{ color: '#94a3b8', fontWeight: 800, marginRight: '4px' }}>↳</span>
                                                    )}
                                                    <span style={{ fontWeight: p.parent_id ? 500 : 700, color: '#1e293b', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {p.title}
                                                    </span>
                                                    {isNewPost(p.created_at) && (
                                                        <span style={{
                                                            fontSize: '0.5625rem',
                                                            fontWeight: 900,
                                                            color: '#ffffff',
                                                            backgroundColor: '#ef4444',
                                                            padding: '1px 4px',
                                                            borderRadius: '3px',
                                                            flexShrink: 0,
                                                            lineHeight: 1,
                                                            letterSpacing: '0.02em',
                                                            boxShadow: '0 1px 2px rgba(239, 68, 68, 0.4)'
                                                        }} title="24시간 이내 등록된 새글">
                                                            N
                                                        </span>
                                                    )}
                                                    {p.comment_count > 0 && (
                                                        <span style={{ fontSize: '0.625rem', color: '#3b82f6', fontWeight: 800, flexShrink: 0 }}>
                                                            [{p.comment_count}]
                                                        </span>
                                                    )}
                                                    {attachments.length > 0 && (
                                                        <span style={{ fontSize: '0.6875rem', flexShrink: 0 }}>📎</span>
                                                    )}
                                                </div>
                                                <span style={{ width: '90px', textAlign: 'center', fontWeight: 600, color: '#475569', fontSize: '0.75rem' }}>
                                                    {p.author}
                                                </span>
                                                <span style={{ width: '130px', textAlign: 'center', fontSize: '0.75rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                    {(() => {
                                                        if (!isAdminRole(p.author_role)) return <span style={{ color: '#94a3b8' }}>-</span>;
                                                        const sites = Array.isArray(p.target_sites) && p.target_sites.length > 0
                                                            ? p.target_sites
                                                            : (Array.isArray(p.visible_sites) && !p.visible_sites.includes('ALL') ? p.visible_sites : (p.target_site ? [p.target_site] : []));
                                                        if (sites.length === 0) {
                                                            return (
                                                                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#059669', backgroundColor: '#ecfdf5', padding: '2px 8px', borderRadius: '4px' }}>
                                                                    전체
                                                                </span>
                                                            );
                                                        }
                                                        if (sites.length === 1) {
                                                            return (
                                                                <span title={sites[0]} style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '2px 8px', borderRadius: '4px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {sites[0]}
                                                                </span>
                                                            );
                                                        }
                                                        return (
                                                            <span
                                                                title={`지정 대상 (${sites.length}곳):\n${sites.join('\n')}`}
                                                                style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#2563eb', backgroundColor: '#eff6ff', padding: '2px 8px', borderRadius: '4px', cursor: 'help', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                            >
                                                                {p.target_site || `${sites[0]} 외 ${sites.length - 1}곳`}
                                                            </span>
                                                        );
                                                    })()}
                                                </span>
                                                <span style={{ width: '100px', textAlign: 'center', color: '#94a3b8', fontSize: '0.6875rem' }}>
                                                    {formatDate(p.created_at)}
                                                </span>
                                                <span style={{ width: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '0.6875rem' }}>
                                                    {p.view_count}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                    </div>

                    {/* [고정 푸터] 페이지네이션 + 검색 + 글쓰기 */}
                    <div style={{
                        padding: '0.75rem 1.5rem',
                        borderTop: '2px solid #e2e8f0',
                        flexShrink: 0,
                        backgroundColor: '#fff',
                        display: 'flex', alignItems: 'center', gap: '0.75rem'
                    }}>
                            {/* 페이지네이션 버튼 네비게이션 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    title="이전 페이지"
                                    style={{
                                        minWidth: '28px', height: '28px', padding: '0 6px',
                                        border: '1px solid #e2e8f0', borderRadius: '6px',
                                        backgroundColor: '#fff',
                                        cursor: currentPage === 1 ? 'default' : 'pointer',
                                        color: currentPage === 1 ? '#cbd5e1' : '#475569',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.875rem', fontWeight: 700,
                                        transition: 'all 0.15s'
                                    }}
                                >‹</button>

                                {Array.from({ length: Math.max(1, totalPages || 1) }, (_, i) => i + 1).map(pageNum => {
                                    const isCurrent = pageNum === currentPage;
                                    return (
                                        <button
                                            key={pageNum}
                                            onClick={() => setCurrentPage(pageNum)}
                                            style={{
                                                minWidth: '28px', height: '28px', padding: '0 8px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                backgroundColor: isCurrent ? '#1e293b' : '#fff',
                                                color: isCurrent ? '#ffffff' : '#475569',
                                                border: isCurrent ? '1px solid #1e293b' : '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem', fontWeight: isCurrent ? 800 : 600,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s'
                                            }}
                                            onMouseEnter={e => {
                                                if (!isCurrent) e.currentTarget.style.backgroundColor = '#f1f5f9';
                                            }}
                                            onMouseLeave={e => {
                                                if (!isCurrent) e.currentTarget.style.backgroundColor = '#fff';
                                            }}
                                        >
                                            {pageNum}
                                        </button>
                                    );
                                })}

                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))}
                                    disabled={currentPage >= (totalPages || 1)}
                                    title="다음 페이지"
                                    style={{
                                        minWidth: '28px', height: '28px', padding: '0 6px',
                                        border: '1px solid #e2e8f0', borderRadius: '6px',
                                        backgroundColor: '#fff',
                                        cursor: currentPage >= (totalPages || 1) ? 'default' : 'pointer',
                                        color: currentPage >= (totalPages || 1) ? '#cbd5e1' : '#475569',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.875rem', fontWeight: 700,
                                        transition: 'all 0.15s'
                                    }}
                                >›</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flex: 1, maxWidth: '240px' }}>
                                <span className="material-icons" style={{ fontSize: '16px', color: '#94a3b8' }}>search</span>
                                <input placeholder="검색..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                                    style={{ border: '1.5px solid #e2e8f0', height: '28px', padding: '0 8px', fontSize: '0.75rem', fontWeight: 600, color: '#1e293b', outline: 'none', borderRadius: '6px', width: '100%', transition: 'border-color 0.15s' }}
                                    onFocus={e => e.target.style.borderColor = '#1e293b'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                            </div>
                            <div style={{ flex: 1 }} />
                            <button onClick={() => { resetForm(); setViewMode('form'); }}
                                style={{ height: '32px', padding: '0 14px', backgroundColor: '#1e293b', color: 'white', borderRadius: '6px', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', transition: 'background-color 0.15s', flexShrink: 0 }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#334155'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#1e293b'}>
                                <span className="material-icons" style={{ fontSize: '14px' }}>edit</span> 글쓰기
                            </button>
                        </div>
                    </>

                    /* ════════════════════════════════════════════ */
                    /* ── 상세보기 모드 ── */
                    /* ════════════════════════════════════════════ */
                ) : viewMode === 'detail' && selectedPost ? (
                    <>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '2px solid #e2e8f0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h1 style={{ fontSize: '1.125rem', fontWeight: 900, color: '#1e293b' }}>게시글 보기</h1>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => { setViewMode('list'); resetForm(); loadPosts(); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#64748b', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span className="material-icons" style={{ fontSize: '16px' }}>arrow_back</span> 목록으로
                                </button>
                            </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            {/* 제목 + 메타 */}
                            <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                                {selectedPost.is_notice ? (
                                    <span style={{ fontSize: '0.625rem', fontWeight: 900, color: '#d97706', backgroundColor: '#fef3c7', padding: '2px 6px', borderRadius: '3px', display: 'inline-block' }}>📌 공지</span>
                                ) : null}
                                {selectedPost.is_popup ? (
                                    <span style={{ fontSize: '0.625rem', fontWeight: 900, color: '#7c3aed', backgroundColor: '#f3e8ff', padding: '2px 6px', borderRadius: '3px', display: 'inline-block' }}>🔔 팝업 공지</span>
                                ) : null}
                            </div>
                            <h2 style={{ fontSize: '1.125rem', fontWeight: 900, color: '#1e293b', marginBottom: '0.5rem' }}>{selectedPost.title}</h2>
                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, color: '#475569' }}>{selectedPost.author}</span>
                                <span>{formatFullDate(selectedPost.created_at)}</span>
                                <span>조회 {selectedPost.view_count}</span>
                                {isAdminRole(selectedPost.author_role) && (
                                    <span style={{ color: '#2563eb', fontWeight: 700 }}>
                                        대상: {(() => {
                                            const sites = Array.isArray(selectedPost.target_sites) && selectedPost.target_sites.length > 0
                                                ? selectedPost.target_sites
                                                : (Array.isArray(selectedPost.visible_sites) && !selectedPost.visible_sites.includes('ALL') ? selectedPost.visible_sites : (selectedPost.target_site ? [selectedPost.target_site] : []));
                                            if (sites.length === 0) return '전체 현장';
                                            if (sites.length === 1) return sites[0];
                                            return `${sites[0]} 외 ${sites.length - 1}곳 (${sites.join(', ')})`;
                                        })()}
                                    </span>
                                )}
                            </div>

                            {/* 본문 (HTML) */}
                            <div className="ql-snow">
                                <div className="ql-editor" style={{ padding: 0, minHeight: '80px', fontSize: '0.875rem', color: '#334155', lineHeight: 1.8 }}
                                    dangerouslySetInnerHTML={{ __html: selectedPost.content }} />
                            </div>

                            {/* 첨부파일 */}
                            {getAttachments(selectedPost.attachments).length > 0 && (
                                <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase' }}>첨부파일</div>
                                    {getAttachments(selectedPost.attachments).map((att, i) => (
                                        <a key={i} href={resolveAttachmentHref(att)} target="_blank" rel="noopener noreferrer"
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', marginBottom: '4px', textDecoration: 'none', fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
                                            <span className="material-icons" style={{ fontSize: '14px', color: '#94a3b8' }}>attach_file</span>
                                            {att.name} <span style={{ color: '#94a3b8' }}>({formatFileSize(att.size)})</span>
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* 버튼 영역 (답글 / 수정 / 삭제) */}
                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                                <button onClick={() => replyToPost(selectedPost)}
                                    style={{ height: '30px', padding: '0 12px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '6px', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span className="material-icons" style={{ fontSize: '14px' }}>reply</span> 답글 쓰기
                                </button>

                                {(isAuthor(selectedPost.author) || isAdmin) && (
                                    <button onClick={() => editPost(selectedPost)}
                                        style={{ height: '30px', padding: '0 12px', backgroundColor: 'white', color: '#1e293b', borderRadius: '6px', border: '1.5px solid #e2e8f0', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>수정</button>
                                )}
                                {(isAuthor(selectedPost.author) || isAdmin) && (
                                    <button onClick={() => deletePost(selectedPost.id)}
                                        style={{ height: '30px', padding: '0 12px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '6px', border: '1.5px solid #fecaca', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}>삭제</button>
                                )}
                            </div>

                            {/* ── 댓글 영역 ── */}
                            <div style={{ marginTop: '1.5rem', borderTop: '2px solid #e2e8f0', paddingTop: '1rem' }}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.75rem' }}>
                                    💬 댓글 {comments.length}개
                                </div>

                                {/* 댓글 목록 */}
                                {topComments.map(c => (
                                    <div key={c.id} style={{ marginBottom: '0.75rem' }}>
                                        <div style={{ padding: '0.625rem 0.75rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#1e293b' }}>{c.author}</span>
                                                    <span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>{formatFullDate(c.created_at)}</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '2px',
                                                            background: '#eff6ff', border: '1px solid #bfdbfe',
                                                            padding: '2px 8px', borderRadius: '4px', cursor: 'pointer',
                                                            fontSize: '0.6875rem', fontWeight: 800, color: '#2563eb'
                                                        }}>
                                                        <span className="material-icons" style={{ fontSize: '12px' }}>reply</span> 댓글
                                                    </button>
                                                    {(isAuthor(c.author) || isAdmin) && (
                                                        <button onClick={() => deleteComment(c.id, selectedPost.id)}
                                                            style={{
                                                                background: '#fff1f2', border: '1px solid #fecdd3',
                                                                padding: '2px 8px', borderRadius: '4px', cursor: 'pointer',
                                                                fontSize: '0.6875rem', fontWeight: 800, color: '#e11d48'
                                                            }}>삭제</button>
                                                    )}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.8125rem', color: '#334155', lineHeight: 1.6 }}>{c.content}</div>
                                        </div>

                                        {/* 답글 목록 */}
                                        {getReplies(c.id).map(r => (
                                            <div key={r.id} style={{ marginLeft: '1.5rem', marginTop: '4px', padding: '0.5rem 0.75rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>↳</span>
                                                        <span style={{ fontWeight: 700, fontSize: '0.6875rem', color: '#1e293b' }}>{r.author}</span>
                                                        <span style={{ fontSize: '0.5625rem', color: '#94a3b8' }}>{formatFullDate(r.created_at)}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button onClick={() => setReplyTo(replyTo === r.id ? null : r.id)}
                                                            style={{
                                                                background: '#f8fafc', border: '1px solid #e2e8f0',
                                                                padding: '1px 6px', borderRadius: '4px', cursor: 'pointer',
                                                                fontSize: '0.625rem', fontWeight: 700, color: '#64748b'
                                                            }}>답글</button>
                                                        {(isAuthor(r.author) || isAdmin) && (
                                                            <button onClick={() => deleteComment(r.id, selectedPost.id)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.625rem', fontWeight: 700, color: '#ef4444' }}>삭제</button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.5 }}>{r.content}</div>
                                            </div>
                                        ))}

                                        {/* 답글 입력 (부모 댓글 또는 답글에 대해) */}
                                        {replyTo === c.id && (
                                            <div style={{ marginLeft: '1.5rem', marginTop: '6px' }}>
                                                <CommentInput
                                                    placeholder="답글을 입력하세요..."
                                                    onSubmit={(text) => handleReplySubmit(text, c.id)}
                                                    onCancel={() => setReplyTo(null)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}

                                {/* 댓글 입력 */}
                                <div style={{ marginTop: '1rem' }}>
                                    <CommentInput
                                        placeholder="댓글을 입력하세요..."
                                        onSubmit={handleCommentSubmit}
                                    />
                                </div>
                            </div>
                        </div>
                    </>

                    /* ════════════════════════════════════════════ */
                    /* ── 글쓰기/수정 모드 ── */
                    /* ════════════════════════════════════════════ */
                ) : (
                    <>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '2px solid #e2e8f0', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h1 style={{ fontSize: '1.125rem', fontWeight: 900, color: '#1e293b' }}>{form.id ? '글 수정' : '새 글 작성'}</h1>
                            <button onClick={() => { setViewMode('list'); resetForm(); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#64748b', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span className="material-icons" style={{ fontSize: '16px' }}>arrow_back</span> 목록으로
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                {/* 제목 + 공지 */}
                                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', marginBottom: '0.75rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>제목</label>
                                        <input value={form.title} onChange={e => updateForm({ title: e.target.value })} placeholder="제목을 입력하세요" required
                                            style={{ width: '100%', border: '2px solid #1e293b', height: '40px', padding: '0 12px', fontWeight: 700, color: '#1e293b', outline: 'none' }} />
                                    </div>
                                    {isAdmin && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', height: '40px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, color: '#d97706', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                <input type="checkbox" checked={form.is_notice === 1} onChange={e => updateForm({ is_notice: e.target.checked ? 1 : 0 })} />
                                                📌 공지
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                <input type="checkbox" checked={form.is_popup === 1} onChange={e => updateForm({ is_popup: e.target.checked ? 1 : 0 })} />
                                                🔔 팝업 공지
                                            </label>
                                            {form.is_popup === 1 && (
                                                <select
                                                    value={form.popup_days || 1}
                                                    onChange={e => updateForm({ popup_days: Number(e.target.value) })}
                                                    style={{
                                                        height: '30px',
                                                        padding: '0 8px',
                                                        borderRadius: '6px',
                                                        border: '1.5px solid #c084fc',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        color: '#6b21a8',
                                                        backgroundColor: '#faf5ff',
                                                        outline: 'none',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {[1, 2, 3, 4, 5, 6, 7].map(day => (
                                                        <option key={day} value={day}>{day}일간</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* 관리자 전용: 대상 현장 선택 (다중 선택/제외 가능) */}
                                {isAdmin && (
                                    <TargetSiteSelector
                                        form={form}
                                        updateForm={updateForm}
                                        sites={sites}
                                    />
                                )}

                                {/* 에디터 */}
                                <div style={{ flex: 1, marginBottom: '0.75rem', minHeight: '200px' }}>
                                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>내용</label>
                                    <ReactQuill
                                        theme="snow"
                                        value={form.content}
                                        onChange={val => updateForm({ content: val })}
                                        modules={quillModules}
                                        style={{ height: '220px', marginBottom: '42px' }}
                                        placeholder="내용을 입력하세요..."
                                    />
                                </div>

                                {/* 첨부파일 */}
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.6875rem', fontWeight: 800, color: '#94a3b8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>첨부파일</label>
                                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                                    <button type="button" onClick={() => fileInputRef.current?.click()}
                                        disabled={uploadProgress.loading}
                                        style={{
                                            height: '32px', padding: '0 12px', border: '1.5px solid #e2e8f0', borderRadius: '6px',
                                            backgroundColor: uploadProgress.loading ? '#e2e8f0' : '#f8fafc',
                                            fontSize: '0.75rem', fontWeight: 700, color: uploadProgress.loading ? '#94a3b8' : '#475569',
                                            cursor: uploadProgress.loading ? 'not-allowed' : 'pointer',
                                            display: 'flex', alignItems: 'center', gap: '4px'
                                        }}>
                                        <span className="material-icons" style={{ fontSize: '14px' }}>attach_file</span>
                                        {uploadProgress.loading ? '업로드 중...' : '파일 추가'}
                                    </button>
                                    <p style={{ fontSize: '0.625rem', color: '#94a3b8', marginTop: '4px', fontWeight: 600 }}>* 최대 50MB까지 업로드 가능합니다. (한글 파일명 지원)</p>

                                    {/* 업로드 프로그레스바 */}
                                    {uploadProgress.loading && (
                                        <div style={{ marginTop: '8px', padding: '8px', backgroundColor: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '0.75rem', fontWeight: 600, color: '#0369a1' }}>
                                                <span className="material-icons" style={{ fontSize: '16px' }}>cloud_upload</span>
                                                {uploadProgress.fileName} 업로드 중...
                                            </div>
                                            <div style={{ width: '100%', height: '6px', backgroundColor: '#e0f2fe', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${uploadProgress.percent}%`,
                                                    height: '100%',
                                                    backgroundColor: '#0ea5e9',
                                                    borderRadius: '3px',
                                                    transition: 'width 0.3s ease'
                                                }} />
                                            </div>
                                        </div>
                                    )}

                                    {getAttachments(form.attachments).map((att, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', padding: '4px 8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.75rem', color: '#475569', fontWeight: 600 }}>
                                            <span className="material-icons" style={{ fontSize: '14px', color: '#94a3b8' }}>attach_file</span>
                                            {att.name} <span style={{ color: '#94a3b8' }}>({formatFileSize(att.size)})</span>
                                            <button type="button" onClick={() => removeAttachment(i)}
                                                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.625rem', fontWeight: 700 }}>✕</button>
                                        </div>
                                    ))}
                                </div>

                                {/* 버튼 */}
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <button type="button" onClick={() => { setViewMode('list'); resetForm(); }}
                                        disabled={uploadProgress.loading}
                                        style={{
                                            flex: 1, height: '48px', borderRadius: '12px', border: '1.5px solid #e2e8f0',
                                            backgroundColor: uploadProgress.loading ? '#f1f5f9' : 'white',
                                            fontWeight: 800, fontSize: '0.9375rem',
                                            color: uploadProgress.loading ? '#94a3b8' : '#64748b',
                                            cursor: uploadProgress.loading ? 'not-allowed' : 'pointer'
                                        }}>
                                        {uploadProgress.loading ? '업로드 중...' : '취소'}
                                    </button>
                                    <button type="submit"
                                        disabled={uploadProgress.loading}
                                        style={{
                                            flex: 2, height: '48px', borderRadius: '12px', border: 'none',
                                            backgroundColor: uploadProgress.loading ? '#64748b' : '#1e293b',
                                            color: 'white', fontWeight: 900, fontSize: '1rem',
                                            cursor: uploadProgress.loading ? 'not-allowed' : 'pointer',
                                            boxShadow: '0 4px 12px rgba(30,41,59,0.2)',
                                            opacity: uploadProgress.loading ? 0.7 : 1
                                        }}>
                                        {uploadProgress.loading ? '파일 업로드 중...' : (form.id ? '수정하기' : '게시하기')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </>
                )}
            </div>
    );
};

export default BoardView;
