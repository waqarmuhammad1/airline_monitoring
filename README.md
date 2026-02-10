# Playwright United Automation

Automated flight search tool for United Airlines using Playwright with persistent browser profiles, Google login detection, flight grid traversal, and network capture.

## Features

- **Persistent Browser Profile** - Maintains login state across runs
- **Stealth Mode** - Anti-detection measures for reliable automation
- **Google Login Check** - Detects existing sessions; pauses for manual login when needed
- **Flight Grid Traversal** - Automatically clicks through all flight options
- **Network Capture** - Records XHR/fetch responses containing price data
- **Retry Logic** - Built-in retries with exponential backoff
- **JSONL Output** - Structured output files for analysis

## Prerequisites

- Node.js 18+
- npm 9+

## Setup

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy env config
cp .env.example .env
```

## Configuration

Edit `.env` to customize:

| Variable | Default | Description |
|---|---|---|
| `USER_DATA_DIR` | `./profile` | Browser profile directory |
| `UNITED_URL` | *(United SFO-NRT search)* | Target search URL |
| `OUTPUT_DIR` | `./output` | Output directory for captures |
| `NAV_TIMEOUT` | `60000` | Navigation timeout (ms) |
| `MAX_RETRIES` | `3` | Max retries per click |
| `RETRY_BACKOFF_MS` | `1000` | Retry backoff base (ms) |
| `MAX_BODY_SIZE` | `2097152` | Max response body capture (bytes) |
| `HEADLESS` | `false` | Run headless (true/false) |

## Usage

### Development (TypeScript direct)
```bash
npm run dev
```

### Production (compiled)
```bash
npm run build
npm start
```

### First Run

1. Run `npm run dev`
2. The browser opens and checks Google login
3. If not logged in, sign in manually in the browser window
4. Press ENTER in the terminal to continue
5. The script navigates to United and traverses flight results

## Output Files

All output is written to the `output/` directory:

- **`network-matches.jsonl`** - One JSON object per line for each price-related network response
- **`run-summary.json`** - Summary with counts, matched URLs, and elapsed time
- **`united-search.png`** - Screenshot of the search results page
- **`grid-traversal-done.png`** - Screenshot after grid traversal

## Project Structure

```
src/
  main.ts              # Entry point
  browser.ts           # Persistent context launcher with stealth
  loginCheck.ts        # Google login detection + manual pause
  united/
    navigate.ts        # United page navigation + readiness checks
    gridTraverse.ts    # Flight grid element traversal
    networkCapture.ts  # XHR/fetch capture and filtering
  utils/
    logger.ts          # Structured logging
    fileStore.ts       # File I/O helpers
    retry.ts           # Retry with backoff
```

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Run with tsx (TypeScript direct) |
| `npm start` | Run compiled JS |
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests |
| `npm run lint` | Lint source files |

## Troubleshooting

### Browser fails to launch
- Ensure Playwright browsers are installed: `npx playwright install chromium`
- On Linux, install system dependencies: `npx playwright install-deps`

### Google login check fails
- Delete the `profile/` directory and retry
- The script will pause for manual login

### United page doesn't load flight results
- Check your network connection
- Increase `NAV_TIMEOUT` in `.env`
- The page may have anti-bot protections; try again with a fresh profile

### No network matches captured
- Verify the United page loads flight results (check screenshots in `output/`)
- Price data may be embedded in the initial HTML rather than XHR calls

## Platform Support

Tested on Windows and Linux. macOS should also work.
