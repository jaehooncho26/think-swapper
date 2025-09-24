// bot.js — DCA $1; sell only when TOTAL P&L > 0 (GUSDT-only)
// - Buys ~$1 GUSDT→GALA/GWETH alternating
// - Tracks cumulative USDT cost and units per token in .bot_state.json
// - Sells ALL GALA or ALL GWETH only if current quoted USDT-out exceeds total cost by (MIN_PROFIT_BPS + PROFIT_BUFFER_BPS)

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');

// -------- env --------
const WALLET        = (process.env.WALLET_ADDRESS || '').trim(); // e.g., "eth|E7DFA9C..."
const PRIVATE_KEY   = (process.env.PRIVATE_KEY || '').trim();
const DRY_RUN       = ((process.env.DRY_RUN || 'true').toLowerCase() === 'true');
const INTERVAL_MIN  = Number(process.env.BOT_INTERVAL_MIN || 10);
const USD_CENTS     = Number(process.env.BOT_USD_CENTS || 100);      // 100 = $1
const SLIPPAGE_BPS  = Number(process.env.SLIPPAGE_BPS || 50);        // 0.50%
const MIN_PROFIT_BPS= Number(process.env.MIN_PROFIT_BPS || 50);      // 0.50% target profit
const PROFIT_BUFFER_BPS = Number(process.env.PROFIT_BUFFER_BPS || 50); // 0.50% buffer for fees/slippage
const DEBUG         = ((process.env.DEBUG || 'false').toLowerCase() === 'true');

// optional endpoints
const gatewayBaseUrl    = process.env.GATEWAY_BASE_URL;
const bundlerBaseUrl    = process.env.BUNDLER_BASE_URL;
const dexBackendBaseUrl = process.env.DEX_BACKEND_BASE_URL || undefined;

// -------- class keys (GalaChain) --------
const GALA  = 'GALA|Unit|none|none';
const GWETH = 'GWETH|Unit|none|none';
const GUSDT = 'GUSDT|Unit|none|none';

// -------- safety --------
if (!WALLET) { console.error('❌ WALLET_ADDRESS missing (expected like eth|E7DFA9...)'); process.exit(1); }
if (!DRY_RUN && !PRIVATE_KEY) { console.error('❌ PRIVATE_KEY missing and DRY_RUN=false → cannot sign swaps.'); process.exit(1); }

// -------- sdk --------
const gswap = new GSwap({
  signer: new PrivateKeySigner(PRIVATE_KEY || '0x'),
  walletAddress: WALLET,
  gatewayBaseUrl,
  bundlerBaseUrl,
  dexBackendBaseUrl,
});
if (DEBUG) console.log('[ENDPOINTS]', { gatewayBaseUrl, bundlerBaseUrl, dexBackendBaseUrl, wallet: WALLET });

// -------- utils --------
function slot(minutes = 10){ return Math.floor(Date.now() / (minutes * 60 * 1000)); }
function nextBuyTokenKey(){ return slot(10) % 2 === 0 ? 'GALA' : 'GWETH'; }
function toDollars(cents){ return Math.max(0, Number(cents || 0)) / 100; }
function isPos(x){ const n = Number(x); return Number.isFinite(n) && n > 0; }
function bpsMulStr(xStr, bps){ const x = Number(xStr); return ((x * (10000 - bps)) / 10000).toString(); }

// -------- state (persisted avg/total) --------
// schema: { GALA: { units, cost_usdt }, GWETH: { units, cost_usdt } }
const STATE_PATH = process.env.STATE_PATH || path.join(process.cwd(), '.bot_state.json');
function loadState(){
  try{
    if (fs.existsSync(STATE_PATH)){
      const j = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      return {
        GALA:  { units: Number(j?.GALA?.units || 0),  cost_usdt: Number(j?.GALA?.cost_usdt || 0) },
        GWETH: { units: Number(j?.GWETH?.units || 0), cost_usdt: Number(j?.GWETH?.cost_usdt || 0) }
      };
    }
  }catch(e){ console.log('[STATE] read error:', e.message); }
  return { GALA: { units: 0, cost_usdt: 0 }, GWETH: { units: 0, cost_usdt: 0 } };
}
function saveState(s){
  try{
    fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
    if (DEBUG) console.log('[STATE] saved', STATE_PATH);
  }catch(e){
    console.log('[STATE] write failed (state will not persist across runs):', e.message);
  }
}
let STATE = loadState();
function addPurchase(symbol, units, costUsd){
  const s = STATE[symbol];
  STATE[symbol] = { units: s.units + units, cost_usdt: s.cost_usdt + costUsd };
}
function clearPosition(symbol){
  STATE[symbol] = { units: 0, cost_usdt: 0 };
}

