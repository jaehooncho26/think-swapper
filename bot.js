// bot.js
// Flip–Flop bot for GalaSwap using @gala-chain/gswap-sdk
// Every tick (10m via GitHub Actions):
// 1) Try to SELL GALA->GUSDT and GWETH->GUSDT if profitable vs ~$1 basis
// 2) BUY ~$1 of GALA (even slots) or GWETH (odd slots)
// Safe for zero balances and bad quotes; supports DRY_RUN and one-shot mode (`node bot.js once`)

require('dotenv').config();
const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');

// -----------------------------
// Env & constants
// -----------------------------
const WALLET        = (process.env.WALLET_ADDRESS || '').trim();     // e.g., "eth|0xabc..."
const PRIVATE_KEY   = (process.env.PRIVATE_KEY || '').trim();        // 0x... secp256k1
const DRY_RUN       = ((process.env.DRY_RUN || 'true').toLowerCase() === 'true');
const INTERVAL_MIN  = Number(process.env.BOT_INTERVAL_MIN || 10);
const USD_CENTS     = Number(process.env.BOT_USD_CENTS || 100);      // 100 = $1
const SLIPPAGE_BPS  = Number(process.env.SLIPPAGE_BPS || 50);        // 0.50%
const MIN_PROFIT_BPS= Number(process.env.MIN_PROFIT_BPS || 10);      // 0.10%

// Optional endpoints (defaults are fine)
const gatewayBaseUrl    = process.env.GATEWAY_BASE_URL;
const bundlerBaseUrl    = process.env.BUNDLER_BASE_URL;
const dexBackendBaseUrl = process.env.DEX_BACKEND_BASE_URL || undefined;

// GalaChain token class keys (G = GalaChain-wrapped)
// Note: "GUSDT" is USDT on GalaChain; "GWETH" is ETH on GalaChain.
const GALA   = 'GALA|Unit|none|none';
const GWETH  = 'GWETH|Unit|none|none';
const GUSDT  = 'GUSDT|Unit|none|none';

// -----------------------------
// Basic validation
// -----------------------------
if (!WALLET) {
  console.error('❌ WALLET_ADDRESS missing in Secrets/ENV (e.g., eth|0xYourWallet)');
  process.exit(1);
}
if (!DRY_RUN && !PRIVATE_KEY) {
  console.error('❌ PRIVATE_KEY missing and DRY_RUN=false → cannot sign swaps.');
  process.exit(1);
}

// -----------------------------
// SDK init (with signer)
// -----------------------------
const gswap = new GSwap({
  signer: new PrivateKeySigner(PRIVATE_KEY || '0x'), // harmless if DRY_RUN=true
  walletAddress: WALLET,
  gatewayBaseUrl,
  bundlerBaseUrl,
  dexBackendBaseUrl,
});

// -----------------------------
// Helpers
// -----------------------------
function slot(minutes = 10) {
  return Math.floor(Date.now() / (minutes * 60 * 1000));
}
function nextBuyTokenKey() {
  // even slot -> GALA, odd slot -> GWETH
  return slot(10) % 2 === 0 ? 'GALA' : 'GWETH';
}
function toDollars(cents) {
  return Math.max(0, Number(cents || 0)) / 100;
}
function isPositiveAmount(xStr) {
  const n = Number(xStr);
  return Number.isFinite(n) && n > 0;
}
function bpsMulStr(xStr, bps) {
  const x = Number(xStr);
  return ((x * (10000 - bps)) / 10000).toString();
}
function gainBps(inUSDC, outUSDC) { // keeping variable names unchanged to minimize diffs
  return ((outUSDC - inUSDC) / Math.max(0.000001, inUSDC)) * 10000;
}

async function ensureSocket() {
  if (!GSwap.events.eventSocketConnected()) {
    await GSwap.events.connectEventSocket();
  }
}

async function getBalancesMap() {
  const page = 1, pageSize = 200;
  try {
    const res = await gswap.assets.getUserAssets(WALLET, page, pageSize); // { tokens: [...] }
    const map = {};
    for (const t of (res.tokens || [])) {
      const sym = (t.symbol || '').toUpperCase();    // e.g., GUSDT, GALA, GWETH
      if (!sym) continue;
      map[sym] = Number(t.quantity || '0');
    }
    return map;
  } catch (e) {
    console.log(`[BALANCE-ERR] ${e?.message || e}`);
    return {}; // treat as no balances rather than crash
  }
}

