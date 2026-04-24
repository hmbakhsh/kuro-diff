export interface AppContext {
  // Service instances are attached here as phases land (git, github, workspace, etc.).
  readonly appVersion: string
}

export function createContext(): AppContext {
  return {
    appVersion: process.env.npm_package_version ?? '0.1.0',
  }
}
