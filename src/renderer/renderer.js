class UnityAutoGraderApp {
    constructor() {
        this.currentPanel = 'dashboard';
        this.canvasConnected = false;
        this.claudeCodeAvailable = false;
        this.activeGradingSession = null;
        this.gradingResults = [];

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.checkStoredCanvasAuth();
        await this.checkClaudeCodeStatus();
        this.loadDashboardData();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const panel = item.dataset.panel;
                this.showPanel(panel);
            });
        });

        // Canvas Authentication Form
        const canvasAuthForm = document.getElementById('canvas-auth-form');
        if (canvasAuthForm) {
            canvasAuthForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.authenticateCanvas();
            });
        }

        // Course selection
        const courseSelect = document.getElementById('course-select');
        if (courseSelect) {
            courseSelect.addEventListener('change', () => {
                this.loadAssignments();
            });
        }

        // Listen for app events
        if (window.electronAPI) {
            window.electronAPI.onAppError((event, error) => {
                this.showToast(`Application Error: ${error.message}`, 'error');
            });

            window.electronAPI.onGradingProgress((event, progress) => {
                this.updateGradingProgress(progress);
            });

            window.electronAPI.onGradingComplete((event, results) => {
                this.handleGradingComplete(results);
            });
        }
    }

    showPanel(panelName) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-panel="${panelName}"]`).classList.add('active');

        // Update content panels
        document.querySelectorAll('.content-panel').forEach(panel => {
            panel.classList.remove('active');
        });
        document.getElementById(`${panelName}-panel`).classList.add('active');

        this.currentPanel = panelName;

        // Load panel-specific data
        switch (panelName) {
            case 'canvas-setup':
                this.loadCanvasSetupData();
                break;
            case 'assignments':
                this.loadCoursesForAssignments();
                break;
            case 'criteria':
                this.loadCriteriaTemplates();
                break;
            case 'results':
                this.loadGradingResults();
                break;
            case 'grading':
                this.loadGradingPanel();
                break;
        }
    }

    async checkStoredCanvasAuth() {
        try {
            const stored = await window.electronAPI.store.get('canvas.user');
            if (stored) {
                this.canvasConnected = true;
                this.updateConnectionStatus('connected');
                this.showToast('Canvas credentials loaded successfully', 'success');
            }
        } catch (error) {
            console.error('Error checking stored Canvas auth:', error);
        }
    }

    async checkClaudeCodeStatus() {
        try {
            const status = await window.electronAPI.claudeCode.getAnalysisResult('status');
            this.claudeCodeAvailable = status && status.isAvailable;

            const statusElement = document.getElementById('claude-status');
            const indicatorElement = document.getElementById('claude-indicator');

            if (this.claudeCodeAvailable) {
                statusElement.textContent = 'Claude Code is available and ready for AI-powered grading.';
                indicatorElement.className = 'status-indicator status-connected';
                indicatorElement.textContent = 'Available';
            } else {
                statusElement.textContent = 'Claude Code not found. Grading will use basic code analysis only. Install Claude Desktop for AI grading features.';
                indicatorElement.className = 'status-indicator status-disconnected';
                indicatorElement.textContent = 'Not Available';
            }
        } catch (error) {
            console.error('Error checking Claude Code status:', error);
            this.claudeCodeAvailable = false;

            const statusElement = document.getElementById('claude-status');
            const indicatorElement = document.getElementById('claude-indicator');

            statusElement.textContent = 'Unable to check Claude Code status. Grading will use basic analysis.';
            indicatorElement.className = 'status-indicator status-disconnected';
            indicatorElement.textContent = 'Unknown';
        }
    }

    async authenticateCanvas() {
        const url = document.getElementById('canvas-url').value.trim();
        const token = document.getElementById('canvas-token').value.trim();

        if (!url || !token) {
            this.showToast('Please enter both Canvas URL and API token', 'warning');
            return;
        }

        try {
            this.showToast('Connecting to Canvas...', 'info');

            const result = await window.electronAPI.canvas.authenticate(url, token);

            if (result.success) {
                this.canvasConnected = true;
                this.updateConnectionStatus('connected');
                this.showCanvasUserInfo(result.user);
                this.showToast('Successfully connected to Canvas!', 'success');
            } else {
                this.showToast(`Canvas connection failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error connecting to Canvas: ${error.message}`, 'error');
        }
    }

    async testCanvasConnection() {
        const url = document.getElementById('canvas-url').value.trim();
        const token = document.getElementById('canvas-token').value.trim();

        if (!url || !token) {
            this.showToast('Please enter both Canvas URL and API token', 'warning');
            return;
        }

        try {
            this.showToast('Testing Canvas connection...', 'info');
            const result = await window.electronAPI.canvas.authenticate(url, token);

            if (result.success) {
                this.showToast('Canvas connection test successful!', 'success');
            } else {
                this.showToast(`Connection test failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Connection test error: ${error.message}`, 'error');
        }
    }

    showCanvasUserInfo(user) {
        const infoCard = document.getElementById('canvas-info');
        const userInfoDiv = document.getElementById('canvas-user-info');

        userInfoDiv.innerHTML = `
            <p><strong>Name:</strong> ${user.name}</p>
            <p><strong>Email:</strong> ${user.primary_email || user.email || 'Not available'}</p>
            <p><strong>ID:</strong> ${user.id}</p>
            <p><strong>Connected:</strong> ${new Date().toLocaleString()}</p>
        `;

        infoCard.style.display = 'block';
    }

    async loadCoursesForAssignments() {
        if (!this.canvasConnected) {
            document.getElementById('assignments-list').innerHTML =
                '<p>Please connect to Canvas first in the Canvas Setup section.</p>';
            return;
        }

        try {
            const result = await window.electronAPI.canvas.getCourses();
            const courseSelect = document.getElementById('course-select');

            if (result.success && result.courses.length > 0) {
                courseSelect.innerHTML = '<option value="">Select a course...</option>';
                result.courses.forEach(course => {
                    const option = document.createElement('option');
                    option.value = course.id;
                    option.textContent = course.name;
                    courseSelect.appendChild(option);
                });
            } else {
                courseSelect.innerHTML = '<option value="">No courses found</option>';
            }
        } catch (error) {
            this.showToast(`Error loading courses: ${error.message}`, 'error');
        }
    }

    async loadAssignments() {
        const courseId = document.getElementById('course-select').value;
        const assignmentsList = document.getElementById('assignments-list');

        if (!courseId) {
            assignmentsList.innerHTML = '<p>Select a course to view assignments.</p>';
            return;
        }

        try {
            this.showToast('Loading assignments...', 'info');
            const result = await window.electronAPI.canvas.getAssignments(courseId);

            if (result.success && result.assignments.length > 0) {
                let html = '<table class="table"><thead><tr><th>Assignment</th><th>Due Date</th><th>Submissions</th><th>Actions</th></tr></thead><tbody>';

                for (const assignment of result.assignments) {
                    const dueDate = assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'No due date';
                    html += `
                        <tr>
                            <td>${assignment.name}</td>
                            <td>${dueDate}</td>
                            <td><button class="btn btn-secondary" onclick="app.viewSubmissions(${courseId}, ${assignment.id})">View</button></td>
                            <td><button class="btn" onclick="app.gradeAssignment(${courseId}, ${assignment.id})">Grade</button></td>
                        </tr>
                    `;
                }

                html += '</tbody></table>';
                assignmentsList.innerHTML = html;
            } else {
                assignmentsList.innerHTML = '<p>No assignments found for this course.</p>';
            }

            this.showToast('Assignments loaded successfully', 'success');
        } catch (error) {
            assignmentsList.innerHTML = '<p>Error loading assignments.</p>';
            this.showToast(`Error loading assignments: ${error.message}`, 'error');
        }
    }

    async viewSubmissions(courseId, assignmentId) {
        try {
            this.showToast('Loading submissions...', 'info');
            const result = await window.electronAPI.canvas.getSubmissions(courseId, assignmentId);

            if (result.success) {
                console.log('Submissions:', result.submissions);
                this.showToast(`Found ${result.submissions.length} submissions`, 'success');

                // Could open a modal or navigate to a detailed view
                // For now, just show count and GitHub URLs
                const githubSubmissions = result.submissions.filter(sub => sub.github_url);
                this.showToast(`${githubSubmissions.length} submissions have GitHub URLs`, 'info');
            }
        } catch (error) {
            this.showToast(`Error loading submissions: ${error.message}`, 'error');
        }
    }

    async startBatchGrading() {
        if (!this.canvasConnected) {
            this.showToast('Please connect to Canvas first', 'warning');
            return;
        }

        if (!this.claudeCodeAvailable) {
            this.showToast('Claude Code is not available for grading', 'warning');
            return;
        }

        const courseId = document.getElementById('course-select')?.value;
        if (!courseId) {
            this.showToast('Please select a course and assignment first', 'warning');
            this.showPanel('assignments');
            return;
        }

        try {
            this.showToast('Starting batch grading...', 'info');

            // Show progress UI
            document.getElementById('progress-bar').style.display = 'block';
            document.getElementById('start-grading-btn').disabled = true;
            document.getElementById('cancel-grading-btn').style.display = 'inline-block';

            // This would typically get the assignment ID and criteria from the UI
            // For demo purposes, we'll use placeholder values
            const mockCriteria = {
                items: [
                    {
                        name: 'Vector Mathematics',
                        description: 'Proper use of Vector3 operations',
                        points: 25,
                        weight: 'high'
                    },
                    {
                        name: 'Code Quality',
                        description: 'Clean, readable, well-organized code',
                        points: 25,
                        weight: 'medium'
                    }
                ]
            };

            // Start grading process (this would be implemented based on your specific needs)
            this.activeGradingSession = {
                courseId: courseId,
                startTime: Date.now(),
                totalSubmissions: 0,
                completedSubmissions: 0
            };

        } catch (error) {
            this.showToast(`Error starting batch grading: ${error.message}`, 'error');
            this.resetGradingUI();
        }
    }

    updateGradingProgress(progress) {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('grading-progress');

        if (progressFill) {
            progressFill.style.width = `${progress.percentage}%`;
        }

        if (progressText) {
            progressText.innerHTML = `
                <p>Grading in progress: ${progress.current}/${progress.total} submissions</p>
                <p>Current: ${progress.currentStudent || 'Processing...'}</p>
            `;
        }
    }

    handleGradingComplete(results) {
        this.gradingResults = results;
        this.activeGradingSession = null;

        this.resetGradingUI();
        this.showToast(`Grading complete! Processed ${results.length} submissions`, 'success');

        // Navigate to results panel
        this.showPanel('results');
    }

    resetGradingUI() {
        document.getElementById('progress-bar').style.display = 'none';
        document.getElementById('start-grading-btn').disabled = false;
        document.getElementById('cancel-grading-btn').style.display = 'none';
        document.getElementById('grading-progress').innerHTML = '<p>No active grading session.</p>';
    }

    async loadCriteriaTemplates() {
        try {
            const templates = await window.electronAPI.store.get('criteria.templates') || [];
            const templatesDiv = document.getElementById('criteria-templates');

            if (templates.length === 0) {
                templatesDiv.innerHTML = '<p>No criteria templates found. Create your first template above.</p>';
            } else {
                let html = '';
                templates.forEach((template, index) => {
                    html += `
                        <div class="card">
                            <h4>${template.name}</h4>
                            <p>${template.description}</p>
                            <p><strong>Items:</strong> ${template.items.length}</p>
                            <button class="btn btn-secondary" onclick="app.editCriteria(${index})">Edit</button>
                            <button class="btn btn-secondary" onclick="app.deleteCriteria(${index})">Delete</button>
                        </div>
                    `;
                });
                templatesDiv.innerHTML = html;
            }
        } catch (error) {
            console.error('Error loading criteria templates:', error);
        }
    }

    async loadDefaultCriteria() {
        const defaultCriteria = {
            name: 'Unity Math Basics',
            description: 'Default criteria for Unity math assignments',
            items: [
                {
                    name: 'Vector Operations',
                    description: 'Proper use of Vector3.Dot, Cross, Normalize, Magnitude',
                    points: 25,
                    weight: 'high'
                },
                {
                    name: 'Transform Mathematics',
                    description: 'Position, rotation, scale manipulations',
                    points: 20,
                    weight: 'high'
                },
                {
                    name: 'Physics Integration',
                    description: 'Rigidbody forces, collision detection',
                    points: 20,
                    weight: 'medium'
                },
                {
                    name: 'Code Organization',
                    description: 'Proper MonoBehaviour structure, clean code',
                    points: 20,
                    weight: 'medium'
                },
                {
                    name: 'Performance',
                    description: 'Efficient math in Update() loops',
                    points: 15,
                    weight: 'low'
                }
            ]
        };

        try {
            let templates = await window.electronAPI.store.get('criteria.templates') || [];
            templates.push(defaultCriteria);
            await window.electronAPI.store.set('criteria.templates', templates);

            this.loadCriteriaTemplates();
            this.showToast('Default criteria template added!', 'success');
        } catch (error) {
            this.showToast(`Error adding default criteria: ${error.message}`, 'error');
        }
    }

    loadGradingResults() {
        const resultsTable = document.getElementById('results-table');

        if (this.gradingResults.length === 0) {
            resultsTable.innerHTML = '<p>No grading results available.</p>';
            return;
        }

        let html = '<table class="table"><thead><tr><th>Student</th><th>Grade</th><th>Feedback</th><th>Actions</th></tr></thead><tbody>';

        this.gradingResults.forEach((result, index) => {
            html += `
                <tr>
                    <td>${result.studentName || 'Unknown'}</td>
                    <td>${result.grade || 'N/A'}/${result.maxPoints || 100}</td>
                    <td>${(result.feedback || '').substring(0, 50)}...</td>
                    <td><button class="btn btn-secondary" onclick="app.viewDetailedResult(${index})">View Details</button></td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        resultsTable.innerHTML = html;
    }

    async exportResults(format) {
        if (this.gradingResults.length === 0) {
            this.showToast('No results to export', 'warning');
            return;
        }

        try {
            const filename = `grading_results_${new Date().toISOString().slice(0, 10)}`;

            switch (format) {
                case 'csv':
                    await window.electronAPI.export.toCsv(this.gradingResults, filename);
                    break;
                case 'json':
                    await window.electronAPI.export.toJson(this.gradingResults, filename);
                    break;
                case 'pdf':
                    await window.electronAPI.export.toPdf(this.gradingResults, filename);
                    break;
            }

            this.showToast(`Results exported to ${format.toUpperCase()} successfully!`, 'success');
        } catch (error) {
            this.showToast(`Export failed: ${error.message}`, 'error');
        }
    }

    updateConnectionStatus(status) {
        const statusElement = document.getElementById('connection-status');

        switch (status) {
            case 'connected':
                statusElement.className = 'status-indicator status-connected';
                statusElement.textContent = 'Connected';
                break;
            case 'disconnected':
                statusElement.className = 'status-indicator status-disconnected';
                statusElement.textContent = 'Disconnected';
                break;
            case 'loading':
                statusElement.className = 'status-indicator status-loading';
                statusElement.textContent = 'Connecting...';
                break;
        }
    }

    loadDashboardData() {
        // Update recent activity
        const recentActivity = document.getElementById('recent-activity');

        // This would typically load from stored data
        const activities = [
            'Application started',
            'Checking system status...'
        ];

        if (activities.length > 0) {
            let html = '<ul>';
            activities.forEach(activity => {
                html += `<li>${activity}</li>`;
            });
            html += '</ul>';
            recentActivity.innerHTML = html;
        }
    }

    loadCanvasSetupData() {
        // Load stored Canvas URL if available
        window.electronAPI.store.get('canvas.apiUrl').then(url => {
            if (url) {
                document.getElementById('canvas-url').value = url;
            }
        });
    }

    loadGradingPanel() {
        const startBtn = document.getElementById('start-grading-btn');
        startBtn.disabled = !this.canvasConnected || !this.claudeCodeAvailable;

        if (!this.canvasConnected) {
            document.getElementById('grading-progress').innerHTML =
                '<p>Canvas connection required for grading. Please connect in the Canvas Setup section.</p>';
        } else if (!this.claudeCodeAvailable) {
            document.getElementById('grading-progress').innerHTML =
                '<p>Claude Code integration is not available. Please check your Claude Code installation.</p>';
        }
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }
}

// Global functions for HTML onclick handlers
window.showPanel = (panel) => window.app.showPanel(panel);
window.testCanvasConnection = () => window.app.testCanvasConnection();
window.createNewCriteria = () => window.app.showToast('Criteria builder coming soon!', 'info');
window.loadDefaultCriteria = () => window.app.loadDefaultCriteria();
window.startBatchGrading = () => window.app.startBatchGrading();
window.cancelGrading = () => window.app.resetGradingUI();
window.exportResults = (format) => window.app.exportResults(format);
window.checkClaudeCode = () => window.app.checkClaudeCodeStatus();

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new UnityAutoGraderApp();
});