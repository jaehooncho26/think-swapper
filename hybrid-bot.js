// hybrid-bot.js
// Runs every ~30 minutes. Priority: try triangular ARBITRAGE first.
// If no profitable arb, randomly tries one of: MOMENTUM, MEAN_REVERT, FIBONACCI.
// Enhanced "once" mode: `node hybrid-bot.js once` → richer simulations (no sockets/balances/swaps).

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');

/* =========================================
   CLI / TEST FLAGS
   ========================================= */
const ARG_ONCE = process.argv[2] === 'once'; // simulation-only mode
const TEST_USD = 0.01; // legacy one-cent reference

/* =========================================
   ENV & CONSTANTS
   ========================================= */
const WALLET        = (process.env.WALLET_ADDRESS || '').trim();
const PRIVATE_KEY   = (process.env.PRIVATE_KEY || '').trim();
const DRY_RUN       = (process.env.DRY_RUN || 'true').toLowerCase() === 'true';

const TOKEN_USDC    = (process.env.TOKEN_USDC  || 'GUSDC|Unit|none|none').trim();
const TOKEN_GALA    = (process.env.TOKEN_GALA  || 'GALA|Unit|none|none').trim();
const TOKEN_WETH    = (process.env.TOKEN_WETH  || 'GWETH|Unit|none|none').trim();

const INTERVAL_MIN  = Number(process.env.BOT_INTERVAL_MIN || 30);
const JITTER_SEC    = Number(process.env.JITTER_SEC || 30);

const SLIPPAGE_BPS  = Number(process.env.SLIPPAGE_BPS || 50); // 0.50%
const BASE_TRADE_USD= Number(process.env.BASE_TRADE_USD || 2);
const MAX_TRADE_USD = Number(process.env.MAX_TRADE_USD || 25);

const ARB_START_USD = Number(process.env.ARB_START_USD || 3);
const ARB_MIN_PROFIT_BPS = Number(process.env.ARB_MIN_PROFIT_BPS || 30);
const ARB_PATH = (process.env.ARB_PATH || 'USDC-GALA-WETH-USDC').toUpperCase().split('-'); // must start=end

// Momentum / Mean-Reversion thresholds
const EMA_ALPHA     = Number(process.env.EMA_ALPHA || 0.2);
const MOMENTUM_TH   = Number(process.env.MOMENTUM_TH || 0.004);
const MEANREV_TH    = Number(process.env.MEANREV_TH || 0.006);

// Fibonacci params
const FIB_LOOKBACK  = Number(process.env.FIB_LOOKBACK || 96);
const ENTRY_50_618  = true;  // use golden pocket
const STOP_AT_786   = true;  // (kept for future TP/SL extensions)
const USE_TP2       = true;

// Endpoints
const gatewayBaseUrl    = process.env.GATEWAY_BASE_URL || 'https://gateway-mainnet.galachain.com';
const bundlerBaseUrl    = process.env.BUNDLER_BASE_URL || 'https://bundle-backend-prod1.defi.gala.com';
const dexBackendBaseUrl = process.env.DEX_BACKEND_BASE_URL || undefined;

// State file (for EMA/FIB in loop mode)
const STATE_FILE = path.join(process.cwd(), 'hybrid_state.json');

/* =========================================
   VALIDATION (skip signer/wallet checks in once-sim)
   ========================================= */
if (!ARG_ONCE) {
  if (!WALLET) {
    console.error('❌ WALLET_ADDRESS missing (format: eth|0x...)');
    process.exit(1);
  }
  if (!DRY_RUN && !PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY missing and DRY_RUN=false → cannot sign swaps.');
    process.exit(1);
  }
}

/* =========================================
   SDK INIT
   ========================================= */
const gswap = new GSwap({
  signer: new PrivateKeySigner(PRIVATE_KEY || '0x'),
  walletAddress: WALLET || 'eth|sim', // harmless in "once" sim
  gatewayBaseUrl,
  bundlerBaseUrl,
  dexBackendBaseUrl,
});

/* =========================================
   COMMON HELPERS
   ========================================= */
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
function bpsMul(x, bps){ const n=Number(x); return ((n*(10000-bps))/10000).toString(); }
function emaUpdate(prev, p, alpha){ return prev==null ? p : alpha*p + (1-alpha)*prev; }

