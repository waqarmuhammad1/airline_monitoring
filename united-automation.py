#!/usr/bin/env python3
"""
Selenium United Airlines Automation — Standalone Single File (Stealth)

Install & run:
    pip install undetected-chromedriver selenium
    python united-automation.py
"""

import json
import os
import re
import sys
import time
import traceback
import urllib.request
from datetime import datetime, timezone

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    ElementClickInterceptedException,
    ElementNotInteractableException,
    StaleElementReferenceException,
    WebDriverException,
)

# ─── CONFIG (all hardcoded, no .env needed) ──────────────────────────────────

REMOTE_DEBUG_PORT = 9222
OUTPUT_DIR = "./output"
NAV_TIMEOUT = 60
MAX_RETRIES = 3
RETRY_BACKOFF_S = 1.0
MAX_BODY_SIZE = 2_097_152
UNITED_URL = (
    "https://www.united.com/en/us/fsr/choose-flights"
    "?f=SFO&t=NRT&d=2026-04-10&r=2026-04-12"
    "&sc=7%2C7&px=1&taxng=1&newHP=True&clm=7&st=bestmatches&tqp=R"
)

PRICE_PATTERN = re.compile(
    r'\$\s?\d[\d,]*(\.\d{2})?|"USD"|"amount"\s*:\s*\d|"price"\s*:\s*\d|"fare"\s*:\s*\d',
    re.IGNORECASE,
)

# ─── LOGGER ──────────────────────────────────────────────────────────────────

def log(level, ctx, msg, err=None):
    ts = datetime.now(timezone.utc).isoformat()
    line = f"[{ts}] [{level}] [{ctx}] {msg}"
    if level == "ERROR":
        print(line, file=sys.stderr)
        if err:
            traceback.print_exception(type(err), err, err.__traceback__, file=sys.stderr)
    elif level == "WARN":
        print(line, file=sys.stderr)
    else:
        print(line)

# ─── FILE HELPERS ────────────────────────────────────────────────────────────

def ensure_dir(d):
    os.makedirs(d, exist_ok=True)

def output_path(filename):
    ensure_dir(OUTPUT_DIR)
    return os.path.join(OUTPUT_DIR, filename)

def append_jsonl(file_path, data):
    ensure_dir(os.path.dirname(file_path))
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(data) + "\n")

def write_json(file_path, data):
    ensure_dir(os.path.dirname(file_path))
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    log("INFO", "file", f"Wrote: {file_path}")

def save_screenshot(file_path, driver):
    ensure_dir(os.path.dirname(file_path))
    driver.save_screenshot(file_path)
    log("INFO", "file", f"Screenshot: {file_path}")

# ─── RETRY ───────────────────────────────────────────────────────────────────

def with_retry(fn, label="operation", max_retries=MAX_RETRIES, backoff_s=RETRY_BACKOFF_S):
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            return fn()
        except Exception as err:
            last_error = err
            msg = str(err)
            log("WARN", "retry", f"{label} attempt {attempt}/{max_retries} failed: {msg}")
            if attempt < max_retries:
                delay = backoff_s * attempt
                log("INFO", "retry", f"Retrying in {delay}s...")
                time.sleep(delay)
    raise last_error

# ─── EXTRA EVASION INIT SCRIPT ───────────────────────────────────────────────

EXTRA_EVASIONS = """
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
"""

# ─── BROWSER ─────────────────────────────────────────────────────────────────

def verify_chrome_reachable():
    url = f"http://127.0.0.1:{REMOTE_DEBUG_PORT}/json/version"
    try:
        resp = urllib.request.urlopen(url, timeout=5)
        info = json.loads(resp.read())
        log("INFO", "browser", f"Chrome reachable — {info.get('Browser', 'unknown')}")
        return True
    except Exception:
        return False

def launch_browser():
    log("INFO", "browser", f"Attaching to Chrome on port {REMOTE_DEBUG_PORT}...")

    if not verify_chrome_reachable():
        print("\n" + "=" * 60)
        print("  ERROR: Chrome is NOT reachable on port", REMOTE_DEBUG_PORT)
        print("=" * 60)
        print("\nIMPORTANT: You must close ALL Chrome windows/processes first,")
        print("then relaunch Chrome with the debug flag:\n")
        print('  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"', end=" ")
        print(f'--remote-debugging-port={REMOTE_DEBUG_PORT}', end=" ")
        print('--user-data-dir="C:\\Users\\waqar\\AppData\\Local\\Google\\Chrome\\User Data"', end=" ")
        print('--profile-directory="Profile 9"')
        print("\nThe --remote-debugging-port flag is IGNORED if Chrome is")
        print("already running. You must kill all chrome.exe first.")
        print("\nOn Windows run:  taskkill /F /IM chrome.exe")
        print("Then relaunch with the command above.")
        print("=" * 60 + "\n")
        raise RuntimeError(f"Chrome not reachable on port {REMOTE_DEBUG_PORT}")

    ws_url = f"http://127.0.0.1:{REMOTE_DEBUG_PORT}"
    resp = urllib.request.urlopen(f"{ws_url}/json/version", timeout=5)
    info = json.loads(resp.read())
    ws_debugger = info.get("webSocketDebuggerUrl", "")
    log("INFO", "browser", f"DevTools WS: {ws_debugger}")

    options = webdriver.ChromeOptions()
    options.add_experimental_option("debuggerAddress", f"127.0.0.1:{REMOTE_DEBUG_PORT}")

    driver = webdriver.Chrome(options=options)
    driver.set_page_load_timeout(NAV_TIMEOUT)
    driver.implicitly_wait(5)

    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": EXTRA_EVASIONS})

    log("INFO", "browser", "Attached to remote Chrome + extra evasions injected")
    return driver

