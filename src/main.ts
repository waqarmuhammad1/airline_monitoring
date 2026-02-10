import dotenv from "dotenv";
dotenv.config();

import { logger } from "./utils/logger";
import { launchPersistentContext, closeContext } from "./browser";
import { ensureGoogleLogin } from "./loginCheck";
import { navigateToUnitedSearch } from "./united/navigate";
import { startNetworkCapture, writeRunSummary } from "./united/networkCapture";
import { traverseFlightGrid } from "./united/gridTraverse";

const CTX = "main";

async function main(): Promise<void> {
  logger.info(CTX, "=== Playwright United Automation ===");
  logger.info(CTX, `Started at: ${new Date().toISOString()}`);

  let context;

  try {
    context = await launchPersistentContext();

    await ensureGoogleLogin(context);

    const page = context.pages()[0] || (await context.newPage());

    startNetworkCapture(page);

    await navigateToUnitedSearch(page);

    await traverseFlightGrid(page);

    writeRunSummary();

    logger.info(CTX, "=== Automation complete ===");
  } catch (err) {
    logger.error(CTX, "Fatal error in main", err);
    process.exitCode = 1;
  } finally {
    if (context) {
      await closeContext(context);
    }
  }
}

main();
