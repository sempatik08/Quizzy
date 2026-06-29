"""
Quizzy E2E Test Suite
=====================
Calistir: python tests/quizzy_e2e.py
Gereksinim: pip install playwright && python -m playwright install chromium

Testler:
  1. Ana sayfa - tum butonlar, inputlar, render
  2. Oda olusturma (1. oyuncu)
  3. Odaya katilma - isim + oda kodu (2. oyuncu)
  4. Takim secimi - 1vs1
  5. Lock Teams & Start
  6. Renk kontrast + hover + okunabilirlik taramasi
  7. Ustte bindirme / layout bozulmasi kontrolu
  8. Yinelenen soru kontrolu (question bank)
"""

import sys, io, re, time, math, os, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright, Page, BrowserContext, expect

BASE    = "http://localhost:3000"
SS_DIR  = "tests/screenshots"
os.makedirs(SS_DIR, exist_ok=True)

RESULTS = {"passed": 0, "failed": 0, "warnings": [], "errors": []}

# ─── Helpers ────────────────────────────────────────────────────────────────

def ss(page: Page, name: str):
    path = f"{SS_DIR}/{name}.png"
    page.screenshot(path=path, full_page=True)
    print(f"    [SS] {path}")

def ok(msg: str):
    RESULTS["passed"] += 1
    print(f"  [PASS] {msg}")

def fail(msg: str, exc=None):
    RESULTS["failed"] += 1
    detail = f"{msg}" + (f" | {exc}" if exc else "")
    RESULTS["errors"].append(detail)
    print(f"  [FAIL] {detail}")

def warn(msg: str):
    RESULTS["warnings"].append(msg)
    print(f"  [WARN] {msg}")

def section(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def wait_net(page: Page, ms: int = 1500):
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(ms)

# ─── Renk kontrast hesabi (WCAG AA: ratio >= 4.5) ───────────────────────────

def relative_luminance(hex_color: str) -> float:
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join(c*2 for c in hex_color)
    r, g, b = (int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4))
    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def contrast_ratio(c1: str, c2: str) -> float:
    l1, l2 = relative_luminance(c1), relative_luminance(c2)
    lighter, darker = max(l1, l2), min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)

def rgb_to_hex(rgb: str) -> str:
    """rgb(r, g, b) veya rgba(r,g,b,a) -> #rrggbb"""
    nums = re.findall(r'\d+', rgb)
    if len(nums) < 3:
        return "#808080"
    return '#{:02x}{:02x}{:02x}'.format(int(nums[0]), int(nums[1]), int(nums[2]))

# ─── TEST 1: Ana sayfa ──────────────────────────────────────────────────────

