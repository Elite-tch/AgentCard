import {
  Horizon,
  Keypair,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  Memo,
  StrKey,
} from '@stellar/stellar-sdk';
import { bizEvent } from './logger';

export function log(level: string, message: string, data?: any) {
  console.log(`[${level.toUpperCase()}] ${message}`, data);
}

function safeMemoText(memo: string | null | undefined): Memo {
  if (memo === null || memo === undefined || memo === '') return Memo.none();
  const s = String(memo);
  if (Buffer.byteLength(s, 'utf8') > 28) {
    throw new Error(`Memo exceeds 28-byte Stellar limit: ${s}`);
  }
  return Memo.text(s);
}

function assertValidStellarAmount(amount: string | number | null | undefined, fieldName: string) {
  if (amount === null || amount === undefined || amount === '') {
    throw new Error(`${fieldName}: missing amount`);
  }
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${fieldName}: invalid amount '${amount}'`);
  }
  if (n > 1_000_000) {
    throw new Error(`${fieldName}: amount '${amount}' exceeds treasury ceiling`);
  }
}

function ctxDestinationAllowlist(): Set<string> | null {
  const raw = process.env.CTX_DESTINATION_ALLOWLIST;
  if (!raw) return null;
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

const NETWORK = process.env.STELLAR_NETWORK || 'mainnet';
const HORIZON_URL =
  NETWORK === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

const server = new Horizon.Server(HORIZON_URL);

export async function submitWithRetry(buildTx: (account: any) => any, keypair: Keypair, maxAttempts = 3): Promise<string> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const account = await server.loadAccount(keypair.publicKey());
    const tx = buildTx(account);
    tx.sign(keypair);
    
    const hashHex = tx.hash().toString('hex');

    try {
      const result = await server.submitTransaction(tx);
      return result.hash;
    } catch (err: any) {
      lastErr = err;
      const resultCodes = err?.response?.data?.extras?.result_codes;
      const txCode = resultCodes?.transaction;

      if (txCode === 'tx_bad_seq' && attempt < maxAttempts) {
        continue;
      }
      if (resultCodes) {
        throw err;
      }
      const resolution = await resolveNetworkErrorOutcome(hashHex);
      if (resolution.landed) {
        return hashHex;
      }
      throw annotateSubmitError(err, hashHex, resolution);
    }
  }
  throw lastErr ?? new Error('submitWithRetry: exhausted attempts without terminal result');
}

export async function resolveNetworkErrorOutcome(hashHex: string) {
  try {
    const record = await server.transactions().transaction(hashHex).call() as any;
    if (record?.successful === true) {
      return { landed: true };
    }
    return {
      landed: false,
      reason: 'applied_failed',
      resultCode: record?.result_codes?.transaction || null,
    };
  } catch (lookupErr: any) {
    const status = lookupErr?.response?.status ?? lookupErr?.status ?? null;
    if (status === 404 || /not.?found/i.test(lookupErr?.message || '')) {
      return { landed: false, reason: 'not_landed' };
    }
    return {
      landed: false,
      reason: 'unknown',
      lookupError: lookupErr?.message || String(lookupErr),
    };
  }
}

function annotateSubmitError(originalErr: any, hashHex: string, resolution: any) {
  const status = resolution.reason;
  const baseMsg = originalErr?.message || String(originalErr);
  const msg =
    status === 'not_landed'
      ? `submit network error and tx ${hashHex} was not accepted by any ledger — safe to retry. (${baseMsg})`
      : status === 'applied_failed'
        ? `tx ${hashHex} applied on-chain but failed (${resolution.resultCode || 'unknown'})`
        : `submit network error and Horizon lookup also failed for ${hashHex}: ${resolution.lookupError || 'unknown'} (original: ${baseMsg})`;
  const wrapped: any = new Error(msg);
  wrapped.stellarStatus = status;
  wrapped.txHash = hashHex;
  return wrapped;
}

export async function sendXlm({ destination, amount, memo }: { destination: string, amount: string | number, memo?: string | null }) {
  const secret = process.env.STELLAR_XLM_SECRET;
  if (!secret) throw new Error('STELLAR_XLM_SECRET not set');
  if (!StrKey.isValidEd25519PublicKey(destination)) {
    throw new Error('sendXlm: invalid destination address');
  }
  assertValidStellarAmount(amount, 'sendXlm');

  const keypair = Keypair.fromSecret(secret);
  return submitWithRetry(
    (account) =>
      new TransactionBuilder(account, { fee: '100000', networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(
          Operation.payment({ destination, asset: Asset.native(), amount: String(amount) }),
        )
        .addMemo(safeMemoText(memo))
        .setTimeout(120)
        .build(),
    keypair,
  );
}

export async function sendUsdc({ destination, amount, memo }: { destination: string, amount: string | number, memo?: string | null }) {
  const secret = process.env.STELLAR_XLM_SECRET;
  if (!secret) throw new Error('STELLAR_XLM_SECRET not set');
  if (!StrKey.isValidEd25519PublicKey(destination)) {
    throw new Error('sendUsdc: invalid destination address');
  }
  assertValidStellarAmount(amount, 'sendUsdc');

  const USDC_ISSUER =
    process.env.STELLAR_USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
  const keypair = Keypair.fromSecret(secret);
  return submitWithRetry(
    (account) =>
      new TransactionBuilder(account, { fee: '100000', networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(
          Operation.payment({
            destination,
            asset: new Asset('USDC', USDC_ISSUER),
            amount: String(amount),
          }),
        )
        .addMemo(safeMemoText(memo))
        .setTimeout(120)
        .build(),
    keypair,
  );
}

function hydrateAsset(rec: any) {
  if (!rec || rec.asset_type === 'native') return Asset.native();
  return new Asset(rec.asset_code, rec.asset_issuer);
}

export async function probeUsdcToXlmPath(destXlm: string | number) {
  const USDC_ISSUER =
    process.env.STELLAR_USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
  const url =
    `${HORIZON_URL}/paths/strict-receive` +
    `?source_assets=USDC%3A${USDC_ISSUER}` +
    `&destination_asset_type=native` +
    `&destination_amount=${encodeURIComponent(String(destXlm))}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const body = await res.json();
    const records = body?._embedded?.records || [];
    if (!records.length) return { ok: false, reason: 'no_path' };
    
    const best = records[0];
    const srcAmount = Number(best.source_amount);
    if (!Number.isFinite(srcAmount) || srcAmount <= 0) {
      return { ok: false, reason: 'invalid_source_amount' };
    }
    const pathAssets = (best.path || []).map(hydrateAsset);
    return {
      ok: true,
      sourceAmount: best.source_amount,
      path: pathAssets,
      pathLength: pathAssets.length,
      candidateCount: records.length,
    };
  } catch (err: any) {
    return { ok: false, reason: `probe_error: ${err.message}` };
  }
}

