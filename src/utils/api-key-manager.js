const crypto = require('crypto');
const { app } = require('electron');
const Store = require('electron-store');

class APIKeyManager {
    constructor() {
        this.store = new Store({
            name: 'api-keys',
            encryptionKey: this.getEncryptionKey()
        });

        this.supportedProviders = {
            openai: {
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                fields: ['apiKey'],
                models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini']
            },
            anthropic: {
                name: 'Anthropic (Claude)',
                baseUrl: 'https://api.anthropic.com/v1',
                fields: ['apiKey'],
                models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'claude-3-5-sonnet-20241022']
            },
            google: {
                name: 'Google AI (Gemini)',
                baseUrl: 'https://generativelanguage.googleapis.com/v1',
                fields: ['apiKey'],
                models: ['gemini-pro', 'gemini-pro-vision', 'gemini-1.5-pro', 'gemini-1.5-flash']
            },
            cohere: {
                name: 'Cohere',
                baseUrl: 'https://api.cohere.ai/v1',
                fields: ['apiKey'],
                models: ['command', 'command-r', 'command-r-plus', 'command-light']
            },
            huggingface: {
                name: 'Hugging Face',
                baseUrl: 'https://api-inference.huggingface.co/models',
                fields: ['apiKey'],
                models: ['custom-endpoint']
            },
            azure: {
                name: 'Azure OpenAI',
                baseUrl: 'https://your-resource.openai.azure.com',
                fields: ['apiKey', 'endpoint', 'deploymentName'],
                models: ['gpt-4', 'gpt-35-turbo']
            },
            custom: {
                name: 'Custom LLM API',
                baseUrl: 'https://your-api-endpoint.com',
                fields: ['apiKey', 'endpoint'],
                models: ['custom-model']
            }
        };
    }

    getEncryptionKey() {
        const machineId = app.getPath('userData');
        return crypto.createHash('sha256').update(machineId + 'aralaro-keys').digest('hex').substr(0, 32);
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

        const keyData = {
            ...cleanedConfig,
            provider,
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

        return keyData;
    }

    async getAllAPIKeys() {
        const allProviders = this.store.get('providers', {});
        const result = {};

        for (const [provider, data] of Object.entries(allProviders)) {
            if (this.supportedProviders[provider]) {
                result[provider] = {
                    ...data,
                    providerInfo: this.supportedProviders[provider],
                    apiKey: data.apiKey ? '***' + data.apiKey.slice(-4) : null
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
                models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']
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

    async getActiveProvider() {
        // Get all providers directly from store without masking
        const allProviders = this.store.get('providers', {});

        for (const [provider, config] of Object.entries(allProviders)) {
            if (this.supportedProviders[provider] && config.isActive && config.apiKey) {
                // Ensure providerInfo is always present
                return {
                    provider,
                    config: {
                        ...config,
                        providerInfo: this.supportedProviders[provider]
                    }
                };
            }
        }

        // Fallback to environment variables if no stored keys are active
        if (process.env.ANTHROPIC_API_KEY) {
            return {
                provider: 'anthropic',
                config: {
                    apiKey: process.env.ANTHROPIC_API_KEY,
                    provider: 'anthropic',
                    isActive: true,
                    providerInfo: this.supportedProviders.anthropic
                }
            };
        }

        if (process.env.OPENAI_API_KEY) {
            return {
                provider: 'openai',
                config: {
                    apiKey: process.env.OPENAI_API_KEY,
                    provider: 'openai',
                    isActive: true,
                    providerInfo: this.supportedProviders.openai
                }
            };
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
}

module.exports = APIKeyManager;