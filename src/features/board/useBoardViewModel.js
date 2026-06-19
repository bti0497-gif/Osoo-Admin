import { useState, useEffect, useCallback } from 'react';
import { BoardModel } from './BoardModel';
import { MemberModel } from '../members/MemberModel';

const toTimestampMs = (value) => {
    if (!value) return 0;

    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isNaN(ms) ? 0 : ms;
    }

    if (typeof value === 'string' || typeof value === 'number') {
        const ms = new Date(value).getTime();
        return Number.isNaN(ms) ? 0 : ms;
    }

    if (typeof value === 'object') {
        if (typeof value.value === 'string' || typeof value.value === 'number') {
            const ms = new Date(value.value).getTime();
            return Number.isNaN(ms) ? 0 : ms;
        }
        if (typeof value.timestampValue === 'string') {
            const ms = new Date(value.timestampValue).getTime();
            return Number.isNaN(ms) ? 0 : ms;
        }
        if (typeof value.seconds === 'number') {
            const nanos = typeof value.nanos === 'number' ? value.nanos : 0;
            return value.seconds * 1000 + Math.floor(nanos / 1_000_000);
        }
    }

    return 0;
};

export const useBoardViewModel = (currentUser, { showAlert, showConfirm } = {}) => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedPost, setSelectedPost] = useState(null);
    const [comments, setComments] = useState([]);
    const [form, setForm] = useState({ title: '', content: '', is_notice: 0, attachments: '', parent_id: null, target_site: '' });
    const [sites, setSites] = useState([]); // 현장 목록 (관리자용 글쓰기)
    const postsPerPage = 10;

    const getReplyParentPost = (parentId) => {
        return posts.find(p => p.id === parentId);
    };

    const replyToPost = (parentPost) => {
        setForm({
            title: `[답글] ${parentPost.title}`,
            content: '',
            is_notice: 0,
            attachments: '',
            parent_id: parentPost.id
        });
        setViewMode('form');
    };

    /**
     * [CRITICAL] 게시글 정렬 로직
     * 1. 공지글 스레드 (is_notice=1인 글 + 그 답글들) - 최상단 고정
     *    - 공지글 먼저 (created_at DESC)
     *    - 그 답글들 (created_at ASC)
     * 2. 일반글 스레드 - 공지글 아래에 일반 순서로 표시 (lastActivity DESC)
     *
     * WARNING: 공지글 체크 해제 시 해당 글은 일반 스레드로 이동됨
     */
    const sortThreadedPosts = (data) => {
        // 모든 게시글을 맵으로 저장 (공지글 답글 찾기 위해)
        const allPostMap = {};
        data.forEach(p => { allPostMap[p.id] = p; });

        // Root ID와 현재 게시글의 깊이(Depth), 그리고 루트가 공지글인지 찾는 함수
        // is_notice는 true, 1, '1' 등 다양한 형식일 수 있음
        const isNoticeValue = (val) => val === true || val === 1 || val === '1' || val === 'true';

        const getThreadInfo = (post) => {
            let current = post;
            let depth = 0;
            let visited = new Set();
            while (current.parent_id && allPostMap[current.parent_id] && !visited.has(current.parent_id)) {
                visited.add(current.id);
                current = allPostMap[current.parent_id];
                depth++;
            }
            return { rootId: current.id, depth, isNoticeThread: isNoticeValue(current.is_notice) };
        };

        // 공지글 스레드와 일반 스레드 분리
        const noticeThreads = {};  // 공지글 스레드 (is_notice=1인 루트)
        const regularThreads = {}; // 일반 스레드

        data.forEach(p => {
            const { rootId, depth, isNoticeThread } = getThreadInfo(p);
            p.depth = depth;

            if (isNoticeThread) {
                if (!noticeThreads[rootId]) noticeThreads[rootId] = { items: [], rootCreatedAt: 0 };
                noticeThreads[rootId].items.push(p);
                if (!p.parent_id) {
                    noticeThreads[rootId].rootCreatedAt = toTimestampMs(p.created_at);
                }
            } else {
                if (!regularThreads[rootId]) regularThreads[rootId] = { items: [], lastActivity: 0 };
                regularThreads[rootId].items.push(p);
            }
        });

        // 공지글 스레드 정렬: 공지글 최신순, 답글은 생성일순
        const sortedNoticePosts = [];
        const sortedNoticeThreadList = Object.values(noticeThreads)
            .sort((a, b) => b.rootCreatedAt - a.rootCreatedAt);

        sortedNoticeThreadList.forEach(thread => {
            // 공지글 먼저
            const rootPost = thread.items.find(p => !p.parent_id);
            if (rootPost) sortedNoticePosts.push(rootPost);

            // 답글들은 생성일순
            const replies = thread.items.filter(p => p.parent_id)
                .sort((a, b) => toTimestampMs(a.created_at) - toTimestampMs(b.created_at));
            sortedNoticePosts.push(...replies);
        });

        // 일반 스레드 정렬: 최근 활동 순
        const sortedRegularPosts = [];
        const regularThreadList = Object.keys(regularThreads).map(rootId => {
            const thread = regularThreads[rootId];
            const lastActivity = thread.items.reduce((max, curr) => {
                const currTime = toTimestampMs(curr.created_at);
                return currTime > max ? currTime : max;
            }, 0);
            return { rootId, items: thread.items, lastActivity };
        });

        regularThreadList.sort((a, b) => b.lastActivity - a.lastActivity);

        regularThreadList.forEach(t => {
            const flatten = (parentId = null) => {
                const children = t.items.filter(item =>
                    (item.parent_id === parentId || (!parentId && !item.parent_id && !sortedRegularPosts.includes(item)))
                );
                children.sort((a, b) => toTimestampMs(a.created_at) - toTimestampMs(b.created_at));
                children.forEach(child => {
                    if (!sortedRegularPosts.includes(child)) {
                        sortedRegularPosts.push(child);
                        flatten(child.id);
                    }
                });
            };
            flatten();
        });

        return [...sortedNoticePosts, ...sortedRegularPosts];
    };

    const loadPosts = useCallback(async () => {
        try {
            setLoading(true);
            const data = await BoardModel.fetchPosts(currentUser);
            const sortedData = sortThreadedPosts(data);
            setPosts(sortedData);
        } catch (error) {
            console.error('Failed to view post:', error);
            showAlert?.('게시글을 불러올 수 없습니다.');
        } finally {
            setLoading(false);
        }
    }, [currentUser, showAlert]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    // 현장 목록 로드 (관리자용)
    const loadSites = useCallback(async () => {
        try {
            const data = await MemberModel.fetchSites();
            setSites(data.sites || []);
        } catch (error) {
            console.error('Failed to load sites:', error);
        }
    }, []);

    useEffect(() => { loadSites(); }, [loadSites]);

    const updateForm = (patch) => setForm(prev => ({ ...prev, ...patch }));

    const submitPost = async () => {
        try {
            const postPayload = {
                ...form,
                author: currentUser?.name || '익명'
            };
            await BoardModel.savePost(postPayload, currentUser);

            showAlert?.('저장 완료');
            await loadPosts();
            resetForm();
            setViewMode('list');
            return { success: true };
        } catch (err) {
            console.error(err);
            showAlert?.('저장 실패: ' + err.message);
        }
        return { success: false };
    };

    const deletePost = async (id) => {
        const confirmed = await showConfirm?.('게시글을 삭제하시겠습니까?');
        if (!confirmed) return;
        try {
            await BoardModel.deletePost(id, currentUser);
            showAlert?.('삭제 완료');
            await loadPosts();
            setViewMode('list');
            setSelectedPost(null);
        } catch (err) {
            console.error(err);
            showAlert?.('삭제 실패: ' + err.message);
        }
    };

    const viewPost = async (post) => {
        try {
            const detail = await BoardModel.fetchPost(post.id, currentUser);
            if (!detail) {
                showAlert?.('게시글을 찾을 수 없습니다.');
                return;
            }
            setSelectedPost(detail);
            setViewMode('detail');
            loadComments(post.id);
        } catch (err) {
            console.error('[viewPost] Error:', err);
            showAlert?.('게시글을 불러올 수 없습니다: ' + (err.message || '권한이 없거나 존재하지 않는 게시글입니다.'));
        }
    };

    const editPost = (post) => {
        setForm({
            id: post.id,
            title: post.title,
            content: post.content,
            is_notice: post.is_notice || 0,
            attachments: post.attachments || '',
            parent_id: post.parent_id || null,
            target_site: post.target_site || ''
        });
        setViewMode('form');
    };

    const resetForm = () => {
        setForm({ title: '', content: '', is_notice: 0, attachments: '', parent_id: null, target_site: '' });
        setSelectedPost(null);
        setComments([]);
    };

    // Comments
    const loadComments = async (postId) => {
        try {
            const data = await BoardModel.fetchComments(postId, currentUser);
            setComments(data);
        } catch (err) {
            console.error('Failed to load comments:', err);
        }
    };

    const submitComment = async (postId, content, parentId) => {
        try {
            const commentData = {
                content,
                author: currentUser?.name || '익명',
                parent_id: parentId || null
            };
            await BoardModel.saveComment(postId, commentData, currentUser);

            await loadComments(postId);
        } catch (err) {
            console.error(err);
            showAlert?.('댓글 저장 실패: ' + err.message);
        }
    };

    const deleteComment = async (commentId, postId) => {
        try {
            await BoardModel.deleteComment(commentId, currentUser);
            await loadComments(postId);
        } catch (err) {
            console.error(err);
            showAlert?.('댓글 삭제 실패: ' + err.message);
        }
    };

    // File upload
    const uploadFile = async (file, options = {}) => {
        try {
            return await BoardModel.uploadFile(file, options);
        } catch (err) {
            console.error('File Upload Error:', err);
            showAlert?.('파일 업로드 실패: ' + err.message);
            return null;
        }
    };

    // Filter and Pagination
    const filteredPosts = posts.filter(p =>
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.author.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
    const currentPosts = filteredPosts.slice(
        (currentPage - 1) * postsPerPage,
        currentPage * postsPerPage
    );

    return {
        posts: currentPosts,
        allPostsCount: filteredPosts.length,
        loading,
        form,
        updateForm,
        submitPost,
        deletePost,
        viewPost,
        editPost,
        replyToPost,
        getReplyParentPost,
        selectedPost,
        comments,
        submitComment,
        deleteComment,
        uploadFile,
        sites, // 현장 목록 (관리자용 글쓰기)
        viewMode,
        setViewMode,
        searchTerm,
        setSearchTerm,
        currentPage,
        setCurrentPage,
        totalPages,
        resetForm,
        loadPosts
    };
};