# ─── NETWORK CAPTURE(via Chrome Performance Logging) ────────────────────────

total_requests = 0
matched_responses = 0
matched_urls = []
capture_start_time = None

def process_performance_logs(driver, jsonl_path):
    global total_requests, matched_responses
    try:
        logs = driver.get_log("performance")
    except Exception:
        return

    for entry in logs:
        try:
            msg = json.loads(entry["message"])["message"]
            method = msg.get("method", "")

            if method == "Network.requestWillBeSent":
                total_requests += 1

            if method == "Network.responseReceived":
                params = msg.get("params", {})
                response = params.get("response", {})
                req_type = params.get("type", "")

                if req_type not in ("XHR", "Fetch"):
                    continue

                url = response.get("url", "")
                status = response.get("status", 0)
                headers = response.get("headers", {})
                request_id = params.get("requestId", "")

                body_text = ""
                try:
                    body_resp = driver.execute_cdp_cmd(
                        "Network.getResponseBody", {"requestId": request_id}
                    )
                    body_text = body_resp.get("body", "")
                    if len(body_text) > MAX_BODY_SIZE:
                        body_text = body_text[:MAX_BODY_SIZE] + "...[TRUNCATED]"
                except Exception:
                    body_text = "[COULD NOT READ BODY]"

                if not PRICE_PATTERN.search(body_text) and not PRICE_PATTERN.search(url):
                    continue

                append_jsonl(jsonl_path, {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "url": url,
                    "method": params.get("response", {}).get("requestHeaders", {}).get(":method", "GET"),
                    "status": status,
                    "responseHeaders": headers,
                    "requestPostData": None,
                    "bodySnippet": body_text[:5000] + "...[SNIPPET]" if len(body_text) > 5000 else body_text,
                    "bodyLength": len(body_text),
                })
                matched_responses += 1
                matched_urls.append(url)
                log("INFO", "capture", f"Matched: {url} ({status})")
        except Exception:
            continue

def write_summary():
    end_time = datetime.now(timezone.utc)
    elapsed_ms = int((end_time - capture_start_time).total_seconds() * 1000)
    write_json(output_path("run-summary.json"), {
        "startTime": capture_start_time.isoformat(),
        "endTime": end_time.isoformat(),
        "elapsedMs": elapsed_ms,
        "totalRequests": total_requests,
        "matchedResponses": matched_responses,
        "matchedUrls": list(set(matched_urls)),
    })
    log("INFO", "capture", f"Summary: {matched_responses} matched / {total_requests} total")

# ─── UNITED NAVIGATION ──────────────────────────────────────────────────────

def navigate_to_united(driver):
    log("INFO", "navigate", f"Going to: {UNITED_URL}")

    with_retry(
        lambda: driver.get(UNITED_URL),
        "United navigation",
    )

    time.sleep(5)

    ui_selectors = [
        '[data-testid="flight-result"]', '[class*="FlightCard"]', '[class*="flight-card"]',
        '[class*="flight-result"]', '[role="grid"]', '[role="table"]',
        '[class*="BookCalendar"]', '[class*="book-calendar"]', '[class*="grid"]',
        'button[class*="cabin"]', '[data-testid*="cabin"]', '[class*="slick-slide"]',
        '[class*="price"]', '[class*="fare"]',
    ]

    for sel in ui_selectors:
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, sel))
            )
            log("INFO", "navigate", f"Found element: {sel}")
            break
        except TimeoutException:
            continue

    save_screenshot(output_path("united-search.png"), driver)
    log("INFO", "navigate", "Page loaded, screenshot saved")

# ─── GRID TRAVERSAL ─────────────────────────────────────────────────────────

GRID_SELECTORS = [
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
]

BROAD_SELECTORS = [
    'td button',
    'td [role="button"]',
]

OVERLAY_SELECTORS = [
    'button[aria-label="Close"]',
    'button[aria-label="close"]',
    '[class*="modal"] button[class*="close"]',
    '[class*="overlay"] button[class*="close"]',
    '#onetrust-accept-btn-handler',
]

