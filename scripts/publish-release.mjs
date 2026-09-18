/**
 * Upload electron-builder output (latest.yml + installer .exe) to Hostinger VPS.
 *
 * Prerequisites:
 *   1. npm run electron:build  (creates release/latest.yml + Setup exe)
 *   2. .env with VPS_* variables (see .env.example)
 *   3. SSH key access to VPS (passwordless scp/ssh)
 *
 * Usage:
 *   npm run publish:release
 *   npm run electron:release     # build + publish
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');

dotenv.config({ path: path.join(ROOT, '.env') });

function log(msg) {
  console.log(`[publish-release] ${msg}`);
}

function fail(msg) {
  console.error(`[publish-release] ERROR: ${msg}`);
  process.exit(1);
}

function readJsonVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  return String(pkg.version || '').trim();
}

function findReleaseArtifacts() {
  if (!fs.existsSync(RELEASE_DIR)) {
    fail(`Release folder not found: ${RELEASE_DIR}\nRun: npm run electron:build`);
  }

  const latestYml = path.join(RELEASE_DIR, 'latest.yml');
  if (!fs.existsSync(latestYml)) {
    fail(`latest.yml not found in ${RELEASE_DIR}\nRun: npm run electron:build`);
  }

  const ymlText = fs.readFileSync(latestYml, 'utf8');
  const pathMatch = ymlText.match(/^path:\s*(.+)$/m);
  const installerName = pathMatch?.[1]?.trim();

  let installerPath = installerName ? path.join(RELEASE_DIR, installerName) : null;
  if (!installerPath || !fs.existsSync(installerPath)) {
    const exeFiles = fs.readdirSync(RELEASE_DIR).filter((f) => f.endsWith('.exe') && !f.includes('blockmap'));
    if (!exeFiles.length) {
      fail('No installer .exe found in release/');
    }
    installerPath = path.join(RELEASE_DIR, exeFiles.sort().pop());
  }

  const blockmapPath = `${installerPath}.blockmap`;
  const artifacts = {
    latestYml,
    installerPath,
    installerName: path.basename(installerPath),
    blockmapPath: fs.existsSync(blockmapPath) ? blockmapPath : null,
  };

  return artifacts;
}

function getVpsConfig() {
  const host = String(process.env.VPS_HOST || '').trim();
  const user = String(process.env.VPS_USER || '').trim();
  const port = String(process.env.VPS_PORT || '22').trim();
  const remotePath = String(process.env.VPS_RELEASE_PATH || '/var/www/downloads/desktop/stable').trim().replace(/\/+$/, '');
  const sshKey = String(process.env.VPS_SSH_KEY_PATH || '').trim();
  const publicUrl = String(
    process.env.UPDATE_FEED_URL || 'https://api.climeto.in/desktop/stable',
  ).trim().replace(/\/+$/, '');

  if (!host) fail('VPS_HOST missing in .env');
  if (!user) fail('VPS_USER missing in .env');

  return { host, user, port, remotePath, sshKey, publicUrl };
}

function buildSshArgs(config) {
  const args = ['-o', 'StrictHostKeyChecking=accept-new'];
  if (config.port && config.port !== '22') {
    args.push('-p', config.port);
  }
  if (config.sshKey) {
    const keyPath = path.resolve(config.sshKey);
    if (!fs.existsSync(keyPath)) {
      fail(
        `SSH key not found: ${keyPath}\n\n`
        + 'Generate one:\n'
        + '  ssh-keygen -t ed25519 -f C:/Users/PC/.ssh/id_ed25519 -C climeto-pwp-release\n\n'
        + 'Then add public key to VPS:\n'
        + `  type ${keyPath}.pub | ssh ${config.user}@${config.host} "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"\n\n`
        + 'Or remove VPS_SSH_KEY_PATH from .env to use Windows default SSH keys.',
      );
    }
    args.push('-i', keyPath);
  }
  return args;
}

/** scp uses -P (uppercase) for port; -p means preserve file times */
function buildScpArgs(config) {
  const args = ['-o', 'StrictHostKeyChecking=accept-new'];
  if (config.port && config.port !== '22') {
    args.push('-P', config.port);
  }
  if (config.sshKey) {
    const keyPath = path.resolve(config.sshKey);
    args.push('-i', keyPath);
  }
  return args;
}

function runCommand(cmd, args, label) {
  log(`${label}...`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    fail(`${label} failed (exit ${result.status})`);
  }
}

function scpUpload(localPath, remoteTarget, config) {
  const scpArgs = [...buildScpArgs(config), localPath, remoteTarget];
  runCommand('scp', scpArgs, `Upload ${path.basename(localPath)}`);
}

function sshExec(command, config) {
  const target = `${config.user}@${config.host}`;
  const sshArgs = [...buildSshArgs(config), target, command];
  runCommand('ssh', sshArgs, 'Remote setup');
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  const version = readJsonVersion();
  const artifacts = findReleaseArtifacts();
  const config = getVpsConfig();
  const remote = `${config.user}@${config.host}:${config.remotePath}`;

  log(`Version: ${version}`);
  log(`Installer: ${artifacts.installerName} (${formatBytes(fs.statSync(artifacts.installerPath).size)})`);
  log(`Remote path: ${config.remotePath}`);
  log(`Public feed URL: ${config.publicUrl}`);

  sshExec(`mkdir -p ${config.remotePath} ${config.remotePath}/archive`, config);

  const archiveName = `${path.parse(artifacts.installerName).name}-v${version}${path.extname(artifacts.installerName)}`;
  scpUpload(artifacts.latestYml, `${remote}/latest.yml`, config);
  scpUpload(artifacts.installerPath, `${remote}/${artifacts.installerName}`, config);
  scpUpload(artifacts.installerPath, `${remote}/archive/${archiveName}`, config);

  if (artifacts.blockmapPath) {
    scpUpload(artifacts.blockmapPath, `${remote}/${path.basename(artifacts.blockmapPath)}`, config);
  }

  sshExec(`mkdir -p ${config.remotePath}/archive && chmod -R 755 ${config.remotePath} && find ${config.remotePath} -type f -exec chmod 644 {} \\;`, config);

  log('');
  log('Published successfully.');
  log(`Users will auto-update from: ${config.publicUrl}/latest.yml`);
  log(`Archive copy: ${config.remotePath}/archive/${archiveName}`);
  log('');
  log('Verify:');
  log(`  curl -I ${config.publicUrl}/latest.yml`);
  log(`  curl ${config.publicUrl}/latest.yml`);
}

main().catch((err) => fail(err?.message || String(err)));