function loadState(){
  try { if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE,'utf8')); }
  catch {}
  return { ema:null, prices:[], position:null };
}
function saveState(s){ try { fs.writeFileSync(STATE_FILE, JSON.stringify(s,null,2)); } catch {} }

async function ensureSocket(){
  if (!GSwap.events.isConnected?.()) await GSwap.events.connectEventSocket();
}

async function getBalancesPaged() {
  // limit must be 1..100 — safe pagination
  const LIMIT = 100;
  let page = 1;
  const out = {};
  while (true) {
    const res = await gswap.assets.getUserAssets(WALLET, page, LIMIT);
    const assets = res?.assets || [];
    for (const a of assets) out[a.classKey] = Number(a.balance || 0);
    if (assets.length < LIMIT) break;
    page += 1;
  }
  return {
    USDC: out[TOKEN_USDC] || 0,
    GALA: out[TOKEN_GALA] || 0,
    WETH: out[TOKEN_WETH] || 0,
  };
}

// Quotes/Spots
async function quoteExactIn(tokenIn, tokenOut, amountIn){
  const q = await gswap.quoting.quoteExactInput(tokenIn, tokenOut, String(amountIn));
  return { out: Number(q.outTokenAmount), feeTier: q.feeTier };
}
async function spotUsdcPerGala(){
  const q = await gswap.quoting.quoteExactInput(TOKEN_GALA, TOKEN_USDC, '1');
  return Number(q.outTokenAmount);
}

/* =========================================
   EXEC HELPERS (writes; not used in "once")
   ========================================= */
async function buyGalaByUsd(usd){
  const exactInUsdc = usd.toString();
  const q = await gswap.quoting.quoteExactInput(TOKEN_USDC, TOKEN_GALA, exactInUsdc);
  const minOut = bpsMul(String(q.outTokenAmount), SLIPPAGE_BPS);
  console.log('BUY plan:', { exactInUsdc, expectGala: String(q.outTokenAmount), minOut, feeTier:q.feeTier, DRY_RUN });
  if (DRY_RUN) return { simulated:true };
  await ensureSocket();
  const pending = await gswap.swaps.swap(TOKEN_USDC, TOKEN_GALA, q.feeTier,
    { exactIn: exactInUsdc, amountOutMinimum: minOut }, WALLET);
  const receipt = await pending.wait();
  console.log('✅ BUY done:', { txId: receipt.txId, hash: receipt.transactionHash });
  return receipt;
}

async function sellGalaByUsdNotional(usd){
  const price = await spotUsdcPerGala();       // USDC per 1 GALA
  const galaAmt = usd / price;                  // sell this many GALA
  const q = await gswap.quoting.quoteExactInput(TOKEN_GALA, TOKEN_USDC, String(galaAmt));
  const minOut = bpsMul(String(q.outTokenAmount), SLIPPAGE_BPS);
  console.log('SELL plan:', { exactInGala: galaAmt.toString(), expectUsdc: String(q.outTokenAmount), minOut, feeTier:q.feeTier, DRY_RUN });
  if (DRY_RUN) return { simulated:true };
  await ensureSocket();
  const pending = await gswap.swaps.swap(TOKEN_GALA, TOKEN_USDC, q.feeTier,
    { exactIn: galaAmt.toString(), amountOutMinimum: minOut }, WALLET);
  const receipt = await pending.wait();
  console.log('✅ SELL done:', { txId: receipt.txId, hash: receipt.transactionHash });
  return receipt;
}

/* =========================================
   ARBITRAGE (USDC→GALA→WETH→USDC)
   ========================================= */
const aliasToKey = { USDC: TOKEN_USDC, GALA: TOKEN_GALA, WETH: TOKEN_WETH };
const keyFromAlias = (a) => aliasToKey[a] || a;

