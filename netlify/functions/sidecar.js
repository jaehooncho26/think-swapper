// netlify/functions/sidecar.js
// Serverless version for Netlify Functions (path: /.netlify/functions/sidecar/*)

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');
const serverless = require('serverless-http'); // <-- keep only this one

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

// ---------------------- Env ----------------------
const RAW_WALLET = process.env.WALLET_ADDRESS || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

const GATEWAY_BASE_URL     = process.env.GATEWAY_BASE_URL     || 'https://gateway-mainnet.galachain.com';
const DEX_BACKEND_BASE_URL = process.env.DEX_BACKEND_BASE_URL || 'https://dex-backend-prod1.defi.gala.com';
const BUNDLER_BASE_URL     = process.env.BUNDLER_BASE_URL     || 'https://bundle-backend-prod1.defi.gala.com';
const GALACONNECT_BASE_URL = process.env.GALACONNECT_BASE_URL || 'https://api-galaswap.gala.com';

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

// ---------------------- Helpers (prices) ----------------------
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

// ---------------------- Assets Fallback ----------------------
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

function normalizeTokensShape(j) {
  if (Array.isArray(j?.tokens)) return { tokens: j.tokens, count: j.count ?? j.tokens.length };
  if (Array.isArray(j?.items))  return { tokens: j.items,  count: j.items.length };
  if (Array.isArray(j))         return { tokens: j,        count: j.length };
  return { tokens: [], count: 0 };
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

app.get('/assets/raw', async (_req, res) => {
  try {
    if (!WALLET) return res.status(400).json({ error: 'WALLET_ADDRESS not set or invalid' });

    try {
      const data = await gswap.assets.getUserAssets(WALLET, 1, 100);
      return res.json({ walletTried: WALLET, raw: data, via: 'sdk' });
    } catch (_e1) {
      const out = await fetchAssetsAny(WALLET, 1, 100);
      if (out.ok) return res.json({ walletTried: WALLET, raw: out.raw, via: out.via });
      return res.status(404).json({ error: 'No assets route succeeded', attempts: out.errors });
    }
  } catch (e) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

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
    res.json({ txId: done.txId, hash: done.transactionHash });
  } catch (e) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// ---------------------- Serverless export ----------------------
module.exports.handler = serverless(app);
