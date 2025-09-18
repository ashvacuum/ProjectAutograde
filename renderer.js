// renderer.js - Frontend JavaScript for the Electron app
class UnityGraderUI {
    constructor() {
        this.currentPage = 'dashboard';
        this.canvasConnected = false;
        this.courses = [];
        this.assignments = [];
        this.criteriaTemplates = [];
        this.gradingResults = null;
        this.isGrading = false;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadStoredData();
        this.loadAppInfo();
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.getAttribute('data-page');
                this.showPage(page);
            });
        });

        // Canvas setup form
        document.getElementById('canvas-config-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.testCanvasConnection();
        });

        // Criteria form
        document.getElementById('criteria-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveCriteriaTemplate();
        });

        // Grading form
        document.getElementById('grading-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.startGrading();
        });

        // Settings form
        document.getElementById('settings-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSettings();
        });

        // Course selection
        document.getElementById('course-select').addEventListener('change', (e) => {
            this.loadAssignments(e.target.value);
        });

        // Grading course selection
        document.getElementById('grading-course-select').addEventListener('change', (e) => {
            this.loadGradingAssignments(e.target.value);
        });

        // Cancel grading
        document.getElementById('cancel-grading-btn').addEventListener('click', () => {
            this.cancelGrading();
        });

        // Listen for progress updates
        window.electronAPI.onGradingProgress((event, progress) => {
            this.updateGradingProgress(progress);
        });

        // Listen for stored data
        window.electronAPI.onStoredData((event, data) => {
            this.loadStoredCanvasData(data);
        });
    }

    showPage(pageId) {
        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-page="${pageId}"]`).classList.add('active');

        // Show page
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(pageId).classList.add('active');

        this.currentPage = pageId;

        // Load page-specific data
        if (pageId === 'assignments') {
            this.loadCourses();
        } else if (pageId === 'grading') {
            this.loadGradingData();
        } else if (pageId === 'criteria') {
            this.loadCriteriaTemplates();
        }
    }

    async testCanvasConnection() {
        const btn = document.getElementById('test-connection-btn');
        const originalText = btn.innerHTML;
        
        btn.innerHTML = '<div class="spinner"></div> Testing...';
        btn.disabled = true;

        try {
            const config = {
                canvasApiUrl: document.getElementById('canvas-url').value.replace(/\/$/, '') + '/api/v1',
                canvasToken: document.getElementById('canvas-token').value,
                anthropicApiKey: document.getElementById('claude-api-key').value,
                githubToken: document.getElementById('github-token').value || null
            };

            const result = await window.electronAPI.canvasLogin(config);
            
            if (result.success) {
                this.canvasConnected = true;
                this.updateSystemStatus();
                this.showNotification('Canvas connection successful!', 'success');
                this.showPage('dashboard');
            } else {
                this.showNotification('Connection failed: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Connection error: ' + error.message, 'error');
        }

        btn.innerHTML = originalText;
        btn.disabled = false;
    }

    async loadCourses() {
        try {
            const result = await window.electronAPI.getCourses();
            if (result.success) {
                this.courses = result.courses;
                this.populateCourseSelect();
            } else {
                this.showNotification('Failed to load courses: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Error loading courses: ' + error.message, 'error');
        }
    }

    populateCourseSelect() {
        const selects = [
            document.getElementById('course-select'),
            document.getElementById('grading-course-select')
        ];

        selects.forEach(select => {
            select.innerHTML = '<option value="">Select a course</option>';
            this.courses.forEach(course => {
                const option = document.createElement('option');
                option.value = course.id;
                option.textContent = course.name;
                select.appendChild(option);
            });
        });
    }

    async loadAssignments(courseId) {
        if (!courseId) {
            document.getElementById('assignments-list').innerHTML = 
                '<p style="color: rgba(255,255,255,0.6);">Select a course to view assignments</p>';
            return;
        }

        try {
            const result = await window.electronAPI.getAssignments(courseId);
            if (result.success) {
                this.assignments = result.assignments;
                this.displayAssignments();
            } else {
                this.showNotification('Failed to load assignments: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Error loading assignments: ' + error.message, 'error');
        }
    }

    displayAssignments() {
        const container = document.getElementById('assignments-list');
        
        if (this.assignments.length === 0) {
            container.innerHTML = '<p style="color: rgba(255,255,255,0.6);">No assignments found for this course.</p>';
            return;
        }

        const html = `
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Assignment Name</th>
                            <th>Due Date</th>
                            <th>Submissions</th>
                            <th>Type</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.assignments.map(assignment => `
                            <tr>
                                <td>${assignment.name}</td>
                                <td>${assignment.due_at ? new Date(assignment.due_at).toLocaleDateString() : 'No due date'}</td>
                                <td>${assignment.submissions_count || 0}</td>
                                <td>${assignment.submission_types ? assignment.submission_types.join(', ') : 'N/A'}</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm" onclick="ui.selectAssignmentForGrading('${assignment.id}', '${assignment.name}')">
                                        <i class="fas fa-robot"></i>
                                        Grade
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    }

    async loadGradingAssignments(courseId) {
        if (!courseId) return;

        try {
            const result = await window.electronAPI.getAssignments(courseId);
            if (result.success) {
                const select = document.getElementById('grading-assignment-select');
                select.innerHTML = '<option value="">Select an assignment</option>';
                
                result.assignments.forEach(assignment => {
                    const option = document.createElement('option');
                    option.value = assignment.id;
                    option.textContent = assignment.name;
                    select.appendChild(option);
                });
            }
        } catch (error) {
            this.showNotification('Error loading assignments: ' + error.message, 'error');
        }
    }

    async loadCriteriaTemplates() {
        try {
            const result = await window.electronAPI.getCriteriaTemplates();
            if (result.success) {
                this.criteriaTemplates = result.templates;
                this.displayCriteriaTemplates();
                this.populateCriteriaSelect();
            }
        } catch (error) {
            this.showNotification('Error loading criteria: ' + error.message, 'error');
        }
    }

    displayCriteriaTemplates() {
        const container = document.getElementById('saved-criteria');
        
        if (this.criteriaTemplates.length === 0) {
            container.innerHTML = '<p style="color: rgba(255,255,255,0.6);">No saved criteria templates yet.</p>';
            return;
        }

        const html = this.criteriaTemplates.map(template => `
            <div class="card" style="margin: 10px 0;">
                <div class="card-header">
                    <h4>${template.name}</h4>
                    <button class="btn btn-danger" onclick="ui.deleteCriteriaTemplate('${template.id}')">
                        <i class="fas fa-trash"></i>
                        Delete
                    </button>
                </div>
                <p style="color: rgba(255,255,255,0.7); margin-bottom: 10px;">${template.description}</p>
                <div>
                    ${template.criteria.map(criterion => `
                        <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
                            <span>${criterion.name}</span>
                            <span>${criterion.points} pts</span>
                        </div>
                    `).join('')}
                </div>
                <div style="margin-top: 10px; font-weight: bold;">
                    Total: ${template.criteria.reduce((sum, c) => sum + c.points, 0)} points
                </div>
            </div>
        `).join('');

        container.innerHTML = html;
    }

    populateCriteriaSelect() {
        const select = document.getElementById('grading-criteria-select');
        select.innerHTML = '<option value="">Select criteria template</option>';
        
        this.criteriaTemplates.forEach(template => {
            const option = document.createElement('option');
            option.value = template.id;
            option.textContent = `${template.name} (${template.criteria.reduce((sum, c) => sum + c.points, 0)} pts)`;
            select.appendChild(option);
        });
    }

    async saveCriteriaTemplate() {
        try {
            const name = document.getElementById('criteria-name').value;
            const description = document.getElementById('criteria-description').value;
            
            const criteriaItems = document.querySelectorAll('#criteria-builder .criteria-item');
            const criteria = [];
            
            criteriaItems.forEach(item => {
                const name = item.querySelector('[data-field="name"]').value;
                const points = parseInt(item.querySelector('[data-field="points"]').value) || 0;
                const description = item.querySelector('[data-field="description"]').value;
                
                if (name) {
                    criteria.push({ name, points, description });
                }
            });

            if (criteria.length === 0) {
                this.showNotification('Please add at least one criterion', 'error');
                return;
            }

            const criteriaData = {
                name,
                description,
                criteria,
                createdAt: new Date().toISOString()
            };

            const result = await window.electronAPI.saveCriteria(criteriaData);
            if (result.success) {
                this.showNotification('Criteria template saved successfully!', 'success');
                document.getElementById('criteria-form').reset();
                this.resetCriteriaBuilder();
                this.loadCriteriaTemplates();
            } else {
                this.showNotification('Failed to save criteria: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Error saving criteria: ' + error.message, 'error');
        }
    }

    async deleteCriteriaTemplate(criteriaId) {
        if (!confirm('Are you sure you want to delete this criteria template?')) {
            return;
        }

        try {
            const result = await window.electronAPI.deleteCriteria(criteriaId);
            if (result.success) {
                this.showNotification('Criteria template deleted', 'success');
                this.loadCriteriaTemplates();
            } else {
                this.showNotification('Failed to delete criteria: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Error deleting criteria: ' + error.message, 'error');
        }
    }

    loadGradingData() {
        this.loadCourses();
        this.loadCriteriaTemplates();
    }

    async startGrading() {
        if (this.isGrading) {
            this.showNotification('Grading already in progress', 'error');
            return;
        }

        try {
            const courseId = document.getElementById('grading-course-select').value;
            const assignmentId = document.getElementById('grading-assignment-select').value;
            const criteriaId = document.getElementById('grading-criteria-select').value;
            const instructions = document.getElementById('grading-instructions').value;
            const useClaudeCode = document.getElementById('use-claude-code').checked;

            if (!courseId || !assignmentId || !criteriaId || !instructions) {
                this.showNotification('Please fill in all required fields', 'error');
                return;
            }

            const selectedCriteria = this.criteriaTemplates.find(t => t.id === criteriaId);
            if (!selectedCriteria) {
                this.showNotification('Selected criteria template not found', 'error');
                return;
            }

            const gradingData = {
                courseId,
                assignmentId,
                criteria: selectedCriteria.criteria,
                instructions,
                useClaudeCode
            };

            this.isGrading = true;
            document.getElementById('grading-progress-container').classList.add('show');
            document.getElementById('start-grading-btn').disabled = true;

            const result = await window.electronAPI.startGrading(gradingData);
            
            this.isGrading = false;
            document.getElementById('start-grading-btn').disabled = false;

            if (result.success) {
                this.gradingResults = result.results;
                this.showNotification('Grading completed successfully!', 'success');
                this.showPage('results');
                this.displayResults();
            } else {
                this.showNotification('Grading failed: ' + result.error, 'error');
            }

            document.getElementById('grading-progress-container').classList.remove('show');

        } catch (error) {
            this.isGrading = false;
            document.getElementById('start-grading-btn').disabled = false;
            document.getElementById('grading-progress-container').classList.remove('show');
            this.showNotification('Error starting grading: ' + error.message, 'error');
        }
    }

    async cancelGrading() {
        try {
            await window.electronAPI.cancelGrading();
            this.isGrading = false;
            document.getElementById('grading-progress-container').classList.remove('show');
            document.getElementById('start-grading-btn').disabled = false;
            this.showNotification('Grading cancelled', 'info');
        } catch (error) {
            this.showNotification('Error cancelling grading: ' + error.message, 'error');
        }
    }

    updateGradingProgress(progress) {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        const gradingLog = document.getElementById('grading-log');

        if (progress.percentage !== undefined) {
            progressFill.style.width = progress.percentage + '%';
        }

        if (progress.message) {
            progressText.textContent = progress.message;
            
            // Add to log
            const logEntry = document.createElement('div');
            logEntry.style.cssText = 'padding: 5px; border-left: 3px solid #4CAF50; margin: 5px 0; background: rgba(255,255,255,0.05);';
            logEntry.innerHTML = `<small style="color: rgba(255,255,255,0.6);">${new Date().toLocaleTimeString()}</small><br>${progress.message}`;
            gradingLog.appendChild(logEntry);
            gradingLog.scrollTop = gradingLog.scrollHeight;
        }
    }

    displayResults() {
        if (!this.gradingResults) {
            return;
        }

        const container = document.getElementById('results-content');
        
        // Create results summary
        const html = `
            <div class="table-container">
                <h4>Grading Summary</h4>
                <p>Processed: ${this.gradingResults.length} submissions</p>
                <p>Average Grade: ${this.calculateAverageGrade().toFixed(1)}</p>
                
                <table class="table">
                    <thead>
                        <tr>
                            <th>Student ID</th>
                            <th>Grade</th>
                            <th>Status</th>
                            <th>Feedback Preview</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.gradingResults.map(result => `
                            <tr>
                                <td>${result.studentId}</td>
                                <td>${result.grade}/100</td>
                                <td>
                                    <span class="status ${result.success ? 'status-connected' : 'status-disconnected'}">
                                        ${result.success ? 'Graded' : 'Failed'}
                                    </span>
                                </td>
                                <td>${result.feedback ? result.feedback.substring(0, 100) + '...' : 'No feedback'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    }

    calculateAverageGrade() {
        if (!this.gradingResults || this.gradingResults.length === 0) return 0;
        
        const validGrades = this.gradingResults.filter(r => r.success && r.grade);
        if (validGrades.length === 0) return 0;
        
        const sum = validGrades.reduce((acc, r) => acc + r.grade, 0);
        return sum / validGrades.length;
    }

    selectAssignmentForGrading(assignmentId, assignmentName) {
        this.showPage('grading');
        
        // Pre-select the assignment
        setTimeout(() => {
            const select = document.getElementById('grading-assignment-select');
            select.value = assignmentId;
        }, 100);
    }

    updateSystemStatus() {
        const statusContainer = document.getElementById('system-status');
        const canvasStatus = this.canvasConnected ? 
            '<div class="status status-connected"><i class="fas fa-circle"></i> Canvas: Connected</div>' :
            '<div class="status status-disconnected"><i class="fas fa-circle"></i> Canvas: Not Connected</div>';
        
        statusContainer.innerHTML = canvasStatus;
    }

    async loadStoredData() {
        // This will be called when stored data is received from main process
    }

    loadStoredCanvasData(data) {
        if (data.canvasConfig && data.canvasConfig.canvasApiUrl) {
            this.canvasConnected = true;
            this.updateSystemStatus();
            
            // Pre-populate Canvas form
            document.getElementById('canvas-url').value = data.canvasConfig.canvasApiUrl.replace('/api/v1', '');
            document.getElementById('canvas-token').value = data.canvasConfig.canvasToken || '';
            document.getElementById('claude-api-key').value = data.canvasConfig.anthropicApiKey || '';
            document.getElementById('github-token').value = data.canvasConfig.githubToken || '';
        }

        if (data.savedCriteria) {
            this.criteriaTemplates = data.savedCriteria;
        }
    }

    async loadAppInfo() {
        try {
            const info = await window.electronAPI.getAppInfo();
            document.getElementById('app-info').innerHTML = `
                <p><strong>Version:</strong> ${info.version}</p>
                <p><strong>Platform:</strong> ${info.platform}</p>
                <p><strong>Architecture:</strong> ${info.arch}</p>
                <p style="margin-top: 15px; color: rgba(255,255,255,0.6);">
                    Unity Auto-Grader - Automated grading for Unity game development assignments
                </p>
            `;
        } catch (error) {
            console.error('Error loading app info:', error);
        }
    }

    async saveSettings() {
        try {
            const settings = {
                theme: document.getElementById('theme-select').value,
                maxConcurrentGrading: parseInt(document.getElementById('max-concurrent').value),
                notifications: document.getElementById('notifications-enabled').checked,
                autoSave: document.getElementById('auto-save').checked
            };

            const result = await window.electronAPI.saveSettings(settings);
            if (result.success) {
                this.showNotification('Settings saved successfully!', 'success');
            } else {
                this.showNotification('Failed to save settings', 'error');
            }
        } catch (error) {
            this.showNotification('Error saving settings: ' + error.message, 'error');
        }
    }

    async exportResults(format) {
        if (!this.gradingResults) {
            this.showNotification('No results to export', 'error');
            return;
        }

        try {
            const result = await window.electronAPI.exportResults(this.gradingResults, format);
            if (result.success) {
                this.showNotification(`Results exported to ${result.filePath}`, 'success');
            } else {
                this.showNotification('Export failed: ' + result.error, 'error');
            }
        } catch (error) {
            this.showNotification('Export error: ' + error.message, 'error');
        }
    }

    async clearAllData() {
        try {
            const result = await window.electronAPI.clearAppData();
            if (result.success) {
                this.showNotification('All data cleared successfully', 'success');
                // Reset UI state
                this.canvasConnected = false;
                this.criteriaTemplates = [];
                this.gradingResults = null;
                this.updateSystemStatus();
                this.showPage('dashboard');
                
                // Clear forms
                document.getElementById('canvas-config-form').reset();
                document.getElementById('criteria-form').reset();
            }
        } catch (error) {
            this.showNotification('Error clearing data: ' + error.message, 'error');
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 10000;
            max-width: 400px;
            animation: slideIn 0.3s ease;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        `;

        // Set background color based on type
        const colors = {
            success: 'linear-gradient(135deg, #4CAF50, #45a049)',
            error: 'linear-gradient(135deg, #f44336, #d32f2f)',
            info: 'linear-gradient(135deg, #2196F3, #1976D2)',
            warning: 'linear-gradient(135deg, #FF9800, #F57C00)'
        };
        
        notification.style.background = colors[type] || colors.info;
        notification.textContent = message;

        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: white;
            font-size: 18px;
            font-weight: bold;
            float: right;
            margin-left: 10px;
            cursor: pointer;
            opacity: 0.7;
        `;
        closeBtn.onclick = () => notification.remove();
        notification.appendChild(closeBtn);

        // Add to document
        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);

        // Add CSS animations if not exists
        if (!document.getElementById('notification-styles')) {
            const styles = document.createElement('style');
            styles.id = 'notification-styles';
            styles.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(styles);
        }
    }

    resetCriteriaBuilder() {
        const builder = document.getElementById('criteria-builder');
        builder.innerHTML = `
            <div class="criteria-item">
                <input type="text" class="form-input" placeholder="Criterion name" data-field="name">
                <input type="number" class="form-input" placeholder="Points" data-field="points" min="0" max="100">
                <textarea class="form-input" placeholder="Description" data-field="description" style="resize: none; height: 40px;"></textarea>
                <button type="button" class="btn btn-danger" onclick="removeCriteriaItem(this)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }
}

// Global functions for HTML event handlers
function addCriteriaItem() {
    const builder = document.getElementById('criteria-builder');
    const newItem = document.createElement('div');
    newItem.className = 'criteria-item';
    newItem.innerHTML = `
        <input type="text" class="form-input" placeholder="Criterion name" data-field="name">
        <input type="number" class="form-input" placeholder="Points" data-field="points" min="0" max="100">
        <textarea class="form-input" placeholder="Description" data-field="description" style="resize: none; height: 40px;"></textarea>
        <button type="button" class="btn btn-danger" onclick="removeCriteriaItem(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;
    builder.appendChild(newItem);
}

function removeCriteriaItem(button) {
    const builder = document.getElementById('criteria-builder');
    if (builder.children.length > 1) {
        button.parentElement.remove();
    } else {
        ui.showNotification('At least one criterion is required', 'warning');
    }
}

function showPage(pageId) {
    ui.showPage(pageId);
}

function exportResults(format) {
    ui.exportResults(format);
}

function backupData() {
    ui.showNotification('Backup feature coming soon!', 'info');
}

function importData() {
    ui.showNotification('Import feature coming soon!', 'info');
}

function clearAllData() {
    ui.clearAllData();
}

// Initialize the UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.ui = new UnityGraderUI();
});