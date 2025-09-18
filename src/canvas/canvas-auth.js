const Store = require('electron-store');
const CanvasAPI = require('./canvas-api');

class CanvasAuth {
  constructor() {
    this.store = new Store();
    this.api = new CanvasAPI();
    this.isAuthenticated = false;
  }

  async authenticate(apiUrl, token) {
    try {
      if (!apiUrl || !token) {
        throw new Error('Canvas API URL and token are required');
      }

      if (!this.isValidUrl(apiUrl)) {
        throw new Error('Invalid Canvas API URL format');
      }

      if (!this.isValidToken(token)) {
        throw new Error('Invalid Canvas API token format');
      }

      const result = await this.api.authenticate(apiUrl, token);

      if (result.success) {
        this.store.set('canvas.apiUrl', apiUrl);
        this.store.set('canvas.token', token);
        this.store.set('canvas.user', result.user);
        this.store.set('canvas.authenticatedAt', new Date().toISOString());

        this.isAuthenticated = true;

        return {
          success: true,
          user: result.user,
          message: 'Successfully authenticated with Canvas'
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async loadStoredCredentials() {
    try {
      const apiUrl = this.store.get('canvas.apiUrl');
      const token = this.store.get('canvas.token');
      const authenticatedAt = this.store.get('canvas.authenticatedAt');

      if (!apiUrl || !token) {
        return {
          success: false,
          error: 'No stored Canvas credentials found'
        };
      }

      if (authenticatedAt) {
        const authDate = new Date(authenticatedAt);
        const daysSinceAuth = (Date.now() - authDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceAuth > 30) {
          this.clearCredentials();
          return {
            success: false,
            error: 'Stored credentials have expired (>30 days old)'
          };
        }
      }

      const result = await this.api.authenticate(apiUrl, token);

      if (result.success) {
        this.isAuthenticated = true;
        this.store.set('canvas.user', result.user);
        this.store.set('canvas.lastVerified', new Date().toISOString());

        return {
          success: true,
          user: result.user,
          apiUrl: apiUrl,
          message: 'Loaded and verified stored Canvas credentials'
        };
      } else {
        this.clearCredentials();
        return {
          success: false,
          error: 'Stored credentials are no longer valid'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  clearCredentials() {
    this.store.delete('canvas.apiUrl');
    this.store.delete('canvas.token');
    this.store.delete('canvas.user');
    this.store.delete('canvas.authenticatedAt');
    this.store.delete('canvas.lastVerified');
    this.isAuthenticated = false;
  }

  getStoredUser() {
    return this.store.get('canvas.user');
  }

  getStoredApiUrl() {
    return this.store.get('canvas.apiUrl');
  }

  getAPI() {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Canvas');
    }
    return this.api;
  }

  isValidUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'https:' &&
             urlObj.hostname.includes('instructure.com') ||
             urlObj.hostname.includes('canvas.');
    } catch (error) {
      return false;
    }
  }

  isValidToken(token) {
    return typeof token === 'string' &&
           token.length > 10 &&
           /^[a-zA-Z0-9~]+$/.test(token);
  }

  getAuthStatus() {
    const user = this.getStoredUser();
    const apiUrl = this.getStoredApiUrl();
    const lastVerified = this.store.get('canvas.lastVerified');

    return {
      isAuthenticated: this.isAuthenticated,
      user: user,
      apiUrl: apiUrl,
      lastVerified: lastVerified
    };
  }

  async refreshConnection() {
    const apiUrl = this.getStoredApiUrl();
    const token = this.store.get('canvas.token');

    if (!apiUrl || !token) {
      return {
        success: false,
        error: 'No stored credentials to refresh'
      };
    }

    return await this.authenticate(apiUrl, token);
  }
}

module.exports = CanvasAuth;