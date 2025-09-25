// bot.cjs — Flip–Flop bot for GalaSwap (with GALA gas reserve + fee-aware profit rule)
// - Auto-detect GUSDT/GUSDC
// - Never sells below GAS_MIN_GALA
// - Auto top-up GALA from stable when under reserve
// - Alternates hourly: USDT→GALA, then USDT→ETH (GWETH)
// - Only sells if round-trip profit ≥ MIN_PROFIT_BPS after estimating ~GALA fee
// - Uses gswap.swaps.swap(...) (no .wait()); confirms via balance polling

require('dotenv').config();
const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');

// -----------------------------
// Env & constants
// -----------------------------
const WALLET        = (process.env.WALLET_ADDRESS || '').trim();   // e.g., "eth|0x..."
const PRIVATE_KEY   = (process.env.PRIVATE_KEY || '').trim();      // 0x...
const DRY_RUN       = ((process.env.DRY_RUN || 'true').toLowerCase() === 'true');

const USD_CENTS     = Number(process.env.BOT_USD_CENTS || 100);    // 100 = $1
const SLIPPAGE_BPS  = Math.max(0, Number(process.env.SLIPPAGE_BPS || 200)); // 2.0% default
const MIN_PROFIT_BPS= Math.max(0, Number(process.env.MIN_PROFIT_BPS || 10)); // sell threshold (bps)
const DEBUG         = ((process.env.DEBUG || 'false').toLowerCase() === 'true');

// Gas reserve knobs
const GAS_MIN_GALA        = Math.max(0, Number(process.env.GAS_MIN_GALA || 2));      // keep at least this much GALA
const GAS_TOPUP_USD_CENTS = Math.max(0, Number(process.env.GAS_TOPUP_USD_CENTS || 200)); // spend this much stable to refill gas

// Approx per-swap fee in GALA (used in profit test)
const GAS_FIXED_FEE_GALA  = Math.max(0, Number(process.env.GAS_FIXED_FEE_GALA || 1));

// Optional: pin endpoints (recommended while debugging)
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
});

if (DEBUG) {
  console.log('[ENDPOINTS]', { gatewayBaseUrl, bundlerBaseUrl, dexBackendBaseUrl, wallet: WALLET });
}

// -----------------------------
// Helpers
// -----------------------------
function slot(minutes = 60) { return Math.floor(Date.now() / (minutes * 60 * 1000)); }
// Alternate each hour: even → GALA, odd → GWETH
function nextBuyTokenKey() { return slot(60) % 2 === 0 ? 'GALA' : 'GWETH'; }

