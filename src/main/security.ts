import { session } from 'electron'

/**
 * Install CSP via onHeadersReceived. Must be called after `app.whenReady()`,
 * NOT before — see electron/electron#42000 for the pre-ready silent crash.
 *
 * The dev relaxation is gated on ELECTRON_RENDERER_URL (set by electron-vite
 * dev server), NOT on `is.dev` / `!app.isPackaged`. That way running the built
 * bundle locally (unpackaged but not serving HMR) still enforces the strict
 * production CSP.
 */
export function installContentSecurityPolicy(): void {
  const directives: Record<string, string[]> = {
    'default-src': ["'none'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
    'connect-src': ["'self'", 'https://api.github.com'],
    'font-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'none'"],
  }

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    // Vite dev server + HMR require eval for source maps and ws for reload.
    directives['script-src']!.push("'unsafe-eval'")
    directives['connect-src']!.push('ws:', 'http://localhost:*', 'ws://localhost:*')
    directives['style-src']!.push('http://localhost:*')
  }

  const policy = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    })
  })
}

/**
 * Block any attempt by a renderer to request Node-integration-like permissions.
 */
export function installWebContentsGuards(): void {
  // Block permission requests (no camera/mic/geolocation surface in this app).
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false))

  session.defaultSession.setPermissionCheckHandler(() => false)
}
