// netlify/functions/one-cent-gala-to-usdc.js
const { spawn } = require('child_process');
const path = require('path');

exports.handler = async () => {
  const script = path.join(process.cwd(), 'bot.js'); // your file at repo root
  return new Promise((resolve) => {
    const p = spawn('node', [script, 'once'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Defaults for safety; override in Netlify env if needed
        DRY_RUN: process.env.DRY_RUN ?? 'true',     // keep true until you’re ready
        BOT_INTERVAL_MIN: '10',                     // irrelevant in 'once' mode, but fine
        BOT_USD_CENTS: process.env.BOT_USD_CENTS ?? '1', // 1 cent per tick
        SLIPPAGE_BPS: process.env.SLIPPAGE_BPS ?? '100',
      },
    });

    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('close', code => resolve({
      statusCode: code === 0 ? 200 : 500,
      body: (code === 0 ? out : err) || `exit ${code}`,
    }));
  });
};
