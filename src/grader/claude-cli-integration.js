const { spawn } = require('child_process');

/**
 * Integration with the local Claude CLI (`claude`), as an alternative to
 * calling the Anthropic HTTP API with a stored key. When the CLI is installed
 * and the user opts in, grading prompts are piped to `claude -p` and the
 * response is parsed exactly like an API response.
 *
 * The prompt is always passed over stdin (never interpolated into the command
 * line), so there is no shell-injection surface even with `shell: true`.
 */
class ClaudeCLIIntegration {
  constructor() {
    this._detection = null; // cached { available, version }
  }

  /**
   * Run the `claude` binary with the given args, feeding `input` over stdin.
   * Resolves with { code, stdout, stderr }. Uses shell:true so Windows can
   * resolve `claude.cmd` / `claude.ps1` shims from PATH.
   */
  _run(args, input = null, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
      let child;
      try {
        // Strip API credentials (main.js loads .env) so the CLI uses the
        // subscription login instead of billing API credits, and variables
        // inherited from a host Claude Code session (e.g. `npm run dev` from
        // its terminal), which point the CLI at that session's proxy.
        const env = { ...process.env };
        for (const key of Object.keys(env)) {
          if (key.startsWith('CLAUDE_CODE_') || key === 'CLAUDECODE' ||
              ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'].includes(key)) {
            delete env[key];
          }
        }
        child = spawn('claude', args, { shell: true, env });
      } catch (error) {
        return reject(error);
      }

      let stdout = '';
      let stderr = '';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error('Claude CLI timed out'));
      }, timeoutMs);

      child.stdout.on('data', (d) => { stdout += d.toString(); });
      child.stderr.on('data', (d) => { stderr += d.toString(); });

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      });

      if (input !== null) {
        child.stdin.write(input);
      }
      child.stdin.end();
    });
  }

  /**
   * Check whether the Claude CLI is installed and runnable. Result is cached;
   * pass force=true to re-probe (e.g. after the user installs it).
   */
  async detect(force = false) {
    if (this._detection && !force) {
      return this._detection;
    }

    try {
      const result = await this._run(['--version'], null, 15000);
      if (result.code === 0 && result.stdout) {
        this._detection = { available: true, version: result.stdout };
      } else {
        this._detection = { available: false, error: result.stderr || 'claude --version failed' };
      }
    } catch (error) {
      this._detection = { available: false, error: error.message };
    }

    return this._detection;
  }

  /**
   * Send one tiny prompt to prove the CLI can actually grade: installed,
   * logged in, and the login still valid. `claude auth status` reports
   * loggedIn even after the token expires, so only a real request tells.
   */
  async verify() {
    try {
      const reply = await this.analyze('Reply with exactly: ok');
      return { ok: true, reply: reply.slice(0, 40) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async isAvailable() {
    return (await this.detect()).available;
  }

  /**
   * Send a grading prompt through the CLI in non-interactive print mode and
   * return the raw text response. Throws on non-zero exit.
   */
  async analyze(prompt) {
    const detection = await this.detect();
    if (!detection.available) {
      throw new Error(`Claude CLI not available: ${detection.error || 'unknown'}`);
    }

    // --tools "" disables every built-in tool: the prompt already holds the
    // rubric, folder tree and source, so the model only reads and scores.
    // Without this it tries gh/WebFetch to look at the repo itself.
    const args = ['-p', '--model', 'claude-haiku-5-5', '--output-format', 'text', '--tools', '""'];

    const result = await this._run(args, prompt, 300000);

    if (result.code !== 0) {
      const output = `${result.stderr}\n${result.stdout}`;
      if (/401|failed to authenticate|oauth|not logged in|invalid api key/i.test(output)) {
        throw new Error('Claude CLI login has expired or is invalid. Open a terminal and run: claude auth login');
      }
      const message = result.stderr || result.stdout || `Claude CLI exited with code ${result.code}`;
      throw new Error(`Claude CLI error: ${message}`);
    }

    if (!result.stdout) {
      throw new Error('Claude CLI returned an empty response');
    }

    return result.stdout;
  }
}

module.exports = ClaudeCLIIntegration;
