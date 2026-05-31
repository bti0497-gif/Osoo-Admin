import React, { lazy } from 'react';
import { DEFAULT_TAB, MENU_ITEMS } from './constants';

// ============================================
// View 컴포넌트 Lazy Imports
// ============================================
const MemberManagementView = lazy(() => import('../features/members/index.jsx').then((m) => ({ default: m.MemberManagementView })));
const BoardView = lazy(() => import('../features/board').then((m) => ({ default: m.BoardView })));
const CertificateView = lazy(() => import('../features/certificate').then((m) => ({ default: m.CertificateView })));
const NewPdfParserView = lazy(() => import('../features/certificate/pdf-parser/components/NewPdfParserView'));
const WaterQualityQueryView = lazy(() => import('../features/certificate/water-quality-query/components/WaterQualityQueryView'));
const TemplateManagerView = lazy(() => import('../features/gyeonggi-reports/TemplateManagerView'));
const TemplateBuilderView = lazy(() => import('../features/gyeonggi-reports/TemplateBuilderView'));
const AttendanceDashboardView = lazy(() => import('../features/attendance').then((m) => ({ default: m.AttendanceDashboardView })));

// ============================================
// 워크스페이스 레지스트리
// ============================================
export const WORKSPACE_REGISTRY = {
  members: {
    render: ({ currentUser }) => React.createElement(MemberManagementView, { currentUser }),
    helpText: '회원 및 현장 정보를 조회, 등록, 수정, 삭제합니다.'
  },
  data_admin: {
    render: ({ currentUser }) => React.createElement('div', null, '데이터관리 워크스페이스'),
    helpText: 'BigQuery 운영 테이블을 조회, 필터링, 수정, 삭제합니다.'
  },
  board: {
    render: ({ currentUser }) => React.createElement(BoardView, { currentUser }),
    helpText: '공지사항 및 소통 게시판을 관리합니다.'
  },
  certificate: {
    render: ({ currentUser, onTabChange }) => React.createElement(CertificateView, { currentUser, onTabChange }),
    helpText: '성적서를 조회, 업로드, 다운로드합니다.'
  },
  pdf_parser: {
    render: () => React.createElement(NewPdfParserView),
    helpText: 'AI로 수질성적서를 파싱하고 Drive/BigQuery에 업로드합니다.'
  },
  water_quality_query: {
    render: () => React.createElement(WaterQualityQueryView),
    helpText: 'BigQuery에 저장된 수질데이터를 월별/현장별로 조회합니다.'
  },
  gyeonggi_reports: {
    render: () => React.createElement('div', null, '경기대 요구 자료 작성 메인 화면'),
    helpText: '경기대 요구 자료 작성 메뉴를 선택하세요.'
  },
  template_manager: {
    render: () => React.createElement(TemplateManagerView),
    helpText: '양식 파일을 관리하고 추가/삭제합니다.'
  },
  template_builder: {
    render: () => React.createElement(TemplateBuilderView),
    helpText: '양식을 선택하고 BigQuery 데이터를 바인딩해 문서를 생성합니다.'
  },
  attendance_dashboard: {
    render: () => React.createElement(AttendanceDashboardView),
    helpText: '전국 현장관리자 출결현황을 조회합니다.'
  },
};

// ============================================
// 헬퍼 함수
// ============================================
export const getWorkspace = (workspaceId) => WORKSPACE_REGISTRY[workspaceId] || WORKSPACE_REGISTRY[DEFAULT_TAB];

export const getWorkspaceMenuMeta = (workspaceId) => 
  MENU_ITEMS.find((menu) => menu.workspaceId === workspaceId || menu.id === workspaceId) || null;

// ============================================
// 레지스트리 검증
// ============================================
export const validateWorkspaceRegistry = () => {
  const errors = [];
  
  // 모든 메뉴에 대응하는 workspace가 있는지 확인
  const missingWorkspaces = MENU_ITEMS
    .filter((menu) => menu.workspaceId && !WORKSPACE_REGISTRY[menu.workspaceId])
    .map((menu) => `workspaceId 연결 누락: ${menu.id} -> ${menu.workspaceId}`);
  
  // 모든 workspace가 메뉴에 등록되어 있는지 확인
  const registeredWorkspaceIds = new Set(MENU_ITEMS.map(m => m.workspaceId).filter(Boolean));
  const orphanedWorkspaces = Object.keys(WORKSPACE_REGISTRY)
    .filter((id) => !registeredWorkspaceIds.has(id) && id !== 'myinfo')
    .map((id) => `orphaned workspace: ${id}`);
  
  errors.push(...missingWorkspaces, ...orphanedWorkspaces);
  
  if (errors.length > 0) {
    console.warn('[WorkspaceRegistry]', errors.join('\n'));
  }
  
  return errors;
};

// 초기 검증 실행
validateWorkspaceRegistry();
