const fs = require('fs');
const openai = require('../config/openai');
const logger = require('../config/logger');

const SYSTEM_PROMPT = `Voce e o ContabilAI, um assistente financeiro inteligente para escritorios de contabilidade.
Voce ajuda com:
- Consultas de notas fiscais, boletos e faturas
- Status de pagamentos e recebimentos
- Resumos financeiros
- Extracao de dados de documentos (imagens e PDFs)
- Duvidas contabeis gerais

Responda sempre em portugues brasileiro, de forma clara e objetiva.
Se nao conseguir resolver o problema, informe que vai escalar para a equipe interna.

Ao analisar documentos financeiros, extraia: valores, datas, CNPJ/CPF, descricoes e categorias.`;

async function interpretMessage(text, conversationHistory = []) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory.slice(-10),
    { role: 'user', content: text },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.3,
    max_tokens: 1024,
  });

  return response.choices[0].message.content;
}

async function classifyIntent(text) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Classifique a intencao do usuario em uma das categorias:
- CONSULTA_NF: consulta de nota fiscal
- CONSULTA_BOLETO: consulta de boleto ou pagamento
- CONSULTA_FINANCEIRA: resumo financeiro, saldo, extrato
- ENVIO_DOCUMENTO: usuario enviou um documento para analise
- DUVIDA_CONTABIL: duvida geral sobre contabilidade
- ESCALAR: problema que precisa de atencao humana
- SAUDACAO: cumprimento ou apresentacao
- OUTRO: nao se encaixa nas categorias anteriores

Responda APENAS com a categoria, sem explicacao.`,
      },
      { role: 'user', content: text },
    ],
    temperature: 0,
    max_tokens: 50,
  });

  return response.choices[0].message.content.trim();
}

async function transcribeAudio(filePath) {
  const file = fs.createReadStream(filePath);
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'pt',
  });
  return transcription.text;
}

async function analyzeImage(filePath) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'Analise esta imagem de documento financeiro. Extraia todos os dados relevantes: valores, datas, CNPJ/CPF, descricoes, numero do documento. Retorne em formato estruturado.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64Image}` },
          },
        ],
      },
    ],
    max_tokens: 2048,
  });

  return response.choices[0].message.content;
}

async function analyzePdf(textContent) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'Analise este conteudo extraido de um PDF financeiro. Extraia todos os dados relevantes: valores, datas, CNPJ/CPF, descricoes, numero do documento, impostos. Retorne em formato estruturado.',
      },
      { role: 'user', content: textContent },
    ],
    max_tokens: 2048,
  });

  return response.choices[0].message.content;
}

async function shouldEscalate(text, aiResponse) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Avalie se esta conversa precisa ser escalada para um humano.
Retorne "true" se:
- O usuario esta insatisfeito ou frustrado
- O problema e muito complexo para IA resolver
- Envolve decisoes financeiras criticas
- O usuario solicita falar com uma pessoa
Retorne apenas "true" ou "false".`,
      },
      { role: 'user', content: `Mensagem do usuario: ${text}\nResposta da IA: ${aiResponse}` },
    ],
    temperature: 0,
    max_tokens: 10,
  });

  return response.choices[0].message.content.trim().toLowerCase() === 'true';
}

module.exports = {
  interpretMessage,
  classifyIntent,
  transcribeAudio,
  analyzeImage,
  analyzePdf,
  shouldEscalate,
};
