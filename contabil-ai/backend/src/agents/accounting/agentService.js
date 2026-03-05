const getOpenAI = require('../../config/openai');
const logger = require('../../config/logger');

const ACCOUNTING_PROMPT = `Voce e um contador brasileiro especialista em lancamentos contabeis.
Dado os dados de uma transacao, sugira o lancamento contabil adequado.

Retorne JSON:
{
  "debit_account": "codigo da conta debito",
  "debit_description": "descricao da conta debito",
  "credit_account": "codigo da conta credito",
  "credit_description": "descricao da conta credito",
  "amount": 1234.56,
  "description": "historico do lancamento",
  "category": "categoria contabil",
  "confidence": 0.95
}

Use o plano de contas padrao brasileiro (Lei 6.404).`;

async function suggestAccountingEntry(companyId, { supplier, amount, category, accountCode, source, extractedData }) {
  // If we already have an account code from memory, use it directly
  if (accountCode) {
    return {
      companyId,
      debit_account: amount > 0 ? '1.1.1' : accountCode,
      credit_account: amount > 0 ? accountCode : '1.1.1',
      amount: Math.abs(amount),
      description: `${supplier || category} - ${source}`,
      category,
      confidence: 0.9,
      source: 'memory',
    };
  }

  // Otherwise use GPT to suggest
  try {
    let memoryContext = '';
    try {
      const memoryEngine = require('../../memory/memoryEngine');
      memoryContext = await memoryEngine.getMemoryContext(companyId);
    } catch { /* no memory available */ }

    const prompt = `Transacao:
- Fornecedor: ${supplier || 'N/A'}
- Valor: R$ ${Math.abs(amount || 0).toFixed(2)}
- Tipo: ${amount > 0 ? 'Receita' : 'Despesa'}
- Classificacao: ${category || 'N/A'}
- Dados extraidos: ${extractedData ? JSON.stringify(extractedData) : 'N/A'}
${memoryContext ? `\n${memoryContext}` : ''}

Sugira o lancamento contabil.`;

    const response = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ACCOUNTING_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const entry = JSON.parse(response.choices[0].message.content);
    return { companyId, ...entry, source: 'ai' };
  } catch (err) {
    logger.error('Accounting entry suggestion failed', { companyId, error: err.message });
    return {
      companyId,
      debit_account: null,
      credit_account: null,
      amount: Math.abs(amount || 0),
      description: `${supplier || ''} - ${category || ''}`,
      category,
      confidence: 0,
      source: 'fallback',
    };
  }
}

module.exports = {
  suggestAccountingEntry,
};