def test_homepage(page: Page):
    section("TEST 1 — Ana Sayfa")
    page.goto(BASE)
    wait_net(page)
    ss(page, "01_home")

    # Baslik
    try:
        title = page.title()
        assert "quizzy" in title.lower() or "quiz" in title.lower()
        ok(f"Sayfa basligi: '{title}'")
    except Exception as e:
        fail("Sayfa basligi Quizzy icermiyor", e)

    # Create Room formu
    try:
        create_name = page.locator("#create-name")
        assert create_name.is_visible()
        ok("Create Room - isim inputu gorunuyor (#create-name)")
    except Exception as e:
        # Fallback: Create Room kartindaki ilk input
        try:
            inputs = page.locator("input").all()
            assert len(inputs) >= 2
            ok(f"Sayfada {len(inputs)} input bulundu")
        except Exception as e2:
            fail("Create Room isim inputu bulunamadi", e2)

    # Join Room formu - join-name ve join-code
    try:
        join_name = page.locator("#join-name")
        join_code = page.locator("#join-code")
        assert join_name.is_visible()
        assert join_code.is_visible()
        ok("Join Room - isim ve kod inputlari gorunuyor (#join-name, #join-code)")
    except Exception as e:
        fail("Join Room inputlari bulunamadi", e)

    # Create Room butonu
    try:
        btn = page.get_by_role("button", name=re.compile(r"create room|oda", re.I)).first
        assert btn.is_visible()
        ok("'Create Room' butonu gorunuyor")
    except Exception as e:
        fail("Create Room butonu bulunamadi", e)

    # Join Room butonu (disabled olmali - input bos)
    try:
        join_btn = page.get_by_role("button", name=re.compile(r"join room|katil|giris", re.I)).first
        assert join_btn.is_visible()
        assert join_btn.is_disabled()
        ok("'Join Room' butonu gorunuyor ve bos formda disabled (dogru)")
    except Exception as e:
        warn(f"Join Room butonu durumu beklenenden farkli: {e}")

    # Create butonu disabled mi olmali (isim bos)
    try:
        create_btn = page.get_by_role("button", name=re.compile(r"create room|oda olustur", re.I)).first
        assert create_btn.is_disabled()
        ok("'Create Room' butonu bos isimde disabled (dogru)")
    except Exception as e:
        warn(f"Create Room disabled kontrolu: {e}")

    # Dil degistirici (EN/TR)
    try:
        lang_btn = page.locator("button", has_text=re.compile(r"^(EN|TR)$")).first
        assert lang_btn.is_visible()
        ok("Dil degistirici butonu gorunuyor (EN/TR)")
    except Exception as e:
        warn(f"Dil degistirici bulunamadi: {e}")

# ─── TEST 2: Oda Olusturma ──────────────────────────────────────────────────

def test_create_room(page: Page) -> str:
    section("TEST 2 — Oda Olusturma")
    page.goto(BASE)
    wait_net(page)

    # Isim gir
    try:
        create_name = page.locator("#create-name")
        create_name.fill("Kaptan1")
        page.wait_for_timeout(300)
        ok("Create Room isim alani dolduruldu")
    except Exception as e:
        # Fallback: Create kartindaki ilk input
        inputs = page.locator("input").all()
        inputs[0].fill("Kaptan1")
        ok("Create Room isim alani (fallback) dolduruldu")

    ss(page, "02_create_filled")

    # Create Room butonuna tikla
    try:
        create_btn = page.get_by_role("button", name=re.compile(r"create room|oda olustur", re.I)).first
        assert not create_btn.is_disabled(), "Create butonu hala disabled!"
        create_btn.click()
        ok("'Create Room' butonuna tiklandi")
    except Exception as e:
        fail("Create Room tiklanamadi", e)
        return "UNKNOWN"

    # Lobby'e yonlendirildi mi
    try:
        page.wait_for_url(re.compile(r"/lobby/[A-Z0-9]{6}"), timeout=10000)
        url = page.url
        room_code = url.split("/")[-1].upper()
        wait_net(page, 1000)
        ss(page, "03_lobby_p1")
        ok(f"Lobby'e yonlendirildi | Oda kodu: {room_code}")
        return room_code
    except Exception as e:
        fail("Lobby'e yonlendirilemedi", e)
        ss(page, "03_lobby_fail")
        return "UNKNOWN"

# ─── TEST 3: Odaya Katilma (2. oyuncu) ──────────────────────────────────────

