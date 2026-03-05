const OpenAI = require('openai');
const env = require('./env');

let openai = null;

function getOpenAI() {
  if (!openai) {
    if (!env.openai.apiKey) {
      throw new Error('OPENAI_API_KEY is required for AI features');
    }
    openai = new OpenAI({ apiKey: env.openai.apiKey });
  }
  return openai;
}

module.exports = getOpenAI;
