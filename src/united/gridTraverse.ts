import path from "path";
import { Page, Locator } from "playwright";
import { logger } from "../utils/logger";
import { getOutputDir, appendJsonl, writeScreenshot } from "../utils/fileStore";
import { withRetry } from "../utils/retry";

const CTX = "gridTraverse";

interface ClickRecord {
  index: number;
  timestamp: string;
  selector: string;
  textContent: string;
  success: boolean;
  error?: string;
}

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

export async function traverseFlightGrid(page: Page): Promise<void> {
  logger.info(CTX, "Starting flight grid traversal...");

  const jsonlPath = path.join(getOutputDir(), "network-matches.jsonl");
  let elements: Locator | null = null;
  let matchedSelector = "";

  for (const selector of GRID_SELECTORS) {
    const count = await page.locator(selector).count().catch(() => 0);
    if (count > 0) {
      elements = page.locator(selector);
      matchedSelector = selector;
      logger.info(CTX, `Found ${count} elements with selector: ${selector}`);
      break;
    }
  }

  if (!elements) {
    logger.warn(CTX, "No grid elements found with known selectors. Attempting broad search...");
    const broadResult = await findGridElementsBroad(page);
    if (broadResult) {
      elements = broadResult.locator;
      matchedSelector = broadResult.selector;
    }
  }

  if (!elements) {
    logger.error(CTX, "Could not find any clickable grid elements");
    const screenshotBuf = await page.screenshot({ fullPage: true });
    writeScreenshot(path.join(getOutputDir(), "no-grid-found.png"), screenshotBuf);
    return;
  }

  const total = await elements.count();
  logger.info(CTX, `Traversing ${total} elements (selector: ${matchedSelector})`);

  for (let i = 0; i < total; i++) {
    const el = elements.nth(i);
    const record: ClickRecord = {
      index: i,
      timestamp: new Date().toISOString(),
      selector: matchedSelector,
      textContent: "",
      success: false,
    };

    try {
      const visible = await el.isVisible().catch(() => false);
      if (!visible) {
        logger.info(CTX, `Element ${i} not visible, skipping`);
        continue;
      }

      record.textContent = (await el.textContent().catch(() => "")) || "";

      await el.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(300);

      await withRetry(
        async () => {
          await dismissOverlays(page);
          await el.click({ timeout: 10000 });
        },
        { label: `click element ${i}`, maxRetries: 3, backoffMs: 1000 }
      );

      record.success = true;
      logger.info(CTX, `Clicked element ${i}: "${record.textContent.substring(0, 60)}"`);

      await page.waitForTimeout(1500);
      await page.waitForLoadState("networkidle").catch(() => {});

    } catch (err) {
      record.error = err instanceof Error ? err.message : String(err);
      logger.warn(CTX, `Failed to click element ${i}: ${record.error}`);
    }

    appendJsonl(jsonlPath, record as unknown as Record<string, unknown>);
  }

  const screenshotBuf = await page.screenshot({ fullPage: true });
  writeScreenshot(path.join(getOutputDir(), "grid-traversal-done.png"), screenshotBuf);
  logger.info(CTX, "Grid traversal complete");
}

async function findGridElementsBroad(page: Page): Promise<{ locator: Locator; selector: string } | null> {
  const broadSelectors = [
    'button:has-text("$")',
    '[role="button"]:has-text("$")',
    'div[tabindex="0"]:has-text("$")',
    'td button',
    'td [role="button"]',
  ];

  for (const selector of broadSelectors) {
    try {
      const count = await page.locator(selector).count();
      if (count >= 2) {
        logger.info(CTX, `Broad search found ${count} elements: ${selector}`);
        return { locator: page.locator(selector), selector };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function dismissOverlays(page: Page): Promise<void> {
  const overlaySelectors = [
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

  for (const selector of overlaySelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 500 })) {
        await btn.click({ timeout: 2000 });
        logger.info(CTX, `Dismissed overlay: ${selector}`);
        await page.waitForTimeout(500);
      }
    } catch {
      continue;
    }
  }
}
