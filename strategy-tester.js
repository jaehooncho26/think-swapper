// strategy-tester.js
// Manual tester for individual strategies with before/after balance report.
// Usage examples:
//   node strategy-tester.js --strategy=arb --usd=3
//   node strategy-tester.js --strategy=momentum --usd=2
//   node strategy-tester.js --strategy=mean --usd=2 --execute
//   node strategy-tester.js --strategy=fib --usd=2 --execute
//
// By default it SIMULATES. Add --execute AND set DRY_RUN=false in .env for real trades.

require('dotenv').config();
const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');

const args = require('minimist')(process.argv.slice(2));
const STRAT = String(args.strategy || 'arb').toLowerCase(); // arb | momentum | mean | fib
const USD   = Number(args.usd || 2);
const EXECUTE = !!args.execute;

const WALLET        = (process.env.WALLET_ADDRESS || '').trim();
const PRIVATE_KEY   = (process.env.PRIVATE_KEY || '').trim();
const DRY_RUN_ENV   = (process.env.DRY_RUN || 'true').toLowerCase() === 'true';

const TOKEN_USDC    = (process.env.TOKEN_USDC  || 'GUSDC|Unit|none|none').trim();
const TOKEN_GALA    = (process.env.TOKEN_GALA  || 'GALA|Unit|none|none').trim();
const TOKEN_WETH    = (process.env.TOKEN_WETH  || 'GWETH|Unit|none|none').trim();

const SLIPPAGE_BPS  = Number(process.env.SLIPPAGE_BPS || 50);
const EMA_ALPHA     = Number(process.env.EMA_ALPHA || 0.2);
const MOMENTUM_TH   = Number(process.env.MOMENTUM_TH || 0.004);
const MEANREV_TH    = Number(process.env.MEANREV_TH || 0.006);
const FIB_LOOKBACK  = Number(process.env.FIB_LOOKBACK || 96);

const ARB_PATH = (process.env.ARB_PATH || 'USDC-GALA-WETH-USDC').toUpperCase().split('-');
const ARB_MIN_PROFIT_BPS = Number(process.env.ARB_MIN_PROFIT_BPS || 30);

const gatewayBaseUrl    = process.env.GATEWAY_BASE_URL || 'https://gateway-mainnet.galachain.com';
const bundlerBaseUrl    = process.env.BUNDLER_BASE_URL || 'https://bundle-backend-prod1.defi.gala.com';
const dexBackendBaseUrl = process.env.DEX_BACKEND_BASE_URL || undefined;

if (!WALLET) {
  console.error('❌ WALLET_ADDRESS missing');
  process.exit(1);
}
if (EXECUTE && DRY_RUN_ENV) {
  console.error('❌ You passed --execute but DRY_RUN=true in .env. Set DRY_RUN=false to actually trade.');
  process.exit(1);
}
if (EXECUTE && !PRIVATE_KEY) {
  console.error('❌ You passed --execute but PRIVATE_KEY is empty.');
  process.exit(1);
}

const gswap = new GSwap({
  signer: new PrivateKeySigner(PRIVATE_KEY || '0x'),
  walletAddress: WALLET,
  gatewayBaseUrl,
  bundlerBaseUrl,
  dexBackendBaseUrl,
});

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
function bpsMul(x, bps){ const n=Number(x); return ((n*(10000-bps))/10000).toString(); }
async function ensureSocket(){ if (!GSwap.events.isConnected?.()) await GSwap.events.connectEventSocket(); }

async function balances() {
    // Page numbers start at 1; limit must be 1..100
    const LIMIT = 100;
    let page = 1;
    const out = { USDC: 0, GALA: 0, WETH: 0 };
  
    while (true) {
      const res = await gswap.assets.getUserAssets(WALLET, page, LIMIT);
      const assets = res?.assets || [];
      for (const a of assets) {
        const bal = Number(a.balance || 0);
        if (a.classKey === TOKEN_USDC) out.USDC = bal;
        if (a.classKey === TOKEN_GALA) out.GALA = bal;
        if (a.classKey === TOKEN_WETH) out.WETH = bal;
      }
      if (assets.length < LIMIT) break; // no more pages
      page += 1;
    }
    return out;
}
  

async function quoteExactIn(tokenIn, tokenOut, amountIn) {
  const q = await gswap.quoting.quoteExactInput(tokenIn, tokenOut, String(amountIn));
  return { out: Number(q.outTokenAmount), feeTier: q.feeTier };
}

// Spot prices (USDC per 1 unit)
async function spotUSDCPerGALA() {
  const { out } = await quoteExactIn(TOKEN_GALA, TOKEN_USDC, 1);
  return out;
}
async function spotUSDCPerWETH() {
  const { out } = await quoteExactIn(TOKEN_WETH, TOKEN_USDC, 1);
  return out;
}

async function asUSDCeq(bal) {
  const pG = await spotUSDCPerGALA();
  const pW = await spotUSDCPerWETH();
  return bal.USDC + bal.GALA * pG + bal.WETH * pW;
}

