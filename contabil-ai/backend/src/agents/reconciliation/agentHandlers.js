const agent = require('./agent');
const { AGENT_EVENTS } = require('../baseAgent');

async function handleJob(job) {
  const event = {
    type: job.name || AGENT_EVENTS.TRANSACTION_DETECTED,
    ...job.data,
  };
  return agent.handleEvent(event);
}

module.exports = { handleJob };
