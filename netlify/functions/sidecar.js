// netlify/functions/sidecar.js
// Serverless version for Netlify Functions (path: /.netlify/functions/sidecar/*)

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');
const serverless = require('serverless-http');

// ---------------------- Helpers ----------------------
function splitEthBar(w) {
  if (!w) return { ok: false };
  const s = String(w).trim().replace(/^"+|"+$/g, '');
  const [prefix, rest] = s.split('|');
  if (!prefix || !rest) return { ok: false };
  return { ok: true, prefix, rest };
}

function normalizeWalletNo0x(w) {
  const sp = splitEthBar(w);
  if (!sp.ok) return '';
  const prefix = String(sp.prefix).trim().toLowerCase();
  let hex = String(sp.rest).trim().replace(/^0x/i, '').toLowerCase();
  hex = hex.slice(0, 40);
  if (!/^[a-f0-9]{40}$/.test(hex)) return '';
  return `${prefix}|${hex}`;
}

function validEthNamespaceNo0x(w) {
  return /^eth\|[a-f0-9]{40}$/.test(String(w).toLowerCase());
}

function maskPK(pk) {
  if (!pk) return '(none)';
  const s = String(pk);
  return s.length > 14 ? s.slice(0, 6) + '...' + s.slice(-6) : '(short key)';
}

