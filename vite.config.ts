// @ts-expect-error Node built-in available at Vite config runtime
import { execSync } from 'child_process'
// @ts-expect-error Node built-in available at Vite config runtime
import { readFileSync } from 'fs'
// @ts-expect-error Node built-in available at Vite config runtime
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function getPackageVersion(): string {
  try {
    const packageJsonPath = fileURLToPath(new URL('./package.json', import.meta.url))
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: unknown }
    return typeof packageJson.version === 'string' && packageJson.version.length > 0 ? packageJson.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function getShortCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'
  } catch {
    return 'dev'
  }
}

const buildVersion = `${getPackageVersion()}+${getShortCommitHash()}`

export default defineConfig({
  base: '/lander/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(buildVersion),
  },
})
