
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const backendDir = __dirname;
const envPath = path.join(backendDir, '.env');
const credentialsPath = path.join(backendDir, '.admin-login.txt');
const gitignorePath = path.join(backendDir, '..', '.gitignore');

async function main() {
  if (!fs.existsSync(envPath)) {
    throw new Error('backend/.env was not found.');
  }

  if (fs.existsSync(credentialsPath)) {
    throw new Error(
      'backend/.admin-login.txt already exists. Secure or remove it before regenerating credentials.'
    );
  }

  // Generate fresh credentials locally.
  const adminPassword = crypto.randomBytes(24).toString('hex');
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const jwtSecret = crypto.randomBytes(48).toString('hex');

  // Preserve existing environment settings and replace old admin secrets.
  const existingLines = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/);

  const managedKeys = [
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD_HASH',
    'JWT_SECRET',
  ];

  const preservedLines = existingLines.filter((line) => {
    const key = line.split('=', 1)[0];
    return !managedKeys.includes(key);
  });

  while (preservedLines.length && preservedLines[preservedLines.length - 1] === '') {
    preservedLines.pop();
  }

  const updatedEnv = [
    ...preservedLines,
    'ADMIN_USERNAME=admin',
    `ADMIN_PASSWORD_HASH=${passwordHash}`,
    `JWT_SECRET=${jwtSecret}`,
    '',
  ].join('\n');

  fs.writeFileSync(envPath, updatedEnv, 'utf8');

  // Keep the login password in a local file, never print it.
  fs.writeFileSync(
    credentialsPath,
    `VELSHE ADMIN LOGIN\nUsername: admin\nPassword: ${adminPassword}\n`,
    { encoding: 'utf8', flag: 'wx' }
  );

  // Prevent the plaintext login file from being committed to GitHub.
  const ignoreRule = 'backend/.admin-login.txt';
  let gitignore = fs.readFileSync(gitignorePath, 'utf8');

  if (!gitignore.split(/\r?\n/).includes(ignoreRule)) {
    gitignore += `${gitignore.endsWith('\n') ? '' : '\n'}${ignoreRule}\n`;
    fs.writeFileSync(gitignorePath, gitignore, 'utf8');
  }

  console.log('✅ Admin credentials regenerated and saved locally.');
  console.log('✅ backend/.env updated with the new password hash and JWT secret.');
  console.log('🔐 Open backend/.admin-login.txt locally to view your login password.');
  console.log('Keep that file private; do not upload it or share its contents.');
}

main().catch((error) => {
  console.error('Credential setup failed:', error.message);
  process.exitCode = 1;
});
