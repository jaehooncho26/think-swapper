// bot.js
require('dotenv').config();
const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');

// -----------------------------
// Env & constants
// -----------------------------
const WALLET        = (process.env.WALLET_ADDRESS || '').trim();
const PRIVATE_KEY   = (process.env.PRIVATE_KEY || '').trim();
const DRY_RUN       = (process.env.DRY_RUN || 'true').toLowerCase() === 'true';
const INTERVAL_MIN  = Number(process.env.BOT_INTERVAL_MIN || 10);
const USD_CENTS     = Number(process.env.BOT_USD_CENTS || 1); // 1 = one cent
const SLIPPAGE_BPS  = Number(process.env.SLIPPAGE_BPS || 100);

// Endpoints (prod defaults ok; you can override in .env)
const gatewayBaseUrl    = process.env.GATEWAY_BASE_URL;
const bundlerBaseUrl    = process.env.BUNDLER_BASE_URL;
const dexBackendBaseUrl = process.env.DEX_BACKEND_BASE_URL || undefined;

// GalaChain token class keys
const GALA  = 'GALA|Unit|none|none';
const GUSDC = 'GUSDC|Unit|none|none';

// -----------------------------
// Basic validation
// -----------------------------
if (!WALLET) {
  console.error('❌ WALLET_ADDRESS missing in .env (example: eth|your-wallet-address)');
  process.exit(1);
}
if (!DRY_RUN && !PRIVATE_KEY) {
  console.error('❌ PRIVATE_KEY missing in .env and DRY_RUN=false → cannot sign swaps.');
  process.exit(1);
}

// -----------------------------
// SDK init (with signer)
// -----------------------------
const gswap = new GSwap({
  signer: new PrivateKeySigner(PRIVATE_KEY || '0x'), // harmless if DRY_RUN (we don’t call writes)
  walletAddress: WALLET,
  gatewayBaseUrl,
  bundlerBaseUrl,
  dexBackendBaseUrl,
});

// -----------------------------
// Helpers
// -----------------------------
function bpsMul(x, bps) {
  const n = Number(x);
  return ((n * (10000 - bps)) / 10000).toString();
}

// Converts USD to GALA amount using a fresh quote of "1 GALA → GUSDC"
async function dollarsToGala(usdDollars) {
  const q = await gswap.quoting.quoteExactInput(GALA, GUSDC, '1');
  const priceGusdcPerGala = Number(q.outTokenAmount);
  if (!priceGusdcPerGala || priceGusdcPerGala <= 0) throw new Error('No GALA price');
  return (usdDollars / priceGusdcPerGala).toString();
}

async function ensureSocket() {
  if (!GSwap.events.isConnected?.()) {
    await GSwap.events.connectEventSocket();
  }
}

// -----------------------------
// Core loop
// -----------------------------
async function runOnce() {
  try {
    await ensureSocket();

    const usd = USD_CENTS / 100; // cents → dollars
    const amountInGala = await dollarsToGala(usd);

    const q = await gswap.quoting.quoteExactInput(GALA, GUSDC, amountInGala);
    const feeTier     = q.feeTier;
    const expectedOut = String(q.outTokenAmount);
    const minOut      = bpsMul(expectedOut, SLIPPAGE_BPS);

    console.log('Planned trade:', { amountInGala, expectedOut, minOut, feeTier, DRY_RUN });

    if (DRY_RUN) {
      console.log('DRY RUN → no swap executed.');
      return;
    }

    const pending = await gswap.swaps.swap(
      GALA,
      GUSDC,
      feeTier,
      { exactIn: amountInGala, amountOutMinimum: minOut },
      WALLET
    );

    const receipt = await pending.wait(); // requires socket
    console.log('✅ Swap done:', { txId: receipt.txId, hash: receipt.transactionHash });
  } catch (e) {
    console.error('❌ Bot error:', e?.message || e);
  }
}

// -----------------------------
// Entry point
// -----------------------------
async function main() {
  try {
    if (process.argv[2] === 'once') {
      await runOnce();
      console.log('One-shot run complete. Exiting.');
      process.exit(0);
    } else {
      console.log(`Starting loop every ${INTERVAL_MIN} min (DRY_RUN=${DRY_RUN})`);
      await runOnce();
      const handle = setInterval(runOnce, INTERVAL_MIN * 60 * 1000);

      // graceful shutdown
      const shutdown = async (sig) => {
        console.log(`\n${sig} received, closing…`);
        clearInterval(handle);
        try { await GSwap.events.disconnectEventSocket?.(); } catch {}
        process.exit(0);
      };
      process.on('SIGINT',  shutdown);
      process.on('SIGTERM', shutdown);
    }
  } catch (e) {
    console.error('❌ Fatal init error:', e?.message || e);
    process.exit(1);
  }
}

main();