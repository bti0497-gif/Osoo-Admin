# 현장관리자 앱(Field Manager App) 팝업 공지 트레이 실시간 알림 기능 개발 사양서

## 1. 개요 및 목적
중앙관리자 앱에서 등록한 **'팝업 공지(`is_popup = true`)'**를 현장관리자 앱이 트레이(백그라운드) 상태에 있거나 다른 화면을 작업 중이더라도 놓치지 않고 수신할 수 있도록 **윈도우 시스템 토스트 알림(Windows Notification) 및 클릭 시 앱 자동 복원 팝업 기능**을 구현하는 사양서입니다.

---

## 2. 주요 기능 및 UI/UX 요구사항

1. **윈도우 시스템 토스트 알림 (Windows System Notification)**
   - 현장관리자 앱이 트레이로 최소화되어 있거나 다른 프로그램 작업 중일 때, 중앙 팝업 공지가 새로 등록되면 윈도우 우측 하단(시계 위)에 소리와 함께 알림창이 팝업됩니다.
   - **알림 제목**: `🚨 [중앙 긴급 공지]`
   - **알림 본문**: `[공지 제목] - 클릭하여 내용을 확인하세요.`

2. **알림 클릭 시 자동 창 복원 및 팝업 모달 표출**
   - 현장근무자가 윈도우 우측 하단 토스트 알림을 클릭하면, 트레이에 숨어있던 현장관리자 앱 메인 윈도우가 **즉시 최상단으로 복원(`show()` & `focus()`)**되며 해당 팝업 공지창이 화면 중앙에 표출됩니다.

3. **피로도 방지 (하루 동안 보지 않기)**
   - 팝업창 하단에 `[오늘 하루 보지 않기]` 버튼이 제공됩니다.
   - 닫기 클릭 시 해당 공지 ID와 날짜가 `localStorage`에 기록되어, 당일(24시간) 동안은 앱을 껐다 켜거나 재접속해도 해당 공지 팝업이 다시 뜨지 않습니다.

4. **중복 알림 방지**
   - 이미 수신/확인한 팝업 공지 ID는 로컬 큐(`seenPopupIds`)에 저장하여 3분 주기 백그라운드 감지 시 동일한 공지 알림이 지속적으로 다시 울리지 않도록 합니다.

---

## 3. 구체적인 소스코드 구현 가이드

### 3.1. 일렉트론 메인 프로세스 (`electron/main.cjs`)

```javascript
const { app, BrowserWindow, ipcMain, Notification } = require('electron');

// 1. 윈도우 창 복원 및 알림 생성 IPC 핸들러
ipcMain.handle('notification:showPopupNotice', (_event, { id, title, content }) => {
  if (!Notification.isSupported()) return { success: false, reason: 'Notification not supported' };

  const notification = new Notification({
    title: `🚨 [중앙 긴급 공지]`,
    body: title || '새로운 중요 공지가 등록되었습니다.',
    icon: path.join(__dirname, '../build/icon.png'), // 앱 아이콘 경로
    silent: false,
  });

  // 알림 클릭 시 앱 창 복원 및 해당 팝업으로 포커스
  notification.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      // 프론트엔드에 특정 팝업 열기 이벤트 전달
      mainWindow.webContents.send('popup:openModal', { id, title, content });
    }
  });

  notification.show();
  return { success: true };
});

// 2. 창 강제 표시 IPC 핸들러
ipcMain.handle('app:focusWindow', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
```

---

### 3.2. 일렉트론 프리로드 (`electron/preload.cjs`)

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 기존 API...
  showPopupNotification: (data) => ipcRenderer.invoke('notification:showPopupNotice', data),
  focusWindow: () => ipcRenderer.invoke('app:focusWindow'),
  onOpenPopupModal: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('popup:openModal', subscription);
    return () => ipcRenderer.removeListener('popup:openModal', subscription);
  }
});
```

---

### 3.3. 프론트엔드 백그라운드 팝업 감지 훅 (`src/hooks/usePopupNoticeWatcher.js`)

```javascript
import { useEffect, useRef, useState } from 'react';

export function usePopupNoticeWatcher(currentUser) {
  const [activePopup, setActivePopup] = useState(null);
  const seenIdsRef = useRef(new Set());

  useEffect(() => {
    if (!currentUser) return;

    // 1. 유효 팝업 공지 조회 함수
    const checkPopupNotices = async () => {
      try {
        const res = await fetch('/api/board/posts?is_popup=1');
        const data = await res.json();
        if (!data.success || !Array.isArray(data.data)) return;

        const now = new Date();
        const validPopups = data.data.filter(post => {
          if (!post.is_popup) return false;
          // 오늘 하루 보지 않기 여부 체크 (localStorage)
          const hideUntil = localStorage.getItem(`hide_popup_${post.id}`);
          if (hideUntil && new Date(hideUntil) > now) return false;
          return true;
        });

        if (validPopups.length > 0) {
          const targetPopup = validPopups[0]; // 가장 최신 팝업

          // 아직 알림을 보내지 않은 새 팝업인 경우 윈도우 시스템 알림 발송
          if (!seenIdsRef.current.has(targetPopup.id)) {
            seenIdsRef.current.add(targetPopup.id);
            setActivePopup(targetPopup);

            if (window.electronAPI?.showPopupNotification) {
              window.electronAPI.showPopupNotification({
                id: targetPopup.id,
                title: targetPopup.title,
                content: targetPopup.content
              });
            }
          }
        }
      } catch (err) {
        console.error('[PopupWatcher] Check error:', err);
      }
    };

    // 최초 1회 즉시 실행 + 3분 주기 감지
    checkPopupNotices();
    const interval = setInterval(checkPopupNotices, 3 * 60 * 1000);

    // 2. 알림 클릭 수신 시 팝업 즉시 노출
    const cleanup = window.electronAPI?.onOpenPopupModal?.((popupData) => {
      setActivePopup(popupData);
    });

    return () => {
      clearInterval(interval);
      if (cleanup) cleanup();
    };
  }, [currentUser]);

  // 오늘 하루 보지 않기 처리 함수
  const dismissToday = (popupId) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // 다음날 0시까지 숨김
    localStorage.setItem(`hide_popup_${popupId}`, tomorrow.toISOString());
    setActivePopup(null);
  };

  return { activePopup, setActivePopup, dismissToday };
}
```

---

## 4. 데이터베이스 및 API 검증 기준
- 게시글 컬럼: `is_popup = TRUE`, `popup_expires_at > CURRENT_TIMESTAMP()`
- API 엔드포인트: `GET /api/board/posts` (팝업 공지 목록 반환)

---
**작성일**: 2026-07-27  
**적용 대상**: 현장관리자 앱 (Osoo Field Manager App / Electron)
