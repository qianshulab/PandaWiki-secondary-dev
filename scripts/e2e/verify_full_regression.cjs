/* eslint-disable no-console */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('../../.e2e-runtime/ui-runner/node_modules/playwright'));
}

const fs = require('node:fs');
const path = require('node:path');

const ADMIN_URL = process.env.PANDAWIKI_ADMIN_URL || 'https://127.0.0.1:2443';
const WIKI_URL = process.env.PANDAWIKI_WIKI_URL || 'http://127.0.0.1:8011/';
const ADMIN_USER = process.env.PANDAWIKI_ADMIN_USER || 'admin';
const ADMIN_PASSWORD =
  process.env.PANDAWIKI_ADMIN_PASSWORD || 'PandaWiki_Production_Password_Replace_Me';
const REPORT_DIR = process.env.PANDAWIKI_REPORT_DIR || 'reports';

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

const CRITICAL_CONSOLE_RE =
  /Hydration failed|Recoverable Error|Minified React error|Unhandled Runtime Error|ReferenceError|TypeError:|Cannot read properties/i;

const adminPages = [
  { label: 'admin.home', url: `${ADMIN_URL}/` },
  { label: 'admin.docs', url: `${ADMIN_URL}/doc` },
  { label: 'admin.stats', url: `${ADMIN_URL}/stat` },
  { label: 'admin.contribution', url: `${ADMIN_URL}/contribution` },
  { label: 'admin.conversation', url: `${ADMIN_URL}/conversation` },
  { label: 'admin.feedback', url: `${ADMIN_URL}/feedback` },
  { label: 'admin.release', url: `${ADMIN_URL}/release` },
];

const featurePages = [
  {
    label: 'settings.portal',
    url: `${ADMIN_URL}/setting?tab=portal-website`,
    mustContain: ['智能问答版权信息', '版权文字', '自定义代码', '统计分析'],
  },
  {
    label: 'settings.robot',
    url: `${ADMIN_URL}/setting?tab=robot`,
    mustContain: [
      '网页挂件机器人',
      '问答机器人 API',
      '钉钉机器人',
      '企业微信机器人',
      '飞书机器人',
      'Discord 机器人',
    ],
  },
  {
    label: 'settings.ai',
    url: `${ADMIN_URL}/setting?tab=ai-setting`,
    mustContain: ['智能问答提示词', '智能摘要提示词', '重置为默认提示词'],
  },
  {
    label: 'settings.security',
    url: `${ADMIN_URL}/setting?tab=security`,
    mustContain: ['水印开关', '显性水印', '隐形水印', '不做限制', '增加内容尾巴', '禁止复制内容'],
  },
  {
    label: 'settings.access',
    url: `${ADMIN_URL}/setting?tab=backend-info`,
    mustContain: ['Wiki 站管理员', 'API Token', '创建 API Token'],
  },
  {
    label: 'settings.mcp',
    url: `${ADMIN_URL}/setting?tab=mcp`,
    mustContain: ['MCP Server', '启用', '禁用'],
  },
];

function ensureReportDir() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function addPageWatchers(page, sink, officialRequests) {
  page.on('console', msg => {
    const text = msg.text();
    if (OFFICIAL_PATTERNS.some(p => text.includes(p))) {
      officialRequests.push({ type: 'console', text, url: page.url() });
    }
    if (msg.type() === 'error' && CRITICAL_CONSOLE_RE.test(text)) {
      sink.push({ type: 'console', level: msg.type(), text, url: page.url() });
    }
  });
  page.on('pageerror', err => {
    const text = err?.message || String(err);
    if (CRITICAL_CONSOLE_RE.test(text)) {
      sink.push({ type: 'pageerror', text, url: page.url() });
    }
  });
  page.on('request', req => {
    const url = req.url();
    if (OFFICIAL_PATTERNS.some(p => url.includes(p))) {
      officialRequests.push({ type: 'request', url, page: page.url() });
    }
  });
}

