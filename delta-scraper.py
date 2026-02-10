#!/usr/bin/env python3
"""
Delta Airlines Flight Search Automation — Standalone Single File

Attaches to an already-running Chrome via --remote-debugging-port=9222.
Navigates to delta.com, fills origin/destination, selects One Way,
picks a departure date, and clicks Search.

Install & run:
    pip install selenium
    python delta-scraper.py

Requires chromedriver.exe in the same directory (must match your Chrome version).

Before running, start Chrome with:
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        --remote-debugging-port=9222
        --user-data-dir="C:\\Users\\waqar\\AppData\\Local\\Google\\Chrome\\User Data"
        --profile-directory="Profile 9"
"""

import json
import random
import sys
import time
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

REMOTE_DEBUG_PORT = 9222
CHROMEDRIVER_PATH = r"chromedriver.exe"

DELTA_URL = "https://www.delta.com/flight-search/search"

ORIGIN_CODE = "SFO"
DESTINATION_CODE = "NRT"
DEPARTURE_MONTH = "April"
DEPARTURE_YEAR = "2026"
DEPARTURE_DAY = "2"


def log(level, ctx, msg, err=None):
    ts = datetime.now(timezone.utc).isoformat()
    line = f"[{ts}] [{level}] [{ctx}] {msg}"
    if level == "ERROR":
        print(line, file=sys.stderr)
        if err:
            import traceback
            traceback.print_exc()
    elif level == "WARN":
        print(line, file=sys.stderr)
    else:
        print(line)


def human_delay(min_s=0.5, max_s=1.5):
    time.sleep(random.uniform(min_s, max_s))


def human_type(driver, element, text, min_char_delay=0.08, max_char_delay=0.2):
    for ch in text:
        driver.execute_script("""
            var el = arguments[0];
            var ch = arguments[1];
            el.value += ch;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent('keydown', { key: ch }));
            el.dispatchEvent(new KeyboardEvent('keyup', { key: ch }));
        """, element, ch)
        time.sleep(random.uniform(min_char_delay, max_char_delay))


def verify_chrome_reachable():
    url = f"http://127.0.0.1:{REMOTE_DEBUG_PORT}/json/version"
    try:
        resp = urllib.request.urlopen(url, timeout=5)
        info = json.loads(resp.read())
        log("INFO", "browser", f"Chrome reachable -- {info.get('Browser', 'unknown')}")
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

    options = webdriver.ChromeOptions()
    options.add_experimental_option("debuggerAddress", f"127.0.0.1:{REMOTE_DEBUG_PORT}")

    service = ChromeService(CHROMEDRIVER_PATH)
    driver = webdriver.Chrome(service=service, options=options)
    driver.set_page_load_timeout(60)
    driver.implicitly_wait(5)

    log("INFO", "browser", "Attached to remote Chrome successfully")
    return driver


def navigate_to_delta(driver):
    log("INFO", "navigate", "Going to Delta homepage...")
    driver.get("https://www.delta.com/apac/en")
    human_delay(8, 12)
    log("INFO", "navigate", f"Page loaded: {driver.title}")


def select_origin(driver, code):
    log("INFO", "origin", f"Selecting origin airport: {code}")
    wait = WebDriverWait(driver, 20)

    from_el = wait.until(EC.presence_of_element_located((By.ID, "fromAirportName")))
    human_delay(0.5, 1.0)
    driver.execute_script("arguments[0].click();", from_el)
    log("INFO", "origin", "Clicked origin field, waiting for modal...")
    human_delay(1.5, 2.5)

    search_input = wait.until(EC.presence_of_element_located((By.ID, "search_input")))
    human_delay(0.3, 0.7)

    driver.execute_script("""
        var el = arguments[0];
        el.value = '';
        el.focus();
        el.dispatchEvent(new Event('input', { bubbles: true }));
    """, search_input)
    human_delay(0.3, 0.5)

    human_type(driver, search_input, code)
    log("INFO", "origin", f"Typed '{code}', waiting for results...")
    human_delay(1.5, 2.5)

    found = driver.execute_script("""
        var lists = document.querySelectorAll("li.airport-list a.airportLookup-list");
        for (var i = 0; i < lists.length; i++) {
            var codeSpan = lists[i].querySelector("span.airport-code");
            if (codeSpan && codeSpan.textContent.trim() === arguments[0]) {
                lists[i].scrollIntoView({ block: "center" });
                lists[i].click();
                return true;
            }
        }
        return false;
    """, code)

    if found:
        log("INFO", "origin", f"Selected {code} from results")
    else:
        log("WARN", "origin", f"Could not find {code} in results, trying first item...")
        driver.execute_script("""
            var first = document.querySelector("li.airport-list a.airportLookup-list");
            if (first) first.click();
        """)

    human_delay(1.0, 2.0)


