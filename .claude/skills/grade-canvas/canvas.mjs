#!/usr/bin/env node
// Minimal Canvas CLI for the grade-canvas skill. No dependencies (Node 21+).
//
// Accounts come from ~/.aralaro/canvas-accounts.json:
//   { "school-a": { "url": "https://x.instructure.com/api/v1", "token": "..." } }
// plus a "default" account from CANVAS_API_URL + CANVAS_API_KEY/CANVAS_TOKEN
// (environment or ./.env).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ACCOUNTS_FILE = path.join(os.homedir(), '.aralaro', 'canvas-accounts.json');

function loadAccounts() {
  try { process.loadEnvFile('.env'); } catch {}
  const accounts = fs.existsSync(ACCOUNTS_FILE) ? JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')) : {};
  const token = process.env.CANVAS_API_KEY || process.env.CANVAS_TOKEN;
  if (!accounts.default && process.env.CANVAS_API_URL && token) {
    accounts.default = { url: process.env.CANVAS_API_URL, token };
  }
  return accounts;
}

function account(name) {
  const acct = loadAccounts()[name];
  if (!acct) throw new Error(`Unknown account "${name}". Run: node canvas.mjs accounts`);
  return { url: acct.url.replace(/\/+$/, ''), token: acct.token };
}

async function request(acct, method, urlOrPath, body) {
  const url = urlOrPath.startsWith('http') ? urlOrPath : acct.url + urlOrPath;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${acct.token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${await res.text()}`);
  return res;
}

// Follows Canvas Link-header pagination.
async function getAll(acct, p) {
  const out = [];
  let next = p + (p.includes('?') ? '&' : '?') + 'per_page=100';
  while (next) {
    const res = await request(acct, 'GET', next);
    out.push(...await res.json());
    next = (res.headers.get('link') || '').match(/<([^>]+)>;\s*rel="next"/)?.[1];
  }
  return out;
}

// Same rule as CanvasAPI.isCurrentCourse in the app: course dates when the
// course overrides its term and has them, else term dates; missing = open-ended.
function isCurrent(course, now = Date.now()) {
  const own = course.restrict_enrollments_to_course_dates ? course : {};
  const startAt = own.start_at || course.term?.start_at;
  const endAt = own.end_at || course.term?.end_at;
  return (startAt ? Date.parse(startAt) : -Infinity) <= now && now <= (endAt ? Date.parse(endAt) : Infinity);
}

function githubUrl(text) {
  const m = (text || '').match(/https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+/i);
  return m ? m[0].replace(/\.git$/, '') : null;
}

const commands = {
  accounts: () => Object.entries(loadAccounts()).map(([name, a]) => ({ name, url: a.url })),

  // Current-term courses only; pass "all" to include past/future terms.
  courses: async (name, scope) => (await getAll(account(name), '/courses?enrollment_type=teacher&enrollment_state=active&state[]=available&include[]=term'))
    .filter(c => scope === 'all' || isCurrent(c))
    .map(c => ({ id: c.id, name: c.name, term: c.term?.name })),

  assignments: async (name, courseId) => (await getAll(account(name), `/courses/${courseId}/assignments`))
    .map(a => ({ id: a.id, name: a.name, due_at: a.due_at, points_possible: a.points_possible, description: a.description })),

  submissions: async (name, courseId, assignmentId) =>
    (await getAll(account(name), `/courses/${courseId}/assignments/${assignmentId}/submissions?include[]=user`))
      .filter(s => s.submitted_at && s.workflow_state !== 'unsubmitted')
      .map(s => {
        const github_url = githubUrl(s.url) || githubUrl(s.body);
        return {
          user_id: s.user_id,
          name: s.user?.name,
          submitted_at: s.submitted_at,
          late: s.late,
          days_late: s.seconds_late ? +(s.seconds_late / 86400).toFixed(2) : 0,
          score: s.score,
          graded: s.workflow_state === 'graded',
          github_url,
          // What the student actually submitted, when no GitHub link was found
          raw: github_url ? undefined : (s.url || s.body || null)
        };
      }),

  // grade <account> <course> <assignment> <user> <score> [commentFile]
  grade: async (name, courseId, assignmentId, userId, score, commentFile) => {
    const body = { submission: { posted_grade: score } };
    if (commentFile) body.comment = { text_comment: fs.readFileSync(commentFile, 'utf8') };
    const res = await request(account(name), 'PUT', `/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`, body);
    const s = await res.json();
    return { user_id: s.user_id, score: s.score, grade: s.grade };
  }
};

const [cmd, ...args] = process.argv.slice(2);
if (!commands[cmd]) {
  console.error('Usage: node canvas.mjs accounts | courses <acct> | assignments <acct> <course> | submissions <acct> <course> <assignment> | grade <acct> <course> <assignment> <user> <score> [commentFile]');
  process.exit(1);
}
try {
  console.log(JSON.stringify(await commands[cmd](...args), null, 2));
} catch (e) {
  console.error(e.message);
  process.exitCode = 1; // not process.exit(): it crashes libuv on Windows with fetch sockets open
}
