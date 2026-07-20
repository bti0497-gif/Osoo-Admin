/**
 * Temporary CommonJS wrapper for electron-builder execution in a type:module package.
 * Keep this in sync with electron-builder.config.js until the main config is migrated.
 */
module.exports = {
  appId: 'com.osoo.admin-app',
  productName: 'Admin Only',
  npmRebuild: false,
  nodeGypRebuild: false,
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
    { from: '.env.local', to: '.env.local' },
  ],
  asarUnpack: [
    'server.cjs',
    'server/**/*',
    '.env.local'
  ],
  win: {
    executableName: 'Admin Only',
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
    artifactName: 'Admin-Only-Setup-${version}.${ext}',
  },
  publish: {
    provider: 'github',
    owner: 'bti0497-gif',
    repo: 'Osoo-Admin',
  },
};