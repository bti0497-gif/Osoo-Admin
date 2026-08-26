import React, { lazy } from 'react';
import { DEFAULT_TAB, MENU_ITEMS } from './constants';

// ============================================
// View 컴포넌트 Lazy Imports
// ============================================
const MemberManagementView = lazy(() => import('../features/members/index.jsx').then((m) => ({ default: m.MemberManagementView })));
const BoardView = lazy(() => import('../features/board').then((m) => ({ default: m.BoardView })));
const CertificateView = lazy(() => import('../features/certificate').then((m) => ({ default: m.CertificateView })));
const CertificateUploadView = lazy(() => import('../features/certificate/upload/components/CertificateUploadView').then((m) => ({ default: m.CertificateUploadView })));
const NewPdfParserView = lazy(() => import('../features/certificate/pdf-parser/components/NewPdfParserView').then((m) => ({ default: m.NewPdfParserView })));
const ManualMatchingView = lazy(() => import('../features/certificate/pdf-parser/components/ManualMatchingView').then((m) => ({ default: m.ManualMatchingView })));
const WaterQualityQueryView = lazy(() => import('../features/certificate/water-quality-query/components/WaterQualityQueryView'));
const WaterQualityListView = lazy(() => import('../features/certificate/water-quality-list/components/WaterQualityListView'));
const TemplateManagerView = lazy(() => import('../features/gyeonggi-reports/TemplateManagerView'));
const TemplateBuilderView = lazy(() => import('../features/gyeonggi-reports/TemplateBuilderView'));
const GyeonggiMonthlyReportView = lazy(() => import('../features/gyeonggi-reports/monthly-report/GyeonggiMonthlyReportView'));
const AttendanceDashboardView = lazy(() => import('../features/attendance').then((m) => ({ default: m.AttendanceDashboardView })));
const PeriodReportView = lazy(() => import('../features/period-report/PeriodReportView').then((m) => ({ default: m.PeriodReportView })));
const SitePhotoExportView = lazy(() => import('../features/photo-export/SitePhotoExportView').then((m) => ({ default: m.SitePhotoExportView })));
const TaxInvoiceManagerView = lazy(() => import('../features/settlement/TaxInvoiceManagerView').then((m) => ({ default: m.TaxInvoiceManagerView })));
const DepositReceiptManagerView = lazy(() => import('../features/settlement/DepositReceiptManagerView').then((m) => ({ default: m.DepositReceiptManagerView })));
const MonthlySettlementAutoView = lazy(() => import('../features/settlement/MonthlySettlementAutoView').then((m) => ({ default: m.MonthlySettlementAutoView })));

// ============================================
// 워크스페이스 레지스트리
// ============================================
export const WORKSPACE_REGISTRY = {
  members: {
    render: ({ currentUser }) => React.createElement(MemberManagementView, { currentUser }),
    helpText: '회원 및 현장 정보를 조회, 등록, 수정, 삭제합니다.'
  },
  data_admin: {
    render: ({ currentUser }) => React.createElement(SitePhotoExportView, { currentUser }),
    helpText: '현장별 월정산 사진(실험사진, 슬러지반출, 청소필증, 약품입고, 키트입고)을 바탕화면에 현장명 폴더로 일괄 다운로드합니다.'
  },
  settlement: {
    render: () => React.createElement('div', null, '정산 관리 메뉴를 선택하세요.'),
    helpText: '정산 관리 메뉴를 선택하세요.'
  },
  tax_invoice_mgr: {
    render: () => React.createElement(TaxInvoiceManagerView),
    helpText: '계산서(매입/매출) 파일의 공백을 자르고 현장별로 3열 고속 매칭합니다.'
  },
  deposit_receipt_mgr: {
    render: () => React.createElement(DepositReceiptManagerView),
    helpText: 'A4 1페이지 4분할 입금표 파일의 공백을 자르고 거래처 및 현장별로 3열 고속 매칭합니다.'
  },
  monthly_settlement_auto: {
    render: () => React.createElement(MonthlySettlementAutoView),
    helpText: '수집된 일일점검, QnTech 키트수질, 성적서 데이터를 기반으로 5대 현장별 월정산 엑셀 파일을 자동 작성합니다.'
  },
  board: {
    render: ({ currentUser }) => React.createElement(BoardView, { currentUser }),
    helpText: '공지사항 및 소통 게시판을 관리합니다.'
  },
  certificate: {
    render: ({ currentUser, onTabChange }) => React.createElement(CertificateView, { currentUser, onTabChange }),
    helpText: '성적서를 조회, 업로드, 다운로드합니다.'
  },
  excel_upload: {
    render: () => React.createElement(CertificateUploadView),
    helpText: '엑셀(수치→BigQuery) 파일을 업로드합니다.'
  },
  pdf_parser: {
    render: () => React.createElement(ManualMatchingView),
    helpText: 'PDF 성적서를 현장별로 수동 매칭하여 Drive에 업로드합니다.'
  },
  water_quality_list: {
    render: () => React.createElement(WaterQualityListView),
    helpText: '업로드된 수질 성적서 목록을 조회하고 삭제/다운로드합니다.'
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
  period_report: {
    render: () => React.createElement(PeriodReportView),
    helpText: '지정한 기간 동안의 전국 현장 유량, 약품사용량 및 수질 5대 항목 데이터를 엑셀 보고서로 추출합니다.'
  },
  gyeonggi_monthly_report: {
    render: () => React.createElement(GyeonggiMonthlyReportView),
    helpText: '경기대 요구 양식(월운영보고서.xlsx)에 월별 데이터를 현장별 시트로 바인딩해 출력합니다.'
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
