// Canvas methods, mixed onto the app via (Base) => class extends Base.
// Moved verbatim from renderer.js; run with the same `this`.
export default (Base) => class extends Base {
    async checkStoredCanvasAuth() {
        try {
            const storedUser = await window.electronAPI.store.get('canvas.user');
            const storedApiUrl = await window.electronAPI.store.get('canvas.apiUrl');
            const authenticatedAt = await window.electronAPI.store.get('canvas.authenticatedAt');

            if (storedUser && storedApiUrl) {
                this.canvasConnected = true;
                this.updateConnectionStatus('connected');

                // Display stored Canvas info in Canvas Setup panel if we're there
                const infoCard = document.getElementById('canvas-info');
                const userInfoDiv = document.getElementById('canvas-user-info');
                if (userInfoDiv) {
                    userInfoDiv.innerHTML = `
                        <p><strong>Name:</strong> ${storedUser.name || 'Unknown'}</p>
                        <p><strong>Email:</strong> ${storedUser.primary_email || storedUser.email || 'Not available'}</p>
                        <p><strong>ID:</strong> ${storedUser.id || 'Unknown'}</p>
                        <p><strong>API URL:</strong> ${storedApiUrl}</p>
                        <p><strong>Last Authenticated:</strong> ${authenticatedAt ? new Date(authenticatedAt).toLocaleString() : 'Unknown'}</p>
                    `;
                    if (infoCard) infoCard.style.display = 'block';
                }

                this.showToast('Canvas credentials loaded successfully', 'success');
            }
        } catch (error) {
            console.error('Error checking stored Canvas auth:', error);
        }
    }

    async checkLLMStatus() {
        try {
            const status = await window.electronAPI.llm.getAnalysisResult('status');
            this.llmAvailable = status && status.isAvailable;

            const statusElement = document.getElementById('llm-status');
            const indicatorElement = document.getElementById('llm-indicator');

            if (this.llmAvailable) {
                const providerName = status.providerName || 'LLM Provider';
                statusElement.textContent = `${providerName} is configured and ready for AI-powered grading.`;
                indicatorElement.className = 'status-indicator status-connected';
                indicatorElement.textContent = 'Available';
            } else {
                statusElement.textContent = 'No LLM provider configured. Grading will use basic code analysis only. Configure an API key in Settings for AI grading features.';
                indicatorElement.className = 'status-indicator status-disconnected';
                indicatorElement.textContent = 'Not Available';
            }
        } catch (error) {
            console.error('Error checking LLM status:', error);
            this.llmAvailable = false;

            const statusElement = document.getElementById('llm-status');
            const indicatorElement = document.getElementById('llm-indicator');

            statusElement.textContent = 'Unable to check LLM status. Grading will use basic analysis.';
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
};
