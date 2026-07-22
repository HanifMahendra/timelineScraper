import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = 8181;
const projectId = 'demo-scele-timeline';
const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');

export function isExpectedDemoEmulator(processInfo, workspace = root) {
  if (!processInfo) return false;
  const commandLine = String(processInfo.commandLine || '').replaceAll('\\', '/').toLowerCase();
  const rulesPath = path.join(workspace, 'firestore.rules').replaceAll('\\', '/').toLowerCase();
  return String(processInfo.name || '').toLowerCase() === 'java.exe'
    && commandLine.includes('cloud-firestore-emulator')
    && commandLine.includes(`--project_id ${projectId}`)
    && commandLine.includes(`--port ${port}`)
    && commandLine.includes(rulesPath);
}

function findWindowsPortOwner() {
  const source = [
    `$connection = Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1`,
    'if ($connection) {',
    '  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)"',
    '  [pscustomobject]@{ pid = $connection.OwningProcess; name = $process.Name; commandLine = $process.CommandLine } | ConvertTo-Json -Compress',
    '}',
    'exit 0',
  ].join('\n');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', source], {
    encoding: 'utf8', timeout: 15_000, windowsHide: true,
  });
  if (result.status !== 0) throw new Error('Tidak dapat memeriksa pemilik port emulator.');
  const value = result.stdout.trim();
  return value ? JSON.parse(value) : null;
}

function cleanupWindowsEmulator() {
  const owner = findWindowsPortOwner();
  if (!owner) return { ok: true, cleaned: false };
  if (!isExpectedDemoEmulator(owner)) return { ok: false, cleaned: false, reason: 'port-owner-mismatch' };
  try { process.kill(Number(owner.pid), 'SIGTERM'); }
  catch { return { ok: false, cleaned: false, reason: 'termination-failed' }; }
  const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(waitBuffer, 0, 0, 500);
  return { ok: !findWindowsPortOwner(), cleaned: true, reason: 'port-still-open' };
}

export function runEmulatorTests({ output = console } = {}) {
  if (process.platform === 'win32') {
    const existing = findWindowsPortOwner();
    if (existing) {
      output.error(`FAIL emulator port ${port} sudah digunakan; runner tidak menghentikan proses yang sudah ada.`);
      return { ok: false, reason: 'port-in-use' };
    }
  }

  const result = spawnSync(process.execPath, [
    npmCli, 'exec', '--yes', 'firebase-tools', '--', 'emulators:exec',
    '--project', projectId, '--only', 'firestore',
    'npm --prefix timeline-scele-auth run test:emulator',
  ], { cwd: root, env: process.env, stdio: 'inherit', shell: false, timeout: 240_000 });

  let cleanup = { ok: true, cleaned: false };
  if (process.platform === 'win32') cleanup = cleanupWindowsEmulator();
  if (!cleanup.ok) output.error(`FAIL cleanup emulator (${cleanup.reason}).`);
  else if (cleanup.cleaned) output.log('PASS cleanup emulator demo Windows.');

  const ok = result.status === 0 && cleanup.ok;
  if (result.error) output.error(`FAIL emulator runner: ${result.error.message}`);
  return { ok, status: result.status, cleanup };
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const result = runEmulatorTests();
  if (!result.ok) process.exitCode = 1;
}