def select_destination(driver, code):
    log("INFO", "destination", f"Selecting destination airport: {code}")
    wait = WebDriverWait(driver, 20)

    to_el = wait.until(EC.presence_of_element_located((By.ID, "toAirportName")))
    human_delay(0.5, 1.0)
    driver.execute_script("arguments[0].click();", to_el)
    log("INFO", "destination", "Clicked destination field, waiting for modal...")
    human_delay(1.5, 2.5)

    search_input = wait.until(EC.presence_of_element_located((By.ID, "search_input")))
    human_delay(0.3, 0.7)

    driver.execute_script("""
        var el = arguments[0];
        el.value = '';
        el.focus();
        el.dispatchEvent(new Event('input', { bubbles: true }));
    """, search_input)
    human_delay(0.3, 0.5)

    human_type(driver, search_input, code)
    log("INFO", "destination", f"Typed '{code}', waiting for results...")
    human_delay(1.5, 2.5)

    found = driver.execute_script("""
        var lists = document.querySelectorAll("li.airport-list a.airportLookup-list");
        for (var i = 0; i < lists.length; i++) {
            var codeSpan = lists[i].querySelector("span.airport-code");
            if (codeSpan && codeSpan.textContent.trim() === arguments[0]) {
                lists[i].scrollIntoView({ block: "center" });
                lists[i].click();
                return true;
            }
        }
        return false;
    """, code)

    if found:
        log("INFO", "destination", f"Selected {code} from results")
    else:
        log("WARN", "destination", f"Could not find {code} in results, trying first item...")
        driver.execute_script("""
            var first = document.querySelector("li.airport-list a.airportLookup-list");
            if (first) first.click();
        """)

    human_delay(1.0, 2.0)


def select_trip_type_one_way(driver):
    log("INFO", "triptype", "Selecting One Way trip type...")
    wait = WebDriverWait(driver, 20)

    try:
        trip_wrapper = wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, "#selectTripType-val, .select-ui-wrapper[aria-labelledby='selectTripType-label']")
        ))
        human_delay(0.5, 1.0)
        driver.execute_script("arguments[0].click();", trip_wrapper)
        human_delay(0.8, 1.2)
    except TimeoutException:
        dropdown = driver.find_element(By.ID, "selectTripType")
        driver.execute_script("arguments[0].click();", dropdown)
        human_delay(0.8, 1.2)

    one_way_clicked = driver.execute_script("""
        var item = document.getElementById("ui-list-selectTripType1");
        if (item) {
            item.scrollIntoView({ block: "center" });
            item.click();
            return true;
        }
        var items = document.querySelectorAll(".select-ui-optionList");
        for (var i = 0; i < items.length; i++) {
            if (items[i].textContent.trim() === "One Way") {
                items[i].click();
                return true;
            }
        }
        return false;
    """)

    if one_way_clicked:
        log("INFO", "triptype", "Selected One Way")
    else:
        log("WARN", "triptype", "Could not click One Way option, trying native select...")
        driver.execute_script("""
            var sel = document.getElementById("selectTripType");
            if (sel) {
                sel.value = "ONE_WAY";
                sel.dispatchEvent(new Event('change', { bubbles: true }));
            }
        """)

    human_delay(1.5, 2.5)


