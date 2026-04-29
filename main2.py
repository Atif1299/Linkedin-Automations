from playwright.sync_api import sync_playwright
import random
import time
import requests

# -------- SELECTORS --------
POST_SELECTOR = "div[role='listitem']"
TEXT_SELECTOR = "span[data-testid='expandable-text-box']"
PROFILE_LINK_SELECTOR = "a[href*='/in/'], a[href*='/company/']"
COMMENT_INPUT_SELECTOR = "div[contenteditable='true'][role='textbox']"

# -------- API CONFIG --------
API_URL = "YOUR_API_URL"

# -------- COMMENT COUNTER --------
comment_count = 0


# -------- CLEAN TEXT --------
def clean_text(text):
    try:
        return text.encode("latin1").decode("utf-8")
    except:
        return text


# -------- GENERATE COMMENT FROM API --------
def generate_comment(post_text):

    try:

        response = requests.post(
            API_URL,
            json={
                "text": post_text
            },
            timeout=30
        )

        if response.status_code == 200:

            data = response.json()

            # Adjust based on your API response
            return data.get("comment", "")

    except Exception as e:
        print("API Error:", e)

    return ""


# -------- AUTHOR EXTRACTION --------
def extract_author(post):

    name = "N/A"
    profile_url = "N/A"

    try:

        # PRIORITY → AUTHOR AFTER FIRST HR
        hr_divs = post.locator("hr + div")

        if hr_divs.count() > 0:

            for h in range(hr_divs.count()):

                section = hr_divs.nth(h)

                # Ignore action section
                if section.locator("button").count() > 2:
                    continue

                links = section.locator(PROFILE_LINK_SELECTOR)

                if links.count() > 0:

                    for j in range(min(links.count(), 3)):

                        link = links.nth(j)

                        href = link.get_attribute("href")

                        if href:

                            raw_text = link.inner_text().strip()

                            if raw_text:

                                lines = raw_text.split("\n")

                                for line in lines:

                                    clean = line.strip()

                                    if (
                                        clean
                                        and len(clean) < 80
                                        and "comment" not in clean.lower()
                                        and "followers" not in clean.lower()
                                        and "liked" not in clean.lower()
                                        and "reposted" not in clean.lower()
                                        and "hour" not in clean.lower()
                                        and "ago" not in clean.lower()
                                        and "•" not in clean
                                        and "http" not in clean
                                    ):

                                        return clean, href

        # FALLBACK → WHOLE POST
        links = post.locator(PROFILE_LINK_SELECTOR)

        if links.count() > 0:

            for i in range(min(links.count(), 8)):

                link = links.nth(i)

                href = link.get_attribute("href")

                if href:

                    raw_text = link.inner_text().strip()

                    if raw_text:

                        lines = raw_text.split("\n")

                        for line in lines:

                            clean = line.strip()

                            if (
                                clean
                                and len(clean) < 80
                                and "comment" not in clean.lower()
                                and "followers" not in clean.lower()
                                and "liked" not in clean.lower()
                                and "reposted" not in clean.lower()
                                and "hour" not in clean.lower()
                                and "ago" not in clean.lower()
                                and "•" not in clean
                                and "http" not in clean
                            ):

                                return clean, href

    except:
        pass

    return name, profile_url


# -------- COMMENT POSTER --------
def comment_on_post(post, generated_comment):

    global comment_count

    try:

        buttons = post.locator("button")

        clicked = False

        # Click first Comment button
        for i in range(buttons.count()):

            btn = buttons.nth(i)

            try:

                text = btn.inner_text().strip().lower()

                if text == "comment":

                    btn.scroll_into_view_if_needed()
                    time.sleep(random.uniform(1, 2))

                    btn.click()

                    clicked = True
                    break

            except:
                pass

        if not clicked:
            print("Comment button not found")
            return False

        # Wait for textbox
        time.sleep(random.uniform(2, 4))

        comment_boxes = post.locator(COMMENT_INPUT_SELECTOR)

        if comment_boxes.count() == 0:
            print("Comment box not found")
            return False

        comment_box = comment_boxes.last

        comment_box.click()

        # Human typing
        for char in generated_comment:
            comment_box.type(char, delay=random.randint(20, 60))

        time.sleep(random.uniform(2, 4))

        # Submit comment
        submit_buttons = post.locator("button")

        submitted = False

        for i in range(submit_buttons.count()):

            btn = submit_buttons.nth(i)

            try:

                txt = btn.inner_text().strip().lower()

                if txt == "comment":

                    btn.click()

                    submitted = True
                    break

            except:
                pass

        if submitted:

            comment_count += 1

            print(f"✓ Comment posted successfully")
            print(f"✓ Total comments posted: {comment_count}")

            delay = random.randint(20, 45)

            print(f"Waiting {delay}s before next action")

            time.sleep(delay)

            return True

    except Exception as e:
        print("Comment Error:", e)

    return False


# -------- SCRAPER --------
def scrape_feed(page):

    seen = set()

    max_scrolls = 5

    for scroll in range(max_scrolls):

        print(f"\nScroll {scroll + 1}")

        try:

            page.wait_for_timeout(random.randint(2500, 4500))

            posts = page.locator(POST_SELECTOR)

            count = posts.count()

            print(f"Found posts: {count}")

            for i in range(count):

                try:

                    time.sleep(random.uniform(1.5, 3))

                    post = posts.nth(i)

                    # -------- AUTHOR --------
                    name, profile_url = extract_author(post)

                    # -------- POST TEXT --------
                    text = "N/A"

                    try:

                        text_elements = post.locator(TEXT_SELECTOR)

                        if text_elements.count() > 0:

                            text = text_elements.first.inner_text().strip()

                    except:
                        pass

                    name = clean_text(name)
                    text = clean_text(text)

                    if text == "N/A":
                        continue

                    unique_key = f"{profile_url}_{text[:150]}"

                    if unique_key in seen:
                        continue

                    seen.add(unique_key)

                    print(f"\nAuthor: {name}")
                    print(f"Generating comment...")

                    # -------- API COMMENT --------
                    generated_comment = generate_comment(text)

                    if not generated_comment:
                        print("No comment generated")
                        continue

                    print(f"Generated Comment: {generated_comment}")

                    # -------- POST COMMENT --------
                    comment_on_post(post, generated_comment)

                except Exception as e:
                    print("Post error:", e)

        except Exception as e:
            print("Scroll error:", e)

        # -------- SCROLL --------
        scroll_distance = random.randint(2500, 5000)

        page.evaluate(f"""
            window.scrollBy({{
                top: {scroll_distance},
                behavior: 'smooth'
            }});
        """)

        wait_time = random.randint(5000, 10000)

        print(f"Waiting {wait_time/1000:.1f} sec...")

        page.wait_for_timeout(wait_time)

        if scroll % 4 == 3:

            long_break = random.randint(15, 35)

            print(f"Taking break: {long_break}s")

            time.sleep(long_break)


# -------- MAIN --------
with sync_playwright() as p:

    browser = p.chromium.launch_persistent_context(
        user_data_dir="linkedin_session",
        headless=False
    )

    page = browser.new_page()

    page.goto("https://www.linkedin.com/feed/")

    print("Login manually ONCE.")
    print("After login press ENTER.")

    input()

    scrape_feed(page)

    print(f"\nFinished.")
    print(f"Total Comments Posted: {comment_count}")

    browser.close()