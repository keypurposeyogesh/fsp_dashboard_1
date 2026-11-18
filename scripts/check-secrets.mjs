import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const findings = [];
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (tracked.some(path => /^\.env(?:\.|$)/.test(path) && !['.env.example', '.env.e2e.example'].includes(path))) findings.push('A non-example environment file is tracked.');
function privilegedValues(text) {
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(text)) return true;
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString()).role === 'service_role') return true; }
    catch { /* Not a parseable JWT. */ }
  }
  return false;
}
for (const path of tracked) {
  if (!existsSync(path) || /\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|pdf|zip)$/i.test(path)) continue;
  if (privilegedValues(readFileSync(path, 'utf8'))) findings.push(`Privileged credential found in ${path}`);
}
for (const path of ['.env.example', '.env.e2e.example']) {
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const assignment = line.match(/^([A-Z_]+)=(.*)$/);
    if (!assignment) continue;
    const [, name, value] = assignment;
    if (/PASSWORD|KEY|TOKEN|SECRET/.test(name) && value.trim() && !value.startsWith('your-')) findings.push(`Non-placeholder credential example: ${path}:${name}`);
    if (name === 'NEXT_PUBLIC_SUPABASE_URL' && value !== 'https://your-project.supabase.co') findings.push('Supabase example URL must be a placeholder.');
  }
}
const privateKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
function scanClient(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) scanClient(path);
    else if (/\.(js|json|map|html)$/.test(entry.name)) {
      const content = readFileSync(path, 'utf8');
      if (privilegedValues(content) || (privateKey && privateKey.length > 16 && content.includes(privateKey))) findings.push(`Privileged value found in client output ${path}`);
    }
  }
}
scanClient('.next/static');
if (process.argv.includes('--history')) {
  try {
    const history = execFileSync('git', ['log', '--all', '-p', '--format=', '--', '.', ':!package-lock.json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (privilegedValues(history)) findings.push('A privileged credential exists in Git history. Rotate it and review history before release.');
  } catch { findings.push('Git history could not be scanned completely.'); }
}
if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1; }
else console.log(`Secret checks passed: tracked files, example configuration, client bundles${process.argv.includes('--history') ? ', and local Git history' : ''}. Remote/provider secrets require separate review.`);
