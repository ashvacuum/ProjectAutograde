const axios = require('axios');

class CanvasAPI {
  constructor() {
    this.baseUrl = null;
    this.token = null;
    this.headers = null;
  }

  authenticate(apiUrl, token) {
    this.baseUrl = apiUrl.replace(/\/$/, '');
    this.token = token;
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    return this.testConnection();
  }

  async testConnection() {
    try {
      const response = await axios.get(`${this.baseUrl}/users/self`, {
        headers: this.headers,
        timeout: 10000
      });
      return {
        success: true,
        user: response.data
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async getCourses() {
    try {
      const response = await axios.get(`${this.baseUrl}/courses`, {
        headers: this.headers,
        params: {
          enrollment_type: 'teacher',
          enrollment_state: 'active',
          state: ['available'],
          include: ['term'],
          per_page: 100
        }
      });
      return {
        success: true,
        courses: response.data.filter(course => !course.access_restricted_by_date && this.isCurrentCourse(course))
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  /**
   * True when the course's active period includes today. Course dates win
   * when the course overrides its term and actually has them (many courses
   * set the override with no dates), otherwise the term's dates are used.
   * A date missing from both counts as open-ended (e.g. "Default Term").
   */
  isCurrentCourse(course, now = Date.now()) {
    const own = course.restrict_enrollments_to_course_dates ? course : {};
    const term = course.term || {};
    const startAt = own.start_at || term.start_at;
    const endAt = own.end_at || term.end_at;
    const start = startAt ? Date.parse(startAt) : -Infinity;
    const end = endAt ? Date.parse(endAt) : Infinity;
    return start <= now && now <= end;
  }

  /**
   * True when either of the assignment's dates (available-from or due) falls
   * inside the course's active period. Undated assignments pass; the
   * has-submissions filter handles those.
   */
  isAssignmentInTerm(assignment, course) {
    const own = course.restrict_enrollments_to_course_dates ? course : {};
    const term = course.term || {};
    const startAt = own.start_at || term.start_at;
    const endAt = own.end_at || term.end_at;
    const start = startAt ? Date.parse(startAt) : -Infinity;
    const end = endAt ? Date.parse(endAt) : Infinity;
    const dates = [assignment.unlock_at, assignment.due_at].filter(Boolean).map(Date.parse);
    return dates.length === 0 || dates.some(d => start <= d && d <= end);
  }

  async getAssignments(courseId) {
    try {
      const [response, courseResponse] = await Promise.all([
        axios.get(`${this.baseUrl}/courses/${courseId}/assignments`, {
          headers: this.headers,
          params: { per_page: 100 }
        }),
        axios.get(`${this.baseUrl}/courses/${courseId}`, {
          headers: this.headers,
          params: { include: ['term'] }
        })
      ]);
      const course = courseResponse.data;
      // Sort by when the assignment opens; undated ones go last.
      const availableAt = a => Date.parse(a.unlock_at || a.due_at) || Infinity;

      return {
        success: true,
        assignments: response.data
          .filter(assignment =>
            (assignment.submission_types.includes('online_url') ||
              assignment.submission_types.includes('online_text_entry')) &&
            assignment.has_submitted_submissions &&
            this.isAssignmentInTerm(assignment, course)
          )
          .sort((a, b) => availableAt(a) - availableAt(b))
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async getSubmissions(courseId, assignmentId) {
    try {
      const response = await axios.get(`${this.baseUrl}/courses/${courseId}/assignments/${assignmentId}/submissions`, {
        headers: this.headers,
        params: {
          include: ['user', 'submission_comments', 'submission_history'],
          per_page: 100
        }
      });

      const submissions = response.data.filter(submission =>
        submission.submitted_at &&
        (submission.url || submission.body) &&
        submission.workflow_state !== 'unsubmitted'
      );

      const processedSubmissions = submissions.map(submission => {
        let githubUrl = null;

        if (submission.url) {
          githubUrl = this.extractGithubUrl(submission.url);
        } else if (submission.body) {
          githubUrl = this.extractGithubUrl(submission.body);
        }

        return {
          id: submission.id,
          user_id: submission.user_id,
          user: submission.user || { name: 'Unknown User', id: submission.user_id },
          submitted_at: submission.submitted_at,
          graded_at: submission.graded_at,
          github_url: githubUrl,
          githubUrl: githubUrl,
          score: submission.score,
          grade: submission.grade,
          workflow_state: submission.workflow_state,
          submission_comments: submission.submission_comments || [],
          attachments: submission.attachments || []
        };
      });

      return {
        success: true,
        submissions: processedSubmissions
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  extractGithubUrl(text) {
    if (!text) return null;

    const githubRegex = /https?:\/\/github\.com\/[^\s<>"']+/gi;
    const matches = text.match(githubRegex);

    if (matches && matches.length > 0) {
      let url = matches[0];

      // Remove trailing punctuation
      url = url.replace(/[.,;)]*$/, '');

      // Clean and normalize the URL
      url = this.cleanGithubUrl(url);

      return url;
    }

    return null;
  }

  cleanGithubUrl(url) {
    if (!url) return url;

    try {
      // Parse the URL
      const urlObj = new URL(url);

      // Remove query parameters and fragments
      urlObj.search = '';
      urlObj.hash = '';

      // Get the pathname and clean it
      let pathname = urlObj.pathname;

      // Remove .git suffix
      pathname = pathname.replace(/\.git$/, '');

      // Remove trailing slashes
      pathname = pathname.replace(/\/+$/, '');

      // Extract owner/repo from pathname
      // GitHub URLs are in format: /owner/repo[/optional-stuff]
      const pathParts = pathname.split('/').filter(part => part.length > 0);

      if (pathParts.length >= 2) {
        const owner = pathParts[0];
        const repo = pathParts[1];

        // Check if there are additional path segments that should be removed
        if (pathParts.length > 2) {
          const thirdPart = pathParts[2];

          // These are GitHub UI paths that should be removed
          const uiPaths = ['tree', 'blob', 'commit', 'commits', 'issues', 'pull', 'releases',
                          'wiki', 'actions', 'projects', 'security', 'pulse', 'graphs',
                          'settings', 'branches', 'tags', 'network', 'contributors'];

          // Common branch names or other paths that shouldn't be part of the base URL
          const commonBranches = ['main', 'master', 'develop', 'dev', 'production', 'staging', 'src'];

          // If the third part is a UI path or common branch/folder, strip everything after repo
          if (uiPaths.includes(thirdPart) || commonBranches.includes(thirdPart)) {
            pathname = `/${owner}/${repo}`;
          } else if (pathParts.length > 3) {
            // If there are 4+ parts, it's likely a deep path, keep only owner/repo
            pathname = `/${owner}/${repo}`;
          } else {
            // 3 parts - could be valid, keep for now but log it
            console.log(`⚠️ Unusual path with 3 segments: ${pathname}`);
            pathname = `/${owner}/${repo}`;
          }
        } else {
          // Only owner/repo, perfect!
          pathname = `/${owner}/${repo}`;
        }

        // Reconstruct the URL with cleaned path
        urlObj.pathname = pathname;
        const cleanedUrl = urlObj.toString().replace(/\/+$/, '');

        if (url !== cleanedUrl) {
          console.log(`🧹 Cleaned URL: ${url} → ${cleanedUrl}`);
        }

        return cleanedUrl;
      } else {
        // Invalid GitHub URL structure
        console.warn(`⚠️ Invalid GitHub URL structure: ${url}`);
        return url;
      }
    } catch (error) {
      console.warn(`⚠️ Failed to parse URL: ${url}`, error);
      // If URL parsing fails, just do basic cleanup
      return url
        .replace(/[?#].*$/, '') // Remove query string and fragment
        .replace(/\/+$/, '') // Remove trailing slashes
        .replace(/\.git$/, ''); // Remove .git suffix
    }
  }

  async postComment(courseId, assignmentId, userId, comment) {
    try {
      const commentData = {
        comment: {
          text_comment: comment
        }
      };

      await axios.put(
        `${this.baseUrl}/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
        commentData,
        { headers: this.headers }
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async postGrade(courseId, assignmentId, userId, grade, comment = '') {
    try {
      const gradeData = {
        submission: {
          posted_grade: grade
        }
      };

      const gradeResponse = await axios.put(
        `${this.baseUrl}/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
        gradeData,
        { headers: this.headers }
      );

      if (comment) {
        const commentData = {
          comment: {
            text_comment: comment
          }
        };

        await axios.put(
          `${this.baseUrl}/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}`,
          commentData,
          { headers: this.headers }
        );
      }

      return {
        success: true,
        submission: gradeResponse.data
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async getBatchSubmissions(courseId, assignmentIds) {
    try {
      const allSubmissions = [];

      for (const assignmentId of assignmentIds) {
        const result = await this.getSubmissions(courseId, assignmentId);
        if (result.success) {
          allSubmissions.push(...result.submissions.map(sub => ({
            ...sub,
            assignment_id: assignmentId
          })));
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return {
        success: true,
        submissions: allSubmissions
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  handleError(error) {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.message || error.response.statusText;

      switch (status) {
        case 401:
          return 'Invalid Canvas API token or token has expired';
        case 403:
          return 'Insufficient permissions to access this resource';
        case 404:
          return 'Resource not found - check course/assignment IDs';
        case 429:
          return 'Too many requests - please wait and try again';
        case 500:
          return 'Canvas server error - please try again later';
        default:
          return `Canvas API error (${status}): ${message}`;
      }
    } else if (error.request) {
      return 'Unable to connect to Canvas - check your internet connection and API URL';
    } else {
      return `Request error: ${error.message}`;
    }
  }
}

module.exports = CanvasAPI;