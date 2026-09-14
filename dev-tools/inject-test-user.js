#!/usr/bin/env node
const puppeteer = require('puppeteer');

function parseArgs() {
  const raw = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (r.startsWith('--')) {
      const key = r.slice(2);
      const val = raw[i + 1] && !raw[i + 1].startsWith('--') ? raw[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

(async () => {
  const args = parseArgs();
  const host = args.url || 'http://localhost:5173';
  const path = args.path || '/';
  const screen = args.screen || 'employees';
  const userId = args.userId || 'test-view-user';
  const username = args.username || 'TESTUSR';
  const name = args.name || 'Teste View';

  const target = `${host.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;

  const user = {
    id: userId,
    username: username,
    name: name,
    role: 'Usuario',
    initials: (name.split(' ').map(p => p[0]).slice(0,2).join('') || 'TV').toUpperCase(),
    employeeId: null,
    isAdmin: false,
    permissions: [
      {
        id: `${userId}-${screen}`,
        userId: userId,
        screen: screen,
        actions: ['view'],
        updatedAt: new Date().toISOString(),
      },
    ],
  };

  console.log('Launching browser and opening', target);

  const browser = await puppeteer.launch({ headless: false, args: ['--start-maximized'] });
  const [page] = await browser.pages();
  try {
    // Open the app page to ensure the origin is reachable
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});

    // Inject localStorage item
    await page.evaluate((key, value) => {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        return false;
      }
    }, 'macro-dp:user', JSON.stringify(user));

    console.log('Injected test user into localStorage as macro-dp:user');

    // Reload the page so the app picks up the stored user
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});

    console.log('Opened app with test user. Browser left open for inspection.');
  } catch (err) {
    console.error('Error during injection:', err);
    await browser.close();
    process.exit(1);
  }
})();