async function simulateTriangle(startUsd){
  const t0 = keyFromAlias(ARB_PATH[0]);
  const t1 = keyFromAlias(ARB_PATH[1]);
  const t2 = keyFromAlias(ARB_PATH[2]);
  const t3 = keyFromAlias(ARB_PATH[3]);
  if (t0 !== t3) throw new Error('ARB_PATH must start and end with same token');

  const q01 = await quoteExactIn(t0, t1, startUsd);
  const q12 = await quoteExactIn(t1, t2, q01.out);
  const q23 = await quoteExactIn(t2, t3, q12.out);
  const profit = q23.out - startUsd;
  const profitBps = (profit / startUsd) * 10000;

  return {
    ok: profitBps >= ARB_MIN_PROFIT_BPS,
    profit, profitBps,
    legs: [
      { in: startUsd, out: q01.out, tokenIn: t0, tokenOut: t1, feeTier: q01.feeTier },
      { in: q01.out,  out: q12.out, tokenIn: t1, tokenOut: t2, feeTier: q12.feeTier },
      { in: q12.out,  out: q23.out, tokenIn: t2, tokenOut: t3, feeTier: q23.feeTier },
    ],
    finalOut: q23.out
  };
}

async function execTriangle(sim){
  if (DRY_RUN) {
    console.log('DRY RUN (triangle):', { profitBps: sim.profitBps.toFixed(2), profit: sim.profit.toFixed(6) });
    return { simulated: true };
  }
  await ensureSocket();

  // Leg 1
  {
    const { tokenIn, tokenOut, in: exactIn } = sim.legs[0];
    const q = await gswap.quoting.quoteExactInput(tokenIn, tokenOut, String(exactIn));
    const minOut = bpsMul(String(q.outTokenAmount), SLIPPAGE_BPS);
    const p = await gswap.swaps.swap(tokenIn, tokenOut, q.feeTier,
      { exactIn: String(exactIn), amountOutMinimum: minOut }, WALLET);
    await p.wait();
  }
  // Leg 2
  {
    const { tokenIn, tokenOut, in: exactIn } = sim.legs[1];
    const q = await gswap.quoting.quoteExactInput(tokenIn, tokenOut, String(exactIn));
    const minOut = bpsMul(String(q.outTokenAmount), SLIPPAGE_BPS);
    const p = await gswap.swaps.swap(tokenIn, tokenOut, q.feeTier,
      { exactIn: String(exactIn), amountOutMinimum: minOut }, WALLET);
    await p.wait();
  }
  // Leg 3
  {
    const { tokenIn, tokenOut, in: exactIn } = sim.legs[2];
    const q = await gswap.quoting.quoteExactInput(tokenIn, tokenOut, String(exactIn));
    const minOut = bpsMul(String(q.outTokenAmount), SLIPPAGE_BPS);
    const p = await gswap.swaps.swap(tokenIn, tokenOut, q.feeTier,
      { exactIn: String(exactIn), amountOutMinimum: minOut }, WALLET);
    const r = await p.wait();
    console.log('✅ Triangle executed. Final leg receipt:', { txId: r.txId, hash: r.transactionHash });
    return r;
  }
}

/* =========================================
   SIGNALS (Momentum / Mean-Revert / Fibonacci)
   ========================================= */
function pushPrice(state, price) {
  state.prices = (state.prices || []).concat([{ t: Date.now(), p: price }]).slice(-Math.max(3*FIB_LOOKBACK, 400));
}
function momentumSignal(price, ema){
  const dev = (price - ema)/ema;
  if (dev > MOMENTUM_TH) return { action:'BUY', reason:`Momentum +${(dev*100).toFixed(2)}%` };
  if (dev < -MOMENTUM_TH) return { action:'SELL', reason:`Momentum ${(dev*100).toFixed(2)}%` };
  return { action:'NONE' };
}
function meanRevertSignal(price, ema){
  const dev = (price - ema)/ema;
  if (dev > MEANREV_TH) return { action:'SELL', reason:`MeanRevert: above EMA by ${(dev*100).toFixed(2)}%` };
  if (dev < -MEANREV_TH) return { action:'BUY', reason:`MeanRevert: below EMA by ${(dev*100).toFixed(2)}%` };
  return { action:'NONE' };
}
function findSwing(prices, lookback){
  const arr = prices.slice(-lookback);
  if (arr.length < 5) return null;
  let hi=-Infinity, lo=Infinity, hiIdx=-1, loIdx=-1;
  for (let i=0;i<arr.length;i++){ const v = arr[i].p; if (v>hi){hi=v;hiIdx=i;} if (v<lo){lo=v;loIdx=i;} }
  const base = prices.length - arr.length;
  return { high: hi, highAt: base+hiIdx, low: lo, lowAt: base+loIdx };
}
function fibLevels(low, high){
  const range = high - low;
  return {
    l382: high - range*0.382,
    l500: high - range*0.500,
    l618: high - range*0.618,
    r382: low  + range*0.382, // for downtrend retrace
    r500: low  + range*0.500,
    r618: low  + range*0.618,
  };
}
function fibonacciSignal(state, price){
  const swings = findSwing(state.prices, FIB_LOOKBACK);
  if (!swings) return { action:'NONE', reason:'no swings yet' };
  const up   = (swings.highAt > swings.lowAt) && (price >= (state.ema ?? price));
  const down = (swings.lowAt > swings.highAt) && (price <= (state.ema ?? price));
  const lv = fibLevels(swings.low, swings.high);

  if (up) {
    if ((price <= lv.l500 && price >= lv.l618) || (price <= lv.l382 && price >= lv.l500))
      return { action:'BUY', reason:'Fib uptrend 38.2–61.8%' };
  } else if (down) {
    if ((price >= lv.r500 && price <= lv.r618) || (price >= lv.r382 && price <= lv.r500))
      return { action:'SELL', reason:'Fib downtrend 38.2–61.8%' };
  }
  return { action:'NONE', reason:'no fib entry' };
}

