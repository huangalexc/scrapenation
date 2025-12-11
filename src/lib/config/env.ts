/**
 * Environment configuration
 * Centralized access to environment variables with type safety
 */

export const env = {
  // Database
  database: {
    url: process.env.DATABASE_URL || '',
  },

  // Google APIs
  google: {
    placesApiKey: process.env.GOOGLE_PLACES_API_KEY || '',
    customSearchApiKey: process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || '',
    customSearchEngineId: process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID || '',
  },

  // OpenAI
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },

  // NextAuth
  nextAuth: {
    secret: process.env.NEXTAUTH_SECRET || '',
    url: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  },

  // Node environment
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
};

/**
 * Validate that required environment variables are present
 */
export function validateEnv() {
  const required = {
    DATABASE_URL: env.database.url,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please check your .env file and ensure all required variables are set.'
    );
  }
}

/**
 * Validate API keys are present (warns instead of throwing)
 */
export function validateApiKeys() {
  const warnings: string[] = [];

  if (!env.google.placesApiKey) {
    warnings.push('GOOGLE_PLACES_API_KEY is not set - Places API integration will fail');
  }

  if (!env.google.customSearchApiKey) {
    warnings.push(
      'GOOGLE_CUSTOM_SEARCH_API_KEY is not set - Custom Search integration will fail'
    );
  }

  if (!env.google.customSearchEngineId) {
    warnings.push(
      'GOOGLE_CUSTOM_SEARCH_ENGINE_ID is not set - Custom Search integration will fail'
    );
  }

  if (!env.openai.apiKey) {
    warnings.push('OPENAI_API_KEY is not set - GPT enrichment will fail');
  }

  if (warnings.length > 0 && !env.isTest) {
    console.warn('\n⚠️  API Key Warnings:\n' + warnings.map((w) => `  - ${w}`).join('\n') + '\n');
  }

  return warnings;
}