function printReport(title, before, after, priceG, priceW, notes) {
  const usdcEqBefore = before.USDC + before.GALA * priceG + before.WETH * priceW;
  const usdcEqAfter  =  after.USDC +  after.GALA * priceG +  after.WETH * priceW;
  const delta = {
    USDC: after.USDC - before.USDC,
    GALA: after.GALA - before.GALA,
    WETH: after.WETH - before.WETH,
    USDC_eq_change: usdcEqAfter - usdcEqBefore
  };
  console.log('\n============== Strategy Test Report ==============');
  console.log('Title:', title);
  console.table({ BEFORE: before, AFTER: after, DELTA: delta });
  if (notes) console.log('Notes:', notes);
  console.log('=================================================\n');
}

// ──────────────────────────────────────────────────────────────
// Execution helpers
// ──────────────────────────────────────────────────────────────
async function swapExactIn(tokenIn, tokenOut, exactIn) {
  const q = await gswap.quoting.quoteExactInput(tokenIn, tokenOut, String(exactIn));
  const minOut = bpsMul(String(q.outTokenAmount), SLIPPAGE_BPS);
  if (!EXECUTE) {
    return { simulated: true, expectedOut: Number(q.outTokenAmount), feeTier: q.feeTier };
  }
  await ensureSocket();
  const p = await gswap.swaps.swap(tokenIn, tokenOut, q.feeTier,
    { exactIn: String(exactIn), amountOutMinimum: minOut }, WALLET);
  const r = await p.wait();
  return { executed: true, receipt: { txId: r.txId, hash: r.transactionHash }, expectedOut: Number(q.outTokenAmount), feeTier: q.feeTier };
}

// ARB: USDC -> GALA -> WETH -> USDC
function keyFromAlias(alias) {
  const a = alias.toUpperCase();
  if (a === 'USDC') return TOKEN_USDC;
  if (a === 'GALA') return TOKEN_GALA;
  if (a === 'WETH') return TOKEN_WETH;
  return alias;
}

async function runArb(startUsd) {
  const t0 = keyFromAlias(ARB_PATH[0]);
  const t1 = keyFromAlias(ARB_PATH[1]);
  const t2 = keyFromAlias(ARB_PATH[2]);
  const t3 = keyFromAlias(ARB_PATH[3]);
  if (t0 !== t3) throw new Error('ARB_PATH must start and end with the same token');

  // simulate first
  const q01 = await quoteExactIn(t0, t1, startUsd);
  const q12 = await quoteExactIn(t1, t2, q01.out);
  const q23 = await quoteExactIn(t2, t3, q12.out);
  const profit = q23.out - startUsd;
  const profitBps = (profit / startUsd) * 10000;
  console.log(`Simulated triangle: ${startUsd} → ${q01.out} → ${q12.out} → ${q23.out} (profit ${profit.toFixed(6)} USDC, ${profitBps.toFixed(2)} bps)`);

  if (!EXECUTE || profitBps < ARB_MIN_PROFIT_BPS) {
    return { simulated: true, profit, profitBps, legs: [q01, q12, q23] };
  }

  // execute legs
  await ensureSocket();
  const e01 = await swapExactIn(t0, t1, startUsd);
  const e12 = await swapExactIn(t1, t2, q01.out);
  const e23 = await swapExactIn(t2, t3, q12.out);
  return { executed: true, profit, profitBps, legs: [e01, e12, e23] };
}

// Momentum / Mean-revert / Fib signals (simple)
let STATE = { ema: null, prices: [] }; // lightweight
function emaUpdate(prev, p, alpha){ return prev==null ? p : alpha*p + (1-alpha)*prev; }
function pushPrice(p){ STATE.prices = (STATE.prices || []).concat([{ t: Date.now(), p }]).slice(-Math.max(3*FIB_LOOKBACK, 400)); }

