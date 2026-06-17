'use strict';
const { Agenda } = require('agenda');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/HsFAst';

let agenda;

function getAgenda() {
  if (!agenda) {
    agenda = new Agenda({
      db: { address: MONGODB_URI, collection: 'agendaJobs' },
      processEvery: '3 seconds',
      maxConcurrency: 4,
      defaultConcurrency: 4,
    });
  }
  return agenda;
}

async function startQueue() {
  const ag = getAgenda();
  const { runPrediction } = require('./predictionService');

  ag.define('runPrediction', { priority: 'normal', concurrency: 4 }, async (job) => {
    const { predictionId, tier } = job.attrs.data;
    await runPrediction(predictionId, tier);
  });

  await ag.start();
  console.log('[agenda] Job queue started (MongoDB-backed)');
  return ag;
}

async function enqueuePrediction(predictionId, tier) {
  const ag = getAgenda();
  await ag.now('runPrediction', { predictionId: String(predictionId), tier });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (agenda) await agenda.stop();
});

module.exports = { startQueue, enqueuePrediction };
