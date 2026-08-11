#!/usr/bin/env node
/**
 * Push every value from .env to Vercel's environment variables.
 *
 * Prerequisites (one time):
 *   npx vercel login
 *   npx vercel link
 *
 * Usage:
 *   node scripts/sync-vercel-env.js            # production + preview + development
 *   node scripts/sync-vercel-env.js production # one target only
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './loadEnv.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const TARGETS = process.argv[2] ? [process.argv[2]] : ['production', 'preview', 'development'];

/** Run `vercel env add`, feeding the secret over stdin so it never lands in shell history. */
function addEnv(key, value, target) {
  return new Promise(resolve => {
    const child = spawn('npx', ['vercel', 'env', 'add', key, target, '--force'], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';
    child.stderr.on('data', d => { stderr += d; });
    child.stdout.on('data', () => {});

    child.stdin.write(value + '\n');
    child.stdin.end();

    child.on('close', code => resolve({ ok: code === 0, stderr }));
  });
}

async function main() {
  if (!fs.existsSync(path.join(ROOT, '.env'))) {
    console.error('No .env found. Run:  cp .env.example .env  then fill it in.');
    process.exit(1);
  }

  loadEnvFile();

  const present = KEYS.filter(k => (process.env[k] || '').trim());
  const missing = KEYS.filter(k => !(process.env[k] || '').trim());

  if (!present.length) {
    console.error('.env has no values filled in yet.');
    process.exit(1);
  }

  if (!fs.existsSync(path.join(ROOT, '.vercel', 'project.json'))) {
    console.error('This folder is not linked to a Vercel project. Run:  npx vercel link');
    process.exit(1);
  }

  console.log(`Syncing ${present.length} variable(s) to: ${TARGETS.join(', ')}\n`);

  let failed = 0;
  for (const key of present) {
    for (const target of TARGETS) {
      const { ok, stderr } = await addEnv(key, process.env[key].trim(), target);
      if (ok) {
        console.log(`  ok    ${key} → ${target}`);
      } else {
        failed++;
        console.log(`  FAIL  ${key} → ${target}: ${stderr.trim().split('\n').pop()}`);
      }
    }
  }

  if (missing.length) {
    console.log(`\nSkipped (empty in .env): ${missing.join(', ')}`);
  }

  console.log(
    failed
      ? `\n${failed} assignment(s) failed.`
      : '\nDone. Redeploy for the values to take effect:  npx vercel --prod'
  );
  process.exit(failed ? 1 : 0);
}

main();