function momentumSignal(price, ema){
  const dev = (price - ema)/ema;
  if (dev > MOMENTUM_TH) return { action:'BUY', reason:`Momentum +${(dev*100).toFixed(2)}% vs EMA` };
  if (dev < -MOMENTUM_TH) return { action:'SELL', reason:`Momentum ${(dev*100).toFixed(2)}% vs EMA` };
  return { action:'NONE' };
}
function meanRevertSignal(price, ema){
  const dev = (price - ema)/ema;
  if (dev > MEANREV_TH) return { action:'SELL', reason:`MeanRevert: above EMA by ${(dev*100).toFixed(2)}%` };
  if (dev < -MEANREV_TH) return { action:'BUY', reason:`MeanRevert: below EMA by ${(dev*100).toFixed(2)}%` };
  return { action:'NONE' };
}
// Fib helpers
function findSwing(prices, lookback){
  const arr = prices.slice(-lookback);
  if (arr.length < 5) return null;
  let hi=-Infinity, lo=Infinity, hiIdx=-1, loIdx=-1;
  for (let i=0;i<arr.length;i++){ const v=arr[i].p; if (v>hi){hi=v;hiIdx=i;} if (v<lo){lo=v;loIdx=i;} }
  const base = prices.length - arr.length;
  return { high: hi, highAt: base+hiIdx, low: lo, lowAt: base+loIdx };
}
function levelsUp(low, high){ const r = high-low; return { l382: high-r*0.382, l500: high-r*0.5, l618: high-r*0.618 }; }
function levelsDown(high, low){ const r = high-low; return { r382: low+r*0.382, r500: low+r*0.5, r618: low+r*0.618 }; }
function trendFromSwings(price){
  const s = findSwing(STATE.prices, FIB_LOOKBACK);
  if (!s) return { trend:'FLAT', swings:null };
  const up   = (s.highAt > s.lowAt) && (price >= (STATE.ema ?? price));
  const down = (s.lowAt > s.highAt) && (price <= (STATE.ema ?? price));
  return { trend: up ? 'UP' : (down ? 'DOWN' : 'FLAT'), swings: s };
}
function fibSignal(price){
  const { trend, swings } = trendFromSwings(price);
  if (!swings) return { action:'NONE', reason:'no swings yet' };
  if (trend==='UP'){
    const f = levelsUp(swings.low, swings.high);
    if (price <= f.l500 && price >= f.l618) return { action:'BUY', reason:'Fib uptrend 50–61.8%' };
    if (price <= f.l382 && price >= f.l500) return { action:'BUY', reason:'Fib uptrend 38.2–50%' };
  }
  if (trend==='DOWN'){
    const f = levelsDown(swings.high, swings.low);
    if (price >= f.r500 && price <= f.r618) return { action:'SELL', reason:'Fib downtrend 50–61.8%' };
    if (price >= f.r382 && price <= f.r500) return { action:'SELL', reason:'Fib downtrend 38.2–50%' };
  }
  return { action:'NONE', reason:'no fib entry' };
}

async function runDirectional(action, usdNotional) {
  if (action === 'BUY') {
    // exactIn in USDC
    return swapExactIn(TOKEN_USDC, TOKEN_GALA, usdNotional);
  }
  if (action === 'SELL') {
    // convert usd to GALA size first
    const pG = await spotUSDCPerGALA();
    const galaAmt = usdNotional / pG;
    return swapExactIn(TOKEN_GALA, TOKEN_USDC, galaAmt);
  }
  return { simulated: true, skipped: true };
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────
(async function main(){
  console.log(`Strategy tester starting… strategy=${STRAT} usd=${USD} execute=${EXECUTE} (DRY_RUN=${DRY_RUN_ENV})`);
  try {
    // 0) Prep + snapshot
    await ensureSocket().catch(()=>{});
    const before = await balances();
    const pG = await spotUSDCPerGALA();
    const pW = await spotUSDCPerWETH();

    // Build EMA and minimal history (pull a few latest prices quickly)
    STATE.ema = STATE.ema ?? pG; // seed with current GALA price in USDC units
    for (let i=0;i<10;i++) { // tiny seed history
      const { out } = await quoteExactIn(TOKEN_GALA, TOKEN_USDC, 1);
      STATE.ema = emaUpdate(STATE.ema, out, EMA_ALPHA);
      pushPrice(out);
    }

    let notes = '';
    if (STRAT === 'arb') {
      const result = await runArb(USD);
      notes = `Arb simulatedProfit=${result.profit?.toFixed(6)} USDC (${result.profitBps?.toFixed(2)} bps)${!EXECUTE ? ' [simulation]' : ''}`;
    } else if (STRAT === 'momentum') {
      const sig = momentumSignal(STATE.prices.at(-1).p, STATE.ema);
      notes = `Momentum signal → ${sig.action} (${sig.reason})`;
      if (sig.action !== 'NONE') await runDirectional(sig.action, USD);
    } else if (STRAT === 'mean') {
      const sig = meanRevertSignal(STATE.prices.at(-1).p, STATE.ema);
      notes = `MeanRevert signal → ${sig.action} (${sig.reason})`;
      if (sig.action !== 'NONE') await runDirectional(sig.action, USD);
    } else if (STRAT === 'fib') {
      const sig = fibSignal(STATE.prices.at(-1).p);
      notes = `Fibonacci signal → ${sig.action} (${sig.reason})`;
      if (sig.action !== 'NONE') await runDirectional(sig.action, USD);
    } else {
      console.log('Unknown --strategy. Use arb | momentum | mean | fib');
    }

    // 3) After balances (real execution only changes balances; simulation will likely match before)
    const after = await balances();
    printReport(`Strategy=${STRAT} usd=${USD} execute=${EXECUTE}`, before, after, pG, pW, notes);

    process.exit(0);
  } catch (e) {
    console.error('❌ Tester error:', e?.message || e);
    process.exit(1);
  }
})();