export async function sendUsdcAsXlm({ destination, destXlm, maxUsdc, memo }: { destination: string, destXlm: string | number, maxUsdc: string | number, memo?: string | null }) {
  const secret = process.env.STELLAR_XLM_SECRET;
  if (!secret) throw new Error('STELLAR_XLM_SECRET not set');
  if (!StrKey.isValidEd25519PublicKey(destination)) {
    throw new Error('sendUsdcAsXlm: invalid destination address');
  }
  assertValidStellarAmount(destXlm, 'sendUsdcAsXlm.destXlm');
  assertValidStellarAmount(maxUsdc, 'sendUsdcAsXlm.maxUsdc');

  const USDC_ISSUER =
    process.env.STELLAR_USDC_ISSUER || 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
  const usdc = new Asset('USDC', USDC_ISSUER);
  const keypair = Keypair.fromSecret(secret);
  const treasuryAddress = keypair.publicKey();

  const probe = await probeUsdcToXlmPath(destXlm);
  bizEvent('dex.usdc_xlm.probe', {
    dest_xlm: destXlm,
    path_ok: probe.ok,
    quoted_usdc: probe.ok ? probe.sourceAmount : null,
    path_length: probe.ok ? probe.pathLength : null,
    candidates: probe.ok ? probe.candidateCount : null,
    reason: probe.ok ? null : probe.reason,
    max_usdc: maxUsdc,
  });

  const sendAmount = Number(maxUsdc).toFixed(7);
  const destMin = Number(destXlm).toFixed(7);
  const forwardAmount = Number(destXlm).toFixed(7);

  if (probe.ok) {
    const quoteUsdcPerXlm = Number(probe.sourceAmount) / Number(destXlm);
    const xlmAtSendAmount = Number(sendAmount) / quoteUsdcPerXlm;
    if (!Number.isFinite(quoteUsdcPerXlm) || !Number.isFinite(xlmAtSendAmount)) {
      throw new Error(
        `sendUsdcAsXlm: slippage math produced non-finite value ` +
          `(sourceAmount=${probe.sourceAmount}, destXlm=${destXlm}, sendAmount=${sendAmount})`,
      );
    }
    if (xlmAtSendAmount < Number(destMin)) {
      throw new Error(
        `DEX would only deliver ${xlmAtSendAmount.toFixed(7)} XLM for ${sendAmount} USDC, ` +
          `below invoice floor ${destMin} XLM. Aborting without burning fees.`,
      );
    }
  }

  const path = probe.ok ? probe.path : [];

  return submitWithRetry(
    (account) =>
      new TransactionBuilder(account, { fee: '200000', networkPassphrase: NETWORK_PASSPHRASE })
        .addOperation(
          Operation.pathPaymentStrictSend({
            sendAsset: usdc,
            sendAmount,
            destination: treasuryAddress,
            destAsset: Asset.native(),
            destMin,
            path,
          }),
        )
        .addOperation(
          Operation.payment({
            destination,
            asset: Asset.native(),
            amount: forwardAmount,
          }),
        )
        .addMemo(safeMemoText(memo))
        .setTimeout(120)
        .build(),
    keypair,
  );
}

