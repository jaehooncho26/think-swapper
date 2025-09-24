// bot.cjs
// Flip–Flop bot for GalaSwap using @gala-chain/gswap-sdk
// - Robust balances loader
// - GUSDT/GUSDC auto-detect
// - Tunable slippage & wait timeout
// - One-shot mode: `node bot.cjs once`

require('dotenv').config();
const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');

// -----------------------------
// Env & constants
// -----------------------------
const WALLET        = (process.env.WALLET_ADDRESS || '').trim();     // e.g., "eth|0x..."
const PRIVATE_KEY   = (process.env.PRIVATE_KEY || '').trim();        // 0x...
const DRY_RUN       = ((process.env.DRY_RUN || 'true').toLowerCase() === 'true');
const USD_CENTS     = Number(process.env.BOT_USD_CENTS || 100);      // $1 default
const SLIPPAGE_BPS  = Math.max(0, Number(process.env.SLIPPAGE_BPS || 100)); // try 100–200 when testing
const MIN_PROFIT_BPS= Math.max(0, Number(process.env.MIN_PROFIT_BPS || 10));
const DEBUG         = ((process.env.DEBUG || 'false').toLowerCase() === 'true');
const TX_WAIT_MS    = Math.max(60000, Number(process.env.TX_WAIT_MS || 600000)); // default 10m

// Optional endpoints (pin if needed)
const gatewayBaseUrl    = process.env.GATEWAY_BASE_URL;
const bundlerBaseUrl    = process.env.BUNDLER_BASE_URL;
const dexBackendBaseUrl = process.env.DEX_BACKEND_BASE_URL || undefined;

// GalaChain class keys
const GALA   = 'GALA|Unit|none|none';
const GWETH  = 'GWETH|Unit|none|none';
const GUSDT  = 'GUSDT|Unit|none|none';
const GUSDC  = 'GUSDC|Unit|none|none';

// -----------------------------
// Guards
// -----------------------------
if (!WALLET) {
  console.error('❌ WALLET_ADDRESS missing (include the "eth|" prefix).');
  process.exit(1);
}
if (!DRY_RUN && !PRIVATE_KEY) {
  console.error('❌ PRIVATE_KEY missing and DRY_RUN=false → cannot sign swaps.');
  process.exit(1);
}

// -----------------------------
// SDK init
// -----------------------------
const gswap = new GSwap({
  signer: new PrivateKeySigner(PRIVATE_KEY || '0x'), // harmless if DRY_RUN=true
  walletAddress: WALLET,
  gatewayBaseUrl,
  bundlerBaseUrl,
  dexBackendBaseUrl,
  transactionWaitTimeoutMs: TX_WAIT_MS
});

if (DEBUG) {
  console.log('[ENDPOINTS]', { gatewayBaseUrl, bundlerBaseUrl, dexBackendBaseUrl, wallet: WALLET, TX_WAIT_MS });
}

// -----------------------------
// Helpers
// -----------------------------
function slot(minutes = 10) { return Math.floor(Date.now() / (minutes * 60 * 1000)); }
function nextBuyTokenKey() { return slot(10) % 2 === 0 ? 'GALA' : 'GWETH'; }
function toDollars(cents) { return Math.max(0, Number(cents || 0)) / 100; }
function isPositiveAmount(xStr) { const n = Number(xStr); return Number.isFinite(n) && n > 0; }
function bpsMulStr(xStr, bps){ const x=Number(xStr); return ((x*(10000-bps))/10000).toString(); }
function gainBps(inUSDC, outUSDC){ return ((outUSDC - inUSDC) / Math.max(1e-6, inUSDC)) * 10000; }
async function ensureSocket(){ if (!GSwap.events.eventSocketConnected()) { await GSwap.events.connectEventSocket(); } }

