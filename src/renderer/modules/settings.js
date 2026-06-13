// Settings methods, mixed onto the app via (Base) => class extends Base.
// Moved verbatim from renderer.js; run with the same `this` as the rest of the app.
export default (Base) => class extends Base {
    // API Key Management Methods
    async loadSettingsPanel() {
        await this.loadSupportedProviders();
        await this.loadAPIKeys();
        await this.loadLatePenaltySettings();
        await this.loadClaudeCLISettings();
    }

    async loadClaudeCLISettings() {
        const statusEl = document.getElementById('claude-cli-status');
        const toggleEl = document.getElementById('claude-cli-toggle');
        if (!statusEl || !toggleEl) return;

        try {
            const [detection, setting] = await Promise.all([
                window.electronAPI.claudeCli.detect(),
                window.electronAPI.claudeCli.getSetting()
            ]);

            if (detection.available) {
                statusEl.innerHTML = `<span style="color: #4CAF50;">✓ Detected${detection.version ? ' — ' + detection.version : ''}</span>`;
                toggleEl.disabled = false;
                toggleEl.checked = !!(setting && setting.enabled);
            } else {
                statusEl.innerHTML = '<span style="color: #e0a030;">Not detected. Install the Claude CLI and click Refresh to enable.</span>';
                toggleEl.disabled = true;
                toggleEl.checked = false;
            }
        } catch (error) {
            statusEl.textContent = `Error checking Claude CLI: ${error.message}`;
            toggleEl.disabled = true;
        }
    }

    async toggleClaudeCLI() {
        const toggleEl = document.getElementById('claude-cli-toggle');
        if (!toggleEl) return;
        try {
            const result = await window.electronAPI.claudeCli.setSetting(toggleEl.checked);
            if (result.success) {
                this.showToast(`Claude CLI grading ${toggleEl.checked ? 'enabled' : 'disabled'}`, 'success');
                await this.refreshLLMStatus();
            } else {
                this.showToast(`Error: ${result.error}`, 'error');
                toggleEl.checked = !toggleEl.checked;
            }
        } catch (error) {
            this.showToast(`Error: ${error.message}`, 'error');
            toggleEl.checked = !toggleEl.checked;
        }
    }

    async loadSupportedProviders() {
        try {
            const result = await window.electronAPI.apiKeys.getProviders();
            if (result.success) {
                this.supportedProviders = result.providers;
            }
        } catch (error) {
            console.error('Error loading supported providers:', error);
        }
    }

    async loadAPIKeys() {
        try {
            const result = await window.electronAPI.apiKeys.getAll();
            if (result.success) {
                this.displayAPIKeys(result.keys);
            } else {
                this.showToast(`Error loading API keys: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error loading API keys: ${error.message}`, 'error');
        }
    }

    displayAPIKeys(apiKeys) {
        const apiKeysList = document.getElementById('api-keys-list');

        if (!apiKeys || Object.keys(apiKeys).length === 0) {
            apiKeysList.innerHTML = '<p style="opacity: 0.7;">No API keys configured. Add your first API key above.</p>';
            return;
        }

        let html = '<div style="display: grid; gap: 16px;">';

        for (const [provider, config] of Object.entries(apiKeys)) {
            const providerInfo = config.providerInfo;
            const statusBadge = config.isActive
                ? '<span style="background: #2ecc71; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Active</span>'
                : '<span style="background: #95a5a6; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Inactive</span>';

            const lastUsed = config.lastUsed
                ? new Date(config.lastUsed).toLocaleDateString()
                : 'Never';

            const createdAt = config.createdAt
                ? new Date(config.createdAt).toLocaleDateString()
                : 'Unknown';

            html += `
                <div class="card" style="background: rgba(255,255,255,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div>
                            <h4 style="margin: 0; display: flex; align-items: center; gap: 8px;">
                                ${providerInfo.name}
                                ${statusBadge}
                            </h4>
                            <p style="margin: 4px 0; opacity: 0.8; font-size: 14px;">
                                API Key: ${config.apiKey || 'Not set'}
                            </p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-secondary" onclick="app.editAPIKey('${provider}')" style="font-size: 12px; padding: 6px 12px;">Edit</button>
                            <button class="btn btn-secondary" onclick="app.testAPIKey('${provider}')" style="font-size: 12px; padding: 6px 12px;">Test</button>
                            <button class="btn btn-secondary" onclick="app.toggleAPIKey('${provider}', ${!config.isActive})" style="font-size: 12px; padding: 6px 12px;">
                                ${config.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button class="btn btn-secondary" onclick="app.deleteAPIKey('${provider}')" style="font-size: 12px; padding: 6px 12px; background: rgba(231, 76, 60, 0.2); border-color: #e74c3c;">Delete</button>
                        </div>
                    </div>
                    <div style="font-size: 12px; opacity: 0.6; display: flex; gap: 16px;">
                        <span>Created: ${createdAt}</span>
                        <span>Last Used: ${lastUsed}</span>
                        ${config.endpoint ? `<span>Endpoint: ${config.endpoint}</span>` : ''}
                    </div>
                </div>
            `;
        }

        html += '</div>';
        apiKeysList.innerHTML = html;
    }

    showAddAPIKeyForm() {
        this.currentEditingProvider = null;
        document.getElementById('api-form-title').textContent = 'Add New API Key';
        document.getElementById('api-key-form').style.display = 'block';
        this.resetAPIKeyForm();
    }

    hideAPIKeyForm() {
        document.getElementById('api-key-form').style.display = 'none';
        this.resetAPIKeyForm();
        this.currentEditingProvider = null;
    }

    resetAPIKeyForm() {
        document.getElementById('api-provider').value = '';
        document.getElementById('api-key-input').value = '';
        document.getElementById('api-endpoint').value = '';
        document.getElementById('api-deployment').value = '';
        document.getElementById('api-is-active').checked = true;
        this.onProviderChange();
    }

    onProviderChange() {
        const provider = document.getElementById('api-provider').value;
        const additionalFields = document.getElementById('additional-fields');
        const endpointField = document.getElementById('endpoint-field');
        const deploymentField = document.getElementById('deployment-field');
        const modelField = document.getElementById('model-field');
        const modelSelect = document.getElementById('api-model');

        // Hide all additional fields first
        additionalFields.style.display = 'none';
        endpointField.style.display = 'none';
        deploymentField.style.display = 'none';
        if (modelField) modelField.style.display = 'none';
        if (modelSelect) modelSelect.innerHTML = '';

        if (!provider) return;

        const providerInfo = this.supportedProviders[provider];
        if (!providerInfo) return;

        // Populate the model dropdown from the provider's supported models.
        if (modelSelect && Array.isArray(providerInfo.models)) {
            for (const model of providerInfo.models) {
                const opt = document.createElement('option');
                opt.value = model;
                opt.textContent = model;
                modelSelect.appendChild(opt);
            }
            modelSelect.value = providerInfo.defaultModel || providerInfo.models[0] || '';
            if (modelField) modelField.style.display = 'block';
        }

        if (providerInfo.fields.includes('endpoint')) {
            additionalFields.style.display = 'block';
            endpointField.style.display = 'block';

            if (provider === 'azure') {
                document.getElementById('api-endpoint').placeholder = 'https://your-resource.openai.azure.com';
            } else if (provider === 'custom') {
                document.getElementById('api-endpoint').placeholder = 'https://your-api-endpoint.com';
            }
        }

        if (providerInfo.fields.includes('deploymentName')) {
            additionalFields.style.display = 'block';
            deploymentField.style.display = 'block';
        }
    }

    async saveAPIKey() {
        const provider = document.getElementById('api-provider').value;
        const apiKey = document.getElementById('api-key-input').value.trim();
        const endpoint = document.getElementById('api-endpoint').value.trim();
        const deployment = document.getElementById('api-deployment').value.trim();
        const isActive = document.getElementById('api-is-active').checked;

        if (!provider) {
            this.showToast('Please select a provider', 'warning');
            return;
        }

        if (!apiKey) {
            this.showToast('Please enter an API key', 'warning');
            return;
        }

        const modelEl = document.getElementById('api-model');
        const config = {
            apiKey,
            isActive
        };
        if (modelEl && modelEl.value) {
            config.model = modelEl.value;
        }

        const providerInfo = this.supportedProviders[provider];
        if (providerInfo && providerInfo.fields.includes('endpoint')) {
            if (!endpoint) {
                this.showToast('Please enter an endpoint URL', 'warning');
                return;
            }
            config.endpoint = endpoint;
        }

        if (providerInfo && providerInfo.fields.includes('deploymentName')) {
            if (!deployment) {
                this.showToast('Please enter a deployment name', 'warning');
                return;
            }
            config.deploymentName = deployment;
        }

        try {
            this.showToast('Saving API key...', 'info');
            // Ensure config is serializable
            const serializableConfig = JSON.parse(JSON.stringify(config));
            const result = await window.electronAPI.apiKeys.set(provider, serializableConfig);

            if (result.success) {
                this.showToast(result.message, 'success');
                this.hideAPIKeyForm();
                await this.loadAPIKeys();

                // Refresh LLM status since we may have just activated a new provider
                await this.refreshLLMStatus();
            } else {
                this.showToast(`Error saving API key: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error saving API key: ${error.message}`, 'error');
        }
    }

    async editAPIKey(provider) {
        try {
            const result = await window.electronAPI.apiKeys.get(provider);
            if (result.success && result.keyData) {
                this.currentEditingProvider = provider;
                const keyData = result.keyData;

                document.getElementById('api-form-title').textContent = `Edit ${this.supportedProviders[provider].name} API Key`;
                document.getElementById('api-provider').value = provider;
                document.getElementById('api-key-input').value = keyData.apiKey || '';
                document.getElementById('api-endpoint').value = keyData.endpoint || '';
                document.getElementById('api-deployment').value = keyData.deploymentName || '';
                document.getElementById('api-is-active').checked = keyData.isActive !== false;

                this.onProviderChange();

                // Restore the saved model after onProviderChange populated the list.
                const modelEl = document.getElementById('api-model');
                if (modelEl && keyData.model) {
                    modelEl.value = keyData.model;
                }
                document.getElementById('api-key-form').style.display = 'block';
            }
        } catch (error) {
            this.showToast(`Error loading API key: ${error.message}`, 'error');
        }
    }

    async deleteAPIKey(provider) {
        const providerName = this.supportedProviders[provider]?.name || provider;

        if (!confirm(`Are you sure you want to delete the API key for ${providerName}?`)) {
            return;
        }

        try {
            const result = await window.electronAPI.apiKeys.delete(provider);
            if (result.success) {
                this.showToast(result.message, 'success');
                await this.loadAPIKeys();
            } else {
                this.showToast(`Error deleting API key: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error deleting API key: ${error.message}`, 'error');
        }
    }

    async testAPIKey(provider) {
        try {
            this.showToast('Testing API key...', 'info');
            const result = await window.electronAPI.apiKeys.test(provider);

            if (result.success) {
                let message = result.message;
                if (result.models && result.models.length > 0) {
                    message += ` (Models: ${result.models.slice(0, 3).join(', ')})`;
                }
                this.showToast(message, 'success');
            } else {
                this.showToast(`API key test failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error testing API key: ${error.message}`, 'error');
        }
    }

    async testCurrentAPIKey() {
        const provider = document.getElementById('api-provider').value;
        const apiKey = document.getElementById('api-key-input').value.trim();
        const endpoint = document.getElementById('api-endpoint').value.trim();
        const deployment = document.getElementById('api-deployment').value.trim();

        if (!provider || !apiKey) {
            this.showToast('Please fill in the provider and API key fields first', 'warning');
            return;
        }

        const config = { apiKey };

        const providerInfo = this.supportedProviders[provider];
        if (providerInfo && providerInfo.fields.includes('endpoint') && endpoint) {
            config.endpoint = endpoint;
        }
        if (providerInfo && providerInfo.fields.includes('deploymentName') && deployment) {
            config.deploymentName = deployment;
        }

        try {
            this.showToast('Testing API key...', 'info');
            // Ensure config is serializable
            const serializableConfig = JSON.parse(JSON.stringify(config));
            const result = await window.electronAPI.apiKeys.test(provider, serializableConfig);

            if (result.success) {
                let message = result.message;
                if (result.models && result.models.length > 0) {
                    message += ` (Models: ${result.models.slice(0, 3).join(', ')})`;
                }
                this.showToast(message, 'success');
            } else {
                this.showToast(`API key test failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error testing API key: ${error.message}`, 'error');
        }
    }

    async toggleAPIKey(provider, isActive) {
        try {
            const result = await window.electronAPI.apiKeys.toggle(provider, isActive);
            if (result.success) {
                const action = isActive ? 'activated' : 'deactivated';
                this.showToast(`${this.supportedProviders[provider].name} ${action}`, 'success');
                await this.loadAPIKeys();
            } else {
                this.showToast(`Error toggling API key: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error toggling API key: ${error.message}`, 'error');
        }
    }

    async exportAPIKeyConfig() {
        try {
            const result = await window.electronAPI.apiKeys.exportConfig();
            if (result.success) {
                const config = result.config;
                const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `api-keys-config-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                this.showToast('API key configuration exported successfully', 'success');
            } else {
                this.showToast(`Error exporting configuration: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error exporting configuration: ${error.message}`, 'error');
        }
    }

    async refreshLLMStatus() {
        try {
            this.showToast('Refreshing LLM status...', 'info');

            // Refresh the provider
            await window.electronAPI.llm.refreshProvider();

            // Check status again
            await this.checkLLMStatus();

            this.showToast('LLM status refreshed', 'success');
        } catch (error) {
            this.showToast(`Error refreshing LLM status: ${error.message}`, 'error');
        }
    }

    // Late Penalty Settings Methods
    toggleLatePenalty() {
        const enabled = document.getElementById('late-penalty-enabled').checked;
        const config = document.getElementById('late-penalty-config');

        if (enabled) {
            config.style.display = 'block';
        } else {
            config.style.display = 'none';
        }

        this.updateLatePenaltyExample();
    }

    updateLatePenaltyExample() {
        const penaltyPerDay = parseInt(document.getElementById('penalty-per-day').value) || 10;
        const maxPenalty = parseInt(document.getElementById('max-penalty').value) || 50;
        const gracePeriod = parseInt(document.getElementById('grace-period').value) || 0;

        const exampleDays = 3;
        let calculatedPenalty = exampleDays * penaltyPerDay;
        if (calculatedPenalty > maxPenalty) {
            calculatedPenalty = maxPenalty;
        }

        const exampleElement = document.getElementById('late-penalty-example');
        let exampleText = `If a student submits ${exampleDays} days late with ${penaltyPerDay}% per day penalty, they lose ${calculatedPenalty}% of their grade.`;

        if (gracePeriod > 0) {
            exampleText += ` Grace period: ${gracePeriod} hours.`;
        }

        if (calculatedPenalty >= maxPenalty) {
            exampleText += ` (Capped at maximum ${maxPenalty}%)`;
        }

        exampleElement.textContent = exampleText;
    }

    async saveLatePenaltySettings() {
        try {
            const settings = {
                enabled: document.getElementById('late-penalty-enabled').checked,
                penaltyPerDay: parseInt(document.getElementById('penalty-per-day').value) || 10,
                maxPenalty: parseInt(document.getElementById('max-penalty').value) || 50,
                gracePeriodHours: parseInt(document.getElementById('grace-period').value) || 0
            };

            const result = await window.electronAPI.latePenalty.saveSettings(settings);

            if (result.success) {
                this.showToast('Late penalty settings saved successfully', 'success');
            } else {
                this.showToast(`Error saving settings: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error saving late penalty settings: ${error.message}`, 'error');
        }
    }

    async loadLatePenaltySettings() {
        try {
            const result = await window.electronAPI.latePenalty.getSettings();

            if (result.success && result.settings) {
                const settings = result.settings;

                document.getElementById('late-penalty-enabled').checked = settings.enabled || false;
                document.getElementById('penalty-per-day').value = settings.penaltyPerDay || 10;
                document.getElementById('max-penalty').value = settings.maxPenalty || 50;
                document.getElementById('grace-period').value = settings.gracePeriodHours || 0;

                // Show/hide config based on enabled state
                const config = document.getElementById('late-penalty-config');
                config.style.display = settings.enabled ? 'block' : 'none';

                this.updateLatePenaltyExample();
            }
        } catch (error) {
            console.error('Error loading late penalty settings:', error);
        }
    }

    async refreshSavedResults() {
        console.log('🔄 Refreshing saved results...');
        this.gradingResults = []; // Clear current results
        await this.loadGradingResults(); // Reload from storage
        this.showToast('Results refreshed from storage', 'success');
    }

    async clearAllResults() {
        const confirmed = confirm('Are you sure you want to clear ALL saved grading results? This cannot be undone.');

        if (!confirmed) return;

        try {
            const result = await window.electronAPI.results.clear();

            if (result.success) {
                this.gradingResults = [];
                this.loadGradingResults();
                this.showToast('All results cleared', 'success');
                console.log('✅ All results cleared');
            } else {
                this.showToast(`Failed to clear results: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showToast(`Error clearing results: ${error.message}`, 'error');
        }
    }

    async updateSavedResultsInfo() {
        try {
            const result = await window.electronAPI.results.load();

            if (result.success) {
                const count = result.results.length;
                const infoElement = document.getElementById('saved-results-info');

                if (infoElement) {
                    if (count === 0) {
                        infoElement.textContent = 'No saved results yet';
                    } else {
                        const mostRecent = result.results[result.results.length - 1];
                        const savedDate = mostRecent?.savedAt ? new Date(mostRecent.savedAt).toLocaleDateString() : 'Unknown';
                        infoElement.textContent = `${count} result${count !== 1 ? 's' : ''} saved • Last saved: ${savedDate}`;
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error updating saved results info:', error);
        }
    }
};