// Normalize number or ISO to epoch ms (seconds auto-converted)
function normEpochMs(v) {
  if (v == null) return 0;
  if (typeof v === 'string' && /\D/.test(v)) {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : 0;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 2e10 ? Math.round(n * 1000) : Math.round(n);
}

// Attempt to pull a timestamp out of an arbitrary object
function extractTxTimestamp(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  const numericFields = [obj.timestamp, obj.blockTimestamp, obj.time, obj.ts, obj.createdAt, obj.completedAt];
  for (const f of numericFields) {
    const ms = normEpochMs(f);
    if (ms) return ms;
  }
  const stringFields = [obj.timestamp, obj.blockTime, obj.block_date, obj.block_time, obj.date, obj.time]
    .filter(x => typeof x === 'string');
  for (const s of stringFields) {
    const ms = normEpochMs(s);
    if (ms) return ms;
  }
  if (obj.receipt) {
    const ms = extractTxTimestamp(obj.receipt);
    if (ms) return ms;
  }
  return 0;
}

// ---------------------- Env ----------------------
const RAW_WALLET = process.env.WALLET_ADDRESS || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

const GATEWAY_BASE_URL     = process.env.GATEWAY_BASE_URL     || 'https://gateway-mainnet.galachain.com';
const DEX_BACKEND_BASE_URL = process.env.DEX_BACKEND_BASE_URL || 'https://dex-backend-prod1.defi.gala.com';
const BUNDLER_BASE_URL     = process.env.BUNDLER_BASE_URL     || 'https://bundle-backend-prod1.defi.gala.com';
const GALACONNECT_BASE_URL = process.env.GALACONNECT_BASE_URL || 'https://api-galaswap.gala.com';

const EXPLORER_BASE_URL    = process.env.EXPLORER_BASE_URL    || 'https://explorer-api.galachain.com/v1/explorer';
const EXPLORER_CHANNELS    = (process.env.EXPLORER_CHANNELS   || 'asset,dex')
  .split(',').map(s => s.trim()).filter(Boolean);
const EXPLORER_LOOKBACK    = Math.max(1, Number(process.env.EXPLORER_LOOKBACK || 1500));

const WALLET = normalizeWalletNo0x(RAW_WALLET);
if (!WALLET) {
  console.warn('⚠️ WALLET_ADDRESS missing or malformed. Expected eth|<40-hex> (no 0x).');
} else if (!validEthNamespaceNo0x(WALLET)) {
  console.warn(`⚠️ WALLET_ADDRESS invalid after normalization: "${WALLET}"`);
}

// ---------------------- App ----------------------
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ✅ Strip Netlify function prefix so routes match
app.use((req, _res, next) => {
  const prefix = '/.netlify/functions/sidecar';
  if (req.url.startsWith(prefix)) {
    req.url = req.url.slice(prefix.length) || '/';
  }
  next();
});

// ---------------------- Init SDK ----------------------
const sdkOpts = {
  walletAddress: WALLET,
  gatewayBaseUrl: GATEWAY_BASE_URL,
  dexBackendBaseUrl: DEX_BACKEND_BASE_URL,
  bundlerBaseUrl: BUNDLER_BASE_URL,
  dexContractBasePath: '/api/asset/dexv3-contract',
  tokenContractBasePath: '/api/asset/token-contract',
  bundlingAPIBasePath: '/bundle',
};
if (PRIVATE_KEY) sdkOpts.signer = new PrivateKeySigner(PRIVATE_KEY);

const gswap = new GSwap(sdkOpts);

// ---------------------- Token Class Keys ----------------------
const CLASS = {
  GUSDC: 'GUSDC|Unit|none|none',
  GALA:  'GALA|Unit|none|none',
  GWETH: 'GWETH|Unit|none|none',
};

// ---------------------- Prices ----------------------
async function priceInUSDC(symbol) {
  if (symbol === 'USDC') return '1';
  if (symbol === 'GALA') {
    const q = await gswap.quoting.quoteExactInput(CLASS.GALA, CLASS.GUSDC, '1');
    return q.outTokenAmount.toString();
  }
  if (symbol === 'ETH') {
    const q = await gswap.quoting.quoteExactInput(CLASS.GWETH, CLASS.GUSDC, '1');
    return q.outTokenAmount.toString();
  }
  throw new Error('Unsupported symbol');
}

// ---------------------- Assets helpers ----------------------
function normalizeTokensShape(j) {
  if (Array.isArray(j?.tokens)) return { tokens: j.tokens, count: j.count ?? j.tokens.length };
  if (Array.isArray(j?.items))  return { tokens: j.items,  count: j.items.length };
  if (Array.isArray(j))         return { tokens: j,        count: j.length };
  return { tokens: [], count: 0 };
}

function addrVariants(ownerNo0x) {
  const m = /^eth\|([a-f0-9]{40})$/.exec(String(ownerNo0x).toLowerCase());
  if (!m) return [];
  const hex = m[1];
  return [
    { key: 'address', value: `eth|${hex}` },
    { key: 'address', value: `eth|0x${hex}` },
    { key: 'address', value: `0x${hex}` },
    { key: 'address', value: hex },
    { key: 'owner',   value: `eth|${hex}` },
    { key: 'owner',   value: `eth|0x${hex}` },
    { key: 'owner',   value: `0x${hex}` },
    { key: 'owner',   value: hex },
  ];
}

async function tryFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

async function fetchAssetsAny(ownerNo0x, page = 1, limit = 100) {
  const candidates = [];
  const av = addrVariants(ownerNo0x);
  for (const a of av) {
    candidates.push(`${GATEWAY_BASE_URL}/api/asset/token-contract/user/assets?${a.key}=${encodeURIComponent(a.value)}&page=${page}&limit=${limit}`);
    candidates.push(`${GATEWAY_BASE_URL}/api/asset/token-contract/assets?${a.key}=${encodeURIComponent(a.value)}&page=${page}&limit=${limit}`);
    candidates.push(`${DEX_BACKEND_BASE_URL}/user/assets?${a.key}=${encodeURIComponent(a.value)}&page=${page}&limit=${limit}`);
  }

  const connectBodies = av.map(a => ({ owner: a.value }));
  const errors = [];

  for (const url of candidates) {
    try {
      const j = await tryFetch(url);
      const norm = normalizeTokensShape(j);
      if (norm.tokens.length >= 0) return { ok: true, via: url, raw: j, norm };
    } catch (e) {
      errors.push({ url, err: String(e?.message || e) });
    }
  }

  for (const body of connectBodies) {
    try {
      const r = await fetch(`${GALACONNECT_BASE_URL}/galachain/api/asset/token-contract/FetchBalances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const arr = Array.isArray(j?.Data) ? j.Data : [];
      const tokens = arr.map(x => ({
        symbol: `${x.collection?.toUpperCase()}`,
        quantity: String(x.quantity ?? '0')
      }));
      return { ok: true, via: `${GALACONNECT_BASE_URL}/galachain/api/asset/token-contract/FetchBalances`, raw: j, norm: { tokens, count: tokens.length } };
    } catch (e) {
      errors.push({ url: `${GALACONNECT_BASE_URL}/galachain/api/asset/token-contract/FetchBalances`, err: String(e?.message || e), body });
    }
  }

  return { ok: false, errors };
}

// Return the three core balances as strings
async function fetchCoreBalances() {
  let data;
  try {
    data = await gswap.assets.getUserAssets(WALLET, 1, 100);
  } catch {
    const out = await fetchAssetsAny(WALLET, 1, 100);
    data = out.ok ? out.norm : { tokens: [] };
  }
  const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
  const bySymbol = new Map(tokens.map(t => [String(t.symbol).toUpperCase(), String(t.quantity)]));

  return {
    GUSDC: bySymbol.get('GUSDC') ?? '0',
    GALA:  bySymbol.get('GALA')  ?? '0',
    GWETH: bySymbol.get('GWETH') ?? '0'
  };
}

// ---------------------- Explorer helpers (tx timestamp) ----------------------
function txMatches(obj, txId) {
  const cand = [obj?.txid, obj?.txId, obj?.hash, obj?.transactionHash, obj?.id];
  return cand.some(v => v && String(v).toLowerCase() === String(txId).toLowerCase());
}

function pickTxTimestamp(hit, blk) {
  // prefer tx timestamp, then block
  const ms = normEpochMs(hit?.timestamp || hit?.time || hit?.date) || normEpochMs(blk?.timestamp || blk?.time || blk?.date);
  return ms || 0;
}

async function explorerLatestHeight(channel) {
  const u = `${EXPLORER_BASE_URL}/height/${encodeURIComponent(channel)}`;
  const j = await tryFetch(u);
  return Number(j?.height ?? j ?? 0);
}

async function explorerBlock(channel, height) {
  const u = `${EXPLORER_BASE_URL}/blocks/${encodeURIComponent(channel)}/${encodeURIComponent(height)}`;
  return tryFetch(u);
}

async function findTxTimestamp(txId, channels) {
  const chans = Array.isArray(channels) && channels.length ? channels : EXPLORER_CHANNELS;
  for (const ch of chans) {
    try {
      let height = await explorerLatestHeight(ch);
      if (!height || !Number.isFinite(height)) continue;

      const max = Math.min(EXPLORER_LOOKBACK, height + 1);
      for (let i = 0; i < max && height - i >= 0; i++) {
        const h = height - i;
        let blk;
        try {
          blk = await explorerBlock(ch, h);
        } catch { continue; }

        const txs = Array.isArray(blk?.transactions)
          ? blk.transactions
          : (Array.isArray(blk?.txs) ? blk.txs : []);

        if (!txs || txs.length === 0) continue;

        const hit = txs.find(t => txMatches(t, txId));
        if (hit) {
          const ts = pickTxTimestamp(hit, blk);
          return { channel: ch, block: h, timestamp: ts, tx: { id: hit?.txid || hit?.txId || hit?.hash || hit?.id } };
        }
      }
    } catch {
      // try next channel
    }
  }
  return null;
}

// ---------------------- Simple in-memory TX log ----------------------
const TX_LOG = []; // newest appended at end; capped to 500 entries
function pushTx(after, meta, tsOverride) {
  const entry = {
    ts: normEpochMs(tsOverride) || Date.now(),
    after: {
      GUSDC: String(after?.GUSDC ?? after?.USDC ?? '0'),
      GALA:  String(after?.GALA  ?? '0'),
      GWETH: String(after?.GWETH ?? after?.WETH ?? '0'),
    },
    meta: meta || {}
  };
  TX_LOG.push(entry);
  if (TX_LOG.length > 500) TX_LOG.splice(0, TX_LOG.length - 500);
  return entry;
}

// ---------------------- Routes ----------------------
app.get('/', (_req, res) => res.json({
  ok: true,
  wallet: WALLET || null,
  swapEnabled: Boolean(PRIVATE_KEY),
  env: {
    gateway: GATEWAY_BASE_URL,
    dexBackend: DEX_BACKEND_BASE_URL,
    bundler: BUNDLER_BASE_URL
  }
}));

app.get('/whoami', (_req, res) => res.json({
  wallet: WALLET || null,
  swapEnabled: Boolean(PRIVATE_KEY)
}));

app.get('/debug', (_req, res) => res.json({
  wallet: WALLET,
  hasPK: Boolean(PRIVATE_KEY),
  pkPreview: maskPK(PRIVATE_KEY),
  gateway: GATEWAY_BASE_URL,
  dexBackend: DEX_BACKEND_BASE_URL,
  bundler: BUNDLER_BASE_URL,
  explorer: { base: EXPLORER_BASE_URL, channels: EXPLORER_CHANNELS, lookback: EXPLORER_LOOKBACK },
  paths: {
    dexContractBasePath: '/api/asset/dexv3-contract',
    tokenContractBasePath: '/api/asset/token-contract',
    bundlingAPIBasePath: '/bundle'
  }
}));

app.get('/prices', async (_req, res) => {
  try {
    const [gala, eth, usdc] = await Promise.all([
      priceInUSDC('GALA'),
      priceInUSDC('ETH'),
      priceInUSDC('USDC'),
    ]);
    res.json({ updatedAt: Date.now(), prices: { GALA: gala, ETH: eth, USDC: usdc } });
  } catch (e) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// UI-friendly assets
app.get('/assets', async (req, res) => {
  try {
    if (!WALLET) return res.status(400).json({ error: 'WALLET_ADDRESS not set or invalid' });

    const strict = req.query.strict === '1';

    let data;
    try {
      data = await gswap.assets.getUserAssets(WALLET, 1, 100);
    } catch (e1) {
      if (strict) return res.status(400).json({ error: e1?.message || String(e1) });
      try {
        const out = await fetchAssetsAny(WALLET, 1, 100);
        if (out.ok) data = out.norm; else data = { tokens: [], count: 0 };
      } catch {
        data = { tokens: [], count: 0 };
      }
    }

    const tokens = Array.isArray(data?.tokens) ? data.tokens : [];
    const bySymbol = new Map(tokens.map(t => [String(t.symbol).toUpperCase(), String(t.quantity)]));

    const MUST_INCLUDE = ['GUSDC', 'GALA', 'GWETH'];
    const ensured = MUST_INCLUDE.map(sym => ({ symbol: sym, quantity: bySymbol.get(sym) ?? '0' }));

    const extras = tokens
      .filter(t => !MUST_INCLUDE.includes(String(t.symbol).toUpperCase()))
      .map(t => ({ symbol: String(t.symbol), quantity: String(t.quantity) }));

    res.json({ wallet: WALLET, tokens: [...ensured, ...extras] });
  } catch (e) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// ---------------------- Transactions ----------------------
app.get('/txs', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const doSeed = (req.query.seed ?? '1') !== '0'; // default seed on
    if (doSeed && TX_LOG.length === 0) {
      try {
        const after = await fetchCoreBalances();
        pushTx(after, { seeded: true });
      } catch { /* ignore seed failure */ }
    }
    const out = TX_LOG.slice(-limit).reverse();
    res.json({ wallet: WALLET || null, count: out.length, txs: out });
  } catch (e) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// Look up a transaction's timestamp via explorer
app.get('/tx-time', async (req, res) => {
  try {
    const txId = String(req.query.txId || req.query.hash || '').trim();
    const channels = String(req.query.channels || '').trim()
      ? String(req.query.channels).split(',').map(s => s.trim()).filter(Boolean) : EXPLORER_CHANNELS;

    if (!txId) return res.status(400).json({ error: 'txId required' });

    const found = await findTxTimestamp(txId, channels);
    if (!found) return res.status(404).json({ error: 'timestamp not found', txId, channels });

    res.json({ txId, ...found });
  } catch (e) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// ---------------------- Quote / Swap ----------------------
app.post('/quote', async (req, res) => {
  const { tokenIn, tokenOut, amountIn, fee } = req.body || {};
  try {
    const q = await gswap.quoting.quoteExactInput(tokenIn, tokenOut, String(amountIn), fee);
    res.json({ out: q.outTokenAmount.toString(), feeTier: q.feeTier, priceImpact: q.priceImpact });
  } catch (e) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

app.post('/swap', async (req, res) => {
  if (!PRIVATE_KEY) return res.status(400).json({ error: 'PRIVATE_KEY not set; /swap disabled' });
  const { tokenIn, tokenOut, fee, exactIn, amountOutMinimum, wallet } = req.body || {};
  try {
    const chosenWallet = wallet ? normalizeWalletNo0x(wallet) : WALLET;
    if (!chosenWallet) return res.status(400).json({ error: 'Invalid wallet format; expected eth|<40-hex>' });

    const tx = await gswap.swaps.swap(
      tokenIn,
      tokenOut,
      fee,
      { exactIn: String(exactIn), amountOutMinimum: String(amountOutMinimum) },
      chosenWallet
    );
    const done = await tx.wait();

    // Determine the best timestamp: SDK object or Explorer lookup
    let txTs = extractTxTimestamp(done);
    if (!txTs && done?.txId) {
      try {
        const found = await findTxTimestamp(done.txId);
        if (found?.timestamp) txTs = found.timestamp;
      } catch {/* ignore */}
    }

    // Snapshot balances and log with timestamp (fallback to now if none)
    try {
      const after = await fetchCoreBalances();
      pushTx(after, { txId: done.txId, hash: done.transactionHash }, txTs);
    } catch (eSnap) {
      console.warn('Swap completed but failed to snapshot balances:', String(eSnap?.message || eSnap));
    }

    res.json({ txId: done.txId, hash: done.transactionHash, timestamp: txTs || Date.now() });
  } catch (e) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// ---------------------- Serverless export ----------------------
module.exports.handler = serverless(app);