OVERLAY_TEXT_MATCHES = ["No thanks", "Accept", "Got it", "Continue"]

def dismiss_overlays(driver):
    for sel in OVERLAY_SELECTORS:
        try:
            el = driver.find_element(By.CSS_SELECTOR, sel)
            if el.is_displayed():
                el.click()
                log("INFO", "grid", f"Dismissed overlay: {sel}")
                time.sleep(0.5)
        except (NoSuchElementException, ElementClickInterceptedException, StaleElementReferenceException):
            continue

    for text in OVERLAY_TEXT_MATCHES:
        try:
            buttons = driver.find_elements(By.TAG_NAME, "button")
            for btn in buttons:
                try:
                    if btn.is_displayed() and text.lower() in (btn.text or "").lower():
                        btn.click()
                        log("INFO", "grid", f"Dismissed overlay button: {text}")
                        time.sleep(0.5)
                        break
                except StaleElementReferenceException:
                    continue
        except Exception:
            continue

def find_grid_elements(driver):
    for sel in GRID_SELECTORS:
        try:
            elements = driver.find_elements(By.CSS_SELECTOR, sel)
            if elements:
                log("INFO", "grid", f"Found {len(elements)} elements: {sel}")
                return elements, sel
        except Exception:
            continue

    for sel in BROAD_SELECTORS:
        try:
            elements = driver.find_elements(By.CSS_SELECTOR, sel)
            if len(elements) >= 2:
                log("INFO", "grid", f"Broad match {len(elements)} elements: {sel}")
                return elements, sel
        except Exception:
            continue

    try:
        buttons = driver.find_elements(By.TAG_NAME, "button")
        price_buttons = [b for b in buttons if "$" in (b.text or "")]
        if len(price_buttons) >= 2:
            log("INFO", "grid", f"Text match {len(price_buttons)} buttons with '$'")
            return price_buttons, "button:contains($)"
    except Exception:
        pass

    return None, None

def traverse_grid(driver):
    log("INFO", "grid", "Starting grid traversal...")

    click_log_path = output_path("click-log.jsonl")
    jsonl_path = output_path("network-matches.jsonl")
    elements, matched_selector = find_grid_elements(driver)

    if not elements:
        log("ERROR", "grid", "No clickable grid elements found")
        save_screenshot(output_path("no-grid-found.png"), driver)
        return

    total = len(elements)
    log("INFO", "grid", f"Traversing {total} elements ({matched_selector})")

    for i in range(total):
        record = {
            "index": i,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "selector": matched_selector,
            "textContent": "",
            "success": False,
        }

        try:
            try:
                elements = driver.find_elements(By.CSS_SELECTOR, matched_selector) if matched_selector != "button:contains($)" else [
                    b for b in driver.find_elements(By.TAG_NAME, "button") if "$" in (b.text or "")
                ]
            except Exception:
                pass

            if i >= len(elements):
                log("INFO", "grid", f"Element {i} no longer exists, skipping")
                continue

            el = elements[i]

            try:
                if not el.is_displayed():
                    log("INFO", "grid", f"Element {i} not visible, skipping")
                    continue
            except StaleElementReferenceException:
                log("INFO", "grid", f"Element {i} stale, skipping")
                continue

            try:
                record["textContent"] = el.text or ""
            except Exception:
                record["textContent"] = ""

            try:
                driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", el)
            except Exception:
                pass
            time.sleep(0.3)

            def click_fn():
                dismiss_overlays(driver)
                el.click()

            with_retry(click_fn, f"click element {i}")

            record["success"] = True
            log("INFO", "grid", f"Clicked {i}: \"{str(record['textContent'])[:60]}\"")

            time.sleep(1.5)

            process_performance_logs(driver, jsonl_path)

        except Exception as err:
            record["error"] = str(err)
            log("WARN", "grid", f"Click {i} failed: {record['error']}")

        append_jsonl(click_log_path, record)

    save_screenshot(output_path("grid-traversal-done.png"), driver)
    log("INFO", "grid", "Grid traversal complete")

# ─── MAIN ────────────────────────────────────────────────────────────────────

def main():
    global capture_start_time

    log("INFO", "main", "=== Selenium United Automation (Stealth) ===")

    driver = None

    try:
        driver = launch_browser()

        capture_start_time = datetime.now(timezone.utc)
        jsonl_path = output_path("network-matches.jsonl")
        log("INFO", "capture", "Network capture started")

        driver.execute_cdp_cmd("Network.enable", {})

        navigate_to_united(driver)

        process_performance_logs(driver, jsonl_path)

        traverse_grid(driver)

        process_performance_logs(driver, jsonl_path)
        write_summary()

        log("INFO", "main", "=== Automation complete ===")
    except Exception as err:
        log("ERROR", "main", "Fatal error", err)
        sys.exit(1)
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
            log("INFO", "main", "Browser closed")

if __name__ == "__main__":
    main()
