#!/usr/bin/env npx tsx
/**
 * Playwright United Airlines Automation — Standalone Single File (Stealth)
 *
 * Install & run:
 *   npm init -y
 *   npm install playwright-extra puppeteer-extra-plugin-stealth
 *   npx playwright install chromium
 *   npx tsx united-automation.ts
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { BrowserContext, Page, Locator, Request, Response } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// ─── STEALTH SETUP ───────────────────────────────────────────────────────────

chromium.use(StealthPlugin());

// ─── CONFIG (all hardcoded, no .env needed) ──────────────────────────────────

const USER_DATA_DIR = path.resolve("./profile");
const OUTPUT_DIR = "./output";
const NAV_TIMEOUT = 60000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 1000;
const MAX_BODY_SIZE = 2097152;
const UNITED_URL =
  "https://www.united.com/en/us/fsr/choose-flights?f=SFO&t=NRT&d=2026-04-10&r=2026-04-12&sc=7%2C7&px=1&taxng=1&newHP=True&clm=7&st=bestmatches&tqp=R";

const PRICE_PATTERN = /\$\s?\d[\d,]*(\.\d{2})?|"USD"|"amount"\s*:\s*\d|"price"\s*:\s*\d|"fare"\s*:\s*\d/i;

// ─── LOGGER ──────────────────────────────────────────────────────────────────

function log(level: string, ctx: string, msg: string, err?: unknown) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [${ctx}] ${msg}`;
  if (level === "ERROR") {
    console.error(line);
    if (err instanceof Error) console.error(err.stack);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

// ─── FILE HELPERS ────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function outputPath(filename: string): string {
  ensureDir(OUTPUT_DIR);
  return path.join(OUTPUT_DIR, filename);
}

function appendJsonl(filePath: string, data: Record<string, unknown>) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(data) + "\n", "utf-8");
}

function writeJson(filePath: string, data: Record<string, unknown>) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  log("INFO", "file", `Wrote: ${filePath}`);
}

function saveScreenshot(filePath: string, buffer: Buffer) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
  log("INFO", "file", `Screenshot: ${filePath}`);
}

// ─── RETRY ───────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  label = "operation",
  maxRetries = MAX_RETRIES,
  backoffMs = RETRY_BACKOFF_MS
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      log("WARN", "retry", `${label} attempt ${attempt}/${maxRetries} failed: ${msg}`);
      if (attempt < maxRetries) {
        const delay = backoffMs * attempt;
        log("INFO", "retry", `Retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ─── EXTRA EVASION INIT SCRIPT (layered on top of stealth plugin) ────────────

const EXTRA_EVASIONS = `
  Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  if (navigator.webdriver !== undefined) {
    try { delete Object.getPrototypeOf(navigator).webdriver; } catch(e) {}
  }

  Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });

  Object.defineProperty(navigator, "plugins", {
    get: () => {
      var arr = [
        { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" },
        { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "" },
        { name: "Native Client", filename: "internal-nacl-plugin", description: "" },
      ];
      arr.item = function(i) { return this[i] || null; };
      arr.namedItem = function(n) { return this.find(function(p) { return p.name === n; }) || null; };
      arr.refresh = function() {};
      return arr;
    }
  });

  Object.defineProperty(navigator, "mimeTypes", {
    get: () => {
      var arr = [
        { type: "application/pdf", suffixes: "pdf", description: "Portable Document Format" },
        { type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format" },
      ];
      arr.item = function(i) { return this[i] || null; };
      arr.namedItem = function(n) { return this.find(function(m) { return m.type === n; }) || null; };
      return arr;
    }
  });

  (function() {
    var oq = window.navigator.permissions.query.bind(window.navigator.permissions);
    window.navigator.permissions.query = function(p) {
      return p.name === "notifications"
        ? Promise.resolve({ state: Notification.permission })
        : oq(p);
    };
  })();

  (function() {
    var gp = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(p) {
      if (p === 37445) return "Intel Inc.";
      if (p === 37446) return "Intel Iris OpenGL Engine";
      return gp.call(this, p);
    };
    if (typeof WebGL2RenderingContext !== "undefined") {
      var gp2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(p) {
        if (p === 37445) return "Intel Inc.";
        if (p === 37446) return "Intel Iris OpenGL Engine";
        return gp2.call(this, p);
      };
    }
  })();

  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) window.chrome.runtime = { connect: function() {}, sendMessage: function() {} };

  (function() {
    try {
      var origCreate = document.createElement.bind(document);
      document.createElement = function() {
        var el = origCreate.apply(this, arguments);
        if (arguments[0] === "iframe") {
          Object.defineProperty(el, "contentWindow", {
            get: new Proxy(Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow").get, {
              apply: function(target, thisArg, args) {
                var w = Reflect.apply(target, thisArg, args);
                if (w) {
                  try { Object.defineProperty(w.navigator, "webdriver", { get: () => undefined }); } catch(e) {}
                }
                return w;
              }
            })
          });
        }
        return el;
      };
    } catch(e) {}
  })();

  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    Object.defineProperty(Notification, "permission", { get: () => "default" });
  }

  (function() {
    var origToString = Function.prototype.toString;
    Function.prototype.toString = function() {
      if (this === Function.prototype.toString) return "function toString() { [native code] }";
      if (this === navigator.permissions.query) return "function query() { [native code] }";
      return origToString.call(this);
    };
  })();

  (function() {
    var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
      var ctx = this.getContext("2d");
      if (ctx) {
        var style = ctx.fillStyle;
        ctx.fillStyle = "rgba(0,0,1,0.01)";
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = style;
      }
      return origToDataURL.apply(this, arguments);
    };
    var origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function() {
      var ctx = this.getContext("2d");
      if (ctx) {
        var style = ctx.fillStyle;
        ctx.fillStyle = "rgba(0,0,1,0.01)";
        ctx.fillRect(0, 0, 1, 1);
        ctx.fillStyle = style;
      }
      return origToBlob.apply(this, arguments);
    };
  })();

  (function() {
    if (typeof AudioContext !== "undefined") {
      var origCreateOsc = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function() {
        var osc = origCreateOsc.apply(this, arguments);
        osc._isModified = true;
        return osc;
      };
    }
  })();

  if (navigator.getBattery) {
    navigator.getBattery = function() {
      return Promise.resolve({
        charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1.0,
        addEventListener: function() {}, removeEventListener: function() {},
      });
    };
  }

  if (navigator.connection) {
    Object.defineProperty(navigator, "connection", {
      get: () => ({
        effectiveType: "4g", rtt: 50, downlink: 10, saveData: false,
        addEventListener: function() {}, removeEventListener: function() {},
      })
    });
  }

  Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
  Object.defineProperty(navigator, "deviceMemory", { get: () => 8 });
  Object.defineProperty(navigator, "platform", { get: () => "Win32" });
  Object.defineProperty(navigator, "maxTouchPoints", { get: () => 0 });
`;

// ─── BROWSER ─────────────────────────────────────────────────────────────────

async function launchBrowser(): Promise<BrowserContext> {
  log("INFO", "browser", `Profile: ${USER_DATA_DIR} | Headless: false`);

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-infobars",
      "--disable-background-networking",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--metrics-recording-only",
      "--no-sandbox",
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    bypassCSP: true,
  });

  context.setDefaultNavigationTimeout(NAV_TIMEOUT);
  context.setDefaultTimeout(NAV_TIMEOUT);

  for (const page of context.pages()) await page.addInitScript(EXTRA_EVASIONS);
  context.on("page", async (page) => await page.addInitScript(EXTRA_EVASIONS));

  log("INFO", "browser", "Launched with playwright-extra stealth + extra evasions");
  return context;
}

// ─── LOGIN CHECK ─────────────────────────────────────────────────────────────

async function checkGoogleLogin(page: Page): Promise<boolean> {
  try {
    await page.goto("https://accounts.google.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    const url = page.url();
    log("INFO", "login", `URL: ${url}`);

    if (url.includes("myaccount.google.com") || url.includes("SignOutOptions")) return true;

    const indicators = [
      'a[aria-label*="Google Account"]',
      'img[data-profile-identifier]',
      '[data-ogsr-up]',
      'a[href*="SignOutOptions"]',
      'header img[src*="googleusercontent"]',
      'a[aria-label*="account"]',
    ];
    for (const sel of indicators) {
      if (await page.locator(sel).first().isVisible({ timeout: 2000 }).catch(() => false)) {
        log("INFO", "login", `Signed-in indicator: ${sel}`);
        return true;
      }
    }

    if (await page.locator('a:has-text("Sign in"), button:has-text("Sign in")').first().isVisible({ timeout: 2000 }).catch(() => false)) {
      return false;
    }

    const body = await page.textContent("body").catch(() => "");
    if (body && (body.includes("Manage your Google Account") || body.includes("Welcome"))) return true;

    return false;
  } catch (err) {
    log("ERROR", "login", "Check failed", err);
    return false;
  }
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Press ENTER after you have signed in... ", () => { rl.close(); resolve(); });
  });
}

async function ensureLogin(context: BrowserContext) {
  const page = context.pages()[0] || (await context.newPage());
  if (await checkGoogleLogin(page)) {
    log("INFO", "login", "Already signed in");
    return;
  }

  console.log("\n========================================");
  console.log("  MANUAL LOGIN REQUIRED");
  console.log("========================================");
  console.log("Sign in to Google in the browser window.");
  console.log("Then press ENTER here to continue.");
  console.log("========================================\n");

  await waitForEnter();

  if (await checkGoogleLogin(page)) {
    log("INFO", "login", "Verified after manual login");
  } else {
    log("WARN", "login", "Could not verify login, continuing anyway...");
  }
}

// ─── NETWORK CAPTURE ─────────────────────────────────────────────────────────

let totalRequests = 0;
let matchedResponses = 0;
const matchedUrls: string[] = [];
let captureStartTime: Date;

function startCapture(page: Page) {
  captureStartTime = new Date();
  totalRequests = 0;
  matchedResponses = 0;
  matchedUrls.length = 0;

  const jsonlPath = outputPath("network-matches.jsonl");
  log("INFO", "capture", "Network capture started");

  page.on("request", (_req: Request) => { totalRequests++; });

  page.on("response", async (response: Response) => {
    try {
      const request = response.request();
      const resourceType = request.resourceType();
      if (resourceType !== "xhr" && resourceType !== "fetch") return;

      const url = response.url();
      let bodyText = "";
      let bodyLength = 0;

      try {
        const cl = response.headers()["content-length"];
        if (cl && parseInt(cl, 10) > MAX_BODY_SIZE) {
          bodyText = "[BODY TOO LARGE]";
          bodyLength = parseInt(cl, 10);
        } else {
          bodyText = await response.text();
          bodyLength = bodyText.length;
          if (bodyLength > MAX_BODY_SIZE) bodyText = bodyText.substring(0, MAX_BODY_SIZE) + "...[TRUNCATED]";
        }
      } catch {
        bodyText = "[COULD NOT READ BODY]";
      }

      if (!PRICE_PATTERN.test(bodyText) && !PRICE_PATTERN.test(url)) return;

      appendJsonl(jsonlPath, {
        timestamp: new Date().toISOString(),
        url,
        method: request.method(),
        status: response.status(),
        responseHeaders: response.headers(),
        requestPostData: request.postData() || null,
        bodySnippet: bodyText.length > 5000 ? bodyText.substring(0, 5000) + "...[SNIPPET]" : bodyText,
        bodyLength,
      });
      matchedResponses++;
      matchedUrls.push(url);
      log("INFO", "capture", `Matched: ${request.method()} ${url} (${response.status()})`);
    } catch (err) {
      log("ERROR", "capture", "Response processing error", err);
    }
  });
}

function writeSummary() {
  const endTime = new Date();
  writeJson(outputPath("run-summary.json"), {
    startTime: captureStartTime.toISOString(),
    endTime: endTime.toISOString(),
    elapsedMs: endTime.getTime() - captureStartTime.getTime(),
    totalRequests,
    matchedResponses,
    matchedUrls: [...new Set(matchedUrls)],
  });
  log("INFO", "capture", `Summary: ${matchedResponses} matched / ${totalRequests} total`);
}

// ─── UNITED NAVIGATION ──────────────────────────────────────────────────────

async function navigateToUnited(page: Page) {
  log("INFO", "navigate", `Going to: ${UNITED_URL}`);

  await withRetry(
    async () => { await page.goto(UNITED_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }); },
    "United navigation"
  );

  await page.waitForLoadState("networkidle").catch(() => log("WARN", "navigate", "Network idle timed out"));

  const uiSelectors = [
    '[data-testid="flight-result"]', '[class*="FlightCard"]', '[class*="flight-card"]',
    '[class*="flight-result"]', '[role="grid"]', '[role="table"]',
    '[class*="BookCalendar"]', '[class*="book-calendar"]', '[class*="grid"]',
    'button[class*="cabin"]', '[data-testid*="cabin"]', '[class*="slick-slide"]',
    '[class*="price"]', '[class*="fare"]',
  ];

  for (const sel of uiSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 10000 });
      log("INFO", "navigate", `Found element: ${sel}`);
      break;
    } catch { continue; }
  }

  const buf = await page.screenshot({ fullPage: true });
  saveScreenshot(outputPath("united-search.png"), buf);
  log("INFO", "navigate", "Page loaded, screenshot saved");
}

// ─── GRID TRAVERSAL ─────────────────────────────────────────────────────────

const GRID_SELECTORS = [
  '[data-testid="flight-result"] button',
  '[class*="FlightCard"] button',
  '[class*="flight-card"] button',
  '[role="grid"] button',
  '[role="grid"] [role="button"]',
  '[role="grid"] [role="gridcell"]',
  '[class*="BookCalendar"] button',
  '[class*="book-calendar"] button',
  'button[class*="cabin"]',
  '[data-testid*="cabin"] button',
  '[class*="slick-slide"] button',
  'button[class*="fare"]',
  'button[class*="price"]',
  '[class*="fare"] button',
  '[class*="price"] button',
  '[role="button"][class*="fare"]',
  '[role="button"][class*="price"]',
  'div[role="button"][class*="cell"]',
  '[class*="grid"] button',
  '[class*="Grid"] button',
  'button[aria-label*="$"]',
  '[role="row"] button',
  '[role="row"] [role="button"]',
  '[role="row"] [role="gridcell"]',
];

const BROAD_SELECTORS = [
  'button:has-text("$")',
  '[role="button"]:has-text("$")',
  'div[tabindex="0"]:has-text("$")',
  'td button',
  'td [role="button"]',
];

const OVERLAY_SELECTORS = [
  'button[aria-label="Close"]',
  'button[aria-label="close"]',
  '[class*="modal"] button[class*="close"]',
  '[class*="overlay"] button[class*="close"]',
  'button:has-text("No thanks")',
  'button:has-text("Accept")',
  'button:has-text("Got it")',
  'button:has-text("Continue")',
  '#onetrust-accept-btn-handler',
];

async function dismissOverlays(page: Page) {
  for (const sel of OVERLAY_SELECTORS) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click({ timeout: 2000 });
        log("INFO", "grid", `Dismissed overlay: ${sel}`);
        await page.waitForTimeout(500);
      }
    } catch { continue; }
  }
}

async function findGridElements(page: Page): Promise<{ locator: Locator; selector: string } | null> {
  for (const sel of GRID_SELECTORS) {
    const count = await page.locator(sel).count().catch(() => 0);
    if (count > 0) {
      log("INFO", "grid", `Found ${count} elements: ${sel}`);
      return { locator: page.locator(sel), selector: sel };
    }
  }
  for (const sel of BROAD_SELECTORS) {
    try {
      const count = await page.locator(sel).count();
      if (count >= 2) {
        log("INFO", "grid", `Broad match ${count} elements: ${sel}`);
        return { locator: page.locator(sel), selector: sel };
      }
    } catch { continue; }
  }
  return null;
}

async function traverseGrid(page: Page) {
  log("INFO", "grid", "Starting grid traversal...");

  const clickLogPath = outputPath("click-log.jsonl");
  const result = await findGridElements(page);

  if (!result) {
    log("ERROR", "grid", "No clickable grid elements found");
    saveScreenshot(outputPath("no-grid-found.png"), await page.screenshot({ fullPage: true }));
    return;
  }

  const { locator: elements, selector: matchedSelector } = result;
  const total = await elements.count();
  log("INFO", "grid", `Traversing ${total} elements (${matchedSelector})`);

  for (let i = 0; i < total; i++) {
    const el = elements.nth(i);
    const record: Record<string, unknown> = {
      index: i,
      timestamp: new Date().toISOString(),
      selector: matchedSelector,
      textContent: "",
      success: false,
    };

    try {
      if (!(await el.isVisible().catch(() => false))) {
        log("INFO", "grid", `Element ${i} not visible, skipping`);
        continue;
      }

      record.textContent = (await el.textContent().catch(() => "")) || "";
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);

      await withRetry(async () => {
        await dismissOverlays(page);
        await el.click({ timeout: 10000 });
      }, `click element ${i}`);

      record.success = true;
      log("INFO", "grid", `Clicked ${i}: "${(record.textContent as string).substring(0, 60)}"`);

      await page.waitForTimeout(1500);
      await page.waitForLoadState("networkidle").catch(() => {});
    } catch (err) {
      record.error = err instanceof Error ? err.message : String(err);
      log("WARN", "grid", `Click ${i} failed: ${record.error}`);
    }

    appendJsonl(clickLogPath, record);
  }

  saveScreenshot(outputPath("grid-traversal-done.png"), await page.screenshot({ fullPage: true }));
  log("INFO", "grid", "Grid traversal complete");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  log("INFO", "main", "=== Playwright United Automation (Stealth) ===");

  let context: BrowserContext | undefined;

  try {
    context = await launchBrowser();
    await ensureLogin(context);

    const page = context.pages()[0] || (await context.newPage());
    startCapture(page);
    await navigateToUnited(page);
    await traverseGrid(page);
    writeSummary();

    log("INFO", "main", "=== Automation complete ===");
  } catch (err) {
    log("ERROR", "main", "Fatal error", err);
    process.exitCode = 1;
  } finally {
    if (context) {
      try { await context.close(); } catch { /* ignore */ }
      log("INFO", "main", "Browser closed");
    }
  }
}

main();
