/* global module */
/**
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  appId: 'com.osoo.admin-app',
  productName: 'Osoo Admin App',
  directories: {
    output: 'release',
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
      { target: 'dir', arch: ['x64'] },
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
    shortcutName: 'Osoo Admin App',
  },
  publish: null,
};