/* =========================================
   STRATEGY EXECUTION (loop mode)
   ========================================= */
async function runMomentum(state, price){
  const sig = momentumSignal(price, state.ema ?? price);
  console.log('Momentum:', sig);
  if (sig.action==='BUY')  return buyGalaByUsd(Math.min(MAX_TRADE_USD, BASE_TRADE_USD));
  if (sig.action==='SELL') return sellGalaByUsdNotional(Math.min(MAX_TRADE_USD, BASE_TRADE_USD));
}
async function runMeanRevert(state, price){
  const sig = meanRevertSignal(price, state.ema ?? price);
  console.log('MeanRevert:', sig);
  if (sig.action==='BUY')  return buyGalaByUsd(Math.min(MAX_TRADE_USD, BASE_TRADE_USD));
  if (sig.action==='SELL') return sellGalaByUsdNotional(Math.min(MAX_TRADE_USD, BASE_TRADE_USD));
}
async function runFibonacci(state, price){
  const sig = fibonacciSignal(state, price);
  console.log('Fibonacci:', sig);
  if (sig.action==='BUY')  return buyGalaByUsd(Math.min(MAX_TRADE_USD, BASE_TRADE_USD));
  if (sig.action==='SELL') return sellGalaByUsdNotional(Math.min(MAX_TRADE_USD, BASE_TRADE_USD));
}

/* =========================================
   MAIN TICK (normal loop)
   ========================================= */
async function tick(){
  try {
    // Update state & spot
    const state = loadState();
    const price = await spotUsdcPerGala();
    state.ema = emaUpdate(state.ema, price, EMA_ALPHA);
    pushPrice(state, price);
    saveState(state);

    // 1) Triangular arb first
    const balances = await getBalancesPaged();
    if (balances.USDC > ARB_START_USD*0.9) {
      const sim = await simulateTriangle(ARB_START_USD);
      console.log(`Arb check: profit=${sim.profit.toFixed(6)} USDC (${sim.profitBps.toFixed(2)} bps)`);
      if (sim.ok) {
        console.log('🎯 Executing triangular arbitrage…');
        await execTriangle(sim);
        return; // done this tick
      }
    } else {
      console.log('Skip arb: insufficient USDC balance.');
    }

    // 2) If no arb, randomly pick one strategy
    const strategies = ['MOMENTUM','MEAN_REVERT','FIBONACCI'];
    const pick = strategies[Math.floor(Math.random()*strategies.length)];
    console.log(`No profitable arb → trying ${pick}… (price=${price.toFixed(6)} ema=${(state.ema??price).toFixed(6)})`);

    if (pick==='MOMENTUM')         await runMomentum(state, price);
    else if (pick==='MEAN_REVERT') await runMeanRevert(state, price);
    else if (pick==='FIBONACCI')   await runFibonacci(state, price);

  } catch (e) {
    console.error('❌ Tick error:', e?.message || e);
  }
}

/* =========================================
   ONE-CENT SIMULATION MODE (ENHANCED)
   ========================================= */
