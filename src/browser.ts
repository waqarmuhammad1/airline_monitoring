import path from "path";
import { chromium, BrowserContext } from "playwright";
import { logger } from "./utils/logger";

const CTX = "browser";

export async function launchPersistentContext(): Promise<BrowserContext> {
  const userDataDir = path.resolve(process.env.USER_DATA_DIR || "./profile");
  const headless = process.env.HEADLESS === "true";
  const navTimeout = parseInt(process.env.NAV_TIMEOUT || "60000", 10);

  logger.info(CTX, `Launching persistent context at: ${userDataDir}`);
  logger.info(CTX, `Headless: ${headless}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
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
    ],
    ignoreDefaultArgs: ["--enable-automation"],
    bypassCSP: true,
  });

  context.setDefaultNavigationTimeout(navTimeout);
  context.setDefaultTimeout(navTimeout);

  for (const page of context.pages()) {
    await applyStealthScripts(page);
  }
  context.on("page", async (page) => {
    await applyStealthScripts(page);
  });

  logger.info(CTX, "Persistent context launched successfully");
  return context;
}

async function applyStealthScripts(page: import("playwright").Page): Promise<void> {
  await page.addInitScript(`
    Object.defineProperty(navigator, "webdriver", { get: () => false });

    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });

    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });

    (function() {
      var originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
      window.navigator.permissions.query = function(parameters) {
        return parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
      };
    })();

    (function() {
      var getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return "Intel Inc.";
        if (parameter === 37446) return "Intel Iris OpenGL Engine";
        return getParameter.call(this, parameter);
      };
    })();
  `);
}

export async function closeContext(context: BrowserContext): Promise<void> {
  try {
    await context.close();
    logger.info(CTX, "Browser context closed");
  } catch (err) {
    logger.error(CTX, "Error closing context", err);
  }
}
