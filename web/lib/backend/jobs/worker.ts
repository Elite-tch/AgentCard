import connectToDatabase from '../db';
import { handlePayment } from './payment-handler';
import { recoverStuckOrders, retryWebhooks, expireStaleOrders } from './reconciler';

const JOBS_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function log(msg: string) {
  console.log(`[worker] ${msg}`);
}

async function runIntervalJobs() {
  await connectToDatabase();
  log('Starting background reconciliation jobs...');

  try {
    await expireStaleOrders();
    await recoverStuckOrders();
    await retryWebhooks();
    log('Background jobs tick completed.');
  } catch (err: any) {
    log(`Background jobs tick failed: ${err.message}`);
  }
}

async function startWorker() {
  log('Initializing AgentCard Worker...');
  await connectToDatabase();
  log('Database connected.');

  // Set up repeating intervals for the reconciler and webhooks
  setInterval(runIntervalJobs, JOBS_INTERVAL_MS);
  log(`Reconciliation interval set to ${JOBS_INTERVAL_MS}ms`);

  // Initial immediate run
  setImmediate(runIntervalJobs);

  // TODO: Attach Stellar Horizon Server Observer here.
  // The blockchain event listener will pipe events into handlePayment(event)
  log('Worker is running and waiting for events...');
}

// Allow running directly via `npx ts-node web/lib/backend/jobs/worker.ts`
if (require.main === module) {
  startWorker().catch((err) => {
    console.error('Fatal worker crash:', err);
    process.exit(1);
  });
}

export { startWorker };
