/**
 * 깃허브 Releases 릴리즈용 (Full Release Bundle) electron-builder 설정
 * - 버전: 1.0.1 (현장 1.0.0 설치본 구동 시 최신 패치로 자동 업그레이드됨)
 * - 출력 경로: release/github
 * - GitHub Releases 연동 (provider: 'github')
 */
module.exports = {
  appId: 'com.osoo.admin-app',
  productName: 'Admin Only',
  extraMetadata: {
    version: '1.0.1'
  },
  npmRebuild: false,
  nodeGypRebuild: false,
  directories: {
    output: 'release/github',
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
  asarUnpack: [
    'server.cjs',
    'server/**/*',
    '.env.local'
  ],
  win: {
    executableName: 'Admin Only',
    target: [
      { target: 'nsis', arch: ['x64'] }
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
    artifactName: 'Admin-Only-Setup-${version}.${ext}',
  },
  publish: {
    provider: 'github',
    owner: 'bti0497-gif',
    repo: 'Osoo-Admin'
  },
};
