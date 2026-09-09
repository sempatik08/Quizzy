"""Drive a real 1v1 match in two browser contexts until a steal window opens,
then screenshot both sides. Verifies the steal UI actually renders."""

import os
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "tests" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

BASE_URL = os.environ.get("QUIZZY_BASE_URL", "http://localhost:3000")
OPTS = ["A", "B", "C", "D", "E"]


def main():
    results = []

    def ok(m):
        results.append(("PASS", m))
        print(f"  [PASS] {m}")

    def bad(m):
        results.append(("FAIL", m))
        print(f"  [FAIL] {m}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx1 = browser.new_context(viewport={"width": 1280, "height": 900})
        ctx2 = browser.new_context(viewport={"width": 1280, "height": 900})
        p1, p2 = ctx1.new_page(), ctx2.new_page()

        errors = []
        for pg, tag in ((p1, "P1"), (p2, "P2")):
            pg.on("pageerror", lambda e, t=tag: errors.append(f"{t}: {e}"))
            pg.on("console", lambda m, t=tag: errors.append(f"{t} console.error: {m.text}")
                  if m.type == "error" else None)

        # --- create + join ---
        p1.goto(BASE_URL)
        p1.fill("#create-name", "P1")
        p1.get_by_role("button", name=re.compile(r"create room", re.I)).first.click()
        p1.wait_for_url(re.compile(r"/lobby/"), timeout=15000)
        code = p1.url.rstrip("/").split("/")[-1]
        print(f"  oda: {code}")

        p2.goto(BASE_URL)
        p2.fill("#join-name", "P2")
        p2.fill("#join-code", code)
        p2.get_by_role("button", name=re.compile(r"join room", re.I)).first.click()
        p2.wait_for_url(re.compile(r"/lobby/"), timeout=15000)

        # --- teams ---
        p1.wait_for_timeout(700)
        p1.get_by_role("button", name=re.compile(r"join blue|mavi", re.I)).first.click()
        p2.wait_for_timeout(700)
        p2.get_by_role("button", name=re.compile(r"join red|kirmizi|kırmızı", re.I)).first.click()
        p1.wait_for_timeout(900)

        # --- lock ---
        p1.get_by_role("button", name=re.compile(r"lock|start|kilitle|baslat|başlat", re.I)).first.click()
        p1.wait_for_timeout(3500)  # coin toss is 2s

        # --- category: click whichever page offers an enabled category button ---
        picked = False
        for pg in (p1, p2):
            try:
                btn = pg.get_by_role("button", name=re.compile(r"general culture|genel kültür|genel kultur", re.I)).first
                if btn.is_visible() and not btn.is_disabled():
                    btn.click()
                    picked = True
                    break
            except Exception:
                continue
        if not picked:
            bad("Kategori secilemedi")
            print(p1.inner_text("body")[:600])
            browser.close()
            return 1

        p1.wait_for_timeout(2500)
        p1.wait_for_url(re.compile(r"/game/"), timeout=15000)
        p2.wait_for_url(re.compile(r"/game/"), timeout=15000)
        ok("Iki oyuncu da oyun ekraninda")

        p1.screenshot(path=str(SHOTS / "20_steal_scoreboard.png"))
        body = p1.inner_text("body")
        if re.search(r"steal left|çalma hakkı|calma hakki", body, re.I):
            ok("ScoreBoard'da kalan steal hakki gorunuyor")
        else:
            bad("ScoreBoard'da steal hakki gorunmuyor")

        # --- answer wrong on the active team's page ---
        VOTING = re.compile(r"your team is voting|takımın oy kullanıyor", re.I)

        def active_page():
            """The page whose own team is currently being asked to vote."""
            for pg in (p1, p2):
                try:
                    if VOTING.search(pg.inner_text("body")):
                        return pg
                except Exception:
                    pass
            return None

        def option_buttons(pg):
            out = []
            for b in pg.locator("button").all():
                try:
                    txt = (b.inner_text() or "").strip()
                    if b.is_visible() and txt[:1] in OPTS and len(txt) > 3:
                        out.append(b)
                except Exception:
                    continue
            return out

        for attempt in range(8):
            actor = active_page()
            if actor is None:
                p1.wait_for_timeout(1500)
                continue

            opts = option_buttons(actor)
            if not opts:
                p1.wait_for_timeout(1200)
                continue

            opts[0].click()
            actor.wait_for_timeout(700)
            # In 1v1 the single vote auto-resolves, so this button usually never
            # appears. Short timeout — the default 30s would outlast the steal window.
            try:
                actor.get_by_role(
                    "button", name=re.compile(r"submit final|son cevab", re.I)
                ).first.click(timeout=1200)
            except Exception:
                pass

            actor.wait_for_timeout(2800)

            combined = p1.inner_text("body") + p2.inner_text("body")
            if re.search(r"steal opportunity|çalma fırsatı|calma firsati", combined, re.I):
                ok(f"Steal banner acildi (deneme {attempt + 1})")
                break
        else:
            bad("8 denemede steal penceresi acilmadi")
            p1.screenshot(path=str(SHOTS / "22_no_steal.png"))
            p2.screenshot(path=str(SHOTS / "22b_no_steal.png"))
            browser.close()
            return 1

        actor = p1 if re.search(r"steal opportunity|çalma fırsatı",
                                p1.inner_text("body"), re.I) else p2
        other = p2 if actor is p1 else p1

        # The banner renders for BOTH teams; only the stealing team gets the
        # Pass button. That is what identifies the stealer.
        PASSBTN = re.compile(r"\bpass\b|pas geç|pas gec", re.I)
        with_pass = [pg for pg in (p1, p2) if PASSBTN.search(pg.inner_text("body"))]

        if len(with_pass) == 1:
            ok("'Pas Gec' butonu yalnizca calan takimda gorunuyor")
        elif not with_pass:
            bad("'Pas Gec' butonu hicbir tarafta gorunmuyor")
        else:
            bad("'Pas Gec' butonu iki tarafta birden gorunuyor (sizinti)")

        stealer = with_pass[0] if with_pass else actor
        watcher = p2 if stealer is p1 else p1

        stealer.screenshot(path=str(SHOTS / "23_steal_active.png"))
        watcher.screenshot(path=str(SHOTS / "24_steal_opponent_view.png"))

        s_body = stealer.inner_text("body")

        if re.search(r"\+10", s_body):
            ok("Banner +10 puani gosteriyor")
        else:
            bad("Banner +10 gostermiyor")

        # timer should show the 20s window
        m = re.search(r"\b(1\d|20|[1-9])\b\s*\n?\s*seconds", s_body, re.I)
        if m:
            ok(f"Steal sayaci gorunuyor ({m.group(1)}s <= 20)")
        else:
            print("  [i] sayac metni yakalanamadi (kritik degil)")

        if errors:
            bad(f"Sayfa hatasi: {errors[:3]}")
        else:
            ok("Konsolda sayfa hatasi yok")

        browser.close()

    failed = [m for s, m in results if s == "FAIL"]
    print("\n" + "=" * 55)
    print(f"  STEAL UI: {len(results) - len(failed)} GECTI / {len(failed)} BASARISIZ")
    print(f"  Ekran goruntuleri: {SHOTS}")
    print("=" * 55)
    return 1 if failed else 0


sys.exit(main())
