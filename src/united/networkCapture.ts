import path from "path";
import { Page, Request, Response } from "playwright";
import { logger } from "../utils/logger";
import { appendJsonl, getOutputDir, writeJson } from "../utils/fileStore";

const CTX = "networkCapture";

const PRICE_PATTERN = /\$\s?\d[\d,]*(\.\d{2})?|"USD"|"amount"\s*:\s*\d|"price"\s*:\s*\d|"fare"\s*:\s*\d/i;
const MAX_BODY_SIZE = parseInt(process.env.MAX_BODY_SIZE || "2097152", 10);

interface CapturedResponse {
  timestamp: string;
  url: string;
  method: string;
  status: number;
  responseHeaders: Record<string, string>;
  requestPostData: string | null;
  bodySnippet: string;
  bodyLength: number;
}

interface RunSummary {
  startTime: string;
  endTime: string;
  elapsedMs: number;
  totalRequests: number;
  matchedResponses: number;
  matchedUrls: string[];
}

let totalRequests = 0;
let matchedResponses = 0;
const matchedUrls: string[] = [];
let startTime: Date;

export function startNetworkCapture(page: Page): void {
  startTime = new Date();
  totalRequests = 0;
  matchedResponses = 0;
  matchedUrls.length = 0;

  const jsonlPath = path.join(getOutputDir(), "network-matches.jsonl");

  logger.info(CTX, "Network capture started");

  page.on("request", (_request: Request) => {
    totalRequests++;
  });

  page.on("response", async (response: Response) => {
    try {
      const request = response.request();
      const resourceType = request.resourceType();

      if (resourceType !== "xhr" && resourceType !== "fetch") {
        return;
      }

      const url = response.url();
      const status = response.status();
      const method = request.method();

      let bodyText = "";
      let bodyLength = 0;

      try {
        const contentLength = response.headers()["content-length"];
        if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
          bodyText = "[BODY TOO LARGE]";
          bodyLength = parseInt(contentLength, 10);
        } else {
          bodyText = await response.text();
          bodyLength = bodyText.length;

          if (bodyLength > MAX_BODY_SIZE) {
            bodyText = bodyText.substring(0, MAX_BODY_SIZE) + "...[TRUNCATED]";
          }
        }
      } catch {
        bodyText = "[COULD NOT READ BODY]";
      }

      if (!PRICE_PATTERN.test(bodyText) && !PRICE_PATTERN.test(url)) {
        return;
      }

      const captured: CapturedResponse = {
        timestamp: new Date().toISOString(),
        url,
        method,
        status,
        responseHeaders: response.headers(),
        requestPostData: request.postData() || null,
        bodySnippet: bodyText.length > 5000 ? bodyText.substring(0, 5000) + "...[SNIPPET]" : bodyText,
        bodyLength,
      };

      appendJsonl(jsonlPath, captured as unknown as Record<string, unknown>);
      matchedResponses++;
      matchedUrls.push(url);
      logger.info(CTX, `Captured price-related response: ${method} ${url} (${status})`);
    } catch (err) {
      logger.error(CTX, "Error processing response", err);
    }
  });
}

export function writeRunSummary(): void {
  const endTime = new Date();
  const summary: RunSummary = {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    elapsedMs: endTime.getTime() - startTime.getTime(),
    totalRequests,
    matchedResponses,
    matchedUrls: [...new Set(matchedUrls)],
  };

  const summaryPath = path.join(getOutputDir(), "run-summary.json");
  writeJson(summaryPath, summary as unknown as Record<string, unknown>);
  logger.info(CTX, `Run summary: ${matchedResponses} matched out of ${totalRequests} total requests`);
}