async function pageSnapshot(page) {
  return page.evaluate(
    ({ OFFICIAL_PATTERNS, OFFICIAL_TEXT }) => {
      const text = document.body?.innerText || '';
      const hrefs = [...document.querySelectorAll('a[href]')].map(a => a.href);
      const imgs = [...document.querySelectorAll('img[src]')].map(img => img.src);
      return {
        text,
        textHits: OFFICIAL_TEXT.filter(t => text.includes(t)),
        hrefHits: hrefs.filter(h => OFFICIAL_PATTERNS.some(p => h.includes(p))),
        imgHits: imgs.filter(src => OFFICIAL_PATTERNS.some(p => src.includes(p))),
      };
    },
    { OFFICIAL_PATTERNS, OFFICIAL_TEXT },
  );
}

async function visitAndCheck(page, item, failures) {
  const response = await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(900);
  const snapshot = await pageSnapshot(page);
  const title = await page.title();
  const finalUrl = page.url();
  const status = response?.status() || 0;
  const bizCount = await page.locator('text=商业版可用').count().catch(() => 0);
  const proMaskCount = await page.locator('text=专业版可用').count().catch(() => 0);

  const pageFailures = [];
  if (status >= 500 || snapshot.text.includes('Internal Server Error')) {
    pageFailures.push(`HTTP/page error: ${status}`);
  }
  if (/型号\s*开源版/.test(snapshot.text)) {
    pageFailures.push('version badge fell back to open-source edition');
  }
  if (snapshot.textHits.length || snapshot.hrefHits.length || snapshot.imgHits.length) {
    pageFailures.push('official link/text residue');
  }
  if (item.mustContain) {
    const missing = item.mustContain.filter(t => !snapshot.text.includes(t));
    if (missing.length) pageFailures.push(`missing expected text: ${missing.join(', ')}`);
    if (bizCount || proMaskCount) {
      pageFailures.push(`feature mask still visible: biz=${bizCount}, pro=${proMaskCount}`);
    }
  }

  if (pageFailures.length) {
    failures.push({
      label: item.label,
      url: item.url,
      finalUrl,
      status,
      pageFailures,
      textHits: snapshot.textHits,
      hrefHits: snapshot.hrefHits,
      imgHits: snapshot.imgHits,
      excerpt: snapshot.text.slice(0, 500),
    });
  }

  return {
    label: item.label,
    url: item.url,
    finalUrl,
    status,
    title,
    bizCount,
    proMaskCount,
    textHits: snapshot.textHits,
    hrefHits: snapshot.hrefHits,
    imgHits: snapshot.imgHits,
    textSample: snapshot.text.slice(0, 240),
  };
}

async function adminFetch(page, url, options = {}) {
  return page.evaluate(
    async ({ url, options }) => {
      const token = localStorage.getItem('panda_wiki_token') || '';
      const headers = {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      };
      const res = await fetch(url, { ...options, headers });
      let body;
      try {
        body = await res.json();
      } catch {
        body = await res.text();
      }
      return { status: res.status, body };
    },
    { url, options },
  );
}

function getPortFromUrl(url) {
  const parsed = new URL(url);
  if (parsed.port) return Number(parsed.port);
  return parsed.protocol === 'https:' ? 443 : 80;
}

