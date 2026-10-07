import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

describe('SECTION 26 — DevOps, Documentation & Final Quality Gate Verification', () => {
  const rootDir = process.cwd();

  // --------------------------------------------------------------------------
  // 26.1 Docker Configuration Audit
  // --------------------------------------------------------------------------
  it('26.1.1 Verifies Dockerfile.backend multi-stage build, healthcheck & security hardening', () => {
    const backendDockerPath = path.join(rootDir, 'Dockerfile.backend');
    assert.ok(fs.existsSync(backendDockerPath), 'Dockerfile.backend must exist');
    const content = fs.readFileSync(backendDockerPath, 'utf-8');

    // Multi-stage verification
    assert.ok(content.includes('FROM node:22-alpine AS builder'), 'Must have builder stage');
    assert.ok(content.includes('FROM node:22-alpine AS runner'), 'Must have runner stage');

    // Security hardening: Non-root user
    assert.ok(content.includes('USER node'), 'Backend container must run as unprivileged node user');

    // Healthcheck & Port
    assert.ok(content.includes('HEALTHCHECK'), 'Backend must define HEALTHCHECK probe');
    assert.ok(content.includes('/health'), 'Backend healthcheck must query /health endpoint');
    assert.ok(content.includes('EXPOSE 3000'), 'Backend must expose port 3000');
  });

  it('26.1.2 Verifies Dockerfile.frontend static build & Nginx server configuration', () => {
    const frontendDockerPath = path.join(rootDir, 'Dockerfile.frontend');
    assert.ok(fs.existsSync(frontendDockerPath), 'Dockerfile.frontend must exist');
    const content = fs.readFileSync(frontendDockerPath, 'utf-8');

    // Multi-stage builder & nginx
    assert.ok(content.includes('FROM node:22-alpine AS builder'), 'Frontend must build with Node');
    assert.ok(content.includes('FROM nginx:1.27-alpine AS runner') || content.includes('FROM nginx:'), 'Frontend must serve with Nginx');
    assert.ok(content.includes('EXPOSE 80'), 'Frontend must expose port 80');
    assert.ok(content.includes('HEALTHCHECK'), 'Frontend must declare HEALTHCHECK');

    // nginx.conf verification
    const nginxConfPath = path.join(rootDir, 'nginx.conf');
    assert.ok(fs.existsSync(nginxConfPath), 'nginx.conf must exist');
    const nginxContent = fs.readFileSync(nginxConfPath, 'utf-8');
    assert.ok(nginxContent.includes('proxy_pass http://backend:3000/api/;'), 'Nginx must reverse proxy /api/');
    assert.ok(nginxContent.includes('proxy_pass http://backend:3000/socket.io/;'), 'Nginx must reverse proxy /socket.io/');
    assert.ok(nginxContent.includes('Upgrade $http_upgrade'), 'Nginx must forward WebSocket upgrade headers');
    assert.ok(nginxContent.includes('try_files $uri $uri/ /index.html;'), 'Nginx must support SPA client-side routing');
    assert.ok(nginxContent.includes('X-Frame-Options'), 'Nginx must include security headers');
  });

  it('26.1.3 Verifies docker-compose.yml defines all services, databases, volumes and networks', () => {
    const composePath = path.join(rootDir, 'docker-compose.yml');
    assert.ok(fs.existsSync(composePath), 'docker-compose.yml must exist');
    const content = fs.readFileSync(composePath, 'utf-8');

    // Services
    assert.ok(content.includes('backend:'), 'docker-compose must declare backend service');
    assert.ok(content.includes('frontend:'), 'docker-compose must declare frontend service');
    assert.ok(content.includes('mongodb:'), 'docker-compose must declare mongodb service');
    assert.ok(content.includes('redis:'), 'docker-compose must declare redis service');

    // Database configurations
    assert.ok(content.includes('mongo:7.0'), 'MongoDB must use mongo:7.0 image');
    assert.ok(content.includes('redis:7-alpine'), 'Redis must use redis:7-alpine image');
    assert.ok(content.includes('27017:27017'), 'MongoDB must map port 27017');
    assert.ok(content.includes('6379:6379'), 'Redis must map port 6379');

    // Persistence & Networking
    assert.ok(content.includes('mongodb_data:'), 'Must declare persistent mongodb volume');
    assert.ok(content.includes('redis_data:'), 'Must declare persistent redis volume');
    assert.ok(content.includes('chatsphere_net:'), 'Must declare isolated bridge network');

    // Healthchecks
    assert.ok(content.includes('mongosh'), 'MongoDB must define mongosh healthcheck');
    assert.ok(content.includes('redis-cli'), 'Redis must define redis-cli ping healthcheck');
  });

  // --------------------------------------------------------------------------
  // 26.2 Environment Variables Audit
  // --------------------------------------------------------------------------
  it('26.2.1 Verifies .env.example contains only actually used variables and no secret leakage', () => {
    const envExamplePath = path.join(rootDir, '.env.example');
    assert.ok(fs.existsSync(envExamplePath), '.env.example must exist');
    const content = fs.readFileSync(envExamplePath, 'utf-8');

    const expectedVars = [
      'NODE_ENV',
      'PORT',
      'MONGO_URI',
      'CLIENT_URL',
      'SESSION_SECRET',
      'JWT_SECRET',
      'REDIS_URL',
      'STORAGE_ENDPOINT',
      'STORAGE_BUCKET',
      'STORAGE_ACCESS_KEY',
      'STORAGE_SECRET_KEY',
      'GEMINI_API_KEY',
      'APP_URL',
    ];

    for (const v of expectedVars) {
      assert.ok(content.includes(`${v}=`), `.env.example must include variable ${v}`);
    }

    // No actual secrets committed
    assert.ok(!content.includes('ghp_'), 'No GitHub personal access tokens allowed');
    assert.ok(!content.includes('AIzaSy'), 'No real Google API keys allowed');
    assert.ok(!content.includes('sk_live'), 'No Stripe live keys allowed');
  });

  it('26.2.2 Verifies frontend client code does not leak backend secrets', () => {
    const srcDir = path.join(rootDir, 'src');
    const walkSync = (dir: string, filelist: string[] = []) => {
      fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          walkSync(filePath, filelist);
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          filelist.push(filePath);
        }
      });
      return filelist;
    };

    const clientFiles = walkSync(srcDir);
    for (const file of clientFiles) {
      const code = fs.readFileSync(file, 'utf-8');
      assert.ok(!code.includes('process.env.JWT_SECRET'), `Client file ${file} must not reference JWT_SECRET`);
      assert.ok(!code.includes('process.env.SESSION_SECRET'), `Client file ${file} must not reference SESSION_SECRET`);
      assert.ok(!code.includes('process.env.MONGO_URI'), `Client file ${file} must not reference MONGO_URI`);
    }
  });

  // --------------------------------------------------------------------------
  // 26.3 CI/CD Quality Gate Pipeline Audit
  // --------------------------------------------------------------------------
  it('26.3.1 Verifies GitHub Actions CI workflow adheres to all required pipeline stages', () => {
    const ciPath = path.join(rootDir, '.github', 'workflows', 'ci.yml');
    assert.ok(fs.existsSync(ciPath), '.github/workflows/ci.yml must exist');
    const content = fs.readFileSync(ciPath, 'utf-8');

    // Pipeline event triggers
    assert.ok(content.includes('push:'), 'CI must trigger on push');
    assert.ok(content.includes('pull_request:'), 'CI must trigger on pull_request');

    // Required stages
    assert.ok(content.includes('npm install'), 'CI must install dependencies');
    assert.ok(content.includes('npm run lint'), 'CI must run type checking and linting');
    assert.ok(content.includes('tests/unit.test.ts'), 'CI must run unit tests');
    assert.ok(content.includes('tests/integration.test.ts'), 'CI must run integration tests');
    assert.ok(content.includes('npm run build'), 'CI must run build step');
    assert.ok(content.includes('npm run test:e2e') || content.includes('tests/e2e.test.ts'), 'CI must run E2E tests');

    // No bypass of failure
    assert.ok(!content.includes('continue-on-error: true'), 'CI pipeline must never bypass test or build failures');
  });
});