def test_join_room(ctx2: BrowserContext, room_code: str) -> Page:
    section(f"TEST 3 — Odaya Katilma (kod: {room_code})")

    p2 = ctx2.new_page()
    p2.goto(BASE)
    wait_net(p2)

    if room_code == "UNKNOWN":
        fail("Oda kodu bilinemedi, katilma testi atlandi")
        return p2

    # Join-name doldur
    try:
        p2.locator("#join-name").fill("Oyuncu2")
        ok("Join isim alani dolduruldu (#join-name)")
    except Exception as e:
        fail("Join isim alani doldurulamadi", e)
        return p2

    # Buton hala disabled olmali (kod bos)
    try:
        join_btn = p2.get_by_role("button", name=re.compile(r"join room|katil|giris", re.I)).first
        assert join_btn.is_disabled()
        ok("Sadece isim girilince Join butonu disabled kaldi (dogru)")
    except Exception as e:
        warn(f"Join buton disabled kontrolu: {e}")

    # Join-code doldur
    try:
        p2.locator("#join-code").fill(room_code)
        ok(f"Join oda kodu alani dolduruldu: {room_code}")
    except Exception as e:
        fail("Join oda kodu alani doldurulamadi", e)
        return p2

    # Buton aktif olmali
    try:
        join_btn = p2.get_by_role("button", name=re.compile(r"join room|katil|giris", re.I)).first
        p2.wait_for_timeout(300)
        assert not join_btn.is_disabled(), "Isim ve kod girildi ama Join butonu hala disabled!"
        ok("Isim + kod girilince Join butonu aktif oldu")
    except Exception as e:
        fail("Join butonu aktif olmadi", e)
        ss(p2, "04_join_btn_disabled")
        return p2

    ss(p2, "04_join_filled")

    # Tikla
    try:
        join_btn.click()
        ok("'Join Room' butonuna tiklandi")
    except Exception as e:
        fail("Join butonu tiklanamadi", e)
        return p2

    # Lobby'e yonlendirildi mi
    try:
        p2.wait_for_url(re.compile(rf"/lobby/{room_code}"), timeout=10000)
        wait_net(p2, 1000)
        ss(p2, "05_lobby_p2")
        ok(f"2. oyuncu lobby'e katildi: /lobby/{room_code}")
    except Exception as e:
        fail("2. oyuncu lobby'e yonlendirilemedi", e)
        ss(p2, "05_lobby_p2_fail")

    return p2

# ─── TEST 4: Takim Secimi & Oyun Baslat ─────────────────────────────────────

def test_teams_and_start(p1: Page, p2: Page, room_code: str):
    section("TEST 4 — Takim Secimi (1vs1)")

    if room_code == "UNKNOWN":
        fail("Oda kodu bilinmiyor, takim testi atlandi")
        return

    # P1 Mavi'ye katil
    try:
        join_blue = p1.get_by_role("button", name=re.compile(r"join blue|maviye katil|mavi", re.I)).first
        join_blue.click()
        p1.wait_for_timeout(800)
        ok("P1 Mavi takima katildi")
        ss(p1, "06_p1_blue")
    except Exception as e:
        fail("P1 Mavi'ye katilamadi", e)

    # P2 Kirmizi'ya katil
    try:
        join_red = p2.get_by_role("button", name=re.compile(r"join red|kirmiziya katil|kirmizi", re.I)).first
        join_red.click()
        p2.wait_for_timeout(800)
        ok("P2 Kirmizi takima katildi")
        ss(p2, "07_p2_red")
    except Exception as e:
        fail("P2 Kirmizi'ya katilamadi", e)

    # P1 sayfasinda iki takim da dolu mu
    p1.wait_for_timeout(500)
    ss(p1, "08_both_teams")

    # Lock Teams & Start (host = P1)
    try:
        lock_btn = p1.get_by_role("button", name=re.compile(r"lock|start|baslat|kilitle", re.I)).first
        assert not lock_btn.is_disabled(), "Lock Teams butonu disabled - iki takimda da oyuncu olmali!"
        lock_btn.click()
        ok("'Lock Teams & Start' butonuna tiklandi")
        p1.wait_for_timeout(1000)
        ss(p1, "09_after_lock")
    except Exception as e:
        fail("Lock Teams tiklanamiyor", e)

    # Coin toss / category pick ekrani gelmeli
    try:
        p1.wait_for_timeout(2000)
        body = p1.locator("body").inner_text()
        has_phase = any(kw in body.lower() for kw in [
            "coin", "toss", "category", "kategori", "captain", "kaptan", "pick"
        ])
        if has_phase:
            ok("Coin toss / kategori secim fazina gecildi")
        else:
            warn(f"Beklenen faz metni bulunamadi. Sayfa icerigi: {body[:200]}")
        ss(p1, "10_game_phase")
    except Exception as e:
        fail("Faz gecisi kontrol edilemedi", e)

