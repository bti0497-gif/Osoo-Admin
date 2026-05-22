/**
 * 앱 전역 상수 정의
 * 메뉴 구조, 탭 라벨 등 여러 컴포넌트에서 공유하는 값들을 한 곳에서 관리합니다.
 */

export const APP_TARGETS = {
  FIELD_APP: 'field-app',
  ADMIN_APP: 'admin-app',
  SHARED_BEFORE_SPLIT: 'shared-before-split'
};

export const ADMIN_ROLES = ['admin', 'group_admin'];

export const MENU_REGISTRY = [
  { id: 'members', label: '회원 및 현장 관리', icon: 'admin_panel_settings', appTarget: APP_TARGETS.ADMIN_APP, workspaceId: 'members', displayOrder: 10 },
  { id: 'data_admin', label: '데이터관리', icon: 'folder', appTarget: APP_TARGETS.ADMIN_APP, workspaceId: 'data_admin', displayOrder: 20 },
  { id: 'board', label: '소통게시판', icon: 'forum', appTarget: APP_TARGETS.ADMIN_APP, workspaceId: 'board', displayOrder: 30 },
  { id: 'certificate', label: '성적서', icon: 'description', appTarget: APP_TARGETS.ADMIN_APP, workspaceId: 'certificate', displayOrder: 40,
    children: [
      { id: 'pdf_parser', label: 'PDF 파서', workspaceId: 'pdf_parser', appTarget: APP_TARGETS.ADMIN_APP },
    ]
  },
  { id: 'gyeonggi_reports', label: '경기대 요구 자료 작성', icon: 'school', appTarget: APP_TARGETS.ADMIN_APP, workspaceId: 'gyeonggi_reports', displayOrder: 50,
    children: [
      { id: 'template_manager', label: '양식관리', workspaceId: 'template_manager', appTarget: APP_TARGETS.ADMIN_APP },
      { id: 'template_builder', label: '양식만들기', workspaceId: 'template_builder', appTarget: APP_TARGETS.ADMIN_APP },
    ]
  },
];

export const ADMIN_MENU_REGISTRY = [];

const flattenMenus = (menus) => menus.flatMap((menu) => [menu, ...(menu.children || [])]);

export const MENUS = MENU_REGISTRY;
export const ADMIN_MENUS = ADMIN_MENU_REGISTRY;

export const MENU_ITEMS = flattenMenus([...MENU_REGISTRY, ...ADMIN_MENU_REGISTRY]);

export const TAB_LABELS = {
  ...Object.fromEntries(MENU_ITEMS.map((menu) => [menu.id, menu.label])),
  data_admin: '데이터관리',
  myinfo: '내 정보 수정',
};

export const DEFAULT_TAB = 'members';

/** 현장근무자(user) 자동 퇴근·강제 로그아웃 기준 시각 (한국 시간, 시 단위) */
export const FIELD_WORKER_AUTO_LOGOUT_HOUR_KST = 20;

export const isAdminRole = (role) => ADMIN_ROLES.includes(role);

export const getMenuLabel = (menuId) => TAB_LABELS[menuId] || TAB_LABELS[DEFAULT_TAB];

export const validateMenuRegistry = (menus = [...MENU_REGISTRY, ...ADMIN_MENU_REGISTRY]) => {
  const ids = new Set();
  const errors = [];

  const visit = (menu) => {
    if (!menu.id) errors.push('메뉴 id가 비어 있습니다.');
    if (ids.has(menu.id)) errors.push(`중복 메뉴 id: ${menu.id}`);
    ids.add(menu.id);

    if (!menu.label) errors.push(`메뉴 label이 비어 있습니다: ${menu.id}`);
    if (!menu.children?.length && !menu.workspaceId) {
      errors.push(`leaf 메뉴에 workspaceId가 없습니다: ${menu.id}`);
    }

    (menu.children || []).forEach(visit);
  };

  menus.forEach(visit);
  return errors;
};

export const getTodayKST = () => {
  const kstDate = new Date(new Date().getTime() + (9 * 60 * 60 * 1000));
  return kstDate.toISOString().split('T')[0];
};

export const getToday = () => new Date().toISOString().split('T')[0];