// -------- balances (pagination; limit ≤ 100) --------
async function fetchAssetsOnce(addr, page, limit){
  try{
    return await gswap.assets.getUserAssets(addr, page, limit);
  }catch(e){
    const msg = e?.message || String(e);
    const body = e?.response?.data ? ` body=${JSON.stringify(e.response.data).slice(0,400)}` : '';
    console.log(`[BALANCE-ERR] ${msg} (page=${page}, limit=${limit}, addr=${addr})${body}`);
    throw e;
  }
}
async function getBalancesMap(){
  const map = {};
  const limits = [100, 50, 20];
  for (const limit of limits){
    let page = 1;
    try{
      while (true){
        const res = await fetchAssetsOnce(WALLET, page, limit);
        const tokens = res?.tokens || [];
        for (const t of tokens){
          const sym = (t.symbol || '').toUpperCase();
          if (!sym) continue;
          map[sym] = Number(t.quantity || '0');
        }
        if (tokens.length < limit) break;
        page += 1;
      }
      break; // success
    }catch{
      if (limit === limits[limits.length - 1]){
        if (DEBUG) console.log('[BALANCES] empty due to repeated errors');
        return {};
      }
    }
  }
  if (DEBUG) console.log('[TOKENS]', Object.keys(map));
  return map;
}

// -------- quoting --------
async function quoteExactIn(IN_CLASS, OUT_CLASS, amountStr){
  if (!isPos(amountStr)) return null;
  try{
    const q = await gswap.quoting.quoteExactInput(IN_CLASS, OUT_CLASS, amountStr);
    const outStr = q?.outTokenAmount?.toString?.();
    if (!q || !isPos(outStr) || q.feeTier == null) return null;
    return q;
  }catch(e){
    console.log(`[QUOTE-SKIP] ${IN_CLASS} -> ${OUT_CLASS} amount=${amountStr} err=${e?.message || e}`);
    return null;
  }
}
async function ensureSocket(){
  if (!GSwap.events.eventSocketConnected()) await GSwap.events.connectEventSocket();
}

// -------- sell logic: check TOTAL profit --------
async function trySellIfProfitable(symbolKey){
  const balances = await getBalancesMap();
  const qtyOnChain = Number(balances[symbolKey] || 0);
  const trackedUnits = STATE[symbolKey]?.units || 0;
  const trackedCost  = STATE[symbolKey]?.cost_usdt || 0;

  if (!(qtyOnChain > 0) || !(trackedUnits > 0) || !(trackedCost > 0)){
    console.log(`[SELL-SKIP] ${symbolKey}: nothing tracked or on-chain`);
    return;
  }

  const IN  = symbolKey === 'GALA' ? GALA : GWETH;
  const OUT = GUSDT;

  const q = await quoteExactIn(IN, OUT, qtyOnChain.toString());
  if (!q){ console.log(`[SELL-SKIP] No valid quote for ${symbolKey}->GUSDT (qty=${qtyOnChain})`); return; }

  const usdtOut = Number(q.outTokenAmount.toString());
  if (!(usdtOut > 0)){ console.log(`[SELL-SKIP] Quote out=0 for ${symbolKey}->GUSDT`); return; }

  // threshold = total cost × (1 + profit target + buffer)
  const totalBps = MIN_PROFIT_BPS + PROFIT_BUFFER_BPS; // net profit target
  const threshold = trackedCost * (1 + totalBps / 10000);

  if (DEBUG){
    const unitNow = usdtOut / qtyOnChain;
    const avgUnit = trackedCost / trackedUnits;
    console.log(`[SELL-CHECK] ${symbolKey}: out=$${usdtOut.toFixed(6)} vs threshold=$${threshold.toFixed(6)} | unitNow=${unitNow.toFixed(8)} avgUnit=${avgUnit.toFixed(8)}`);
  }

  if (usdtOut + 1e-9 < threshold){
    console.log(`[SELL-SKIP] ${symbolKey}: total-out $${usdtOut.toFixed(6)} < threshold $${threshold.toFixed(6)}`);
    return;
  }

  const minOut = bpsMulStr(q.outTokenAmount.toString(), SLIPPAGE_BPS);

  if (DRY_RUN){
    console.log(`[SELL-DRY] ${symbolKey}->GUSDT qty=${qtyOnChain} out≈$${usdtOut.toFixed(6)} minOut=${minOut} (trackedCost=$${trackedCost.toFixed(6)})`);
    clearPosition(symbolKey);
    saveState(STATE);
    return;
  }

  try{
    await ensureSocket();
    const pending = await gswap.swaps.swap(IN, OUT, q.feeTier, {
      exactIn: qtyOnChain.toString(),
      amountOutMinimum: minOut
    }, WALLET);
    const receipt = await pending.wait();
    console.log(`✅ SELL ${symbolKey} done:`, { txId: receipt.txId, hash: receipt.transactionHash });
    clearPosition(symbolKey); // reset after realizing profit
    saveState(STATE);
  }catch(e){
    console.log(`[SELL-ERR] ${symbolKey}->GUSDT ${e?.message || e}`);
  }
}

