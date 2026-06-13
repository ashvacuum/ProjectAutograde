// Ui methods, mixed onto the app via (Base) => class extends Base.
// Moved verbatim from renderer.js; run with the same `this` as the rest of the app.
export default (Base) => class extends Base {
    async loadTheme() {
        try {
            const result = await window.electronAPI.store.get('theme');
            const theme = result || 'ciit';
            this.applyTheme(theme);

            // Update theme selector
            const themeSelect = document.getElementById('theme-select');
            if (themeSelect) {
                themeSelect.value = theme;
            }
        } catch (error) {
            console.error('❌ Error loading theme:', error);
            this.applyTheme('ciit'); // Default to CIIT theme
        }
    }

    async changeTheme(theme) {
        try {
            this.applyTheme(theme);
            await window.electronAPI.store.set('theme', theme);
            this.showToast(`Theme changed to ${this.getThemeName(theme)}`, 'success');
        } catch (error) {
            console.error('❌ Error changing theme:', error);
            this.showToast('Failed to change theme', 'error');
        }
    }

    applyTheme(theme) {
        const body = document.body;
        const html = document.documentElement;

        // Remove existing theme
        html.removeAttribute('data-theme');
        body.removeAttribute('data-theme');

        // Apply new theme (if not default CIIT)
        if (theme !== 'ciit') {
            html.setAttribute('data-theme', theme);
            body.setAttribute('data-theme', theme);
        }
    }

    getThemeName(theme) {
        const themeNames = {
            'ciit': 'CIIT Philippines',
            'professional': 'Professional Blue',
            'discord': 'Discord Dark'
        };
        return themeNames[theme] || theme;
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }
    // FTUE (First Time User Experience) Methods
    async checkFirstTimeUse() {
        try {
            // Check if Canvas auth and API key exist
            const canvasUser = await window.electronAPI.store.get('canvas.user');
            const apiKeys = await window.electronAPI.apiKeys.getAll();

            // If no Canvas auth or no API keys, this is first time use
            const hasCanvas = !!canvasUser;
            const hasAIKey = apiKeys.success && Object.keys(apiKeys.keys).length > 0;

            return !hasCanvas || !hasAIKey;
        } catch (error) {
            console.error('Error checking first time use:', error);
            return false;
        }
    }

    showFTUEModal() {
        const modal = document.getElementById('ftue-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideFTUEModal() {
        const modal = document.getElementById('ftue-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async completeFTUESetup() {
        const submitBtn = document.getElementById('ftue-submit-btn');
        const errorDiv = document.getElementById('ftue-error');

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Setting up...';
            errorDiv.style.display = 'none';

            // Get form values
            const canvasUrl = document.getElementById('ftue-canvas-url').value.trim();
            const canvasToken = document.getElementById('ftue-canvas-token').value.trim();
            const aiProvider = document.getElementById('ftue-ai-provider').value;
            const aiKey = document.getElementById('ftue-ai-key').value.trim();

            // Validate inputs
            if (!canvasUrl || !canvasToken || !aiProvider || !aiKey) {
                throw new Error('All fields are required');
            }

            // Step 1: Authenticate with Canvas
            const canvasResult = await window.electronAPI.canvas.authenticate(canvasUrl, canvasToken);
            if (!canvasResult.success) {
                throw new Error(`Canvas authentication failed: ${canvasResult.error}`);
            }

            // Step 2: Save AI API key
            const apiConfig = {
                apiKey: aiKey,
                providerInfo: {
                    name: this.getProviderName(aiProvider)
                }
            };

            // Add Azure-specific fields if needed
            if (aiProvider === 'azure') {
                const endpoint = document.getElementById('ftue-azure-endpoint').value.trim();
                const deployment = document.getElementById('ftue-azure-deployment').value.trim();

                if (!endpoint || !deployment) {
                    throw new Error('Azure endpoint and deployment name are required');
                }

                apiConfig.endpoint = endpoint;
                apiConfig.deploymentName = deployment;
            }

            const apiKeyResult = await window.electronAPI.apiKeys.set(aiProvider, apiConfig);
            if (!apiKeyResult.success) {
                throw new Error(`Failed to save AI API key: ${apiKeyResult.error}`);
            }

            // Set as active provider
            await window.electronAPI.apiKeys.toggle(aiProvider, true);

            // Mark FTUE as completed
            await window.electronAPI.store.set('ftue.completed', true);

            // Hide modal and complete initialization
            this.hideFTUEModal();
            this.showToast('Setup completed successfully!', 'success');

            // Continue with normal initialization
            await this.checkStoredCanvasAuth();
            await this.checkLLMStatus();
            this.loadDashboardData();
            this.currentEditingProvider = null;
            this.supportedProviders = {};
            await this.loadTheme();

        } catch (error) {
            console.error('FTUE setup error:', error);
            errorDiv.textContent = error.message;
            errorDiv.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Complete Setup';
        }
    }

    getProviderName(provider) {
        const names = {
            'anthropic': 'Anthropic (Claude)',
            'openai': 'OpenAI',
            'google': 'Google AI (Gemini)',
            'azure': 'Azure OpenAI'
        };
        return names[provider] || provider;
    }
};
