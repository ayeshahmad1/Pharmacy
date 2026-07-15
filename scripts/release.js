/*
 * One-command release builder for Pharmacy POS.
 *
 * Run from the project root:
 *     npm run release
 *
 * It will:
 *   1. Build the React frontend (pharmacy-frontend1).
 *   2. Copy the fresh build into pharmacy-backend/public.
 *   3. Bump the patch version in package.json (1.0.0 -> 1.0.1 -> ...).
 *   4. Build the Windows installer with electron-builder.
 *
 * The finished installer lands in:  dist/Pharmacy POS Setup <version>.exe
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const frontendDir = path.join(root, 'pharmacy-frontend1');
const distDir = path.join(frontendDir, 'dist');
const publicDir = path.join(root, 'pharmacy-backend', 'public');
const pkgPath = path.join(root, 'package.json');

function run(cmd, cwd) {
  console.log(`\n> ${cmd}\n`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function step(msg) {
  console.log(`\n=== ${msg} ===`);
}

try {
  // 1. Build the frontend ----------------------------------------------------
  step('1/4  Building frontend');
  run('npm run build', frontendDir);

  // 2. Copy the build into the backend's public folder -----------------------
  step('2/4  Copying frontend into pharmacy-backend/public');
  if (!fs.existsSync(distDir)) {
    throw new Error('Frontend build folder not found: ' + distDir);
  }
  fs.rmSync(publicDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });
  fs.cpSync(distDir, publicDir, { recursive: true });
  console.log('Copied ' + distDir + ' -> ' + publicDir);

  // 3. Bump the patch version ------------------------------------------------
  step('3/4  Bumping version');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const parts = String(pkg.version).split('.').map((n) => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  parts[2] += 1; // bump patch
  const oldVersion = pkg.version;
  pkg.version = parts.join('.');
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Version ${oldVersion} -> ${pkg.version}`);

  // 4. Build the installer ---------------------------------------------------
  step('4/4  Building Windows installer');
  run('npx electron-builder --win nsis', root);

  console.log('\n✔ Done. Installer is in the dist\\ folder:');
  console.log(`   dist\\Pharmacy POS Setup ${pkg.version}.exe`);
  console.log('\nNext: uninstall the old "Pharmacy POS" (Settings > Apps), then run that installer.');
} catch (err) {
  console.error('\n✖ Release failed:\n' + (err && err.message ? err.message : err));
  process.exit(1);
}
