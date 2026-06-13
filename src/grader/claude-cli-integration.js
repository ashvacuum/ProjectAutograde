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
        child = spawn('claude', args, { shell: true });
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

    const result = await this._run(['-p', '--output-format', 'text'], prompt);

    if (result.code !== 0) {
      const message = result.stderr || `Claude CLI exited with code ${result.code}`;
      throw new Error(`Claude CLI error: ${message}`);
    }

    if (!result.stdout) {
      throw new Error('Claude CLI returned an empty response');
    }

    return result.stdout;
  }
}

module.exports = ClaudeCLIIntegration;