const SIM_SAMPLES      = Number(process.env.SIM_SAMPLES || 24);     // number of price points
const SIM_SAMPLE_MS    = Number(process.env.SIM_SAMPLE_MS || 300);  // ms between samples
const SIM_FAKE_VAR_BPS = Number(process.env.SIM_FAKE_VAR_BPS || 120); // ±1.2% random walk if flat
const SIM_ARB_AMOUNTS  = (process.env.SIM_ARB_AMOUNTS || '0.01,0.05,0.10')
  .split(',').map(x => Number(x.trim())).filter(x => x > 0);

async function qExactIn(tokenIn, tokenOut, amountIn) {
  const q = await gswap.quoting.quoteExactInput(tokenIn, tokenOut, String(amountIn));
  return { expectedOut: Number(q.outTokenAmount), feeTier: q.feeTier };
}
async function spotUsdcPerGalaOnce() {
  const q = await gswap.quoting.quoteExactInput(TOKEN_GALA, TOKEN_USDC, '1');
  return Number(q.outTokenAmount);
}
function genRandomWalk(seed, n, varBps) {
  const out = [seed];
  for (let i = 1; i < n; i++) {
    const step = (Math.random() * 2 - 1) * (varBps / 10000); // ±varBps
    out.push(out[i - 1] * (1 + step));
  }
  return out;
}
function basicSwing(arr) {
  let hi = -Infinity, lo = Infinity, hiIdx = -1, loIdx = -1;
  arr.forEach((v, i) => { if (v > hi) { hi = v; hiIdx = i; } if (v < lo) { lo = v; loIdx = i; } });
  return { high: hi, low: lo, hiIdx, loIdx };
}
async function simulateTriangleOnce(startUsd, pathAliases) {
  const a = (alias) => ({ USDC: TOKEN_USDC, GALA: TOKEN_GALA, WETH: TOKEN_WETH }[alias] || alias);
  const [A,B,C,D] = pathAliases.map(a);
  if (A !== D) throw new Error('ARB_PATH must start and end with the same token');

  const leg01 = await qExactIn(A, B, startUsd);
  const leg12 = await qExactIn(B, C, leg01.expectedOut);
  const leg23 = await qExactIn(C, D, leg12.expectedOut);
  const finalOut = leg23.expectedOut;
  const profit = finalOut - startUsd;
  const profitBps = (profit / startUsd) * 10000;

  return {
    path: pathAliases.join('-'),
    usdIn: startUsd,
    legs: { leg01Out: leg01.expectedOut, leg12Out: leg12.expectedOut, leg23Out: leg23.expectedOut },
    profit: Number(profit.toFixed(8)),
    profitBps: Number(profitBps.toFixed(2)),
  };
}

