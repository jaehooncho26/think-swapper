// sidecar.js — CommonJS server that powers your frontend
// Run: node sidecar.js

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();
const { GSwap, PrivateKeySigner } = require('@gala-chain/gswap-sdk');

// ---------------------- Helpers ----------------------
function splitEthBar(w) {
  if (!w) return { ok: false };
  const s = String(w).trim().replace(/^"+|"+$/g, ''); // strip stray quotes
  const [prefix, rest] = s.split('|');
  if (!prefix || !rest) return { ok: false };
  return { ok: true, prefix, rest };
}

// Normalize to GalaChain’s no-0x style: eth|<40-hex>
function normalizeWalletNo0x(w) {
  const sp = splitEthBar(w);
  if (!sp.ok) return '';
  const prefix = String(sp.prefix).trim().toLowerCase();
  let hex = String(sp.rest).trim().replace(/^0x/i, '').toLowerCase(); // strip 0x if present
  hex = hex.slice(0, 40); // guard against extra chars
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
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const RAW_WALLET = process.env.WALLET_ADDRESS || '';
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';

const GATEWAY_BASE_URL     = process.env.GATEWAY_BASE_URL     || 'https://gateway-mainnet.galachain.com';
const DEX_BACKEND_BASE_URL = process.env.DEX_BACKEND_BASE_URL || 'https://dex-backend-prod1.defi.gala.com';
const BUNDLER_BASE_URL     = process.env.BUNDLER_BASE_URL     || 'https://bundle-backend-prod1.defi.gala.com';
const GALACONNECT_BASE_URL = process.env.GALACONNECT_BASE_URL || 'https://api-galaswap.gala.com'; // read-only balances API

// ---------------------- Normalize wallet (no 0x) ----------------------
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

// ---------------------- Init SDK (single declaration) ----------------------
const sdkOpts = { walletAddress: WALLET };
if (PRIVATE_KEY) sdkOpts.signer = new PrivateKeySigner(PRIVATE_KEY);

// Named URLs
sdkOpts.gatewayBaseUrl     = GATEWAY_BASE_URL;
sdkOpts.dexBackendBaseUrl  = DEX_BACKEND_BASE_URL;
sdkOpts.bundlerBaseUrl     = BUNDLER_BASE_URL;

// IMPORTANT: prod uses contract API prefixes; without these you’ll hit /user/assets at root -> 400
sdkOpts.dexContractBasePath   = '/api/asset/dexv3-contract';
sdkOpts.tokenContractBasePath = '/api/asset/token-contract';
sdkOpts.bundlingAPIBasePath   = '/bundle';

const gswap = new GSwap(sdkOpts); // <— exactly once

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

// ---------------------- Assets Fallback (smart multi-host, multi-address) ----------------------
function addrVariants(ownerNo0x) {
  const m = /^eth\|([a-f0-9]{40})$/.exec(String(ownerNo0x).toLowerCase());
  if (!m) return [];
  const hex = m[1];
  return [
    { key: 'address', value: `eth|${hex}` },        // eth|no0x
    { key: 'address', value: `eth|0x${hex}` },      // eth|0x
    { key: 'address', value: `0x${hex}` },          // 0x
    { key: 'address', value: hex },                 // bare hex
    { key: 'owner',   value: `eth|${hex}` },        // try owner param name
    { key: 'owner',   value: `eth|0x${hex}` },
    { key: 'owner',   value: `0x${hex}` },
    { key: 'owner',   value: hex },
  ];
}

async function tryFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  return j;
}

function normalizeTokensShape(j) {
  // Accept { tokens: [...] } directly
  if (Array.isArray(j?.tokens)) return { tokens: j.tokens, count: j.count ?? j.tokens.length };
  // Accept { items: [...] }
  if (Array.isArray(j?.items)) return { tokens: j.items, count: j.items.length };
  // Accept plain array
  if (Array.isArray(j)) return { tokens: j, count: j.length };
  return { tokens: [], count: 0 };
}

async function fetchAssetsAny(ownerNo0x, page = 1, limit = 100) {
  const candidates = [];
  const av = addrVariants(ownerNo0x);
  for (const a of av) {
    // Gateway token-contract (legacy)
    candidates.push(`${GATEWAY_BASE_URL}/api/asset/token-contract/user/assets?${a.key}=${encodeURIComponent(a.value)}&page=${page}&limit=${limit}`);
    candidates.push(`${GATEWAY_BASE_URL}/api/asset/token-contract/assets?${a.key}=${encodeURIComponent(a.value)}&page=${page}&limit=${limit}`);
    // Dex backend (SDK)
    candidates.push(`${DEX_BACKEND_BASE_URL}/user/assets?${a.key}=${encodeURIComponent(a.value)}&page=${page}&limit=${limit}`);
  }

  // GalaConnect (current public API) — POST /galachain/api/{channel}/token-contract/FetchBalances
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

  // Try GalaConnect POST (asset channel)
  for (const body of connectBodies) {
    try {
      const r = await fetch(`${GALACONNECT_BASE_URL}/galachain/api/asset/token-contract/FetchBalances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      // Response shape: { Data: [ { collection, category, type, additionalKey, quantity, ... } ] }
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

// Raw passthrough to inspect asset response (SDK -> fallback)
app.get('/assets/raw', async (_req, res) => {
  try {
    if (!WALLET) return res.status(400).json({ error: 'WALLET_ADDRESS not set or invalid' });

    // 1) Try SDK first
    try {
      const data = await gswap.assets.getUserAssets(WALLET, 1, 100);
      return res.json({ walletTried: WALLET, raw: data, via: 'sdk' });
    } catch (_e1) {
      // 2) Smart fallback across hosts & param styles
      const out = await fetchAssetsAny(WALLET, 1, 100);
      if (out.ok) return res.json({ walletTried: WALLET, raw: out.raw, via: out.via });
      return res.status(404).json({ error: 'No assets route succeeded', attempts: out.errors });
    }
  } catch (e) {
    res.status(400).json({ error: e?.message || String(e) });
  }
});

// UI-friendly assets
app.get('/assets', async (req, res) => {
  try {
    if (!WALLET) return res.status(400).json({ error: 'WALLET_ADDRESS not set or invalid' });

    const strict = req.query.strict === '1'; // default non-strict

    // Step 1: SDK
    let data;
    try {
      data = await gswap.assets.getUserAssets(WALLET, 1, 100);
    } catch (e1) {
      if (strict) return res.status(400).json({ error: e1?.message || String(e1) });
      // Step 2: smart fallback
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

app.listen(PORT, () => {
  console.log(`🚀 Sidecar running at http://localhost:${PORT}`);
  console.log(`🔎 Wallet:        ${WALLET || '(none)'} ${WALLET && validEthNamespaceNo0x(WALLET) ? '(valid)' : '(INVALID)'}`);
  console.log(`🌐 Gateway:       ${GATEWAY_BASE_URL}`);
  console.log(`🌐 DexBackend:    ${DEX_BACKEND_BASE_URL}`);
  console.log(`🌐 Bundler:       ${BUNDLER_BASE_URL}`);
  if (PRIVATE_KEY) console.log(`🔐 Signer:        present (${maskPK(PRIVATE_KEY)})`);
});
