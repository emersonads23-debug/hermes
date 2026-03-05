const OpenAI = require('openai');
const env = require('./env');

const openai = new OpenAI({ apiKey: env.openai.apiKey });

module.exports = openai;