function toDollars(cents) { return Math.max(0, Number(cents || 0)) / 100; }
function isPositiveAmount(xStr) { const n = Number(xStr); return Number.isFinite(n) && n > 0; }
function bpsMulStr(xStr, bps){ const x=Number(xStr); return ((x*(10000-bps))/10000).toString(); }
function gainBps(inUSDC, outUSDC){ return ((outUSDC - inUSDC) / Math.max(1e-6, inUSDC)) * 10000; }
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// -------- Balances (robust attempts) --------
async function getBalancesMap() {
  const map = {};
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

  const attempts = [
    { start: 1, limit: 100 },
    { start: 1, limit: 50 },
    { start: 0, limit: 100 },
    { start: 0, limit: 50 },
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
    if (map.GALA  != null) console.log('[GALA]',  map.GALA);
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
// Gas reserve helpers
// -----------------------------
function needsGasTopUp(balances) {
  const galaBal = Number(balances.GALA || 0);
  return galaBal + 1e-9 < GAS_MIN_GALA;
}

async function topUpGasIfNeeded() {
  const before = await getBalancesMap();
  if (!needsGasTopUp(before)) {
    if (DEBUG) console.log(`[GAS] GALA balance OK (>= ${GAS_MIN_GALA})`);
    return false;
  }

  const stable = resolveStableFromBalances(before);
  if (!stable.sym) {
    console.log(`[GAS] Need GALA top-up but no GUSDT/GUSDC available.`);
    return false;
  }

  const usd = toDollars(GAS_TOPUP_USD_CENTS);
  if (!(stable.amount + 1e-9 >= usd)) {
    console.log(`[GAS] Need GALA top-up but insufficient ${stable.sym}. Need ~$${usd}, have ~$${stable.amount}`);
    return false;
  }

  const q = await safeQuoteExactIn(stable.classKey, GALA, usd.toString());
  if (!q) {
    console.log(`[GAS] No valid quote for ${stable.sym}->GALA top-up ($${usd}).`);
    return false;
  }

  const minOut = bpsMulStr(q.outTokenAmount.toString(), SLIPPAGE_BPS);
  console.log(`[GAS] Top-up: ${stable.sym}->GALA $${usd} feeTier=${q.feeTier} out=${q.outTokenAmount} minOut=${minOut}`);

  if (DRY_RUN) {
    console.log(`[GAS-DRY] Would top-up GALA gas reserve.`);
    return true;
  }

  try {
    const submitRes = await gswap.swaps.swap(
      stable.classKey, GALA, q.feeTier,
      { exactIn: usd.toString(), amountOutMinimum: minOut },
      WALLET
    );
    if (DEBUG) console.log('[GAS-SUBMIT]', submitRes);

    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      const after = await getBalancesMap();
      const galaBefore = Number(before.GALA || 0);
      const galaAfter  = Number(after.GALA  || 0);
      const stableBefore = Number(before[stable.sym] || 0);
      const stableAfter  = Number(after[stable.sym]  || 0);
      const stableDropped = stableAfter + 1e-6 <= stableBefore - usd + 1e-3;
      const galaIncreased = galaAfter > galaBefore;

      if (stableDropped && galaIncreased) {
        console.log(`✅ GAS top-up confirmed: ${stable.sym} ${stableBefore}→${stableAfter}, GALA ${galaBefore}→${galaAfter}`);
        return true;
      }
    }
    console.log('[GAS-NOCONFIRM] Top-up submitted but not yet reflected in balances.');
    return true; // submitted; not blocking main flow
  } catch (e) {
    console.log(`[GAS-SUBMIT-ERR] ${e?.message || e}`);
    return false;
  }
}

// -----------------------------
// Trading helpers
// -----------------------------
async function galaFeeInStable(OUT_CLASS) {
  // Estimate per-swap fee value in stable by converting GAS_FIXED_FEE_GALA → stable
  if (!(GAS_FIXED_FEE_GALA > 0)) return 0;
  const q = await safeQuoteExactIn(GALA, OUT_CLASS, GAS_FIXED_FEE_GALA.toString());
  return q ? Number(q.outTokenAmount.toString()) : 0;
}

async function trySellIfProfitable(symbolKey) {
  const balances = await getBalancesMap();

  // If selling GALA, sell only the excess above reserve; for GWETH, sell any positive balance
  let qty = Number(balances[symbolKey] || 0);
  if (symbolKey === 'GALA') {
    const excess = Math.max(0, qty - GAS_MIN_GALA);
    if (excess <= 0) {
      console.log(`[SELL-SKIP] GALA at/below reserve (hold ${qty}, reserve ${GAS_MIN_GALA}).`);
      return;
    }
    qty = excess;
  } else {
    if (!(qty > 0)) { console.log(`[SELL-SKIP] No ${symbolKey} balance`); return; }
  }

  const IN  = symbolKey === 'GALA' ? GALA : GWETH;
  const stable = resolveStableFromBalances(balances);
  const OUT = stable.classKey || GUSDT;

  // 1) Quote selling qty → stable (pool fee/impact included)
  const qSell = await safeQuoteExactIn(IN, OUT, qty.toString());
  if (!qSell) { console.log(`[SELL-SKIP] No valid quote for ${symbolKey}->${stable.sym || 'GUSDT'}`); return; }
  const sellOutStable = Number(qSell.outTokenAmount.toString());

  // 2) Subtract estimated on-chain swap fee (≈GAS_FIXED_FEE_GALA) valued in stable
  const feeNowStable = await galaFeeInStable(OUT);
  const netStable = Math.max(0, sellOutStable - feeNowStable);
  if (!(netStable > 0)) { console.log('[SELL-SKIP] Fee exceeds proceeds.'); return; }

  // 3) Hypothetical buy-back test: stable → original token, using ONLY net proceeds
  const qBuyBack = await safeQuoteExactIn(OUT, IN, netStable.toString());
  if (!qBuyBack) { console.log(`[SELL-SKIP] No valid quote for round-trip back to ${symbolKey}`); return; }

  const gotBack = Number(qBuyBack.outTokenAmount.toString());
  const edgeBps = ((gotBack - qty) / Math.max(1e-12, qty)) * 10000; // profit AFTER fee & impact

  if (edgeBps < MIN_PROFIT_BPS) {
    console.log(`[SELL-SKIP] Round-trip < threshold after fee (edge=${edgeBps.toFixed(2)} bps, need ≥ ${MIN_PROFIT_BPS}).`);
    return;
  }

  // 4) Execute the sell with slippage protection
  const minOut = bpsMulStr(qSell.outTokenAmount.toString(), SLIPPAGE_BPS);
  if (DEBUG) console.log(`[SELL-QUOTE] ${symbolKey}->${stable.sym || 'GUSDT'} qty=${qty} feeTier=${qSell.feeTier} out=${qSell.outTokenAmount} feeNowStable≈${feeNowStable} minOut=${minOut}`);

  if (DRY_RUN) { console.log(`[SELL-DRY] ${symbolKey}->${stable.sym || 'GUSDT'} qty=${qty} minOut=${minOut}`); return; }

  try {
    const submitRes = await gswap.swaps.swap(
      IN, OUT, qSell.feeTier,
      { exactIn: qty.toString(), amountOutMinimum: minOut },
      WALLET
    );
    if (DEBUG) console.log('[SELL-SUBMIT]', submitRes);

    // Quick balance confirm (best-effort)
    await sleep(5000);
    const after = await getBalancesMap();
    const stableSym = (OUT === GUSDT) ? 'GUSDT' : (OUT === GUSDC ? 'GUSDC' : 'GUSDT');
    const soldBefore = Number(balances[symbolKey] || 0);
    const soldAfter  = Number(after[symbolKey] || 0);
    const stableBefore = Number(balances[stableSym] || 0);
    const stableAfter  = Number(after[stableSym] || 0);

    if (soldAfter < soldBefore && stableAfter > stableBefore) {
      console.log(`✅ SELL likely executed: ${symbolKey} ${soldBefore}→${soldAfter}, ${stableSym} ${stableBefore}→${stableAfter}`);
    } else {
      console.log('[SELL-NOCONFIRM] Could not verify via balances immediately (may still settle).');
    }
  } catch (e) {
    console.log(`[SELL-SUBMIT-ERR] ${symbolKey}->${stable.sym || 'GUSDT'}: ${e?.message || e}`);
  }
}

async function buyOneDollar() {
  const usd = toDollars(USD_CENTS);
  if (!(usd > 0)) { console.log('[BUY-SKIP] USD amount <= 0'); return; }

  const balancesBefore = await getBalancesMap();
  const stable = resolveStableFromBalances(balancesBefore);
  if (!stable.sym) { console.log('[BUY-SKIP] No GUSDT/GUSDC balance detected'); return; }
  if (stable.amount + 1e-9 < usd) { console.log(`[BUY-SKIP] Not enough ${stable.sym} (need $${usd}, have ~$${stable.amount})`); return; }

  const buyKey = nextBuyTokenKey();              // 'GALA' or 'GWETH'
  const OUT = buyKey === 'GALA' ? GALA : GWETH;

  const q = await safeQuoteExactIn(stable.classKey, OUT, usd.toString());
  if (!q) { console.log(`[BUY-SKIP] No valid quote for ${stable.sym}->${buyKey} (usd=${usd}).`); return; }

  const minOut = bpsMulStr(q.outTokenAmount.toString(), SLIPPAGE_BPS);
  console.log(`[BUY-QUOTE] ${stable.sym}->${buyKey} $${usd} feeTier=${q.feeTier} out=${q.outTokenAmount} minOut=${minOut}`);

  if (DRY_RUN) { console.log(`[BUY-DRY] ${stable.sym}->${buyKey} $${usd} minOut=${minOut}`); return; }

  try {
    const submitRes = await gswap.swaps.swap(
      stable.classKey, OUT, q.feeTier,
      { exactIn: usd.toString(), amountOutMinimum: minOut },
      WALLET
    );
    if (DEBUG) console.log('[BUY-SUBMIT]', submitRes);

    // Balance-based confirmation (6x over ~30s)
    const targetSym = buyKey === 'GALA' ? 'GALA' : 'GWETH';
    const beforeBought = Number(balancesBefore[targetSym] || 0);
    const beforeStable = Number(balancesBefore[stable.sym] || 0);

    let confirmed = false;
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const after = await getBalancesMap();
      const afterBought = Number(after[targetSym] || 0);
      const afterStable = Number(after[stable.sym] || 0);
      const stableDropped = afterStable + 1e-6 <= beforeStable - usd + 1e-3;
      const boughtIncreased = afterBought > beforeBought;

      if (stableDropped && boughtIncreased) {
        console.log(`✅ BUY likely executed (balance confirm): ${stable.sym} ${beforeStable}→${afterStable}, ${targetSym} ${beforeBought}→${afterBought}`);
        confirmed = true;
        break;
      }
    }

    if (!confirmed) {
      console.log('[BUY-NOCONFIRM] Could not confirm via balances within ~30s. It may still settle shortly.');
    }

  } catch (submitErr) {
    const msg  = submitErr?.message || submitErr;
    const body = submitErr?.response?.data ? JSON.stringify(submitErr.response.data) : '';
    console.log(`[BUY-SUBMIT-ERR] ${stable.sym}->${buyKey}: ${msg} ${body}`);
    console.log('Fix tips: endpoints (prod), correct stable (GUSDT/GUSDC), spendable balance, or adjust SLIPPAGE_BPS while testing.');
  }
}

// -----------------------------
// One-shot entry (with gas-first policy)
// -----------------------------
async function runOnce() {
  try {
    // 0) GAS FIRST: top-up if below reserve
    await topUpGasIfNeeded();

    // 1) Try to close profit on excess GALA (never below reserve) and any GWETH
    await trySellIfProfitable('GALA');
    await trySellIfProfitable('GWETH');

    // 2) Alternate buy (hourly flip between GALA and GWETH)
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
