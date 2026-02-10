import fs from "fs";
import path from "path";
import { logger } from "./logger";

const CTX = "fileStore";

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(CTX, `Created directory: ${dir}`);
  }
}

export function getOutputDir(): string {
  const dir = process.env.OUTPUT_DIR || "./output";
  ensureDir(dir);
  return dir;
}

export function appendJsonl(filePath: string, data: Record<string, unknown>): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, JSON.stringify(data) + "\n", "utf-8");
}

export function writeJson(filePath: string, data: Record<string, unknown>): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  logger.info(CTX, `Wrote JSON file: ${filePath}`);
}

export function writeScreenshot(filePath: string, buffer: Buffer): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, buffer);
  logger.info(CTX, `Saved screenshot: ${filePath}`);
}
