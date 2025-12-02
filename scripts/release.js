#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Simple release script for bumping version and creating git tag
 * Usage:
 *   node scripts/release.js        # bump patch (1.0.0 -> 1.0.1)
 *   node scripts/release.js minor  # bump minor (1.0.0 -> 1.1.0)
 *   node scripts/release.js major  # bump major (1.0.0 -> 2.0.0)
 *   node scripts/release.js --dry-run  # preview changes without committing
 *   node scripts/release.js --force    # re-tag current version (move tag to HEAD)
 */

// Parse arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const isForce = args.includes('--force') || args.includes('-f');
const versionType = args.find(arg => !arg.startsWith('-')) || 'patch';

function exec(command, silent = false) {
  if (isDryRun) {
    console.log(`[DRY RUN] ${command}`);
    return '';
  }
  if (!silent) console.log(`> ${command}`);
  try {
    return execSync(command, { encoding: 'utf8', stdio: silent ? 'pipe' : 'inherit' });
  } catch (error) {
    console.error(`Failed to execute: ${command}`);
    process.exit(1);
  }
}

function execQuiet(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (error) {
    return '';
  }
}

function getCurrentVersion() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return pkg.version;
}

function getLastTag() {
  const tag = execQuiet('git describe --tags --abbrev=0 2>/dev/null');
  return tag || null;
}

