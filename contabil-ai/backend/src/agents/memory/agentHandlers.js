const agent = require('./agent');
const { AGENT_EVENTS } = require('../baseAgent');

async function handleJob(job) {
  const event = {
    type: job.name || AGENT_EVENTS.MEMORY_UPDATE_REQUESTED,
    ...job.data,
  };
  return agent.handleEvent(event);
}

module.exports = { handleJob };
