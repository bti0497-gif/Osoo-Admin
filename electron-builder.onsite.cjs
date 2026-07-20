/**
 * 현장 최초 설치용 (Seed / On-site Installer) electron-builder 설정
 * - 버전: 1.0.0 (깃허브 Releases 릴리즈 v1.0.1 자동 업그레이드 유도용)
 * - 출력 경로: release/onsite
 * - 로컬 자격증명 키 (.env.local, client_secret*.json, firebase/bigquery key 등) 포함
 */
module.exports = {
  appId: 'com.osoo.admin-app',
  productName: 'Admin Only',
  extraMetadata: {
    version: '1.0.0'
  },
  npmRebuild: false,
  nodeGypRebuild: false,
  directories: {
    output: 'release/onsite',
    buildResources: 'build',
  },
  files: [
    'dist/**/*',
    'server/**/*',
    'server.cjs',
    'start.cjs',
    'electron/**/*',
    'scripts/**/*',
    'templates/**/*',
    'node_modules/**/*',
    'package.json',
    '.env.local',
  ],
  extraResources: [
    { from: 'templates', to: 'templates' },
    { from: 'scripts', to: 'scripts' },
  ],
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'dir', arch: ['x64'] }
    ],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'public/icon.ico',
    uninstallerIcon: 'public/icon.ico',
    installerHeaderIcon: 'public/icon.ico',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Admin Only',
  },
  publish: {
    provider: 'github',
    owner: 'bti0497-gif',
    repo: 'Osoo-Admin',
  },
};
