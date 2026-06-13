const { safeStorage } = require('electron');
const Store = require('electron-store');

// Marker prefix identifying a value encrypted with Electron's safeStorage
// (OS-backed: DPAPI on Windows, Keychain on macOS, libsecret on Linux).
const ENC_PREFIX = 'enc:v1:';

class APIKeyManager {
    constructor() {
        // Plaintext-on-disk store. Secrets are encrypted per-value with the OS
        // keystore (see encryptSecret/decryptSecret) rather than relying on a
        // hardcoded electron-store key, which offered no real protection.
        try {
            this.store = new Store({ name: 'api-keys' });
            // Touch the store to surface a corrupt file early.
            try {
                this.store.get('providers', {});
            } catch (readError) {
                console.error('Failed to read key store, recreating:', readError.message);
                this.store.clear();
            }
        } catch (error) {
            console.error('Failed to initialize key store:', error.message);
            this.store = new Store({ name: 'api-keys' });
        }

        this.supportedProviders = {
            openai: {
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                fields: ['apiKey'],
                models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
                defaultModel: 'gpt-4o'
            },
            anthropic: {
                name: 'Anthropic (Claude)',
                baseUrl: 'https://api.anthropic.com/v1',
                fields: ['apiKey'],
                models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
                defaultModel: 'claude-opus-4-8'
            },
            google: {
                name: 'Google AI (Gemini)',
                baseUrl: 'https://generativelanguage.googleapis.com/v1',
                fields: ['apiKey'],
                models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
                defaultModel: 'gemini-2.0-flash'
            },
            cohere: {
                name: 'Cohere',
                baseUrl: 'https://api.cohere.ai/v1',
                fields: ['apiKey'],
                models: ['command-r-plus', 'command-r', 'command'],
                defaultModel: 'command-r-plus'
            },
            huggingface: {
                name: 'Hugging Face',
                baseUrl: 'https://api-inference.huggingface.co/models',
                fields: ['apiKey'],
                models: ['custom-endpoint'],
                defaultModel: 'custom-endpoint'
            },
            azure: {
                name: 'Azure OpenAI',
                baseUrl: 'https://your-resource.openai.azure.com',
                fields: ['apiKey', 'endpoint', 'deploymentName'],
                models: ['gpt-4o', 'gpt-4', 'gpt-35-turbo'],
                defaultModel: 'gpt-4o'
            },
            custom: {
                name: 'Custom LLM API',
                baseUrl: 'https://your-api-endpoint.com',
                fields: ['apiKey', 'endpoint'],
                models: ['custom-model'],
                defaultModel: 'custom-model'
            }
        };
    }

    // Encrypt a secret with the OS keystore. Falls back to plaintext only when
    // the platform can't provide encryption (rare; logged once by the caller).
    encryptSecret(plain) {
        if (typeof plain !== 'string' || plain === '') {
            return plain;
        }
        try {
            if (safeStorage.isEncryptionAvailable()) {
                return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64');
            }
        } catch (error) {
            console.warn('safeStorage encryption unavailable, storing key unencrypted:', error.message);
        }
        return plain;
    }

    // Reverse of encryptSecret. Plaintext (legacy or fallback) values pass through.
    decryptSecret(stored) {
        if (typeof stored !== 'string' || !stored.startsWith(ENC_PREFIX)) {
            return stored;
        }
        try {
            const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64');
            return safeStorage.decryptString(buf);
        } catch (error) {
            console.error('Failed to decrypt stored key:', error.message);
            return null;
        }
    }

