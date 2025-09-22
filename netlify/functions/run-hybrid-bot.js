const { spawn } = require('child_process');
const path = require('path');

exports.handler = async () => {
  const script = path.join(process.cwd(), 'hybrid-bot.js');

  return new Promise((resolve) => {
    const child = spawn('node', [script, 'cron'], {
      cwd: process.cwd(),
      env: { ...process.env, DRY_RUN: process.env.DRY_RUN ?? 'true' },
    });

    let out = '', err = '';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    child.on('close', (code) => {
      resolve({
        statusCode: code === 0 ? 200 : 500,
        body: (code === 0 ? out : err) || `exit ${code}`,
      });
    });
  });
};