// -------- buy logic: add to cumulative cost --------
async function buyOneDollar(){
  const usd = toDollars(USD_CENTS);
  if (!(usd > 0)){ console.log('[BUY-SKIP] USD amount <= 0'); return; }

  const balances = await getBalancesMap();
  const gusdtBal = Number(balances.GUSDT || 0);
  if (gusdtBal + 1e-9 < usd){ console.log(`[BUY-SKIP] Not enough GUSDT (need $${usd}, have $${gusdtBal})`); return; }

  const buyKey = nextBuyTokenKey(); // 'GALA' or 'GWETH'
  const IN  = GUSDT;
  const OUT = buyKey === 'GALA' ? GALA : GWETH;

  // quote to estimate units for state update
  const q = await quoteExactIn(IN, OUT, usd.toString());
  if (!q){ console.log(`[BUY-SKIP] No valid quote for GUSDT->${buyKey} (usd=${usd})`); return; }

  const outUnits = Number(q.outTokenAmount.toString());
  if (!(outUnits > 0)){ console.log(`[BUY-SKIP] Quote out=0 for GUSDT->${buyKey}`); return; }

  const minOut = bpsMulStr(q.outTokenAmount.toString(), SLIPPAGE_BPS);

  if (DRY_RUN){
    console.log(`[BUY-DRY] GUSDT->${buyKey} spend=$${usd.toFixed(6)} estUnits=${outUnits} minOut=${minOut}`);
    addPurchase(buyKey, outUnits, usd); // record intended cost/units
    saveState(STATE);
    return;
  }

  try{
    await ensureSocket();
    const pending = await gswap.swaps.swap(IN, OUT, q.feeTier, {
      exactIn: usd.toString(),
      amountOutMinimum: minOut
    }, WALLET);
    const receipt = await pending.wait();
    console.log('✅ BUY done:', { txId: receipt.txId, hash: receipt.transactionHash });

    // NOTE: We use quoted outUnits to update state. For maximum accuracy you can
    // parse actual filled units from the receipt if the SDK exposes it.
    addPurchase(buyKey, outUnits, usd);
    saveState(STATE);
  }catch(e){
    console.log(`[BUY-ERR] GUSDT->${buyKey} ${e?.message || e}`);
  }
}

// -------- main loop --------
async function runOnce(){
  try{
    await trySellIfProfitable('GALA');   // dump ALL if total profit target met
    await trySellIfProfitable('GWETH');  // dump ALL if total profit target met
    await buyOneDollar();                // then add ~$1 to the next asset
  }catch(e){
    console.error('❌ Bot error:', e?.message || e);
  }
}
async function main(){
  if (process.argv[2] === 'once'){
    await runOnce();
    console.log('One-shot run complete. Exiting.');
    process.exit(0);
  }else{
    console.log(`Starting loop every ${INTERVAL_MIN} min (DRY_RUN=${DRY_RUN})`);
    await runOnce();
    const handle = setInterval(runOnce, INTERVAL_MIN * 60 * 1000);
    const shutdown = async (sig) => {
      console.log(`\n${sig} received, closing…`);
      clearInterval(handle);
      try { await GSwap.events.disconnectEventSocket?.(); } catch {}
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}
main();