    async setAPIKey(provider, config) {
        if (!this.supportedProviders[provider]) {
            throw new Error(`Unsupported provider: ${provider}`);
        }

        const requiredFields = this.supportedProviders[provider].fields;
        for (const field of requiredFields) {
            if (!config[field] || config[field].trim() === '') {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Trim all string fields to remove accidental whitespace
        const cleanedConfig = { ...config };
        for (const field of requiredFields) {
            if (typeof cleanedConfig[field] === 'string') {
                cleanedConfig[field] = cleanedConfig[field].trim();
            }
        }

        const providerInfo = this.supportedProviders[provider];
        const keyData = {
            ...cleanedConfig,
            provider,
            model: cleanedConfig.model || providerInfo.defaultModel,
            apiKey: this.encryptSecret(cleanedConfig.apiKey),
            createdAt: new Date().toISOString(),
            lastUsed: null,
            isActive: cleanedConfig.isActive !== undefined ? cleanedConfig.isActive : true
        };

        this.store.set(`providers.${provider}`, keyData);
        return { success: true, message: `API key for ${this.supportedProviders[provider].name} saved successfully` };
    }

    async getAPIKey(provider) {
        if (!this.supportedProviders[provider]) {
            throw new Error(`Unsupported provider: ${provider}`);
        }

        const keyData = this.store.get(`providers.${provider}`);
        if (!keyData) {
            return null;
        }

        // Decrypt the secret for in-process use; on-disk value stays encrypted.
        return { ...keyData, apiKey: this.decryptSecret(keyData.apiKey) };
    }

    async getAllAPIKeys() {
        const allProviders = this.store.get('providers', {});
        const result = {};

        for (const [provider, data] of Object.entries(allProviders)) {
            if (this.supportedProviders[provider]) {
                const plain = this.decryptSecret(data.apiKey);
                result[provider] = {
                    ...data,
                    model: data.model || this.supportedProviders[provider].defaultModel,
                    providerInfo: this.supportedProviders[provider],
                    apiKey: plain ? '***' + plain.slice(-4) : null
                };
            }
        }

        return result;
    }

    async deleteAPIKey(provider) {
        if (!this.supportedProviders[provider]) {
            throw new Error(`Unsupported provider: ${provider}`);
        }

        this.store.delete(`providers.${provider}`);
        return { success: true, message: `API key for ${this.supportedProviders[provider].name} deleted successfully` };
    }

    async testAPIKey(provider, config = null) {
        const keyData = config || await this.getAPIKey(provider);
        if (!keyData) {
            throw new Error(`No API key found for provider: ${provider}`);
        }

        const providerInfo = this.supportedProviders[provider];

        try {
            switch (provider) {
                case 'openai':
                    return await this.testOpenAI(keyData);
                case 'anthropic':
                    return await this.testAnthropic(keyData);
                case 'google':
                    return await this.testGoogle(keyData);
                case 'cohere':
                    return await this.testCohere(keyData);
                case 'huggingface':
                    return await this.testHuggingFace(keyData);
                case 'azure':
                    return await this.testAzureOpenAI(keyData);
                case 'custom':
                    return await this.testCustomAPI(keyData);
                default:
                    throw new Error(`Testing not implemented for provider: ${provider}`);
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                provider: providerInfo.name
            };
        }
    }

    async testOpenAI(keyData) {
        const response = await fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${keyData.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            return {
                success: true,
                message: 'OpenAI API key is valid',
                models: data.data ? data.data.map(m => m.id).slice(0, 5) : []
            };
        } else {
            const error = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${error}`);
        }
    }

    async testAnthropic(keyData) {
        const response = await fetch('https://api.anthropic.com/v1/models', {
            headers: {
                'x-api-key': keyData.apiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
            }
        });

        if (response.ok) {
            return {
                success: true,
                message: 'Anthropic API key is valid',
                models: this.supportedProviders.anthropic.models
            };
        } else {
            const error = await response.text();
            throw new Error(`Anthropic API error: ${response.status} - ${error}`);
        }
    }

    async testGoogle(keyData) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${keyData.apiKey}`);

        if (response.ok) {
            const data = await response.json();
            return {
                success: true,
                message: 'Google AI API key is valid',
                models: data.models ? data.models.map(m => m.name).slice(0, 5) : []
            };
        } else {
            const error = await response.text();
            throw new Error(`Google AI API error: ${response.status} - ${error}`);
        }
    }

    async testCohere(keyData) {
        const response = await fetch('https://api.cohere.ai/v1/models', {
            headers: {
                'Authorization': `Bearer ${keyData.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            return {
                success: true,
                message: 'Cohere API key is valid',
                models: data.models ? data.models.map(m => m.name).slice(0, 5) : []
            };
        } else {
            const error = await response.text();
            throw new Error(`Cohere API error: ${response.status} - ${error}`);
        }
    }

    async testHuggingFace(keyData) {
        const response = await fetch('https://huggingface.co/api/whoami', {
            headers: {
                'Authorization': `Bearer ${keyData.apiKey}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            return {
                success: true,
                message: 'Hugging Face API key is valid',
                user: data.name || 'Unknown'
            };
        } else {
            const error = await response.text();
            throw new Error(`Hugging Face API error: ${response.status} - ${error}`);
        }
    }

    async testAzureOpenAI(keyData) {
        if (!keyData.endpoint || !keyData.deploymentName) {
            throw new Error('Azure OpenAI requires endpoint and deployment name');
        }

        const endpoint = keyData.endpoint.replace(/\/$/, '');
        const response = await fetch(`${endpoint}/openai/deployments/${keyData.deploymentName}/chat/completions?api-version=2023-05-15`, {
            method: 'POST',
            headers: {
                'api-key': keyData.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1
            })
        });

        if (response.ok || response.status === 400) {
            return {
                success: true,
                message: 'Azure OpenAI API key is valid',
                endpoint: keyData.endpoint,
                deployment: keyData.deploymentName
            };
        } else {
            const error = await response.text();
            throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`);
        }
    }

    async testCustomAPI(keyData) {
        if (!keyData.endpoint) {
            throw new Error('Custom API requires endpoint URL');
        }

        const endpoint = keyData.endpoint.replace(/\/$/, '');
        const response = await fetch(`${endpoint}/health`, {
            headers: {
                'Authorization': `Bearer ${keyData.apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            return {
                success: true,
                message: 'Custom API endpoint is reachable',
                endpoint: keyData.endpoint
            };
        } else {
            throw new Error(`Custom API endpoint unreachable: ${response.status}`);
        }
    }

    async updateLastUsed(provider) {
        const keyData = await this.getAPIKey(provider);
        if (keyData) {
            keyData.lastUsed = new Date().toISOString();
            this.store.set(`providers.${provider}`, keyData);
        }
    }

    async toggleProvider(provider, isActive) {
        const keyData = await this.getAPIKey(provider);
        if (keyData) {
            keyData.isActive = isActive;
            this.store.set(`providers.${provider}`, keyData);
            return { success: true };
        }
        throw new Error(`No configuration found for provider: ${provider}`);
    }

    getSupportedProviders() {
        return this.supportedProviders;
    }

    validateKeyFormat(provider, apiKey) {
        if (!apiKey || typeof apiKey !== 'string') {
            return false;
        }

        // Check for common API key formats
        switch (provider) {
            case 'anthropic':
                // Anthropic keys start with sk-ant-api03- or similar
                return apiKey.startsWith('sk-ant-');
            case 'openai':
                // OpenAI keys start with sk-
                return apiKey.startsWith('sk-');
            case 'google':
                // Google AI keys are typically 39 characters
                return apiKey.length >= 20;
            case 'azure':
                // Azure keys are typically 32 characters hex
                return apiKey.length >= 20;
            default:
                // For other providers, just check it's not empty
                return apiKey.length > 10;
        }
    }

    getExpectedKeyFormat(provider) {
        switch (provider) {
            case 'anthropic':
                return 'sk-ant-api03-...';
            case 'openai':
                return 'sk-...';
            case 'google':
                return 'AI... (39 chars)';
            case 'azure':
                return '32 character hex string';
            default:
                return 'Valid API key';
        }
    }

    async validateAndCleanupKeys() {
        console.log('\n🔍 Validating stored API keys...');
        const allProviders = this.store.get('providers', {});
        let cleanedCount = 0;

        for (const [provider, config] of Object.entries(allProviders)) {
            const apiKey = this.decryptSecret(config.apiKey);
            if (config.apiKey && (!apiKey || !this.validateKeyFormat(provider, apiKey))) {
                console.warn(`⚠️ Removing invalid API key for ${provider}`);
                this.store.delete(`providers.${provider}`);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`✅ Cleaned up ${cleanedCount} invalid API key(s)`);
        } else {
            console.log('✅ All stored API keys are valid');
        }
    }

    async getActiveProvider() {
        try {
            // Get all providers directly from store without masking
            const allProviders = this.store.get('providers', {});

            for (const [provider, config] of Object.entries(allProviders)) {
                if (this.supportedProviders[provider] && config.isActive && config.apiKey) {
                    // Decrypt before validating — the on-disk value is ciphertext.
                    const apiKey = this.decryptSecret(config.apiKey);
                    const isValidKey = apiKey && this.validateKeyFormat(provider, apiKey);

                    if (!isValidKey) {
                        console.warn(`Invalid API key format detected for ${provider}, skipping...`);
                        console.warn(`   Expected format: ${this.getExpectedKeyFormat(provider)}`);
                        // Mark as inactive to prevent future issues (without rewriting the secret)
                        try {
                            this.store.set(`providers.${provider}.isActive`, false);
                        } catch (e) {
                            console.error(`Failed to update provider status: ${e.message}`);
                        }
                        continue;
                    }

                    // Ensure providerInfo is always present
                    return {
                        provider,
                        config: {
                            ...config,
                            apiKey,
                            model: config.model || this.supportedProviders[provider].defaultModel,
                            providerInfo: this.supportedProviders[provider]
                        }
                    };
                }
            }
        } catch (error) {
            console.error('Error reading stored API keys:', error.message);
            // In production, we don't fall back to .env - the user must configure keys in the app
            if (process.env.NODE_ENV === 'development') {
                console.log('Development mode: Falling back to environment variables...');
            } else {
                console.error('No valid stored API keys found. Please configure your API key in Settings.');
                return null;
            }
        }

        // Only use .env fallback in development mode
        if (process.env.NODE_ENV === 'development') {
            if (process.env.ANTHROPIC_API_KEY) {
                console.log('Using Anthropic API key from environment variables (dev mode only)');
                return {
                    provider: 'anthropic',
                    config: {
                        apiKey: process.env.ANTHROPIC_API_KEY.trim(),
                        provider: 'anthropic',
                        isActive: true,
                        providerInfo: this.supportedProviders.anthropic
                    }
                };
            }

            if (process.env.OPENAI_API_KEY) {
                console.log('Using OpenAI API key from environment variables (dev mode only)');
                return {
                    provider: 'openai',
                    config: {
                        apiKey: process.env.OPENAI_API_KEY.trim(),
                        provider: 'openai',
                        isActive: true,
                        providerInfo: this.supportedProviders.openai
                    }
                };
            }
        }

        return null;
    }

    async exportConfig() {
        const allKeys = await this.getAllAPIKeys();
        const exportData = {};

        for (const [provider, config] of Object.entries(allKeys)) {
            exportData[provider] = {
                provider,
                hasApiKey: !!config.apiKey,
                isActive: config.isActive,
                createdAt: config.createdAt,
                lastUsed: config.lastUsed,
                providerName: config.providerInfo.name
            };
        }

        return {
            exportedAt: new Date().toISOString(),
            providers: exportData
        };
    }

    async clearAllKeys() {
        this.store.delete('providers');
        return { success: true, message: 'All API keys have been deleted' };
    }

    async resetStore() {
        // Complete reset of the store, useful if encryption becomes corrupted
        try {
            this.store.clear();
            console.log('Store has been completely reset');
            return { success: true, message: 'Store has been reset successfully' };
        } catch (error) {
            console.error('Failed to reset store:', error.message);
            return { success: false, message: `Failed to reset store: ${error.message}` };
        }
    }

    async healthCheck() {
        // Perform a health check on the store
        try {
            const providers = this.store.get('providers', {});
            const providerCount = Object.keys(providers).length;

            return {
                success: true,
                healthy: true,
                providerCount,
                message: `Store is healthy with ${providerCount} provider(s) configured`
            };
        } catch (error) {
            console.error('Store health check failed:', error.message);
            return {
                success: false,
                healthy: false,
                error: error.message,
                message: 'Store is corrupted or unreadable. Consider resetting the store.',
                suggestedAction: 'reset'
            };
        }
    }
}

module.exports = APIKeyManager;