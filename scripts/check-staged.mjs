import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const names = (filter) =>
  execFileSync(
    'git',
    ['diff', '--cached', '--name-only', `--diff-filter=${filter}`, '-z'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)

const changed = names('ACMRD')
if (changed.length === 0) process.exit(0)

const present = names('ACMR')
const formatted = present.filter((file) =>
  /\.(?:[cm]?[jt]sx?|css|html|json|md)$/.test(file),
)
const projectChanged = changed.some(
  (file) =>
    /\.(?:[cm]?[jt]sx?)$/.test(file) ||
    /^(?:package(?:-lock)?\.json|tsconfig.*\.json|vite\.config\.ts|vitest\.config\.ts|\.oxlintrc\.json)$/.test(
      file,
    ),
)
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim()
const snapshot = mkdtempSync(join(tmpdir(), 'its-going-down-staged-'))

try {
  execFileSync('git', ['checkout-index', '--all', `--prefix=${snapshot}/`])
  symlinkSync(join(root, 'node_modules'), join(snapshot, 'node_modules'), 'dir')
  const binary = (name) => join(root, 'node_modules', '.bin', name)

  if (formatted.length > 0) {
    execFileSync(binary('prettier'), ['--check', ...formatted], {
      cwd: snapshot,
      stdio: 'inherit',
    })
  }
  if (projectChanged) {
    execFileSync('npm', ['run', 'lint'], { cwd: snapshot, stdio: 'inherit' })
    execFileSync('npm', ['run', 'typecheck'], {
      cwd: snapshot,
      stdio: 'inherit',
    })
    execFileSync('npm', ['test'], { cwd: snapshot, stdio: 'inherit' })
  }
} finally {
  rmSync(snapshot, { recursive: true, force: true })
}
