// GalaSwap fee-tier arbitrage bot (TypeScript)
// One-file version with DRY_RUN and resilient wait
// Requires: Node 18+, packages @gala-chain/gswap-sdk dotenv bignumber.js ts-node typescript
// Tip: set "esModuleInterop": true in tsconfig for the BigNumber default import.

import 'dotenv/config';
import BigNumber from 'bignumber.js';
import { GSwap, PrivateKeySigner, FEE_TIER } from '@gala-chain/gswap-sdk';

// ---- ENV & Config ----
const PRIVATE_KEY = process.env.PRIVATE_KEY!; // 0x...
const WALLET = process.env.WALLET_ADDRESS!;   // e.g., "eth|0xabc..."

const TOKEN_IN  = process.env.TOKEN_IN  || 'GALA|Unit|none|none';
const TOKEN_OUT = process.env.TOKEN_OUT || 'GUSDC|Unit|none|none';

const AMOUNT_IN  = new BigNumber(process.env.AMOUNT_IN  || '100');
const MIN_PROFIT = new BigNumber(process.env.MIN_PROFIT_IN_TOKEN || '0.5');
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS || '100'); // 100 = 1%
const DRY_RUN = String(process.env.DRY_RUN || 'false').toLowerCase() === 'true';

// DEX fee tiers to test (0.05%, 0.30%, 1.00%)
const FEES = [FEE_TIER.PERCENT_00_05, FEE_TIER.PERCENT_00_30, FEE_TIER.PERCENT_01_00];

function minusBps(x: BigNumber, bps: number) {
  return x.multipliedBy(new BigNumber(10_000 - bps)).dividedBy(10_000).decimalPlaces(0);
}

// Resilient wait: try wait(); on timeout, listen to socket events
async function resilientWait(pendingTx: any, timeoutMs = 45000) {
  try {
    return await pendingTx.wait();
  } catch (err) {
    const txId = pendingTx.transactionId;
    console.warn('wait() timed out; falling back to socket. txId=', txId);
    await GSwap.events.connectEventSocket();
    return await new Promise((resolve, reject) => {
      const socket: any = GSwap.events;
      const timer = setTimeout(() => {
        socket.off?.('transaction', onTx);
        reject(new Error('socket wait timeout'));
      }, timeoutMs);
      function onTx(id: string, resp: any) {
        if (id !== txId) return;
        socket.off?.('transaction', onTx);
        clearTimeout(timer);
        if (resp?.status === 'PROCESSED') resolve(resp);
        else reject(new Error(resp?.error || `tx ${id} failed`));
      }
      socket.on?.('transaction', onTx);
    });
  }
}

async function main() {
  // 1) Initialize SDK with signer for write operations (swaps)
  const gswap = new GSwap({ signer: new PrivateKeySigner(PRIVATE_KEY), walletAddress: WALLET });

  // 2) Connect event socket so tx.wait() can confirm on-chain
  await GSwap.events.connectEventSocket();
  console.log('Connected to bundler socket:', (GSwap as any).bundlerSocketUrl || 'default');
  console.log('Event socket connected:', GSwap.events.eventSocketConnected());
  if (DRY_RUN) console.log('🧪 DRY_RUN=true — swaps will be simulated/logged only.');

  // 3) Polling loop
  while (true) {
    try {
      // Gather candidate round-trips across fee tiers
      const cands: { feeA: number; feeB: number; leg1Out: BigNumber; outBack: BigNumber }[] = [];
      for (const feeA of FEES) {
        try {
          // Quote leg 1: TOKEN_IN -> TOKEN_OUT on feeA
          const q1 = await gswap.quoting.quoteExactInput(TOKEN_IN, TOKEN_OUT, AMOUNT_IN.toFixed(), feeA);

          for (const feeB of FEES) {
            if (feeB === feeA) continue; // must be different tier for intra-pair arb
            try {
              // Quote leg 2: TOKEN_OUT -> TOKEN_IN on feeB
              const q2 = await gswap.quoting.quoteExactInput(TOKEN_OUT, TOKEN_IN, q1.outTokenAmount, feeB);
              cands.push({ feeA, feeB, leg1Out: q1.outTokenAmount, outBack: q2.outTokenAmount });
            } catch {}
          }
        } catch {}
      }

      if (!cands.length) {
        console.log('No fee-tier combos found (pools may not exist). Sleeping…');
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }

      // Pick best round-trip by maximum amount returned to TOKEN_IN
      cands.sort((a, b) => b.outBack.minus(a.outBack).toNumber());
      const [best] = cands;
      if (!best) { await new Promise(r=>setTimeout(r, 3000)); continue; }

      const profit = best.outBack.minus(AMOUNT_IN);
      console.log(`Best ${best.feeA}→${best.feeB}: back=${best.outBack.toString()} profit=${profit.toString()} (${TOKEN_IN.split('|')[0]})`);

      // 4) Execute if profitable after threshold
      if (profit.isGreaterThan(MIN_PROFIT)) {
        console.log('Threshold met — executing two legs with slippage protection…');

        if (DRY_RUN) {
          console.log('🧪 DRY RUN: would execute', {
            feeA: best.feeA, feeB: best.feeB,
            amountIn: AMOUNT_IN.toFixed(),
            leg1Min: minusBps(best.leg1Out, SLIPPAGE_BPS).toFixed()
          });
          await new Promise(r=>setTimeout(r, 1500));
          continue;
        }

        // Leg 1: IN -> OUT on feeA (with amountOutMinimum)
        const minOut1 = minusBps(best.leg1Out, SLIPPAGE_BPS);
        const leg1 = await gswap.swaps.swap(
          TOKEN_IN,
          TOKEN_OUT,
          best.feeA,
          { exactIn: AMOUNT_IN.toFixed(), amountOutMinimum: minOut1.toFixed() },
          WALLET
        );
        console.log('leg1 submitted. txId=', leg1.transactionId);
        const leg1Done = await resilientWait(leg1, 45000);
        console.log('leg1 processed:', leg1Done);

        // Re-quote based on conservative amount actually targeted for leg1
        const q2Min = await gswap.quoting.quoteExactInput(TOKEN_OUT, TOKEN_IN, minOut1.toFixed(), best.feeB);
        const minOut2 = minusBps(q2Min.outTokenAmount, SLIPPAGE_BPS);

        // Leg 2: OUT -> IN on feeB
        const leg2 = await gswap.swaps.swap(
          TOKEN_OUT,
          TOKEN_IN,
          best.feeB,
          { exactIn: minOut1.toFixed(), amountOutMinimum: minOut2.toFixed() },
          WALLET
        );
        console.log('leg2 submitted. txId=', leg2.transactionId);
        const leg2Done = await resilientWait(leg2, 45000);
        console.log('leg2 processed:', leg2Done);
      }
    } catch (e: any) {
      console.error('Loop error:', e?.message || e);
      await new Promise(r=>setTimeout(r, 5000));
    }

    // small delay to avoid hammering
    await new Promise((r) => setTimeout(r, 2500));
  }
}

main()
  .catch((e) => console.error('Fatal error:', e))
  .finally(() => GSwap.events.disconnectEventSocket());