(async () => {
  ensureReportDir();
  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const consoleErrors = [];
  const officialRequests = [];
  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    adminUrl: ADMIN_URL,
    wikiUrl: WIKI_URL,
    checks: {},
    pages: [],
    screenshots: {},
    failures,
    consoleErrors,
    officialRequests,
  };

  const adminPage = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    ignoreHTTPSErrors: true,
  });
  addPageWatchers(adminPage, consoleErrors, officialRequests);

  let originalSettings = null;
  let appId = null;
  let targetKbId = null;

  try {
    await adminPage.goto(`${ADMIN_URL}/login`, { waitUntil: 'networkidle', timeout: 30000 });
    await adminPage.getByPlaceholder('账号').fill(ADMIN_USER);
    await adminPage.getByPlaceholder('密码').fill(ADMIN_PASSWORD);
    await adminPage.getByRole('button', { name: /登录/ }).click();
    await adminPage.waitForURL(/\/?(\?.*)?$/, { timeout: 30000 });
    await adminPage.waitForTimeout(1000);

    const tokenExists = await adminPage.evaluate(() => !!localStorage.getItem('panda_wiki_token'));
    if (!tokenExists) failures.push({ label: 'admin.login', pageFailures: ['missing auth token'] });

    const kbList = await adminFetch(adminPage, '/api/v1/knowledge_base/list');
    const kbs = Array.isArray(kbList.body?.data) ? kbList.body.data : [];
    const wikiPort = getPortFromUrl(WIKI_URL);
    const targetKb =
      kbs.find(kb => kb.access_settings?.ports?.includes(wikiPort)) ||
      kbs.find(kb => kb.id === undefined ? false : true);
    if (!targetKb) {
      failures.push({ label: 'knowledge_base.list', pageFailures: ['no knowledge base found'], kbList });
    } else {
      targetKbId = targetKb.id;
      await adminPage.evaluate(kbId => localStorage.setItem('kb_id', kbId), targetKbId);
      report.checks.knowledgeBase = {
        status: kbList.status,
        selected: {
          id: targetKb.id,
          name: targetKb.name,
          ports: targetKb.access_settings?.ports || [],
          hosts: targetKb.access_settings?.hosts || [],
        },
      };
    }

    const license = await adminFetch(adminPage, '/api/v1/license');
    const limitation = license.body?.data?.limitation || {};
    const requiredLicenseFlags = [
      'allow_custom_copyright',
      'allow_advanced_bot',
      'allow_watermark',
      'allow_copy_protection',
      'allow_open_ai_bot_settings',
      'allow_mcp_server',
      'allow_visitor_permission_control',
    ];
    const missingFlags = requiredLicenseFlags.filter(flag => limitation[flag] !== true);
    if (license.status !== 200 || !license.body?.success || missingFlags.length) {
      failures.push({
        label: 'license',
        pageFailures: [`license invalid or flags disabled: ${missingFlags.join(', ')}`],
        license,
      });
    }
    report.checks.license = {
      status: license.status,
      success: license.body?.success,
      edition: license.body?.data?.edition,
      state: license.body?.data?.state,
      missingFlags,
    };

    if (targetKbId) {
      const appDetail = await adminFetch(
        adminPage,
        `/api/v1/app/detail?kb_id=${encodeURIComponent(targetKbId)}&type=1`,
      );
      if (appDetail.status !== 200 || !appDetail.body?.success || !appDetail.body?.data?.id) {
        failures.push({ label: 'app.detail', pageFailures: ['cannot load web app detail'], appDetail });
      } else {
        appId = appDetail.body.data.id;
        originalSettings = appDetail.body.data.settings || {};
        report.checks.appDetail = {
          status: appDetail.status,
          appId,
          settingsKeys: Object.keys(originalSettings),
        };
      }
    }

    for (const item of [...adminPages, ...featurePages]) {
      const result = await visitAndCheck(adminPage, item, failures);
      report.pages.push(result);
      if (item.label === 'settings.security') {
        const shot = path.join(REPORT_DIR, 'full-regression-settings-security.png');
        await adminPage.screenshot({ path: shot, fullPage: true });
        report.screenshots.security = shot;
      }
      if (item.label === 'settings.mcp') {
        const shot = path.join(REPORT_DIR, 'full-regression-settings-mcp.png');
        await adminPage.screenshot({ path: shot, fullPage: true });
        report.screenshots.mcp = shot;
      }
    }

    if (targetKbId && appId && originalSettings) {
      const uniqueTitle = `PandaWiki Regression ${Date.now()}`;
      const nextSettings = { ...originalSettings, title: uniqueTitle };
      const update = await adminFetch(adminPage, `/api/v1/app?id=${encodeURIComponent(appId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kb_id: targetKbId, settings: nextSettings }),
      });
      report.checks.settingApplyUpdate = { status: update.status, success: update.body?.success, uniqueTitle };
      if (update.status !== 200 || !update.body?.success) {
        failures.push({ label: 'setting.apply.update', pageFailures: ['update app setting failed'], update });
      } else {
        const wikiPageForApply = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
          ignoreHTTPSErrors: true,
        });
        addPageWatchers(wikiPageForApply, consoleErrors, officialRequests);
        const wikiResp = await wikiPageForApply.goto(WIKI_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        await wikiPageForApply.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
        await wikiPageForApply.waitForTimeout(1200);
        const wikiTitle = await wikiPageForApply.title();
        const wikiText = await wikiPageForApply.locator('body').innerText({ timeout: 10000 });
        const applied = wikiTitle.includes(uniqueTitle) || wikiText.includes(uniqueTitle);
        report.checks.settingApplyVisible = {
          status: wikiResp?.status() || 0,
          applied,
          wikiTitle,
          textSample: wikiText.slice(0, 220),
        };
        if (!applied) {
          failures.push({
            label: 'setting.apply.visible',
            pageFailures: ['updated title is not visible on wiki site'],
            wikiTitle,
            excerpt: wikiText.slice(0, 500),
          });
        }
        await wikiPageForApply.close();
      }
    }
  } finally {
    if (targetKbId && appId && originalSettings) {
      const restore = await adminFetch(adminPage, `/api/v1/app?id=${encodeURIComponent(appId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kb_id: targetKbId, settings: originalSettings }),
      }).catch(err => ({ status: 0, body: { success: false, message: String(err) } }));
      report.checks.settingRestore = { status: restore.status, success: restore.body?.success };
      if (restore.status !== 200 || !restore.body?.success) {
        failures.push({ label: 'setting.restore', pageFailures: ['restore original setting failed'], restore });
      }
    }
  }

  const wikiPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  addPageWatchers(wikiPage, consoleErrors, officialRequests);
  const wikiResp = await wikiPage.goto(WIKI_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await wikiPage.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  await wikiPage.waitForTimeout(1500);
  const wikiSnapshot = await pageSnapshot(wikiPage);
  const wikiTitle = await wikiPage.title();
  const wikiStatus = wikiResp?.status() || 0;
  const wikiShot = path.join(REPORT_DIR, 'full-regression-wiki-home.png');
  await wikiPage.screenshot({ path: wikiShot, fullPage: true });
  report.screenshots.wikiHome = wikiShot;
  report.checks.wikiHome = {
    status: wikiStatus,
    title: wikiTitle,
    textHits: wikiSnapshot.textHits,
    hrefHits: wikiSnapshot.hrefHits,
    imgHits: wikiSnapshot.imgHits,
    textSample: wikiSnapshot.text.slice(0, 300),
  };
  if (
    wikiStatus >= 500 ||
    wikiSnapshot.text.includes('Internal Server Error') ||
    wikiSnapshot.textHits.length ||
    wikiSnapshot.hrefHits.length ||
    wikiSnapshot.imgHits.length
  ) {
    failures.push({
      label: 'wiki.home',
      pageFailures: ['wiki status/offical link check failed'],
      status: wikiStatus,
      title: wikiTitle,
      textHits: wikiSnapshot.textHits,
      hrefHits: wikiSnapshot.hrefHits,
      imgHits: wikiSnapshot.imgHits,
      excerpt: wikiSnapshot.text.slice(0, 500),
    });
  }

  const criticalErrors = consoleErrors.filter(err => CRITICAL_CONSOLE_RE.test(err.text || ''));
  if (criticalErrors.length) {
    failures.push({ label: 'console.runtime', pageFailures: ['critical console/page error found'], criticalErrors });
  }
  if (officialRequests.length) {
    failures.push({ label: 'official.network', pageFailures: ['official outbound request found'], officialRequests });
  }

  const adminShot = path.join(REPORT_DIR, 'full-regression-admin-last.png');
  await adminPage.screenshot({ path: adminShot, fullPage: true }).catch(() => undefined);
  report.screenshots.adminLast = adminShot;

  report.ok = failures.length === 0;
  const reportPath = path.join(REPORT_DIR, 'full-regression-latest.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.ok, failures: report.failures, reportPath, screenshots: report.screenshots }, null, 2));

  await browser.close();
  if (!report.ok) process.exit(1);
})();