// -------- Balances (robust attempts) --------
async function getBalancesMap() {
  const map = {};

  // Try SDK default first (no explicit page/limit)
  try {
    const r = await gswap.assets.getUserAssets(WALLET);
    const tokens = r?.tokens || [];
    for (const t of tokens) {
      const sym = (t.symbol || '').toUpperCase();
      if (sym) map[sym] = Number(t.quantity || '0');
    }
    if (Object.keys(map).length > 0) {
      if (DEBUG) console.log('[TOKENS]', Object.keys(map));
      return map;
    }
  } catch (e) {
    if (DEBUG) console.log('[BALANCE-ERR default]', e?.message || e);
  }

  // Fallback attempts for gateways with stricter params
  const attempts = [
    { start: 1, limit: 100 },
    { start: 1, limit: 50 },
    { start: 0, limit: 100 },
    { start: 0, limit: 50 }
  ];

  for (const { start, limit } of attempts) {
    let page = start, got = false;
    if (DEBUG) console.log(`[BALANCE-TRY] pageStart=${start} limit=${limit}`);
    while (true) {
      try {
        const res = await gswap.assets.getUserAssets(WALLET, page, limit);
        const tokens = res?.tokens || [];
        if (tokens.length === 0 && !got) break;
        got = true;
        for (const t of tokens) {
          const sym = (t.symbol || '').toUpperCase();
          if (sym) map[sym] = Number(t.quantity || '0');
        }
        if (tokens.length < limit) break;
        page += 1;
      } catch (e) {
        if (DEBUG) console.log(`[BALANCE-ERR] ${e?.message || e} (page=${page}, limit=${limit})`);
        break;
      }
    }
    if (Object.keys(map).length > 0) break;
  }

  if (DEBUG) {
    console.log('[TOKENS]', Object.keys(map));
    if (map.GUSDT != null) console.log('[GUSDT]', map.GUSDT);
    if (map.GUSDC != null) console.log('[GUSDC]', map.GUSDC);
  }
  return map;
}

function resolveStableFromBalances(b) {
  if (b.GUSDT > 0) return { sym: 'GUSDT', classKey: GUSDT, amount: Number(b.GUSDT) };
  if (b.GUSDC > 0) return { sym: 'GUSDC', classKey: GUSDC, amount: Number(b.GUSDC) };
  if (b.GUSDT != null) return { sym: 'GUSDT', classKey: GUSDT, amount: Number(b.GUSDT) };
  if (b.GUSDC != null) return { sym: 'GUSDC', classKey: GUSDC, amount: Number(b.GUSDC) };
  return { sym: null, classKey: null, amount: 0 };
}

async function safeQuoteExactIn(IN_CLASS, OUT_CLASS, amountStr) {
  if (!isPositiveAmount(amountStr)) return null;
  try {
    const q = await gswap.quoting.quoteExactInput(IN_CLASS, OUT_CLASS, amountStr);
    const outStr = q?.outTokenAmount?.toString?.();
    if (!isPositiveAmount(outStr)) return null;
    if (q.feeTier == null) return null;
    return q;
  } catch (e) {
    if (DEBUG) console.log(`[QUOTE-SKIP] ${IN_CLASS} -> ${OUT_CLASS} amount=${amountStr} err=${e?.message || e}`);
    return null;
  }
}

