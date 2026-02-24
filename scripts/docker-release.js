#!/usr/bin/env node
/**
 * Docker Release Script
 * - Bumps version
 * - Builds Docker image
 * - Tags with version
 * - Pushes to registry
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IMAGE_NAME = process.env.DOCKER_IMAGE || 'gthrepwood/todo-pwa';

function run(command, options = {}) {
  console.log(`> ${command}`);
  try {
    execSync(command, { stdio: 'inherit', shell: true, ...options });
  } catch (err) {
    console.error(`Command failed: ${command}`);
    process.exit(1);
  }
}

function getVersion() {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  return pkg.version;
}

function bumpVersion() {
  run('npm version minor --no-git-tag-version');
}

function build() {
  run(`docker build -t ${IMAGE_NAME}:latest .`);
}

function tag() {
  const version = getVersion();
  run(`docker tag ${IMAGE_NAME}:latest ${IMAGE_NAME}:${version}`);
}

function push() {
  const version = getVersion();
  run(`docker push ${IMAGE_NAME}:latest`);
  run(`docker push ${IMAGE_NAME}:${version}`);
}

// Main execution
console.log('🚀 Starting Docker release...\n');

bumpVersion();
console.log('');
build();
tag();
push();

console.log('\n✅ Docker release completed successfully!');
console.log(`   Image: ${IMAGE_NAME}:${getVersion()}`);