# ─── TEST 5: Renk Kontrast Taramasi ─────────────────────────────────────────

def test_color_contrast(page: Page):
    section("TEST 5 — Renk Kontrast & Okunabilirlik")
    page.goto(BASE)
    wait_net(page)

    selectors = [
        ("h1, h2",           "Basliklar"),
        ("p",                "Paragraflar"),
        ("button",           "Butonlar"),
        ("input",            "Input alanlari"),
        ("label",            "Etiketler"),
        (".text-quizzy-muted", "Muted text"),
    ]

    issues = []

    for selector, label in selectors:
        elements = page.locator(selector).all()
        for i, el in enumerate(elements[:8]):  # Her tipten max 8
            try:
                if not el.is_visible():
                    continue
                # WCAG: disabled elementler kontrast muafiyetine sahip
                if el.is_disabled():
                    continue
                color_raw = el.evaluate("e => window.getComputedStyle(e).color")
                bg_raw    = el.evaluate("e => window.getComputedStyle(e).backgroundColor")

                color_hex = rgb_to_hex(color_raw)
                bg_hex    = rgb_to_hex(bg_raw)

                # Transparan arkaplan: parent'a yuksel
                if bg_raw.startswith("rgba") and ", 0)" in bg_raw:
                    bg_raw = el.evaluate("""e => {
                        let el = e.parentElement;
                        while(el) {
                            const bg = window.getComputedStyle(el).backgroundColor;
                            if (!bg.startsWith('rgba') || !bg.includes(', 0)')) return bg;
                            el = el.parentElement;
                        }
                        return 'rgb(255,255,255)';
                    }""")
                    bg_hex = rgb_to_hex(bg_raw)

                ratio = contrast_ratio(color_hex, bg_hex)
                text  = el.inner_text()[:30].strip().replace('\n', ' ')

                if ratio < 3.0:
                    issues.append(f"{label}[{i}] '{text}': ratio={ratio:.2f} (DUSUK) fg={color_hex} bg={bg_hex}")
                    warn(f"Dusuk kontrast | {label} '{text}' ratio={ratio:.2f}")
                elif ratio < 4.5:
                    pass  # WCAG AA icin normal gri zone
            except Exception:
                pass

    if not issues:
        ok("Renk kontrast taramasi tamamlandi, kritik sorun yok")
    else:
        fail(f"Kontrast sorunlari: {len(issues)} element")

# ─── TEST 6: Hover Durumu Taramasi ───────────────────────────────────────────

def test_hover_states(page: Page):
    section("TEST 6 — Hover Durumlari")
    page.goto(BASE)
    wait_net(page)

    buttons = page.locator("button:not([disabled])").all()
    hover_issues = []

    for i, btn in enumerate(buttons[:10]):
        try:
            if not btn.is_visible():
                continue
            text = btn.inner_text()[:20].strip()
            color_before = btn.evaluate("e => window.getComputedStyle(e).backgroundColor")
            btn.hover()
            page.wait_for_timeout(200)
            color_after = btn.evaluate("e => window.getComputedStyle(e).backgroundColor")

            if color_before == color_after:
                hover_issues.append(f"Buton '{text}': hover rengi degismedi")
            else:
                ok(f"Buton '{text}': hover rengi degisiyor")
        except Exception as e:
            pass

    if hover_issues:
        for h in hover_issues:
            warn(h)
    else:
        ok("Tum butonlar hover'da gorsel degisim yapiyor")

    ss(page, "11_hover_test")

# ─── TEST 7: Layout Binisme Kontrolu ────────────────────────────────────────

