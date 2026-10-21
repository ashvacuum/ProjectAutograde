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
import { execFileSync } from 'node:child_process';

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

// Same rules as CanvasAPI.isCurrentCourse / isAssignmentInTerm in the app:
// course dates when the course overrides its term and has them, else term
// dates; missing = open-ended.
function period(course) {
  const own = course.restrict_enrollments_to_course_dates ? course : {};
  const startAt = own.start_at || course.term?.start_at;
  const endAt = own.end_at || course.term?.end_at;
  return [startAt ? Date.parse(startAt) : -Infinity, endAt ? Date.parse(endAt) : Infinity];
}

function isCurrent(course, now = Date.now()) {
  const [start, end] = period(course);
  return start <= now && now <= end;
}

function inTerm(assignment, course) {
  const [start, end] = period(course);
  const dates = [assignment.unlock_at, assignment.due_at].filter(Boolean).map(Date.parse);
  return dates.length === 0 || dates.some(d => start <= d && d <= end);
}

// First GitHub link in the text as { url, ref }, where ref is whatever
// follows /tree/ or /blob/ (branch, maybe plus a folder path).
function githubLink(text) {
  const m = (text || '').match(/https?:\/\/(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^\s?#<>"']+))?(?=[\s?#<>"'/]|$)/i);
  return m ? { url: `https://github.com/${m[1]}`, ref: m[2] ? decodeURIComponent(m[2]).replace(/[.,;)\/]+$/, '') : null } : null;
}

// Same rule as GitCommands.resolveRepoRef in the app: the longest prefix of
// ref that is a real branch; null (default branch) if none matches.
function resolveBranch(url, ref) {
  if (!ref) return null;
  let heads = [];
  try {
    heads = execFileSync('git', ['ls-remote', '--heads', url], { encoding: 'utf8', timeout: 30000 })
      .split('\n').map(line => line.split('refs/heads/')[1]).filter(Boolean);
  } catch {}
  const parts = ref.split('/');
  for (let n = parts.length; n > 0; n--) {
    if (heads.includes(parts.slice(0, n).join('/'))) return parts.slice(0, n).join('/');
  }
  return null;
}

const commands = {
  accounts: () => Object.entries(loadAccounts()).map(([name, a]) => ({ name, url: a.url })),

  // Current-term courses only; pass "all" to include past/future terms.
  courses: async (name, scope) => (await getAll(account(name), '/courses?enrollment_type=teacher&enrollment_state=active&state[]=available&include[]=term'))
    .filter(c => scope === 'all' || isCurrent(c))
    .map(c => ({ id: c.id, name: c.name, term: c.term?.name })),

  // This term's assignments that have submissions, sorted by available date;
  // pass "all" to skip the filtering.
  assignments: async (name, courseId, scope) => {
    const acct = account(name);
    const [list, course] = await Promise.all([
      getAll(acct, `/courses/${courseId}/assignments`),
      request(acct, 'GET', `/courses/${courseId}?include[]=term`).then(r => r.json())
    ]);
    const availableAt = a => Date.parse(a.unlock_at || a.due_at) || Infinity;
    return list
      .filter(a => scope === 'all' || (a.has_submitted_submissions && inTerm(a, course)))
      .sort((a, b) => availableAt(a) - availableAt(b))
      .map(a => ({ id: a.id, name: a.name, unlock_at: a.unlock_at, due_at: a.due_at, points_possible: a.points_possible, description: a.description }));
  },

  // The rubric attached to the assignment in Canvas, or null if none.
  rubric: async (name, courseId, assignmentId) => {
    const a = await (await request(account(name), 'GET', `/courses/${courseId}/assignments/${assignmentId}`)).json();
    if (!a.rubric) return null;
    return {
      title: a.rubric_settings?.title,
      points_possible: a.rubric_settings?.points_possible,
      criteria: a.rubric.map(c => ({
        id: c.id,
        points: c.points,
        description: c.description,
        long_description: c.long_description || undefined,
        ratings: c.ratings.map(r => ({ points: r.points, description: r.description, long_description: r.long_description || undefined }))
      }))
    };
  },

  submissions: async (name, courseId, assignmentId) =>
    (await getAll(account(name), `/courses/${courseId}/assignments/${assignmentId}/submissions?include[]=user`))
      .filter(s => s.submitted_at && s.workflow_state !== 'unsubmitted')
      .map(s => {
        const link = githubLink(s.url) || githubLink(s.body);
        const github_url = link?.url || null;
        return {
          user_id: s.user_id,
          name: s.user?.name,
          submitted_at: s.submitted_at,
          late: s.late,
          days_late: s.seconds_late ? +(s.seconds_late / 86400).toFixed(2) : 0,
          score: s.score,
          graded: s.workflow_state === 'graded',
          github_url,
          // Branch the student linked (/tree/<branch>); null = default branch
          branch: link?.ref ? resolveBranch(github_url, link.ref) : null,
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