async function runOnceTestAll() {
  console.log('🧪 Enhanced simulation of ALL strategies (no sockets, no balances, no swaps)…');

  // ---- 1) Triangular arb sims (try both permutations & small amounts)
  try {
    const path1 = (process.env.ARB_PATH || 'USDC-GALA-WETH-USDC').toUpperCase().split('-');
    const path2 = [path1[0], path1[2], path1[1], path1[3]]; // swap middle order

    for (const amt of SIM_ARB_AMOUNTS) {
      const r1 = await simulateTriangleOnce(amt, path1);
      const r2 = await simulateTriangleOnce(amt, path2);
      const best = (r1.profitBps >= r2.profitBps) ? r1 : r2;
      console.log('ARB (sim):', { tryAmount: amt, bestPath: best.path, ...best });
    }
  } catch (e) {
    console.log('ARB (sim) error:', e?.message || e);
  }

  // ---- 2) Build a tiny real price series
  const real = [];
  for (let i = 0; i < SIM_SAMPLES; i++) {
    real.push(await spotUsdcPerGalaOnce());
    if (i < SIM_SAMPLES - 1) await sleep(SIM_SAMPLE_MS);
  }

  const swingReal = basicSwing(real);
  const varPct = swingReal.high === 0 ? 0 : (swingReal.high - swingReal.low) / swingReal.high;
  let series = real;

  // If too flat, synthesize a small random walk around the last real price
  if (!isFinite(varPct) || varPct < 0.001) { // <0.1% range
    const seed = real[real.length - 1] || 0.02;
    series = genRandomWalk(seed, SIM_SAMPLES, SIM_FAKE_VAR_BPS);
    console.log(`ℹ️ Real quotes too flat; using synthetic random walk ±${SIM_FAKE_VAR_BPS/100}% for signals.`);
  }

  // Compute EMA over the series
  let ema = null;
  for (const p of series) ema = ema == null ? p : (EMA_ALPHA * p + (1 - EMA_ALPHA) * ema);
  const price = series[series.length - 1];

  // ---- 3) Momentum
  {
    const dev = (price - ema) / ema;
    const action = dev > MOMENTUM_TH ? 'BUY' : (dev < -MOMENTUM_TH ? 'SELL' : 'NONE');
    console.log('Momentum (sim):', {
      samples: SIM_SAMPLES,
      price, ema,
      deviationPct: Number((dev * 100).toFixed(3)),
      thresholdPct: Number((MOMENTUM_TH * 100).toFixed(2)),
      action
    });
  }

  // ---- 4) Mean Reversion
  {
    const dev = (price - ema) / ema;
    const action = dev > MEANREV_TH ? 'SELL' : (dev < -MEANREV_TH ? 'BUY' : 'NONE');
    console.log('MeanRevert (sim):', {
      samples: SIM_SAMPLES,
      price, ema,
      deviationPct: Number((dev * 100).toFixed(3)),
      thresholdPct: Number((MEANREV_TH * 100).toFixed(2)),
      action
    });
  }

  // ---- 5) Fibonacci (use last 1/3rd of series as swing window)
  {
    const tail = series.slice(Math.floor(series.length * 2 / 3));
    const { high, low, hiIdx, loIdx } = basicSwing(tail);
    const rng = high - low;
    const l382 = high - rng * 0.382, l500 = high - rng * 0.5, l618 = high - rng * 0.618;
    const r382 = low + rng * 0.382,  r500 = low + rng * 0.5,  r618 = low + rng * 0.618;
    const upTrend = (hiIdx > loIdx) && price >= ema;
    const dnTrend = (loIdx > hiIdx) && price <= ema;

    let action = 'NONE', zone = null;
    if (upTrend && ((price <= l500 && price >= l618) || (price <= l382 && price >= l500))) { action='BUY'; zone='UP 38.2–61.8%'; }
    else if (dnTrend && ((price >= r500 && price <= r618) || (price >= r382 && price <= r500))) { action='SELL'; zone='DOWN 38.2–61.8%'; }

    console.log('Fibonacci (sim):', {
      samples: SIM_SAMPLES,
      trend: upTrend ? 'UP' : (dnTrend ? 'DOWN' : 'FLAT'),
      swingLow: low, swingHigh: high,
      levels: { l382, l500, l618, r382, r500, r618 },
      price, ema, action, zone
    });
  }

  console.log('✅ Simulation finished.');
}

/* =========================================
   LOOP
   ========================================= */
async function loop(){
  const firstJitter = Math.floor(Math.random()*JITTER_SEC)*1000;
  if (firstJitter){ console.log(`Initial jitter ${Math.floor(firstJitter/1000)}s…`); await sleep(firstJitter); }
  await tick();

  const intervalMs = INTERVAL_MIN*60*1000;
  console.log(`⏱️ every ${INTERVAL_MIN} min (±${JITTER_SEC}s jitter)`);
  setInterval(async ()=>{
    try {
      const j = Math.floor(Math.random()*JITTER_SEC)*1000;
      if (j) await sleep(j);
      await tick();
    } catch (e) {
      console.error('Loop error:', e?.message || e);
    }
  }, intervalMs);
}

/* =========================================
   START
   ========================================= */
(async function main(){
  if (ARG_ONCE) {
    await runOnceTestAll(); // pure-sim, safe & fast
    process.exit(0);
  }

  console.log('Hybrid Bot starting…', {
    wallet: WALLET,
    intervalMin: INTERVAL_MIN,
    dryRun: DRY_RUN,
    arb: { ARB_PATH, ARB_START_USD, ARB_MIN_PROFIT_BPS },
    momentum: { EMA_ALPHA, MOMENTUM_TH },
    meanRevert: { MEANREV_TH },
    fib: { FIB_LOOKBACK }
  });

  try {
    const b = await getBalancesPaged();
    console.log('Balances snapshot:', b);
  } catch(e){ console.warn('Balance fetch failed (non-fatal):', e?.message||e); }

  await loop();

  const shutdown = async (sig) => {
    console.log(`${sig} received, closing…`);
    try { await GSwap.events.disconnectEventSocket?.(); } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
