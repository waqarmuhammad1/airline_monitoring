import path from "path";
import { Page } from "playwright";
import { logger } from "../utils/logger";
import { getOutputDir, writeScreenshot } from "../utils/fileStore";
import { withRetry } from "../utils/retry";

const CTX = "united:navigate";

const DEFAULT_URL =
  "https://www.united.com/en/us/fsr/choose-flights?f=SFO&t=NRT&d=2026-04-10&r=2026-04-12&sc=7%2C7&px=1&taxng=1&newHP=True&clm=7&st=bestmatches&tqp=R";

export async function navigateToUnitedSearch(page: Page): Promise<void> {
  const targetUrl = process.env.UNITED_URL || DEFAULT_URL;
  const navTimeout = parseInt(process.env.NAV_TIMEOUT || "60000", 10);

  logger.info(CTX, `Navigating to: ${targetUrl}`);

  await withRetry(
    async () => {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: navTimeout });
    },
    { label: "United page navigation", maxRetries: 3 }
  );

  logger.info(CTX, "Waiting for network idle...");
  await page.waitForLoadState("networkidle").catch(() => {
    logger.warn(CTX, "Network idle timed out, continuing...");
  });

  logger.info(CTX, "Waiting for key UI elements...");
  await waitForFlightResults(page, navTimeout);

  const screenshotPath = path.join(getOutputDir(), "united-search.png");
  const buffer = await page.screenshot({ fullPage: true });
  writeScreenshot(screenshotPath, buffer);

  logger.info(CTX, "United search page loaded and screenshot saved");
}

async function waitForFlightResults(page: Page, timeout: number): Promise<void> {
  const selectors = [
    '[data-testid="flight-result"]',
    '[class*="FlightCard"]',
    '[class*="flight-card"]',
    '[class*="flight-result"]',
    '[role="grid"]',
    '[role="table"]',
    '[class*="BookCalendar"]',
    '[class*="book-calendar"]',
    '[class*="grid"]',
    'button[class*="cabin"]',
    '[data-testid*="cabin"]',
    '[class*="slick-slide"]',
    '[class*="price"]',
    '[class*="fare"]',
  ];

  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 10000 });
      logger.info(CTX, `Found UI element: ${selector}`);
      return;
    } catch {
      continue;
    }
  }

  logger.warn(CTX, "No known flight result selectors found, waiting for general content...");
  await page.waitForTimeout(Math.min(timeout, 15000));
}
