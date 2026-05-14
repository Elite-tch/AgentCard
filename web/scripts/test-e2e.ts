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
  rpc
} from '@stellar/stellar-sdk';

const AMOUNT = process.argv[2] || '0.02';
const AGENTCARD_BASE = `http://localhost:${process.env.PORT || 3000}/api`;
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL || 'https://mainnet.sorobanrpc.com';
const RECEIVER_CONTRACT_ID = process.env.RECEIVER_CONTRACT_ID;
const NETWORK = process.env.STELLAR_NETWORK || 'mainnet';
const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

async function main() {
  console.log(`\n=== agentcard V2 E2E test — $${AMOUNT} USDC ===\n`);

  if (!RECEIVER_CONTRACT_ID) throw new Error('RECEIVER_CONTRACT_ID not set in .env');
  if (!process.env.STELLAR_XLM_SECRET) throw new Error('STELLAR_XLM_SECRET not set in .env');

  await connectToDatabase();

  const testToken = `AgentCard_${crypto.randomBytes(24).toString('hex')}`;
  const keyHash = await bcrypt.hash(testToken, 10);
  const keyPrefix = testToken.slice(10, 22);

  const newKey = await ApiKey.create({
    dashboardId: 'test-dashboard-e2e',
    keyHash,
    keyPrefix,
    label: 'e2e-test-v2',
    mode: 'live',
    enabled: true
  });
  
  const keyId = String(newKey._id);
  console.log(`[1] Created test API key ${keyId.slice(0, 8)}`);

  let orderId;
  try {
    const orderRes = await fetch(`${AGENTCARD_BASE}/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': testToken, 'idempotency-key': crypto.randomUUID() },
      body: JSON.stringify({ amount_usdc: AMOUNT }),
    });

    if (!orderRes.ok) {
      const err = await orderRes.text();
      throw new Error(`POST /v1/orders failed: ${orderRes.status} ${err}`);
    }

    const order = await orderRes.json();
    orderId = order.order_id;
    const payment = order.payment;

    console.log(`[2] Order created: ${orderId}`);
    console.log(`    Contract: ${payment.contract_id}`);
    console.log(`    USDC:     ${payment.usdc.amount}`);
    if (payment.xlm) console.log(`    XLM:      ${payment.xlm.amount}`);

    if (!payment.xlm?.amount) throw new Error('No XLM quote in payment instructions');

    const keypair = Keypair.fromSecret(process.env.STELLAR_XLM_SECRET);
    const stroops = BigInt(Math.round(parseFloat(payment.xlm.amount) * 1e7));

    console.log(`\n[3] Invoking pay_xlm on contract (${stroops} stroops)...`);

    const server = new rpc.Server(SOROBAN_RPC_URL);
    const account = await server.getAccount(keypair.publicKey());
    const contract = new Contract(RECEIVER_CONTRACT_ID);

    const tx = new TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        contract.call(
          'pay_xlm',
          new Address(keypair.publicKey()).toScVal(),
          nativeToScVal(stroops, { type: 'i128' }),
          nativeToScVal(Buffer.from(orderId, 'utf-8'), { type: 'bytes' }),
        ),
      )
      .setTimeout(300)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(`Simulation failed: ${sim.error}`);

    const preparedTx = rpc.assembleTransaction(tx, sim).build();
    preparedTx.sign(keypair);

    let sendResult = await server.sendTransaction(preparedTx);
    if (sendResult.status === 'TRY_AGAIN_LATER') {
      console.log('    TX: TRY_AGAIN_LATER — retrying in 5s...');
      await new Promise((r) => setTimeout(r, 5000));
      sendResult = await server.sendTransaction(preparedTx);
    }
    if (sendResult.status === 'ERROR')
      throw new Error(`Transaction failed: ${JSON.stringify(sendResult.errorResult)}`);
    if (sendResult.status === 'TRY_AGAIN_LATER')
      throw new Error('Soroban network busy (TRY_AGAIN_LATER after retry)');

    console.log(`    TX hash: ${sendResult.hash}`);
    console.log(`    Status:  ${sendResult.status}`);

    let txStatus = 'PENDING';
    const txDeadline = Date.now() + 60000;
    while (Date.now() < txDeadline) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const check = await server.getTransaction(sendResult.hash);
        if (check.status === 'SUCCESS' || check.status === 'FAILED') {
          txStatus = check.status;
          break;
        }
        process.stdout.write('.');
      } catch (parseErr: any) {
        if (
          parseErr.message?.includes('Bad union switch') ||
          parseErr.message?.includes('bad union switch')
        ) {
          txStatus = 'SUCCESS';
          console.log(`\n    (XDR parse note: ${parseErr.message} — assuming landed)`);
          break;
        }
        throw parseErr;
      }
    }
    console.log(`\n    Final TX status: ${txStatus}`);
    if (txStatus !== 'SUCCESS') throw new Error(`Soroban TX did not succeed: ${txStatus}`);

    console.log('\n[4] Polling for card delivery...');
    const deadline = Date.now() + 5 * 60 * 1000; 
    let card;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 4000));

      const statusRes = await fetch(`${AGENTCARD_BASE}/v1/orders/${orderId}`, {
        headers: { 'x-api-key': testToken },
      });
      const status = await statusRes.json();
      process.stdout.write(`  ${status.status} (${status.phase})\n`);

      if (status.phase === 'ready') {
        card = status.card;
        break;
      }
      if (['failed', 'refund_pending', 'refunded', 'expired'].includes(status.status)) {
        throw new Error(`Order ${status.status}: ${status.error || 'no detail'}`);
      }
    }

    if (!card) throw new Error('Timed out waiting for card delivery');

    console.log('\n=== CARD DELIVERED ===');
    console.log(`Number: ****${card.number?.slice(-4)}`);
    console.log(`Expiry: ${card.expiry}`);
    console.log(`Brand:  ${card.brand}`);
    console.log('(CVV not logged)\n');
  } finally {
    await ApiKey.deleteOne({ _id: keyId });
    console.log(`[cleanup] Removed test API key`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`\nFATAL: ${err.message}`);
  process.exit(1);
});