export function parseStellarPayUri(uri: string) {
  if (typeof uri !== 'string') return { destination: null, amount: null, memo: null };
  const withoutScheme = uri.replace(/^(web\+)?stellar:pay\?/i, '');
  if (withoutScheme === uri) {
    return { destination: null, amount: null, memo: null };
  }
  const params = new URLSearchParams(withoutScheme);
  return {
    destination: params.get('destination'),
    amount: params.get('amount'),
    memo: params.get('memo'),
  };
}

const MICRO_ORDER_USD_THRESHOLD = parseFloat(process.env.MICRO_ORDER_USD_THRESHOLD || '0.20');

export async function payCtxOrder(paymentUrl: string, opts: { paymentAsset?: string, maxUsdc?: string|number } = {}) {
  const { paymentAsset, maxUsdc } = opts;
  const { destination, amount, memo } = parseStellarPayUri(paymentUrl);
  if (!destination || !amount || !memo) {
    throw new Error(`Invalid CTX payment URL: ${String(paymentUrl).slice(0, 32)}…`);
  }
  
  if (!StrKey.isValidEd25519PublicKey(destination)) {
    bizEvent('ctx.invalid_destination', {
      payment_url_prefix: String(paymentUrl).slice(0, 24),
    });
    throw new Error('payCtxOrder: invalid destination address');
  }
  
  const allowlist = ctxDestinationAllowlist();
  if (allowlist && !allowlist.has(destination)) {
    bizEvent('ctx.destination_not_allowlisted', {
      destination: maskStellarAddress(destination),
    });
    throw new Error('payCtxOrder: destination not in CTX_DESTINATION_ALLOWLIST');
  }
  
  assertValidStellarAmount(amount, 'payCtxOrder.amount');

  const isUsdc = typeof paymentAsset === 'string' && /usdc/i.test(paymentAsset);

  if (isUsdc) {
    if (!maxUsdc || Number(maxUsdc) <= 0) {
      throw new Error(`payCtxOrder: paymentAsset=usdc requires maxUsdc > 0 (got ${maxUsdc})`);
    }

    if (Number(maxUsdc) < MICRO_ORDER_USD_THRESHOLD) {
      log(
        'info',
        'xlm-sender: paying CTX via direct XLM from treasury (micro order, DEX bypassed)',
        {
          dest_xlm: amount,
          max_usdc: maxUsdc,
          threshold_usd: MICRO_ORDER_USD_THRESHOLD,
          destination: maskStellarAddress(destination),
        },
      );
      const txHash = await sendXlm({ destination, amount, memo });
      bizEvent('ctx.paid', {
        path: 'xlm_from_treasury_micro',
        amount_xlm: amount,
        max_usdc: maxUsdc,
        threshold_usd: MICRO_ORDER_USD_THRESHOLD,
        destination: maskStellarAddress(destination),
        tx_hash: txHash,
        memo_len: memo.length,
      });
      return txHash;
    }

    log('info', 'xlm-sender: paying CTX via USDC→XLM path payment', {
      dest_xlm: amount,
      max_usdc: maxUsdc,
      destination: maskStellarAddress(destination),
    });
    const txHash = await sendUsdcAsXlm({
      destination,
      destXlm: amount,
      maxUsdc,
      memo,
    });
    bizEvent('ctx.paid', {
      path: 'usdc_to_xlm',
      amount_xlm: amount,
      max_usdc: maxUsdc,
      destination: maskStellarAddress(destination),
      tx_hash: txHash,
      memo_len: memo.length,
    });
    return txHash;
  }

  log('info', 'xlm-sender: paying CTX', { amount, destination: maskStellarAddress(destination) });
  const txHash = await sendXlm({ destination, amount, memo });
  bizEvent('ctx.paid', {
    path: 'xlm_direct',
    amount_xlm: amount,
    destination: maskStellarAddress(destination),
    tx_hash: txHash,
    memo_len: memo.length,
  });
  return txHash;
}

function maskStellarAddress(addr: string) {
  if (typeof addr !== 'string' || addr.length < 10) return '<invalid>';
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}
