# the think swapper

A lightweight GalaSwap trading bot + dashboard.
Shows wallet balances, live prices, and recent swaps, and can run an hourly trading loop that executes small, controlled swaps based on simple signals.

# Live

Site: https://itsgoodtothink.com
API base: https://itsgoodtothink.com/.netlify/functions/sidecar

# What It Does

   Tracks GUSDC / GALA / GWETH balances.
   Quotes live prices via GalaSwap (GALA→USDC, WETH→USDC).
   Logs swaps and shows after-trade balances and a total value for each transaction.
   Resolves real on-chain timestamps for swaps when a txId is available.
   (Optional) Executes swaps with a private key (bot mode).

# Intended Use

   A transparent, low-maintenance bot to probe edges hourly (momentum, mean-reversion, small route arb) with    strict risk caps.
   A public dashboard for balance/price/tx visibility.
   A stepping stone: start read-only, later enable automated trades.

# Architecture
   /
   ├─ index.html                  # UI (static)
   └─ netlify/
      └─ functions/
         └─ sidecar.js           # Serverless Express API (serverless-http)

         Frontend polls /prices, /assets, and /txs.
         Sidecar API wraps @gala-chain/gswap-sdk, provides price/asset endpoints, swap, and a tx timestamp             helper.

   Core endpoints
      GET /prices → { prices: { GALA, ETH, USDC } }
      GET /assets → { tokens: [ {symbol, quantity}, ... ] }
      GET /txs → recent in-memory tx snapshots (after-balances, time, ids)
      GET /tx-time?txId=... → on-chain timestamp lookup
      POST /swap → executes a swap (requires PRIVATE_KEY)

# Bot Strategy (hourly)

   Signals
      EMA filter — smooths price input (parameter: EMA_ALPHA)
      Momentum — trade with the drift if abs Δp > MOMENTUM_TH
      Mean Reversion — fade the move if |price − EMA| > MEANREV_TH
      (Optional) Route Arbitrage — probe fixed route (e.g., USDC→GALA→WETH→USDC) and act if expected P&L > ARB_MIN_PROFIT_BPS

   Risk & execution
      Trade sizing: BASE_TRADE_USD up to MAX_TRADE_USD
      Slippage cap: SLIPPAGE_BPS (e.g., 50 = 0.50%)
      Dry-run: set DRY_RUN=true to simulate without sending
      Quote first, then commit: use GalaSwap quotes, verify price impact ≤ cap, then submit

# Pseudocode
every hour:
  p = quoted prices (GALA->USDC, WETH->USDC)
  ema = update_ema(p, EMA_ALPHA)
  mom = (p - p_prev)/p_prev
  dev = (p - ema)/ema

  if |mom| > MOMENTUM_TH:   direction = sign(mom)
  else if |dev| > MEANREV_TH: direction = -sign(dev)
  else: skip

  size = clamp(BASE_TRADE_USD, MAX_TRADE_USD)
  quote path for 'direction', check price_impact <= SLIPPAGE_BPS
  if ok and not DRY_RUN: POST /swap
  record snapshot

# Environment Variables

Required
   WALLET_ADDRESS=eth|<40-hex>     # no "0x" after the pipe


Optional (defaults are sane)
   PRIVATE_KEY=0x...               # omit for read-only (no swaps)
   GATEWAY_BASE_URL=https://gateway-mainnet.galachain.com
   DEX_BACKEND_BASE_URL=https://dex-backend-prod1.defi.gala.com
   BUNDLER_BASE_URL=https://bundle-backend-prod1.defi.gala.com
   GALACONNECT_BASE_URL=https://api-galaswap.gala.com
   
   EXPLORER_BASE_URL=https://explorer-api.galachain.com/v1/explorer
   EXPLORER_CHANNELS=asset,dex
   EXPLORER_LOOKBACK=1500


Bot tuning (for your scheduled runner)
   BOT_INTERVAL_MIN=60
   DRY_RUN=false
   SLIPPAGE_BPS=50
   BASE_TRADE_USD=2
   MAX_TRADE_USD=25

   EMA_ALPHA=0.2
   MOMENTUM_TH=0.004
   MEANREV_TH=0.006

   ARB_PATH=USDC-GALA-WETH-USDC
   ARB_START_USD=3
   ARB_MIN_PROFIT_BPS=30

# Local Dev
npm i -g netlify-cli
netlify dev

   UI: http://localhost:8888
   API: http://localhost:8888/.netlify/functions/sidecar

Quick tests
   curl -s localhost:8888/.netlify/functions/sidecar/prices | jq
   curl -s localhost:8888/.netlify/functions/sidecar/assets | jq
   curl -s "localhost:8888/.netlify/functions/sidecar/txs?limit=10&seed=0" | jq

# Deploy (Netlify)

   Publish directory: /
   Functions directory: netlify/functions
   Build command: (leave empty)

Set env vars in Site settings → Environment variables, then deploy.

# UI Details

Balances and live prices refresh on timers.
Transactions show:
   Time (local or a fixed TZ in index.html)
   After-trade balances (USDC, GALA, ETH)
   Total value at the time when available; otherwise an ≈approx using current prices.
   If a tx row has a txId, the UI calls /tx-time to resolve the on-chain time.

Note: tx history is in-memory in the function. For durability, plug in KV/DB and persist rows after swaps.

