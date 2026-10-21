---
name: grade-canvas
description: Grade Unity game-math assignments submitted to Canvas as GitHub links, with Claude doing the grading in this session (no API key or credits). Use when asked to grade submissions, check who submitted, grade an assignment or course, list Canvas courses or assignments, or post grades and feedback to Canvas, for any configured Canvas account.
---

# Grade Canvas submissions

Claude is the grader. The helper script only talks to Canvas; you clone and read the student repos yourself.

Helper: `node .claude/skills/grade-canvas/canvas.mjs <command>` (prints JSON):

| Command | Returns |
|---|---|
| `accounts` | Configured Canvas accounts |
| `courses <acct> [all]` | Courses you teach in the current term (id, name, term); `all` includes past and future terms |
| `assignments <acct> <course> [all]` | This term's assignments that have submissions, sorted by available date (id, name, unlock/due dates, points, description); `all` lists everything |
| `submissions <acct> <course> <assignment>` | Submitted work: user_id, name, late/days_late, score, graded, github_url |
| `grade <acct> <course> <assignment> <user> <score> [commentFile]` | Posts a score and optional feedback comment |

## Accounts

Accounts live in `~/.aralaro/canvas-accounts.json`, outside the repo:

```json
{ "school-a": { "url": "https://school-a.instructure.com/api/v1", "token": "..." } }
```

`CANVAS_API_URL` + `CANVAS_API_KEY` from the environment or `./.env` show up as account `default`. If `accounts` returns nothing, tell the user to add their Canvas tokens there themselves. Never ask for a token in chat, and never print one.

## Workflow

1. **Pick the target.** Run `accounts`, then `courses` and `assignments` as needed. If the user named an assignment loosely, match it and confirm the choice in one line.
2. **Pick the rubric.** Use, in order: a rubric the user gives, the assignment description, or the matching template in `src/criteria/default-criteria.json`. Keep each criterion's point value, and scale so the total equals the assignment's `points_possible`.
3. **List submissions.** Skip ones already `graded` unless the user asks for a regrade. Report any with no `github_url` (show `raw`) instead of guessing.
4. **Grade each submission.**
   - `git -c core.longpaths=true clone --depth 1 <github_url> "$TMP/aralaro/<user_id>"` (use the scratchpad when you have one). Without `core.longpaths`, Windows checkouts fail on TextMesh Pro sample paths.
   - Find the C# scripts: usually `Assets/**/*.cs`, but also accept non-standard layouts and note them. Skip `Assets/TextMesh Pro/` and other imported packages.
   - Check scene and prefab YAML (`*.unity`, `*.prefab`) for values the code leaves to the Inspector, such as starting HP, speeds, and which objects are children of the camera.
   - Read the actual code. Score each rubric criterion on whether the math is correct and actually used, not on keyword hits. Bands: 90-100% mastery, 80-89% proficient, 70-79% developing, 60-69% beginning, below 60% major gaps.
   - Late work: apply the rubric's `lateSubmissionPenalty` if it is enabled (penaltyPerDay % per day after gracePeriodHours, capped at maxPenalty %). Otherwise just mention `days_late` in the report.
   - Write feedback for the student: what they did well, what to fix, with file and line references. Keep it encouraging and specific, and don't paste their code back.
   - Delete the clone when done.
   - With more than about 5 submissions, grade them in parallel subagents (one per submission or small batch), each returning `{user_id, score, per-criterion scores, feedback}`.
5. **Review before posting.** Show a table: student, score/points, per-criterion scores, late, one-line summary. Also write the full feedback for each student to `grades-<assignment>.md` in the scratchpad (or the working directory).
6. **Post only after the user says yes.** Posting is visible to students. Write each comment to a file, then run `grade ... <score> <commentFile>`. Post only the students the user approved, and report any failures.

## Scheduled runs

This skill can run unattended (for example from a scheduled task) up to step 5: grade, then write the report. Never post grades in an unattended run. Leave that for the user to approve.
