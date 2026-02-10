import readline from "readline";
import { BrowserContext, Page } from "playwright";
import { logger } from "./utils/logger";

const CTX = "loginCheck";
const GOOGLE_CHECK_URL = "https://accounts.google.com/";

export async function ensureGoogleLogin(context: BrowserContext): Promise<void> {
  logger.info(CTX, "Checking Google login status...");

  const page = context.pages()[0] || (await context.newPage());
  const loggedIn = await checkLoginStatus(page);

  if (loggedIn) {
    logger.info(CTX, "Google account is already signed in");
    return;
  }

  logger.warn(CTX, "Google account is NOT signed in");
  console.log("\n========================================");
  console.log("  MANUAL LOGIN REQUIRED");
  console.log("========================================");
  console.log("A browser window is open at accounts.google.com.");
  console.log("Please sign in to your Google account.");
  console.log("After signing in, return here and press ENTER to continue.");
  console.log("========================================\n");

  await waitForEnter();

  const verified = await checkLoginStatus(page);
  if (verified) {
    logger.info(CTX, "Login verified successfully");
  } else {
    logger.warn(CTX, "Login could not be verified, continuing anyway...");
  }
}

async function checkLoginStatus(page: Page): Promise<boolean> {
  try {
    await page.goto(GOOGLE_CHECK_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    const url = page.url();
    logger.info(CTX, `Current URL: ${url}`);

    if (url.includes("myaccount.google.com") || url.includes("accounts.google.com/SignOutOptions")) {
      return true;
    }

    const signedInIndicators = [
      'a[aria-label*="Google Account"]',
      'img[data-profile-identifier]',
      '[data-ogsr-up]',
      'a[href*="SignOutOptions"]',
      'header img[src*="googleusercontent"]',
      'a[aria-label*="account"]',
    ];

    for (const selector of signedInIndicators) {
      const found = await page.locator(selector).first().isVisible({ timeout: 2000 }).catch(() => false);
      if (found) {
        logger.info(CTX, `Detected signed-in indicator: ${selector}`);
        return true;
      }
    }

    const signInButton = await page
      .locator('a:has-text("Sign in"), button:has-text("Sign in")')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (signInButton) {
      logger.info(CTX, "Found 'Sign in' button — user is NOT logged in");
      return false;
    }

    const bodyText = await page.textContent("body").catch(() => "");
    if (bodyText && (bodyText.includes("Manage your Google Account") || bodyText.includes("Welcome"))) {
      return true;
    }

    return false;
  } catch (err) {
    logger.error(CTX, "Error checking login status", err);
    return false;
  }
}

function waitForEnter(): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Press ENTER after you have signed in... ", () => {
      rl.close();
      resolve();
    });
  });
}