def select_departure_date(driver, target_month, target_year, target_day):
    log("INFO", "date", f"Selecting departure date: {target_day} {target_month} {target_year}")
    wait = WebDriverWait(driver, 20)

    date_trigger = wait.until(EC.presence_of_element_located(
        (By.CSS_SELECTOR, "#calDepartLabelCont, .calDispValueCont")
    ))
    human_delay(0.5, 1.0)
    driver.execute_script("arguments[0].click();", date_trigger)
    log("INFO", "date", "Opened calendar")
    human_delay(1.0, 1.5)

    max_nav = 24
    for _ in range(max_nav):
        current_month = driver.execute_script(
            "var el = document.querySelector('.dl-datepicker-month-0'); return el ? el.textContent.trim() : '';"
        )
        current_year = driver.execute_script(
            "var el = document.querySelector('.dl-datepicker-year-0'); return el ? el.textContent.trim() : '';"
        )

        if not current_month:
            current_month = driver.execute_script(
                "var el = document.querySelector('.dl-datepicker-month'); return el ? el.textContent.trim() : '';"
            )
        if not current_year:
            current_year = driver.execute_script(
                "var el = document.querySelector('.dl-datepicker-year'); return el ? el.textContent.trim() : '';"
            )

        log("INFO", "date", f"Calendar showing: {current_month} {current_year}")

        if current_month.lower() == target_month.lower() and current_year == target_year:
            break

        next_btn = driver.execute_script("""
            var btn = document.querySelector('a.dl-datepicker-1');
            if (!btn) btn = document.querySelector('a[aria-label="Next"]');
            return btn;
        """)
        if next_btn:
            driver.execute_script("arguments[0].click();", next_btn)
            human_delay(0.5, 0.8)
        else:
            log("WARN", "date", "Could not find Next button")
            break
    else:
        log("WARN", "date", f"Could not navigate to {target_month} {target_year} within {max_nav} clicks")

    human_delay(0.5, 1.0)

    day_clicked = driver.execute_script("""
        var target_day = arguments[0];
        var target_month = arguments[1];
        var target_year = arguments[2];
        var links = document.querySelectorAll('.dl-datepicker-calendar a.dl-state-default');
        for (var i = 0; i < links.length; i++) {
            var label = links[i].getAttribute('aria-label') || '';
            if (label.indexOf(target_day + ' ' + target_month) !== -1 &&
                label.indexOf(target_year) !== -1) {
                links[i].scrollIntoView({ block: "center" });
                links[i].click();
                return true;
            }
        }
        for (var i = 0; i < links.length; i++) {
            if (links[i].textContent.trim() === target_day) {
                links[i].scrollIntoView({ block: "center" });
                links[i].click();
                return true;
            }
        }
        return false;
    """, target_day, target_month, target_year)

    if day_clicked:
        log("INFO", "date", f"Selected day {target_day}")
    else:
        log("WARN", "date", f"Could not click day {target_day}")

    human_delay(1.0, 1.5)

    done_btn = driver.execute_script("""
        var btns = document.querySelectorAll('.calDoneBtn, button.donebutton, .calenderDoneBtn');
        for (var i = 0; i < btns.length; i++) {
            if (btns[i].offsetParent !== null) {
                btns[i].click();
                return true;
            }
        }
        return false;
    """)
    if done_btn:
        log("INFO", "date", "Clicked Done button on calendar")
        human_delay(0.5, 1.0)


def click_search(driver):
    log("INFO", "search", "Clicking Search button...")
    human_delay(0.5, 1.0)

    clicked = driver.execute_script("""
        var btn = document.getElementById("btn-book-submit");
        if (btn && btn.offsetParent !== null) {
            btn.scrollIntoView({ block: "center" });
            btn.click();
            return "btn-book-submit";
        }
        btn = document.getElementById("btnSubmit");
        if (btn && btn.offsetParent !== null) {
            btn.scrollIntoView({ block: "center" });
            btn.click();
            return "btnSubmit";
        }
        var all = document.querySelectorAll('button[type="submit"]');
        for (var i = 0; i < all.length; i++) {
            if (all[i].textContent.trim().toUpperCase().indexOf("SEARCH") !== -1 &&
                all[i].offsetParent !== null) {
                all[i].scrollIntoView({ block: "center" });
                all[i].click();
                return "submit-button";
            }
        }
        return null;
    """)

    if clicked:
        log("INFO", "search", f"Clicked search via: {clicked}")
    else:
        log("WARN", "search", "Could not find search button, trying form submit...")
        driver.execute_script("""
            var form = document.querySelector('form[name="bookWidgetForm"]');
            if (form) form.submit();
        """)

    log("INFO", "search", "Search submitted, waiting for results page...")
    human_delay(5, 10)


def main():
    log("INFO", "main", "=== Delta Flight Search Automation ===")
    log("INFO", "main", f"Route: {ORIGIN_CODE} -> {DESTINATION_CODE}")
    log("INFO", "main", f"Date: {DEPARTURE_DAY} {DEPARTURE_MONTH} {DEPARTURE_YEAR} (One Way)")

    driver = None

    try:
        driver = launch_browser()
        navigate_to_delta(driver)

        select_origin(driver, ORIGIN_CODE)
        select_destination(driver, DESTINATION_CODE)
        select_trip_type_one_way(driver)
        select_departure_date(driver, DEPARTURE_MONTH, DEPARTURE_YEAR, DEPARTURE_DAY)
        click_search(driver)

        log("INFO", "main", f"Final URL: {driver.current_url}")
        log("INFO", "main", "=== Automation complete ===")

    except Exception as err:
        log("ERROR", "main", "Fatal error", err)
        sys.exit(1)
    finally:
        log("INFO", "main", "Done. Browser left open for inspection.")


if __name__ == "__main__":
    main()
