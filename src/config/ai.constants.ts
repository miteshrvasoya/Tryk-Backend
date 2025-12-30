
import dotenv from 'dotenv';
dotenv.config();

export const AI_CONFIG = {
  activeProvider: process.env.AI_PROVIDER || 'openrouter',
  providers: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-haiku-20240307',
    },
    groq: {
      apiKey: process.env.GROQ_API_KEY,
      model: 'openai/gpt-oss-120b', 
    },
    openrouter: {
      apiKey: process.env.OPEN_ROUTER_API_KEY,
      model: 'meta-llama/llama-3.1-405b-instruct:free',
      baseURL: 'https://openrouter.ai/api/v1',
    }
  }
};
