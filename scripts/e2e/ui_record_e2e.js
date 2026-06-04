#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = process.env.PANDAWIKI_ROOT || path.resolve(__dirname, "../..");
const playwrightPath =
  process.env.PANDAWIKI_PLAYWRIGHT_PATH ||
  path.join(root, ".e2e-runtime", "ui-runner", "node_modules", "playwright");
const { chromium } = require(playwrightPath);

const baseUrl = (process.env.PANDAWIKI_UI_BASE_URL || "http://127.0.0.1:5173").replace(/\/+$/, "");
const apiBaseUrl = (process.env.PANDAWIKI_E2E_BASE_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const adminPassword = process.env.PANDAWIKI_E2E_ADMIN_PASSWORD || "PandaWiki_E2E_123456";
const reportsDir = path.join(root, "reports");
const screenshotDir = path.join(reportsDir, "ui-e2e-screenshots");
const videoDir = path.join(reportsDir, "ui-e2e-video");
const traceDir = path.join(reportsDir, "ui-e2e-trace");
const tracePath = path.join(traceDir, "ui-e2e-trace.zip");
const reportPath = path.join(reportsDir, "ui-e2e-report.json");

for (const dir of [screenshotDir, videoDir, traceDir]) {
  fs.rmSync(dir, { recursive: true, force: true });
}

for (const dir of [reportsDir, screenshotDir, videoDir, traceDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

const results = [];
const networkErrors = [];
const consoleErrors = [];
let page;

function slug(name) {
  return name
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function assert(condition, message, details) {
  if (!condition) {
    const err = new Error(message);
    if (details !== undefined) err.details = details;
    throw err;
  }
}

async function bodyText() {
  return await page.locator("body").innerText({ timeout: 15000 });
}

async function takeScreenshot(name) {
  const file = path.join(screenshotDir, `${String(results.length + 1).padStart(2, "0")}-${slug(name)}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return path.relative(root, file).replace(/\\/g, "/");
}


const backendState = {};
let backendToken = null;

async function apiRequest(method, path, body, query) {
  const url = new URL(`${apiBaseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
      else if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  const headers = { "Content-Type": "application/json" };
  if (backendToken) headers.Authorization = `Bearer ${backendToken}`;
  const resp = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await resp.json();
  if (payload.success === false) {
    throw new Error(`${method} ${path} failed: ${JSON.stringify(payload)}`);
  }
  return payload.data;
}

async function loadBackendState() {
  const login = await apiRequest("POST", "/api/v1/user/login", {
    account: "admin",
    password: adminPassword,
  });
  backendToken = login.token;
  const kbs = await apiRequest("GET", "/api/v1/knowledge_base/list");
  const kb = kbs.find((item) => item.name === "e2e-kb-1") || kbs[0];
  assert(kb && kb.id, "未找到 E2E 知识库");
  backendState.kbId = kb.id;
  const navs = await apiRequest("GET", "/api/v1/nav/list", undefined, { kb_id: kb.id });
  backendState.navId = navs?.[0]?.id || "";
  const allNodes = await apiRequest("GET", "/api/v1/node/list", undefined, {
    kb_id: kb.id,
    nav_id: backendState.navId,
  });
  backendState.nodeCount = Array.isArray(allNodes) ? allNodes.length : 0;
  const nodes = await apiRequest("GET", "/api/v1/node/list", undefined, {
    kb_id: kb.id,
    nav_id: backendState.navId,
    search: "e2e-doc-edited-by-contrib",
  });
  const node = nodes.find((item) => item.name === "e2e-doc-edited-by-contrib") || nodes[0];
  assert(node && node.id, "未找到 E2E 历史/投稿编辑后的文档");
  backendState.nodeId = node.id;
  backendState.releases = await apiRequest("GET", "/api/pro/v1/node/release/list", undefined, {
    kb_id: kb.id,
    node_id: node.id,
  });
  backendState.addContributions = await apiRequest("GET", "/api/pro/v1/contribute/list", undefined, {
    kb_id: kb.id,
    page: 1,
    per_page: 20,
    node_name: "e2e-contrib-add",
  });
  backendState.webApp = await apiRequest("GET", "/api/v1/app/detail", undefined, {
    kb_id: kb.id,
    type: 1,
  });
  backendState.openAIApp = await apiRequest("GET", "/api/v1/app/detail", undefined, {
    kb_id: kb.id,
    type: 9,
  });
  backendState.mcpApp = await apiRequest("GET", "/api/v1/app/detail", undefined, {
    kb_id: kb.id,
    type: 12,
  });
}

async function waitForText(text, timeout = 15000) {
  await page.waitForFunction(
    (needle) => document.body && document.body.innerText.includes(needle),
    text,
    { timeout },
  );
}

async function check(name, fn) {
  const started = Date.now();
  try {
    await fn();
    const screenshot = await takeScreenshot(name);
    const item = {
      name,
      status: "PASS",
      elapsed_ms: Date.now() - started,
      screenshot,
    };
    results.push(item);
    console.log(`[PASS] ${name}`);
  } catch (err) {
    let screenshot = null;
    try {
      screenshot = await takeScreenshot(`${name}-FAIL`);
    } catch (_) {
      // ignore screenshot failure; original error is more important
    }
    const item = {
      name,
      status: "FAIL",
      elapsed_ms: Date.now() - started,
      error: err.message,
      details: err.details,
      screenshot,
    };
    results.push(item);
    console.log(`[FAIL] ${name}: ${err.message}`);
  }
}

async function login() {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByPlaceholder("账号").fill("admin");
  await page.getByPlaceholder("密码").fill(adminPassword);
  await page.getByRole("button", { name: "登录" }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 60000 });
  await waitForText("专业版");
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    recordVideo: { dir: videoDir, size: { width: 1440, height: 1000 } },
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("response", (resp) => {
    const url = resp.url();
    const status = resp.status();
    if (url.includes("/api/") && status >= 500) {
      networkErrors.push({ url, status });
    }
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push({ type: "pageerror", text: err.message });
  });

  await check("登录和专业版状态", async () => {
    await login();
    await loadBackendState();
    const text = await bodyText();
    assert(text.includes("PandaWiki"), "未显示 PandaWiki 首页");
    assert(text.includes("专业版"), "未显示专业版状态");
    assert(text.includes("e2e-kb-1"), "未显示 E2E 知识库");
  });

  await check("知识库数量超过免费版限制", async () => {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60000 });
    const combo = page.locator('[role="combobox"]').filter({ hasText: "e2e-kb-1" }).first();
    await combo.click();
    await page.getByRole("option", { name: "e2e-kb-2" }).waitFor({ state: "visible", timeout: 15000 });
    await page.keyboard.press("Escape");
  });

  await check("文档节点超过 300 免费版限制", async () => {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("e2e-doc-000");
    const text = await bodyText();
    const countMatch = text.match(/共\s*(\d+)\s*个文档/);
    const docCount = countMatch ? Number(countMatch[1]) : 0;
    assert(text.includes("e2e-doc-000"), "未显示 E2E 文档");
    assert(docCount >= 301, "未显示超过 300 个文档统计", { docCount, backendNodeCount: backendState.nodeCount });
  });

  await check("统计页 7 天周期可点击", async () => {
    await page.goto(`${baseUrl}/stat`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("近 7 天");
    const sevenDay = page.getByRole("tab", { name: "近 7 天" });
    assert(await sevenDay.isEnabled(), "近 7 天统计 Tab 不可用");
    await sevenDay.click();
    await page.waitForTimeout(800);
    const selected = await sevenDay.getAttribute("aria-selected");
    assert(selected === "true", "近 7 天统计 Tab 未被选中", { ariaSelected: selected });
  });

  await check("自定义 Prompt 前端读写展示", async () => {
    await page.goto(`${baseUrl}/setting?tab=ai-setting`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("智能问答提示词");
    const prompt = page.getByPlaceholder("智能问答提示词");
    const summary = page.getByPlaceholder("智能摘要提示词");
    assert(await prompt.isEnabled(), "智能问答提示词输入框不可编辑");
    assert(await summary.isEnabled(), "智能摘要提示词输入框不可编辑");
    assert((await prompt.inputValue()) === "E2E custom prompt", "智能问答提示词内容不正确");
    assert((await summary.inputValue()) === "E2E summary prompt", "智能摘要提示词内容不正确");
  });

  await check("内容合规屏蔽词前端展示", async () => {
    await page.goto(`${baseUrl}/setting?tab=security`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("内容合规");
    const text = await bodyText();
    assert(text.includes("屏蔽 AI 问答中的关键字"), "未显示屏蔽词设置项");
    assert(text.includes("secret-e2e"), "未显示 E2E 英文屏蔽词");
    assert(text.includes("内部"), "未显示 E2E 中文屏蔽词");
  });

  await check("评论审核设置前端可见", async () => {
    await page.goto(`${baseUrl}/setting?tab=feedback`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("评论审核");
    const text = await bodyText();
    assert(text.includes("文档评论"), "未显示文档评论设置");
    assert(text.includes("评论审核"), "未显示评论审核设置");
    assert(text.includes("启用") && text.includes("禁用"), "未显示评论审核开关选项");
  });

  await check("子管理员权限拆分前端展示", async () => {
    await page.goto(`${baseUrl}/setting?tab=backend-info`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("Wiki 站管理员");
    const text = await bodyText();
    assert(text.includes("e2e-normal-user"), "未显示普通子管理员用户");
    assert(text.includes("文档管理"), "未显示文档管理权限");
    assert(text.includes("e2e-admin-1") && text.includes("e2e-admin-2"), "未显示两个管理员用户");
    assert(text.includes("完全控制"), "未显示完全控制权限");
  });

  await check("API Token 前端创建并展示", async () => {
    await page.goto(`${baseUrl}/setting?tab=backend-info`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("API Token");
    const tokenName = `ui-token-${Date.now()}`;
    await page.getByRole("button", { name: "创建 API Token" }).click();
    await page.getByPlaceholder("请输入").fill(tokenName);
    await page.getByRole("button", { name: "确认" }).click();
    await waitForText(tokenName, 20000);
    const text = await bodyText();
    assert(text.includes(tokenName), "未显示新建 API Token 备注");
    assert(text.includes("pw_"), "未显示 API Token 前缀");
    assert(text.includes("完全控制"), "未显示 API Token 权限");
  });

  await check("水印和内容复制保护前端展示", async () => {
    await page.goto(`${baseUrl}/setting?tab=security`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("水印");
    await waitForText("内容复制");
    const text = await bodyText();
    const watermarkField = page.getByPlaceholder("请输入水印内容, 支持多行输入").first();
    assert(text.includes("显性水印"), "未显示显性水印选项");
    assert(await watermarkField.isVisible(), "水印内容输入框不可见");
    assert((await watermarkField.inputValue()) === "E2E Watermark", "未展示已保存的水印内容");
    assert(text.includes("增加内容尾巴"), "未显示复制保护追加尾巴选项");
    const settings = backendState.webApp?.settings || {};
    assert(settings.watermark_setting === "visible", "后端水印设置不是 visible", settings);
    assert(settings.copy_setting === "append", "后端复制保护设置不是 append", settings);
  });

  await check("问答机器人 API 前端展示", async () => {
    await page.goto(`${baseUrl}/setting?tab=robot`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("问答机器人 API");
    await waitForText("API 调用地址");
    const text = await bodyText();
    assert(text.includes("/share/v1/chat/completions"), "未展示 OpenAI 兼容 API 地址");
    const tokenField = page.getByPlaceholder("API Token").first();
    assert(await tokenField.isVisible(), "API Token 输入框不可见");
    assert((await tokenField.inputValue()) === "e2e-openai-secret", "API Token 内容不正确");
    const settings = backendState.openAIApp?.settings?.openai_api_bot_settings || {};
    assert(settings.is_enabled === true, "后端问答机器人 API 未启用", settings);
  });

  await check("MCP Server 前端展示", async () => {
    await page.goto(`${baseUrl}/setting?tab=mcp`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("MCP 设置");
    await waitForText("MCP URL");
    await waitForText("MCP Tool名称");
    const text = await bodyText();
    const toolNameField = page.getByPlaceholder("自定义检索文档MCP Tool名称").first();
    const toolDescField = page.getByPlaceholder("自定义检索文档MCP Tool描述").first();
    assert(await toolNameField.isVisible(), "MCP Tool 名称输入框不可见");
    assert(await toolDescField.isVisible(), "MCP Tool 描述输入框不可见");
    assert((await toolNameField.inputValue()) === "e2e_get_docs", "未展示 MCP Tool 名称");
    assert((await toolDescField.inputValue()) === "E2E docs retrieval", "未展示 MCP Tool 描述");
    assert(text.includes("需要认证"), "未展示 MCP 访问控制认证选项");
    const tokenField = page.getByPlaceholder("访问口令").first();
    assert(await tokenField.isVisible(), "MCP 访问口令输入框不可见");
    assert((await tokenField.inputValue()) === "e2e-mcp-pass", "MCP 访问口令不正确");
    const settings = backendState.mcpApp?.settings?.mcp_server_settings || {};
    assert(settings.is_enabled === true, "后端 MCP Server 未启用", settings);
  });

  await check("文档历史版本前端展示", async () => {
    assert(backendState.nodeId, "缺少历史版本文档 ID");
    assert((backendState.releases || []).some((item) => item.release_name === "e2e-v1"), "后端未返回 e2e-v1 历史版本", backendState.releases);
    await page.goto(`${baseUrl}/doc/editor/history/${backendState.nodeId}`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("历史版本");
    await waitForText("e2e-v1");
    const text = await bodyText();
    assert(text.includes("e2e-doc-edited-by-contrib"), "未展示当前文档标题");
    assert(text.includes("E2E first release"), "未展示历史版本发布说明");
    assert(text.includes("未发布的草稿"), "未展示当前草稿版本");
  });

  await check("贡献审核列表前端展示", async () => {
    const addItems = backendState.addContributions?.list || [];
    assert(addItems.some((item) => item.node_name === "e2e-contrib-add" && item.status === "approved"), "后端未返回已采纳新增投稿", backendState.addContributions);
    await page.goto(`${baseUrl}/contribution?node_name=e2e-contrib-add`, { waitUntil: "networkidle", timeout: 60000 });
    await waitForText("e2e-contrib-add");
    const text = await bodyText();
    assert(text.includes("已采纳"), "未展示已采纳状态");
    assert(text.includes("E2E add contribution"), "未展示投稿说明");
    assert(text.includes("新增"), "未展示新增投稿类型");
  });

  await check("浏览器端无 JS 异常和 API 5xx 错误", async () => {
    assert(networkErrors.length === 0, "存在 API 5xx 响应", networkErrors);
    assert(consoleErrors.length === 0, "存在浏览器 JS 异常或 console error", consoleErrors);
  });

  await context.tracing.stop({ path: tracePath });
  const video = page.video();
  await context.close();
  await browser.close();

  let videoPath = null;
  if (video) {
    try {
      videoPath = path.relative(root, await video.path()).replace(/\\/g, "/");
    } catch (_) {
      videoPath = null;
    }
  }

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const report = {
    base_url: baseUrl,
    passed,
    failed,
    trace: path.relative(root, tracePath).replace(/\\/g, "/"),
    video: videoPath,
    screenshots_dir: path.relative(root, screenshotDir).replace(/\\/g, "/"),
    network_errors: networkErrors,
    console_errors: consoleErrors.slice(0, 50),
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (failed > 0) process.exit(1);
})().catch(async (err) => {
  const report = {
    base_url: baseUrl,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length + 1,
    fatal: err.stack || err.message,
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.error(err);
  process.exit(1);
});
