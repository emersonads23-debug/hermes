const agent = require('./agent');
const { AGENT_EVENTS } = require('../baseAgent');

// Handler for BullMQ worker jobs
async function handleJob(job) {
  const event = {
    type: job.name || AGENT_EVENTS.DOCUMENT_RECEIVED,
    ...job.data,
  };
  return agent.handleEvent(event);
}

module.exports = { handleJob };
