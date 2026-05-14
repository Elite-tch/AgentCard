import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import connectToDatabase from '../lib/backend/db';
import { ApiKey } from '../lib/backend/models/ApiKey';
import {
  Keypair,
  Networks,
  TransactionBuilder,
  Contract,
  nativeToScVal,
  Address,
  rpc,
} from '@stellar/stellar-sdk';

const COUNT = parseInt(process.argv[2] || '5', 10);
const AMOUNT = process.argv[3] || '0.02';
const AGENTCARD_BASE = `http://localhost:${process.env.PORT || 3000}/api`;
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || 'https://mainnet.sorobanrpc.com';
const RECEIVER_CONTRACT_ID = process.env.RECEIVER_CONTRACT_ID;
const NETWORK = process.env.STELLAR_NETWORK || 'mainnet';
const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

function now() {
  return Date.now();
}
function fmtMs(ms: number | null) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
function shortId(s: string | null) {
  return s ? s.slice(0, 8) : '—';
}

async function main() {
  if (!RECEIVER_CONTRACT_ID) throw new Error('RECEIVER_CONTRACT_ID not set');
  if (!process.env.STELLAR_XLM_SECRET) throw new Error('STELLAR_XLM_SECRET not set');

  console.log(`\n=== agentcard batch e2e — ${COUNT}× $${AMOUNT} on ${NETWORK} ===\n`);
  console.log(`  contract = ${RECEIVER_CONTRACT_ID}`);
  console.log(`  rpc      = ${SOROBAN_RPC_URL}`);
  console.log(`  api      = ${AGENTCARD_BASE}`);
  console.log('');

  await connectToDatabase();

  const testToken = `AgentCard_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = await bcrypt.hash(testToken, 10);
  const keyPrefix = testToken.slice(10, 22);
  
  const newKey = await ApiKey.create({
    dashboardId: 'test-dashboard-batch-e2e',
    keyHash,
    keyPrefix,
    label: 'batch-e2e-test',
    mode: 'live',
    enabled: true
  });
  const keyId = String(newKey._id);
  console.log(`created batch test key ${shortId(keyId)}\n`);

  const keypair = Keypair.fromSecret(process.env.STELLAR_XLM_SECRET);
  const server = new rpc.Server(SOROBAN_RPC_URL);
  const contract = new Contract(RECEIVER_CONTRACT_ID);

  const results: any[] = [];
  const batchStart = now();

  try {
    for (let i = 0; i < COUNT; i++) {
      const n = i + 1;
      const t = {
        started: now(),
        createdOrder: null as number | null,
        simulated: null as number | null,
        sent: null as number | null,
        landed: null as number | null,
        firstProcessing: null as number | null,
        delivered: null as number | null,
      };
      const result = { n, t, orderId: null as string | null, txHash: null as string | null, finalPhase: null as string | null, error: null as string | null };
      results.push(result);

      console.log(`──── order ${n}/${COUNT} ────`);

      try {
        const orderRes = await fetch(`${AGENTCARD_BASE}/v1/orders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': testToken, 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({ amount_usdc: AMOUNT }),
        });
        if (!orderRes.ok) {
          const errText = await orderRes.text();
          throw new Error(`POST /v1/orders ${orderRes.status}: ${errText}`);
        }
        const order = await orderRes.json();
        result.orderId = order.order_id;
        t.createdOrder = now();

        const xlmAmount = order.payment.xlm?.amount;
        if (!xlmAmount) throw new Error('no XLM quote in payment instructions');
        const stroops = BigInt(Math.round(parseFloat(xlmAmount) * 1e7));

        console.log(`  id=${shortId(order.order_id)} xlm=${xlmAmount}`);

        const account = await server.getAccount(keypair.publicKey());
        const tx = new TransactionBuilder(account, {
          fee: '1000000',
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(
            contract.call(
              'pay_xlm',
              new Address(keypair.publicKey()).toScVal(),
              nativeToScVal(stroops, { type: 'i128' }),
              nativeToScVal(Buffer.from(order.order_id, 'utf-8'), { type: 'bytes' }),
            ),
          )
          .setTimeout(300)
          .build();

        const sim = await server.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(sim)) throw new Error(`simulation failed: ${sim.error}`);
        t.simulated = now();

        const preparedTx = rpc.assembleTransaction(tx, sim).build();
        preparedTx.sign(keypair);

        let sendResult = await server.sendTransaction(preparedTx);
        if (sendResult.status === 'TRY_AGAIN_LATER') {
          console.log(`  send: TRY_AGAIN_LATER → wait 5s + retry`);
          await new Promise((r) => setTimeout(r, 5000));
          sendResult = await server.sendTransaction(preparedTx);
        }
        if (sendResult.status === 'ERROR') {
          throw new Error(`sendTransaction ERROR: ${JSON.stringify(sendResult.errorResult)}`);
        }
        result.txHash = sendResult.hash;
        t.sent = now();
        console.log(`  sent: ${shortId(sendResult.hash)} (${sendResult.status})`);

        let txStatus = 'PENDING';
        const txDeadline = Date.now() + 60_000;
        while (Date.now() < txDeadline) {
          await new Promise((r) => setTimeout(r, 3000));
          try {
            const check = await server.getTransaction(sendResult.hash);
            if (check.status === 'SUCCESS' || check.status === 'FAILED') {
              txStatus = check.status;
              break;
            }
          } catch (parseErr: any) {
            if (
              parseErr.message?.includes('Bad union switch') ||
              parseErr.message?.includes('bad union switch')
            ) {
              txStatus = 'SUCCESS';
              break;
            }
            throw parseErr;
          }
        }
        if (txStatus !== 'SUCCESS') throw new Error(`tx did not land: ${txStatus}`);
        t.landed = now();
        console.log(`  landed in ${fmtMs(t.landed - t.sent)}`);

        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let finalPhase = null;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const statusRes = await fetch(`${AGENTCARD_BASE}/v1/orders/${order.order_id}`, {
            headers: { 'x-api-key': testToken },
          });
          const status = await statusRes.json();

          if (status.phase === 'processing' && !t.firstProcessing) {
            t.firstProcessing = now();
            console.log(`  watcher pickup +${fmtMs(t.firstProcessing - t.landed)}`);
          }
          if (status.phase === 'ready') {
            t.delivered = now();
            finalPhase = 'ready';
            console.log(
              `  delivered ****${status.card?.number?.slice(-4) || '????'} in ${fmtMs(t.delivered - t.started)}`,
            );
            break;
          }
          if (['failed', 'refunded', 'rejected', 'expired'].includes(status.phase)) {
            finalPhase = status.phase;
            console.log(`  terminal fail: ${status.phase} — ${status.error || 'no detail'}`);
            break;
          }
        }
        if (!finalPhase) throw new Error('timed out waiting for delivery (5 min)');
        result.finalPhase = finalPhase;
      } catch (err: any) {
        result.error = err.message;
        result.finalPhase = result.finalPhase || 'error';
        console.log(`  ✖ ${err.message}`);
      }
      console.log('');
    }

    const batchDuration = now() - batchStart;
    const delivered = results.filter((r) => r.finalPhase === 'ready');
    const failed = results.filter((r) => r.finalPhase !== 'ready');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(
      ` BATCH RESULTS — ${delivered.length}/${COUNT} delivered in ${fmtMs(batchDuration)}`,
    );
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    console.log("\nper-order timings (all numbers relative to that order's start):");
    console.log('');
    console.log('  #  phase        order→sent  sent→landed  landed→proc  proc→delivered  total');
    console.log('  -  -----------  ----------  -----------  -----------  --------------  -----');
    for (const r of results) {
      const t = r.t;
      const orderToSent = t.sent && t.createdOrder ? t.sent - t.createdOrder : null;
      const sentToLanded = t.landed && t.sent ? t.landed - t.sent : null;
      const landedToProc = t.firstProcessing && t.landed ? t.firstProcessing - t.landed : null;
      const procToDelivered =
        t.delivered && t.firstProcessing ? t.delivered - t.firstProcessing : null;
      const total = (t.delivered || now()) - t.started;
      console.log(
        `  ${String(r.n).padStart(2)}  ${(r.finalPhase || '—').padEnd(11)}  ` +
          `${String(fmtMs(orderToSent)).padStart(10)}  ` +
          `${String(fmtMs(sentToLanded)).padStart(11)}  ` +
          `${String(fmtMs(landedToProc)).padStart(11)}  ` +
          `${String(fmtMs(procToDelivered)).padStart(14)}  ` +
          `${fmtMs(total)}`,
      );
    }

    if (delivered.length > 0) {
      const totals = delivered.map((r) => r.t.delivered - r.t.started);
      const sentToLandedArr = delivered.map((r) => r.t.landed - r.t.sent).filter(Boolean);
      const landedToDelivArr = delivered.map((r) => r.t.delivered - r.t.landed).filter(Boolean);
      const min = (a: number[]) => Math.min(...a);
      const max = (a: number[]) => Math.max(...a);
      const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;

      console.log('\ndelivered-only stats:');
      console.log(
        `  total         min ${fmtMs(min(totals))}  mean ${fmtMs(mean(totals))}  max ${fmtMs(max(totals))}`,
      );
      if (sentToLandedArr.length) {
        console.log(
          `  sent→landed   min ${fmtMs(min(sentToLandedArr))}  mean ${fmtMs(mean(sentToLandedArr))}  max ${fmtMs(max(sentToLandedArr))}`,
        );
      }
      if (landedToDelivArr.length) {
        console.log(
          `  landed→deliv  min ${fmtMs(min(landedToDelivArr))}  mean ${fmtMs(mean(landedToDelivArr))}  max ${fmtMs(max(landedToDelivArr))}`,
        );
      }
    }

    if (failed.length > 0) {
      console.log('\nfailures:');
      for (const f of failed) {
        console.log(`  #${f.n}  ${f.finalPhase}  ${f.error || ''}`);
      }
    }

    const successRate = (delivered.length / COUNT) * 100;
    console.log(`\nsuccess rate: ${successRate.toFixed(0)}%`);
    console.log('');
  } finally {
    await ApiKey.deleteOne({ _id: keyId });
    console.log(`(cleanup) removed batch test key ${shortId(keyId)}`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`\nFATAL: ${err.stack || err.message}`);
  process.exit(1);
});
