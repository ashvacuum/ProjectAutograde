import Criteria from './modules/criteria.js';
import Canvas from './modules/canvas.js';
import Grading from './modules/grading.js';
import Results from './modules/results.js';
import Ui from './modules/ui.js';
import Settings from './modules/settings.js';

class AppCore {
    constructor() {
        this.currentPanel = 'dashboard';
        this.canvasConnected = false;
        this.claudeCodeAvailable = false;
        this.activeGradingSession = null;
        this.gradingResults = [];
        this.currentAssignment = null;
        this.currentResultsFilter = 'all';

        this.init();
    }

    async init() {
        this.setupEventListeners();

        // Check if this is first time use
        const isFirstTimeUser = await this.checkFirstTimeUse();
        if (isFirstTimeUser) {
            this.showFTUEModal();
            return; // Don't continue initialization until FTUE is complete
        }

        await this.checkStoredCanvasAuth();
        await this.checkLLMStatus();
        this.loadDashboardData();
        this.currentEditingProvider = null;
        this.supportedProviders = {};
        await this.loadTheme();
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

        // FTUE Form
        const ftueForm = document.getElementById('ftue-form');
        if (ftueForm) {
            ftueForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.completeFTUESetup();
            });
        }

        // Canvas Authentication Form
        const canvasAuthForm = document.getElementById('canvas-auth-form');
        if (canvasAuthForm) {
            canvasAuthForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.authenticateCanvas();
            });
        }

        // API Key Form
        const apiKeyForm = document.getElementById('api-key-form-element');
        if (apiKeyForm) {
            apiKeyForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveAPIKey();
            });
        }

        // Criteria Form
        const criteriaForm = document.getElementById('criteria-form');
        if (criteriaForm) {
            criteriaForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveCriteriaTemplate();
            });
        }

        // Late Penalty Settings Event Listeners
        const penaltyPerDaySelect = document.getElementById('penalty-per-day');
        const maxPenaltySelect = document.getElementById('max-penalty');
        const gracePeriodInput = document.getElementById('grace-period');

        if (penaltyPerDaySelect) {
            penaltyPerDaySelect.addEventListener('change', () => this.updateLatePenaltyExample());
        }
        if (maxPenaltySelect) {
            maxPenaltySelect.addEventListener('change', () => this.updateLatePenaltyExample());
        }
        if (gracePeriodInput) {
            gracePeriodInput.addEventListener('input', () => this.updateLatePenaltyExample());
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
                this.updateSavedResultsInfo();
                break;
            case 'grading':
                this.loadGradingPanel();
                break;
            case 'settings':
                this.loadSettingsPanel();
                break;
        }
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
                    const totalPoints = template.totalPoints || template.items.reduce((sum, item) => sum + (item.points || 0), 0);
                    html += `
                        <div class="card">
                            <h4>${template.name}</h4>
                            <p>${template.description || 'No description provided'}</p>
                            <p><strong>Total Points:</strong> ${totalPoints} | <strong>Criteria:</strong> ${template.items.length}</p>
                            <div style="margin-top: 12px; font-size: 12px; opacity: 0.8;">
                                ${template.items.map(item => `${item.name} (${item.points}pts)`).join(' • ')}
                            </div>
                            <div style="margin-top: 16px;">
                                <button class="btn btn-secondary" onclick="app.editCriteria('${template.id}')">Edit</button>
                                <button class="btn btn-secondary" onclick="app.deleteCriteria(${index})" style="margin-left: 8px;">Delete</button>
                                <button class="btn" onclick="app.previewCriteria(${index})" style="margin-left: 8px;">Preview</button>
                            </div>
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
        const defaultCriteria = this.getDefaultCriteria();

        try {
            let templates = await window.electronAPI.store.get('criteria.templates') || [];

            // Check if the new rubric already exists
            const existingIndex = templates.findIndex(t => t.name === defaultCriteria.name);

            if (existingIndex >= 0) {
                // Replace existing template
                templates[existingIndex] = defaultCriteria;
                this.showToast('Default rubric updated!', 'success');
            } else {
                // Add new template
                templates.push(defaultCriteria);
                this.showToast('Default Unity Game Programming Rubric added!', 'success');
            }

            await window.electronAPI.store.set('criteria.templates', templates);
            this.loadCriteriaTemplates();

        } catch (error) {
            this.showToast(`Error adding default criteria: ${error.message}`, 'error');
        }
    }

    // editCriteria is now handled by showCriteriaModal(criteriaId)

    async deleteCriteria(index) {
        try {
            const templates = await window.electronAPI.store.get('criteria.templates') || [];
            if (index >= 0 && index < templates.length) {
                const template = templates[index];

                // Confirm deletion
                const confirmed = confirm(`Are you sure you want to delete the criteria template "${template.name}"?`);
                if (confirmed) {
                    templates.splice(index, 1);
                    await window.electronAPI.store.set('criteria.templates', templates);

                    this.loadCriteriaTemplates();
                    this.showToast(`Criteria template "${template.name}" deleted successfully!`, 'success');
                }
            }
        } catch (error) {
            this.showToast(`Error deleting criteria: ${error.message}`, 'error');
        }
    }


    async previewCriteria(index) {
        try {
            const templates = await window.electronAPI.store.get('criteria.templates') || [];
            if (index >= 0 && index < templates.length) {
                const template = templates[index];
                let preview = `**${template.name}**\n`;
                preview += `${template.description || ''}\n`;
                preview += `Total Points: ${template.totalPoints || 'Not specified'}\n\n`;

                template.items.forEach((item, i) => {
                    preview += `${i + 1}. ${item.name} (${item.points} pts)\n`;
                    preview += `   ${item.description}\n`;
                    if (item.ratings) {
                        item.ratings.forEach(rating => {
                            preview += `   • ${rating.name}: ${rating.points} pts - ${rating.description}\n`;
                        });
                    }
                    preview += '\n';
                });

                // For now, show in toast - in real app this would be a modal
                this.showToast(`Criteria preview would show: ${template.name}`, 'info');
                console.log('Criteria Preview:', preview);
            }
        } catch (error) {
            this.showToast(`Error previewing criteria: ${error.message}`, 'error');
        }
    }

    async clearAndLoadNewRubric() {
        try {
            // Clear existing templates
            await window.electronAPI.store.set('criteria.templates', []);

            // Load the new default rubric
            await this.loadDefaultCriteria();

            this.showToast('Rubric templates cleared and new default loaded!', 'success');
        } catch (error) {
            this.showToast(`Error clearing templates: ${error.message}`, 'error');
        }
    }



}

const UnityAutoGraderApp = Criteria(Settings(Ui(Results(Grading(Canvas(AppCore))))));

// Global functions for HTML onclick handlers
window.showPanel = (panel) => window.app.showPanel(panel);
window.updateFTUEAIFields = () => {
    const provider = document.getElementById('ftue-ai-provider').value;
    const azureFields = document.getElementById('ftue-azure-fields');
    const helpText = document.getElementById('ftue-ai-key-help');

    if (provider === 'azure') {
        azureFields.style.display = 'block';
        helpText.textContent = 'Your Azure OpenAI API key';
    } else {
        azureFields.style.display = 'none';

        const helpTexts = {
            'anthropic': 'Get your API key from https://console.anthropic.com',
            'openai': 'Get your API key from https://platform.openai.com',
            'google': 'Get your API key from https://makersuite.google.com/app/apikey'
        };

        helpText.textContent = helpTexts[provider] || 'This key will be used to power automated grading';
    }
};
window.testCanvasConnection = () => window.app.testCanvasConnection();
window.createNewCriteria = () => window.app.showCriteriaModal();
window.loadDefaultCriteria = () => window.app.loadDefaultCriteria();
window.editCriteria = (criteriaId) => window.app.showCriteriaModal(criteriaId);
window.deleteCriteria = (index) => window.app.deleteCriteria(index);
window.loadAssignments = () => window.app.loadAssignments();
window.gradeAssignment = (courseId, assignmentId) => window.app.gradeAssignment(courseId, assignmentId);
window.startBatchGrading = () => window.app.startBatchGrading();
window.startBatchGradingFromAssignments = () => window.app.startBatchGradingFromAssignments();
window.cancelBatchGrading = () => window.app.cancelBatchGrading();
window.startIndividualGrading = () => window.app.startIndividualGrading();
window.cancelGrading = () => window.app.resetGradingUI();
window.exportResults = (format) => window.app.exportResults(format);
window.refreshLLMStatus = () => window.app.refreshLLMStatus();
window.filterResults = (filter) => window.app.filterResults(filter);
window.openCanvasGradebook = () => window.app.openCanvasGradebook();
window.clearAndLoadNewRubric = () => window.app.clearAndLoadNewRubric();

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new UnityAutoGraderApp();
});