// Safer quote wrapper (rejects 0/NaN, handles errors)
async function safeQuoteExactIn(IN_CLASS, OUT_CLASS, amountStr) {
  if (!isPositiveAmount(amountStr)) return null;
  try {
    const q = await gswap.quoting.quoteExactInput(IN_CLASS, OUT_CLASS, amountStr);
    if (!q) return null;
    const outStr = q.outTokenAmount?.toString?.();
    if (!isPositiveAmount(outStr)) return null;
    if (q.feeTier == null) return null;
    return q;
  } catch (e) {
    console.log(`[QUOTE-SKIP] ${IN_CLASS} -> ${OUT_CLASS} amount=${amountStr} err=${e?.message || e}`);
    return null;
  }
}

// -----------------------------
// Trading helpers
// -----------------------------
async function trySellIfProfitable(symbolKey) {
  const balances = await getBalancesMap();
  const qty = Number(balances[symbolKey] || 0);
  if (!(qty > 0)) {
    console.log(`[SELL-SKIP] No ${symbolKey} balance`);
    return;
  }

  const IN  = symbolKey === 'GALA' ? GALA : GWETH;
  const OUT = GUSDT;

  const q = await safeQuoteExactIn(IN, OUT, qty.toString());
  if (!q) {
    console.log(`[SELL-SKIP] No valid quote for ${symbolKey}->GUSDT (qty=${qty})`);
    return;
  }

  const usdcOutNum = Number(q.outTokenAmount.toString()); // name retained
  if (!(usdcOutNum > 0)) {
    console.log(`[SELL-SKIP] Quote out=0 for ${symbolKey}->GUSDT`);
    return;
  }

  const basis = toDollars(USD_CENTS); // default ~$1 basis
  const bps   = gainBps(basis, usdcOutNum);
  if (bps < MIN_PROFIT_BPS) {
    console.log(`[SELL-SKIP] ${symbolKey} not profitable (bps=${bps.toFixed(2)})`);
    return;
  }

  const minOut = bpsMulStr(q.outTokenAmount.toString(), SLIPPAGE_BPS);
  if (DRY_RUN) {
    console.log(`[SELL-DRY] ${symbolKey}->GUSDT qty=${qty} exp≈$${usdcOutNum.toFixed(6)} minOut=${minOut}`);
    return;
  }

  try {
    await ensureSocket();
    const pending = await gswap.swaps.swap(IN, OUT, q.feeTier, {
      exactIn: qty.toString(),
      amountOutMinimum: minOut
    }, WALLET);
    const receipt = await pending.wait(); // waits via event socket
    console.log('✅ SELL done:', { txId: receipt.txId, hash: receipt.transactionHash });
  } catch (e) {
    console.log(`[SELL-ERR] ${symbolKey}->GUSDT ${e?.message || e}`);
  }
}

async function buyOneDollar() {
  const usd = toDollars(USD_CENTS);  // e.g., 1
  if (!(usd > 0)) {
    console.log('[BUY-SKIP] USD amount <= 0');
    return;
  }

  const balances = await getBalancesMap();
  const gusdcBal = Number(balances.GUSDT || 0); // var name kept, but now reading GUSDT
  if (gusdcBal + 1e-9 < usd) {
    console.log(`[BUY-SKIP] Not enough GUSDT (need $${usd}, have $${gusdcBal})`);
    return;
  }

  const buyKey = nextBuyTokenKey();         // 'GALA' or 'GWETH'
  const IN  = GUSDT;
  const OUT = buyKey === 'GALA' ? GALA : GWETH;

  const q = await safeQuoteExactIn(IN, OUT, usd.toString());
  if (!q) {
    console.log(`[BUY-SKIP] No valid quote for GUSDT->${buyKey} (usd=${usd})`);
    return;
  }

  const minOut = bpsMulStr(q.outTokenAmount.toString(), SLIPPAGE_BPS);

  if (DRY_RUN) {
    console.log(`[BUY-DRY] GUSDT->${buyKey} spend=$${usd} feeTier=${q.feeTier} minOut=${minOut}`);
    return;
  }

  try {
    await ensureSocket();
    const pending = await gswap.swaps.swap(IN, OUT, q.feeTier, {
      exactIn: usd.toString(),
      amountOutMinimum: minOut
    }, WALLET);
    const receipt = await pending.wait();
    console.log('✅ BUY done:', { txId: receipt.txId, hash: receipt.transactionHash });
  } catch (e) {
    console.log(`[BUY-ERR] GUSDT->${buyKey} ${e?.message || e}`);
  }
}

// -----------------------------
// One-shot run (for GitHub Actions) or loop (local testing)
// -----------------------------
async function runOnce() {
  try {
    // 1) Try to close profit on both assets
    await trySellIfProfitable('GALA');   // safe if no GALA
    await trySellIfProfitable('GWETH');  // safe if no GWETH

    // 2) Alternate $1 buy
    await buyOneDollar();
  } catch (e) {
    console.error('❌ Bot error:', e?.message || e);
  }
}

async function main() {
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
}

main();
