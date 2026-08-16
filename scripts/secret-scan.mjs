import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = 'scripts/secret-scan.mjs';
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md', '.txt', '.yml', '.yaml', '.rules', '.example', '']);
const ACADEMIC_UPLOAD_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls', '.pdf', '.docx', '.doc']);
const PATTERNS = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['service-account-private-key', /["']private_key["']\s*:\s*["'](?!placeholder|example|<)/i],
  ['authorization-bearer-token', /authorization\s*[:=]\s*["']?bearer\s+(?!<|\$\{|\[REDACTED\]|token\b)[A-Za-z0-9._~+/=-]{20,}/i],
  ['session-encryption-key', /SESSION_ENCRYPTION_KEY\s*=\s*(?!$|<|placeholder|example)[A-Za-z0-9+/=]{40,}/m],
  ['scele-password', /^\s*(?:STAGING_)?SCELE_PASSWORD\s*=\s*(?!$|<|placeholder|example|\$\{).{8,}/im],
  ['playwright-session', /["'](?:cookies|storageState)["']\s*:\s*(?:\[|\{)/i],
];

function gitFiles(repo) {
  try {
    const output = execFileSync('git', ['-C', repo, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return output.split('\0').filter(Boolean);
  } catch {
    const files = [];
    const walk = (directory) => {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (['.git', 'node_modules', '.next', 'out'].includes(entry.name)) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute); else files.push(path.relative(repo, absolute));
      }
    };
    walk(repo);
    return files;
  }
}

function normalize(root, absolute) {
  return path.relative(root, absolute).replaceAll('\\', '/');
}

export function scanWorkspace(rootDirectory) {
  const backend = path.join(rootDirectory, 'timeline-scele-auth');
  const candidates = new Set([
    ...gitFiles(rootDirectory).map((file) => path.join(rootDirectory, file)),
    ...gitFiles(backend).map((file) => path.join(backend, file)),
  ]);
  const findings = [];
  for (const absolute of candidates) {
    const relative = normalize(rootDirectory, absolute);
    if (relative === SELF || /(^|\/)(node_modules|\.next|out)(\/|$)/.test(relative)) continue;
    const basename = path.basename(relative).toLowerCase();
    if (basename === 'auth.json') findings.push({ file: relative, type: 'auth-session-file' });
    if (/^\.env(?:\..+)?$/.test(basename) && !basename.endsWith('.example')) findings.push({ file: relative, type: 'tracked-env-file' });
    const extension = path.extname(relative).toLowerCase();
    if (ACADEMIC_UPLOAD_EXTENSIONS.has(extension) && !/(^|\/)(fixtures?|test-data)(\/|$)/i.test(relative)) {
      findings.push({ file: relative, type: 'academic-upload-file' });
    }
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    let stat; try { stat = fs.statSync(absolute); } catch { continue; }
    if (!stat.isFile() || stat.size > 2_000_000) continue;
    let content; try { content = fs.readFileSync(absolute, 'utf8'); } catch { continue; }
    if (relative.endsWith('.env.example')) continue;
    for (const [type, pattern] of PATTERNS) {
      if (pattern.test(content)) findings.push({ file: relative, type });
    }
  }
  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.type.localeCompare(b.type));
}

export function printFindings(findings, output = console) {
  if (!findings.length) { output.log('Secret scan: clean.'); return; }
  for (const finding of findings) output.error(`Secret finding: ${finding.file} [${finding.type}] <redacted>`);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const findings = scanWorkspace(root); printFindings(findings); if (findings.length) process.exitCode = 1;
}