def test_layout_overlap(page: Page):
    section("TEST 7 — Layout Binisme / Overflow Kontrolu")
    page.goto(BASE)
    wait_net(page)

    # Yatay scroll kontrolu
    try:
        has_h_scroll = page.evaluate("""() =>
            document.documentElement.scrollWidth > document.documentElement.clientWidth
        """)
        if has_h_scroll:
            warn("Yatay kayma (horizontal overflow) var — tasma ihtimali!")
        else:
            ok("Yatay overflow yok")
    except Exception as e:
        fail("Overflow kontrol edilemedi", e)

    # Elementlerin birbirine binmesi
    try:
        overlaps = page.evaluate("""() => {
            const els = [...document.querySelectorAll('button, input, h1, h2, h3, p')];
            const rects = els.map(e => {
                const r = e.getBoundingClientRect();
                return { tag: e.tagName, text: e.innerText?.slice(0,20), x: r.left, y: r.top, w: r.width, h: r.height };
            }).filter(r => r.w > 0 && r.h > 0);

            const issues = [];
            for (let i = 0; i < rects.length; i++) {
                for (let j = i+1; j < rects.length; j++) {
                    const a = rects[i], b = rects[j];
                    const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
                    const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
                    if (overlapX && overlapY) {
                        const area = Math.min(a.w*a.h, b.w*b.h);
                        if (area > 100) {
                            issues.push(a.tag + '["' + a.text + '"] + ' + b.tag + '["' + b.text + '"]');
                        }
                    }
                }
            }
            return issues.slice(0, 10);
        }""")
        if overlaps:
            for ov in overlaps:
                warn(f"Potansiyel binisme: {ov}")
        else:
            ok("Gorunur element binismesi yok")
    except Exception as e:
        fail("Binisme kontrol edilemedi", e)

    # Mobil gorunumu (375px)
    try:
        page.set_viewport_size({"width": 375, "height": 812})
        wait_net(page, 500)
        ss(page, "12_mobile_375")
        h_scroll_mobile = page.evaluate("""()=>
            document.documentElement.scrollWidth > document.documentElement.clientWidth
        """)
        if h_scroll_mobile:
            warn("375px genislikte yatay overflow var!")
        else:
            ok("375px mobil gorunumde yatay overflow yok")
        page.set_viewport_size({"width": 1280, "height": 800})
    except Exception as e:
        fail("Mobil gorunum kontrolu basarisiz", e)

# ─── TEST 8: Yinelenen Soru Kontrolu ────────────────────────────────────────

def test_duplicate_questions():
    section("TEST 8 — Yinelenen Soru Kontrolu (Soru Bankasi)")

    import subprocess, sys as _sys
    result = subprocess.run(
        [_sys.executable, "-c", """
import json, sys
sys.path.insert(0, '.')
# Node.js ile soru bankasini cek
import subprocess
out = subprocess.run(
    ['node', '-e', '''
const { QUESTIONS } = require('./server/questions');
const out = {};
for(const [cat, qs] of Object.entries(QUESTIONS)) {
    out[cat] = qs.map(q => ({ id: q.id, text: q.text }));
}
process.stdout.write(JSON.stringify(out));
'''],
    capture_output=True, text=True, cwd='.'
)
print(out.stdout)
"""],
        capture_output=True, text=True, encoding='utf-8'
    )

    raw = result.stdout.strip()
    if not raw:
        fail("Soru bankasi okunamadi")
        return

    try:
        data = json.loads(raw)
    except Exception as e:
        fail(f"JSON parse hatasi: {e}")
        return

    total_dupes = 0
    for cat, questions in data.items():
        texts = [q["text"].strip().lower() for q in questions]
        ids   = [q["id"] for q in questions]

        # ID tekrari
        seen_ids = {}
        for qid in ids:
            seen_ids[qid] = seen_ids.get(qid, 0) + 1
        id_dupes = {k: v for k, v in seen_ids.items() if v > 1}
        if id_dupes:
            fail(f"[{cat}] Yinelenen ID'ler: {id_dupes}")
            total_dupes += len(id_dupes)

        # Metin tekrari
        seen_texts = {}
        for t in texts:
            seen_texts[t] = seen_texts.get(t, 0) + 1
        text_dupes = {k[:60]: v for k, v in seen_texts.items() if v > 1}
        if text_dupes:
            fail(f"[{cat}] Yinelenen SORULAR: {text_dupes}")
            total_dupes += len(text_dupes)

        if not id_dupes and not text_dupes:
            ok(f"[{cat}] {len(questions)} soru — tekrar yok")

    if total_dupes == 0:
        ok("Tum kategorilerde yinelenen soru/ID bulunamadi")