// -----------------------------
// Trading helpers
// -----------------------------
async function trySellIfProfitable(symbolKey) {
  const balances = await getBalancesMap();
  const qty = Number(balances[symbolKey] || 0);
  if (!(qty > 0)) { console.log(`[SELL-SKIP] No ${symbolKey} balance`); return; }

  const IN  = symbolKey === 'GALA' ? GALA : GWETH;
  const stable = resolveStableFromBalances(balances);
  const OUT = stable.classKey || GUSDT;

  const q = await safeQuoteExactIn(IN, OUT, qty.toString());
  if (!q) { console.log(`[SELL-SKIP] No valid quote for ${symbolKey}->${stable.sym || 'GUSDT'}`); return; }

  const usdcOutNum = Number(q.outTokenAmount.toString());
  const bps = gainBps(toDollars(USD_CENTS), usdcOutNum);
  if (bps < MIN_PROFIT_BPS) { console.log(`[SELL-SKIP] ${symbolKey} not profitable (bps=${bps.toFixed(2)})`); return; }

  const minOut = bpsMulStr(q.outTokenAmount.toString(), SLIPPAGE_BPS);
  if (DEBUG) console.log(`[SELL-QUOTE] ${symbolKey}->${stable.sym || 'GUSDT'} qty=${qty} feeTier=${q.feeTier} out=${q.outTokenAmount} minOut=${minOut}`);

  if (DRY_RUN) { console.log(`[SELL-DRY] ${symbolKey}->${stable.sym || 'GUSDT'} qty=${qty} minOut=${minOut}`); return; }

  try {
    await ensureSocket();
    const pending = await gswap.swaps.swap(
      IN, OUT, q.feeTier,
      { exactIn: qty.toString(), amountOutMinimum: minOut },
      WALLET
    );
    if (DEBUG) { try { console.log('[SELL-PENDING]', { txId: pending?.txId, transactionHash: pending?.transactionHash }); } catch {} }
    const receipt = await pending.wait();
    console.log('✅ SELL done:', { txId: receipt.txId, hash: receipt.transactionHash });
  } catch (e) {
    console.log(`[SELL-ERR] ${symbolKey}->${stable.sym || 'GUSDT'} wait failed: ${e?.message || e}`);
  }
}

async function buyOneDollar() {
  const usd = toDollars(USD_CENTS);
  if (!(usd > 0)) { console.log('[BUY-SKIP] USD amount <= 0'); return; }

  const balances = await getBalancesMap();
  const stable = resolveStableFromBalances(balances);
  if (!stable.sym) { console.log('[BUY-SKIP] No GUSDT/GUSDC balance detected'); return; }
  if (stable.amount + 1e-9 < usd) { console.log(`[BUY-SKIP] Not enough ${stable.sym} (need $${usd}, have $${stable.amount})`); return; }

  const buyKey = nextBuyTokenKey();                     // 'GALA' or 'GWETH'
  const OUT = buyKey === 'GALA' ? GALA : GWETH;

  const q = await safeQuoteExactIn(stable.classKey, OUT, usd.toString());
  if (!q) { console.log(`[BUY-SKIP] No valid quote for ${stable.sym}->${buyKey} (usd=${usd}).`); return; }

  const minOut = bpsMulStr(q.outTokenAmount.toString(), SLIPPAGE_BPS);
  if (DEBUG) { console.log(`[BUY-QUOTE] ${stable.sym}->${buyKey} $${usd} feeTier=${q.feeTier} out=${q.outTokenAmount} minOut=${minOut}`); }

  if (DRY_RUN) { console.log(`[BUY-DRY] ${stable.sym}->${buyKey} $${usd} minOut=${minOut}`); return; }

  try {
    await ensureSocket(); // make sure event socket is up
    const pending = await gswap.swaps.swap(
      stable.classKey,
      OUT,
      q.feeTier,
      { exactIn: usd.toString(), amountOutMinimum: minOut },
      WALLET
    );

    if (DEBUG) { try { console.log('[BUY-PENDING]', { txId: pending?.txId, transactionHash: pending?.transactionHash }); } catch {} }

    const receipt = await pending.wait();
    console.log('✅ BUY done:', { txId: receipt.txId, hash: receipt.transactionHash });

  } catch (e) {
    console.log(`[BUY-ERR] ${stable.sym}->${buyKey} wait failed: ${e?.message || e}`);
    console.log('Tip: increase SLIPPAGE_BPS (e.g., 150–200) and/or set DEBUG="true" to inspect feeTier & minOut. You can also raise TX_WAIT_MS.');
  }
}

// -----------------------------
// One-shot entry
// -----------------------------
async function runOnce() {
  try {
    await trySellIfProfitable('GALA');
    await trySellIfProfitable('GWETH');
    await buyOneDollar();
  } catch (e) {
    console.error('❌ Bot error:', e?.message || e);
  }
}

(async function main() {
  if (process.argv[2] === 'once') {
    await runOnce();
    console.log('One-shot run complete. Exiting.');
    process.exit(0);
  } else {
    console.log('Run once mode recommended from CI. Usage: node bot.cjs once');
    await runOnce();
  }
})();