function generateChangelog(newVersion) {
  const lastTag = getLastTag();
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';

  console.log(`\nGenerating changelog from ${lastTag || 'beginning'}...`);

  // Get commits since last tag
  const commits = execQuiet(`git log ${range} --format=%s`).split('\n').filter(Boolean);

  if (commits.length === 0) {
    console.log('No new commits found');
    return '';
  }

  // Categorize commits
  const categories = {
    feat: [],
    fix: [],
    docs: [],
    chore: [],
    refactor: [],
    other: []
  };

  commits.forEach(commit => {
    const match = commit.match(/^(\w+):\s*(.+)/);
    if (match) {
      const [, type, message] = match;
      const category = categories[type] || categories.other;
      category.push(message);
    } else {
      categories.other.push(commit);
    }
  });

  // Build changelog entry - only include user-facing changes
  const date = new Date().toISOString().split('T')[0];
  let entry = `## [${newVersion}] - ${date}\n\n`;

  if (categories.feat.length > 0) {
    entry += '### Features\n\n';
    categories.feat.forEach(msg => entry += `- ${msg}\n`);
    entry += '\n';
  }

  if (categories.fix.length > 0) {
    entry += '### Bug Fixes\n\n';
    categories.fix.forEach(msg => entry += `- ${msg}\n`);
    entry += '\n';
  }

  if (categories.refactor.length > 0) {
    entry += '### Refactoring\n\n';
    categories.refactor.forEach(msg => entry += `- ${msg}\n`);
    entry += '\n';
  }

  // Skip docs, chore, and other - not user-facing changes

  if (isDryRun) {
    console.log('\n[DRY RUN] Changelog preview:\n');
    console.log('---');
    console.log(entry);
    console.log('---\n');
    return entry;
  }

  // Read existing changelog
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
  let existingContent = '';

  if (fs.existsSync(changelogPath)) {
    existingContent = fs.readFileSync(changelogPath, 'utf8');
    // Remove header if it exists
    existingContent = existingContent.replace(/^# Change Log\n\nAll notable changes are listed here\.\n\n<br>\n\n/m, '');
  }

  // Write new changelog
  const newContent = `# Change Log

All notable changes are listed here.

<br>

${entry}${existingContent}`;

  fs.writeFileSync(changelogPath, newContent, 'utf8');
  console.log('✓ CHANGELOG.md updated');

  // Stage the changelog
  exec('git add CHANGELOG.md', true);

  return entry;
}

function calculateNewVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Invalid version type: ${type}`);
  }
}

function retag() {
  const currentVersion = getCurrentVersion();
  const tagName = `v${currentVersion}`;

  console.log('=== FORCE RE-TAG MODE ===\n');
  console.log(`Current version: ${currentVersion}`);
  console.log(`Re-tagging ${tagName} to point to current HEAD\n`);

  // Check for uncommitted changes
  try {
    execSync('git diff-index --quiet HEAD --', { encoding: 'utf8' });
  } catch (error) {
    console.error('Error: You have uncommitted changes. Please commit or stash them first.');
    process.exit(1);
  }

  // Check if tag exists locally
  const localTagExists = execQuiet(`git tag -l ${tagName}`);

  // Check if tag exists remotely
  const remoteTagExists = execQuiet(`git ls-remote --tags origin ${tagName}`);

  if (!localTagExists && !remoteTagExists) {
    console.error(`Error: Tag ${tagName} does not exist locally or remotely.`);
    console.error('Use normal release without --force to create a new tag.');
    process.exit(1);
  }

  console.log('⚠️  WARNING: This will delete and recreate the tag!');
  console.log(`   Local tag exists: ${localTagExists ? 'YES' : 'NO'}`);
  console.log(`   Remote tag exists: ${remoteTagExists ? 'YES' : 'NO'}`);
  console.log('');

  // Delete local tag if exists
  if (localTagExists) {
    console.log('Deleting local tag...');
    exec(`git tag -d ${tagName}`);
  }

  // Delete remote tag if exists
  if (remoteTagExists) {
    console.log('Deleting remote tag...');
    exec(`git push origin :refs/tags/${tagName}`);
  }

  // Create new tag at HEAD
  console.log('Creating new tag at HEAD...');
  exec(`git tag ${tagName}`);

  // Push new tag
  console.log('Pushing new tag to remote...');
  exec(`git push origin ${tagName}`);

  console.log(`\n✓ Tag ${tagName} re-created at HEAD`);
  console.log(`✓ Pushed to remote`);
  console.log('\n⚠️  Remember to rebuild and re-upload release artifacts!');
}

function main() {
  // Handle --force mode
  if (isForce) {
    retag();
    return;
  }

  if (!['patch', 'minor', 'major'].includes(versionType)) {
    console.error(`Invalid version type: ${versionType}`);
    console.error('Usage: node scripts/release.js [patch|minor|major] [--dry-run] [--force]');
    process.exit(1);
  }

  const currentVersion = getCurrentVersion();
  const newVersion = isDryRun
    ? calculateNewVersion(currentVersion, versionType)
    : null;

  if (isDryRun) {
    console.log('=== DRY RUN MODE ===\n');
  }

  console.log(`Current version: ${currentVersion}`);
  console.log(`Bumping ${versionType} version...\n`);

  if (isDryRun) {
    console.log(`New version will be: ${newVersion}\n`);
    generateChangelog(newVersion);
    console.log('[DRY RUN] No changes made.');
    console.log('Run without --dry-run to perform the release.');
    return;
  }

  // Check for uncommitted changes
  try {
    execSync('git diff-index --quiet HEAD --', { encoding: 'utf8' });
  } catch (error) {
    console.error('Error: You have uncommitted changes. Please commit or stash them first.');
    process.exit(1);
  }

  // Bump version first (this updates package.json)
  exec(`npm version ${versionType} --no-git-tag-version`);

  const actualNewVersion = getCurrentVersion();

  // Generate changelog
  generateChangelog(actualNewVersion);

  // Commit package.json and CHANGELOG.md together
  exec(`git add package.json`);
  exec(`git commit -m "chore: release v${actualNewVersion}"`);

  // Create git tag
  exec(`git tag v${actualNewVersion}`);

  // Push to remote
  exec(`git push origin main`);
  exec(`git push origin v${actualNewVersion}`);

  console.log(`\n✓ Version bumped to ${actualNewVersion}`);
  console.log(`✓ CHANGELOG.md updated`);
  console.log(`✓ Git tag v${actualNewVersion} created`);
  console.log(`✓ Pushed to remote`);
}

main();