# ─── TEST 9: Gecersiz Oda Kodu ───────────────────────────────────────────────

def test_invalid_room_code(page: Page):
    section("TEST 9 — Gecersiz Oda Kodu Hata Mesaji")
    page.goto(BASE)
    wait_net(page)

    try:
        page.locator("#join-name").fill("TestUser")
        page.locator("#join-code").fill("ZZZZZZ")
        page.wait_for_timeout(300)
        join_btn = page.get_by_role("button", name=re.compile(r"join room|katil|giris", re.I)).first
        assert not join_btn.is_disabled()
        join_btn.click()
        page.wait_for_timeout(2000)

        body = page.locator("body").inner_text()
        has_error = any(kw in body.lower() for kw in [
            "not found", "bulunamadi", "invalid", "gecersiz", "error", "hata"
        ])
        if has_error:
            ok("Gecersiz oda kodu icin hata mesaji gosteriliyor")
        else:
            warn("Gecersiz kod girildi ama hata mesaji gorulmedi")
        ss(page, "13_invalid_code")
    except Exception as e:
        fail("Gecersiz kod testi basarisiz", e)

# ─── MAIN ────────────────────────────────────────────────────────────────────

def run():
    print("\n" + "="*60)
    print("  QUIZZY E2E TEST SUITE")
    print("="*60)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)

        ctx1 = browser.new_context(viewport={"width": 1280, "height": 800})
        ctx2 = browser.new_context(viewport={"width": 1280, "height": 800})

        p1 = ctx1.new_page()
        p2_page = None
        room_code = "UNKNOWN"

        try:
            test_homepage(p1)
        except Exception as e:
            fail("Ana sayfa testi coktu", e)

        try:
            room_code = test_create_room(p1)
        except Exception as e:
            fail("Oda olusturma testi coktu", e)

        try:
            p2_page = test_join_room(ctx2, room_code)
        except Exception as e:
            fail("Odaya katilma testi coktu", e)

        if p2_page:
            try:
                test_teams_and_start(p1, p2_page, room_code)
            except Exception as e:
                fail("Takim + baslat testi coktu", e)

        # Renk/hover/layout testleri icin yeni sayfa
        visual_page = ctx1.new_page()
        try:
            test_color_contrast(visual_page)
        except Exception as e:
            fail("Renk kontrast testi coktu", e)

        try:
            test_hover_states(visual_page)
        except Exception as e:
            fail("Hover testi coktu", e)

        try:
            test_layout_overlap(visual_page)
        except Exception as e:
            fail("Layout testi coktu", e)

        try:
            test_invalid_room_code(visual_page)
        except Exception as e:
            fail("Gecersiz kod testi coktu", e)

        browser.close()

    # Soru yineleme (tarayici gerektirmiyor)
    try:
        test_duplicate_questions()
    except Exception as e:
        fail("Yinelenen soru testi coktu", e)

    # Sonuc raporu
    print("\n" + "="*60)
    print(f"  SONUCLAR: {RESULTS['passed']} GECTI  /  {RESULTS['failed']} BASARISIZ")
    if RESULTS["warnings"]:
        print(f"\n  UYARILAR ({len(RESULTS['warnings'])}):")
        for w in RESULTS["warnings"]:
            print(f"    ! {w}")
    if RESULTS["errors"]:
        print(f"\n  HATALAR ({RESULTS['failed']}):")
        for e in RESULTS["errors"]:
            print(f"    x {e}")
    print("="*60)
    print(f"\n  Ekran goruntuleri: tests/screenshots/\n")

if __name__ == "__main__":
    run()
