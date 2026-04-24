# LinkedIn Feed Scraper with Human-Like Delays (Playwright)

from playwright.sync_api import sync_playwright
import csv
import random
import time

OUTPUT_FILE = "linkedin_feed.csv"

# Main post container
POST_SELECTOR = "div[role='listitem']"

# Name selector (based on your HTML structure)
NAME_SELECTOR = "p.fa3ef5cf._46224383._28a25f3f.c9d8a9ab.e8e29d48._25094419.f9223754._0f36af5b._28aa3f0d._4ab61046"

# Text selector (based on your HTML structure)
TEXT_SPAN_SELECTOR = "span[data-testid='expandable-text-box']"
TEXT_SPAN_SELECTOR = "span._564faccf.c9d8a9ab.e8e29d48._25094419.f9223754._0f36af5b._5ac7fe5d.cc76b7da"


def scrape_feed(page):
    collected = []
    seen = set()

    max_scrolls = 2  # short test run

    for scroll in range(max_scrolls):

        print(f"\nScroll {scroll + 1}")

        try:
            # Wait slightly before reading posts
            page.wait_for_timeout(random.randint(2500, 4500))

            posts = page.locator(POST_SELECTOR)
            count = posts.count()

            print(f"Found posts: {count}")

            for i in range(min(count, 4)):  # limit to first 3-4 posts for testing

                # Human delay between reading posts
                time.sleep(random.uniform(0.8, 2.2))

                try:
                    post = posts.nth(i)

                    name = "N/A"
                    text = "N/A"

                    # -------- NAME --------
                    try:
                        name_element = post.locator(NAME_SELECTOR).first

                        if name_element.count() > 0:
                            name = name_element.inner_text().strip()
                    except:
                        pass

                    # -------- TEXT --------
                    try:
                        text_element = post.locator(TEXT_SPAN_SELECTOR).first

                        if text_element.count() > 0:
                            text = text_element.inner_text().strip()
                    except:
                        pass

                    # Skip empty results
                    if name == "N/A" and text == "N/A":
                        continue

                    unique_key = f"{name}_{text[:80]}"

                    if unique_key not in seen:
                        seen.add(unique_key)

                        collected.append({
                            "name": name,
                            "post_text": text
                        })

                        print(f"Saved: {name}")

                except Exception as e:
                    print("Post error:", e)

        except Exception as e:
            print("Scroll error:", e)

        # Human-like scrolling
        scroll_distance = random.randint(2500, 5000)

        page.evaluate(f"""
            window.scrollBy({{
                top: {scroll_distance},
                behavior: 'smooth'
            }});
        """)

        # Random wait after scrolling
        wait_time = random.randint(4000, 9000)

        print(f"Waiting {wait_time/1000:.1f} sec...")

        page.wait_for_timeout(wait_time)

        # Occasional long break
        if scroll % 7 == 0 and scroll != 0:
            long_break = random.randint(20, 45)

            print(f"Taking human break: {long_break}s")

            time.sleep(long_break)

    return collected


def save_csv(data):
    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=["name", "post_text"])
        writer.writeheader()
        writer.writerows(data)

    print(f"Saved {len(data)} posts to CSV")


with sync_playwright() as p:

    browser = p.chromium.launch_persistent_context(
        user_data_dir="linkedin_session",
        headless=False
    )

    page = browser.new_page()

    page.goto("https://www.linkedin.com/feed/")

    print("Login with Google manually ONCE.")
    print("After login, press ENTER in terminal.")

    input()

    data = scrape_feed(page)

    save_csv(data)

    browser.close()

