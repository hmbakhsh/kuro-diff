// electron-builder afterPack hook — flips Electron Fuses on the packaged app,
// then re-signs ad-hoc on ARM64 local builds so the binary stays runnable
// before Developer ID signing happens in CI.
const path = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async function afterPack(context) {
  const ext = { darwin: '.app', win32: '.exe', linux: '' }[context.electronPlatformName]
  const electronBinaryPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}${ext}`,
  )

  await flipFuses(electronBinaryPath, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature:
      context.electronPlatformName === 'darwin' && context.arch === 3, // Arch.arm64 = 3
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  })
}
