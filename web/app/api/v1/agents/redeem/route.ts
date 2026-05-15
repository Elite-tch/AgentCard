import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/backend/db';
import { ApiKey } from '@/lib/backend/models/ApiKey';

/**
 * Public endpoint for agents to redeem a claim code for their API key.
 * This is the "handshake" that flips the agent state from 'minted' to 'initializing'.
 */
export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 });
  }

  const { claim_code } = body;
  if (!claim_code) {
    return NextResponse.json({ error: 'bad_request', message: 'claim_code is required' }, { status: 400 });
  }

  await connectToDatabase();

  const key = await ApiKey.findOne({ claimCode: claim_code });

  if (!key) {
    return NextResponse.json({ error: 'invalid_claim_code', message: 'Claim code not found' }, { status: 404 });
  }

  if (key.claimExpiresAt && key.claimExpiresAt < new Date()) {
    return NextResponse.json({ error: 'claim_code_expired', message: 'Claim code has expired' }, { status: 410 });
  }

  const rawKey = key.temporaryRawKey;
  if (!rawKey) {
    return NextResponse.json({ error: 'already_redeemed', message: 'This claim code has already been used' }, { status: 410 });
  }

  // Update state and clear temporary raw key
  key.agentState = 'initializing';
  key.agentStateAt = new Date();
  key.temporaryRawKey = undefined; // Clear it so it can't be redeemed again
  key.claimCode = undefined;
  await key.save();

  return NextResponse.json({
    api_key: rawKey,
    id: key._id,
    label: key.label
  }, { status: 200 });
}
