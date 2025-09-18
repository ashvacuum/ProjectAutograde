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
          state: ['available', 'completed'],
          per_page: 100
        }
      });
      return {
        success: true,
        courses: response.data.filter(course => !course.access_restricted_by_date)
      };
    } catch (error) {
      return {
        success: false,
        error: this.handleError(error)
      };
    }
  }

  async getAssignments(courseId) {
    try {
      const response = await axios.get(`${this.baseUrl}/courses/${courseId}/assignments`, {
        headers: this.headers,
        params: {
          per_page: 100,
          order_by: 'due_at'
        }
      });
      return {
        success: true,
        assignments: response.data.filter(assignment =>
          assignment.submission_types.includes('online_url') ||
          assignment.submission_types.includes('online_text_entry')
        )
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
          include: ['user', 'submission_comments'],
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
          user_name: submission.user?.name || 'Unknown User',
          submitted_at: submission.submitted_at,
          github_url: githubUrl,
          score: submission.score,
          grade: submission.grade,
          workflow_state: submission.workflow_state,
          submission_comments: submission.submission_comments || []
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
      return matches[0].replace(/[.,;)]*$/, '');
    }

    return null;
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