let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('../../.e2e-runtime/ui-runner/node_modules/playwright'));
}

const OFFICIAL_PATTERNS = [
  'pandawiki.docs.baizhi.cloud',
  'release.baizhi.cloud',
  'sentry.baizhi.cloud',
  'baizhi.cloud/consult',
  'bbs.baizhi.cloud',
  'pandawiki.qa.baizhi.cloud',
  'github.com/chaitin/PandaWiki',
  'ly.safepoint.cloud',
  'model-square.app.baizhi.cloud/token',
];
const OFFICIAL_TEXT = [
  '帮助文档',
  '在线支持',
  '微信交流群',
  '企业微信交流群',
  '社区论坛',
  '官方论坛',
  '商务咨询',
  '立即更新',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 }, ignoreHTTPSErrors: true });
  const officialRequests = [];
  page.on('request', req => {
    const url = req.url();
    if (OFFICIAL_PATTERNS.some(p => url.includes(p))) officialRequests.push(url);
  });

  await page.goto('https://127.0.0.1:2443/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('账号').fill('admin');
  await page.getByPlaceholder('密码').fill('PandaWiki_Production_Password_Replace_Me');
  await page.getByRole('button', { name: /登录/ }).click();
  await page.waitForURL(/2443\/?(\?.*)?$/, { timeout: 30000 });
  await page.waitForTimeout(1000);

  const adminUrls = [
    'https://127.0.0.1:2443/',
    'https://127.0.0.1:2443/setting?tab=mcp',
    'https://127.0.0.1:2443/setting?tab=ai',
    'https://127.0.0.1:2443/setting?tab=access',
    'https://127.0.0.1:2443/doc',
  ];
  const pageResults = [];
  for (const url of adminUrls) {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const snapshot = await page.evaluate(({ OFFICIAL_PATTERNS, OFFICIAL_TEXT }) => {
      const text = document.body.innerText || '';
      const hrefs = [...document.querySelectorAll('a[href]')].map(a => a.href);
      return {
        textHits: OFFICIAL_TEXT.filter(t => text.includes(t)),
        hrefHits: hrefs.filter(h => OFFICIAL_PATTERNS.some(p => h.includes(p))),
        hrefs,
      };
    }, { OFFICIAL_PATTERNS, OFFICIAL_TEXT });
    pageResults.push({ url, ...snapshot });
  }

  await page.goto('http://127.0.0.1:8011/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const wikiResult = await page.evaluate(({ OFFICIAL_PATTERNS, OFFICIAL_TEXT }) => {
    const text = document.body.innerText || '';
    const hrefs = [...document.querySelectorAll('a[href]')].map(a => a.href);
    const imgs = [...document.querySelectorAll('img[src]')].map(img => img.src);
    return {
      textHits: OFFICIAL_TEXT.filter(t => text.includes(t)),
      hrefHits: hrefs.filter(h => OFFICIAL_PATTERNS.some(p => h.includes(p))),
      imgHits: imgs.filter(src => OFFICIAL_PATTERNS.some(p => src.includes(p))),
      statusText: text.slice(0, 200),
    };
  }, { OFFICIAL_PATTERNS, OFFICIAL_TEXT });

  const failures = [];
  for (const r of pageResults) {
    if (r.textHits.length || r.hrefHits.length) failures.push({ type: 'admin', url: r.url, textHits: r.textHits, hrefHits: r.hrefHits });
  }
  if (wikiResult.textHits.length || wikiResult.hrefHits.length || wikiResult.imgHits.length) failures.push({ type: 'wiki', ...wikiResult });
  if (officialRequests.length) failures.push({ type: 'network', officialRequests });

  const report = { ok: failures.length === 0, failures, pageResults: pageResults.map(({ url, textHits, hrefHits }) => ({ url, textHits, hrefHits })), wikiResult, officialRequests };
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  if (!report.ok) process.exit(1);
})();

