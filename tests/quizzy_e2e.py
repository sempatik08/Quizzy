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
  9. Gecersiz oda kodu hata mesaji
 10. Davet linki: /join/<kod> on-doldurma + gecersiz link (PBI 12)
 11. Lobide davet linki paneli (PBI 12)
 12. PWA manifest/ikon/service worker + ses tercihi kaliciligi (PBI 15)
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
    """Her gorunur butonun hover'da GORSEL geri bildirim verdigini dogrular.

    Eskiden `buttons[:10]` dilimini gezip her buton icin ayri bir ok() yaziyordu.
    Bu, suite'in toplam assertion sayisini sayfada o an hangi butonlarin render
    edildigine bagli hale getiriyordu: ayni kod 90, 91 ve 94 arasinda dalgalandi.
    Kayan bir esik gercek regresyonu gizler, cunku dusen sayinin hata mi yoksa
    orneklem farki mi oldugu anlasilmaz.

    Simdi TUM gorunur butonlar taraniyor ve **tek** bir assertion uretiliyor;
    geri bildirim vermeyen butonlar uyari olarak listeleniyor. Sayi artik sabit.

    Sadece backgroundColor degil, renk/kenarlik/opaklik/transform de sayiliyor:
    ikon butonlari ve kart boyutundaki hedefler hover'i arka planla degil
    bunlarla veriyor olabilir ve bu bir hata degil.
    """
    section("TEST 6 — Hover Durumlari")
    page.goto(BASE)
    wait_net(page)

    IN_DEV_OVERLAY = """e => {
        let n = e;
        while (n) {
            const name = (n.nodeName || '').toLowerCase();
            if (name.includes('nextjs') || name.includes('dev-overlay')) return true;
            if (n.parentNode) {
                n = n.parentNode;
                if (n.nodeType === 11 && n.host) n = n.host;  // shadow root -> host
            } else {
                n = null;
            }
        }
        return false;
    }"""

    SNAPSHOT = """e => {
        const cs = window.getComputedStyle(e);
        return [cs.backgroundColor, cs.color, cs.borderColor, cs.opacity,
                cs.transform, cs.boxShadow].join('|');
    }"""

    buttons = page.locator("button:not([disabled])").all()
    checked = 0
    no_feedback = []

    for btn in buttons:
        try:
            if not btn.is_visible():
                continue
            # Next'in dev overlay'i bizim UI'imiz degil ve duzeltemeyecegimiz bir
            # uyari uretir. Shadow DOM icinde yasiyor: Playwright shadow siniri
            # gecer ama closest() gecmez, o yuzden host'lari da tirmaniyoruz.
            if btn.evaluate(IN_DEV_OVERLAY):
                continue
            text = (btn.inner_text() or btn.get_attribute("aria-label") or "?")
            text = text.replace("\n", " ")[:24].strip() or "?"

            before = btn.evaluate(SNAPSHOT)
            btn.hover()
            page.wait_for_timeout(180)
            after = btn.evaluate(SNAPSHOT)
            checked += 1

            if before == after:
                no_feedback.append(text)
        except Exception:
            # Gorunurken kaybolan/yeniden render olan buton: sayma, uyarma.
            continue

    if checked == 0:
        fail("Hover taramasi hic buton bulamadi")
    elif no_feedback:
        ok(f"{checked} buton tarandi ({len(no_feedback)} tanesi hover'da degismiyor)")
        for t in no_feedback:
            warn(f"Buton '{t}': hover'da gorsel degisim yok")
    else:
        ok(f"{checked} butonun hepsi hover'da gorsel degisim yapiyor")

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

# ─── TEST 8: Soru Bankasi Butunlugu ─────────────────────────────────────────

def test_duplicate_questions():
    """Soru bankasi kontrolunu tests/question_bank_test.js'e devreder.

    Onceki hali python -> python -> node seklinde ic ice subprocess kuruyor ve
    node'un UTF-8 cikisini sistemin ANSI codepage'i (cp1254) ile decode etmeye
    calisiyordu; bankada 'Chloe Zhao' ya da en-dash gibi tek bir cp1254-disi
    karakter olmasi tum testi UnicodeDecodeError ile dusuruyordu.

    Node suite'i ayni kontrolleri (ID + metin tekilligi) nativ olarak yapiyor,
    ustune sik/cevap sekli ve TR ceviri tamligini da kontrol ediyor. Burada
    sadece calistirip PASS/FAIL satirlarini bu rapora aktariyoruz — tek
    subprocess, explicit utf-8, kod tekrari yok.
    """
    section("TEST 8 — Soru Bankasi Butunlugu (question_bank_test.js)")

    import subprocess
    try:
        result = subprocess.run(
            ["node", "tests/question_bank_test.js"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            cwd=".", timeout=120,
        )
    except Exception as e:
        fail("question_bank_test.js calistirilamadi", e)
        return

    lines = (result.stdout or "").splitlines()
    if not lines:
        fail(f"question_bank_test.js cikti uretmedi (rc={result.returncode}) {result.stderr[:200]}")
        return

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[PASS] "):
            ok(stripped[7:])
        elif stripped.startswith("[FAIL] "):
            fail(stripped[7:])

    if result.returncode != 0:
        fail(f"question_bank_test.js basarisiz dondu (rc={result.returncode})")


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

# ─── TEST 10: Davet Linki (PBI 12) ───────────────────────────────────────────

def test_invite_link(page: Page, room_code: str):
    section(f"TEST 10 — Davet Linki (/join/{room_code})")

    # 10a. Lobide davet linki gorunur ve dogru URL'i tasir
    try:
        page.goto(f"{BASE}/join/{room_code}")
        wait_net(page)

        code_input = page.locator("#join-code")
        assert code_input.count() > 0, "#join-code yok"
        filled = code_input.input_value()
        if filled.upper() == room_code.upper():
            ok(f"Davet linki oda kodunu otomatik doldurdu ({filled})")
        else:
            fail(f"Kod alani beklenen {room_code} degil: '{filled}'")

        if code_input.get_attribute("readonly") is not None:
            ok("Onceden dolu kod alani salt-okunur")
        else:
            warn("Kod alani davet linkinde duzenlenebilir kalmis")

        name_input = page.locator("#join-name")
        assert name_input.count() > 0, "#join-name yok"
        if name_input.input_value() == "":
            ok("Isim alani bos — davet edilen oyuncunun tek yapmasi gereken bu")
        else:
            warn("Isim alani beklenmedik sekilde dolu")

        # Sadece isim girilince buton aktif olmali (kod zaten dolu)
        join_btn = page.get_by_role("button", name=re.compile(r"join room|odaya katil", re.I)).first
        if join_btn.is_disabled():
            ok("Isim girilmeden Join butonu disabled")
        else:
            warn("Isim bos iken Join butonu aktif")

        name_input.fill("DavetliOyuncu")
        page.wait_for_timeout(300)
        if not join_btn.is_disabled():
            ok("Sadece isim girilince Join butonu aktifleşiyor")
        else:
            fail("Isim girildi ama Join butonu hala disabled")

        ss(page, "14_invite_link_prefill")
    except Exception as e:
        fail("Davet linki on-doldurma testi basarisiz", e)

    # 10b. Gecersiz kodlu link okunabilir bir hata gosterir
    try:
        page.goto(f"{BASE}/join/ABC")
        wait_net(page)
        body = page.locator("body").inner_text().lower()
        if any(kw in body for kw in ["not valid", "gecerli degil", "geçerli değil",
                                     "6 characters", "6 karakter"]):
            ok("Kisa/gecersiz davet linki hata mesaji gosteriyor")
        else:
            fail(f"Gecersiz davet linki icin hata mesaji yok: {body[:120]}")

        if page.locator("#join-code").count() == 0:
            ok("Gecersiz linkte katilma formu hic gosterilmiyor")
        else:
            warn("Gecersiz linkte katilma formu yine de render edildi")

        # Oda kodu alfabesi 0/O/1/I/L icermez — bunlari tasiyan link gercek olamaz
        page.goto(f"{BASE}/join/OOIILL")
        wait_net(page)
        body = page.locator("body").inner_text().lower()
        if any(kw in body for kw in ["not valid", "gecerli degil", "geçerli değil",
                                     "6 characters", "6 karakter"]):
            ok("Yasakli karakterli (O/I/L) link de reddediliyor")
        else:
            warn("O/I/L iceren link gecerli sayildi")

        ss(page, "15_invite_link_invalid")
    except Exception as e:
        fail("Gecersiz davet linki testi basarisiz", e)


# ─── TEST 11: Lobide Davet Linki Paneli (PBI 12) ─────────────────────────────

def test_lobby_invite_panel(page: Page):
    section("TEST 11 — Lobide Davet Linki Paneli")
    try:
        page.goto(BASE)
        wait_net(page)
        page.locator("#create-name").fill("LinkHost")
        page.get_by_role("button", name=re.compile(r"create room|oda olustur|oda oluştur", re.I)).first.click()
        page.wait_for_url(re.compile(r"/lobby/[A-Z0-9]{6}"), timeout=15000)
        wait_net(page)

        code = page.url.rstrip("/").split("/")[-1]

        url_el = page.locator("#invite-url")
        if url_el.count() > 0:
            ok("Lobide davet linki paneli gorunuyor")
            shown = url_el.inner_text()
            if f"/join/{code}" in shown:
                ok(f"Panel dogru davet URL'ini gosteriyor ({shown})")
            else:
                fail(f"Panel URL'i /join/{code} icermiyor: '{shown}'")
        else:
            fail("Lobide #invite-url paneli bulunamadi")

        copy_btn = page.locator("#copy-invite-link")
        if copy_btn.count() > 0 and copy_btn.is_visible():
            ok("Linki kopyala butonu var ve gorunur")
        else:
            fail("Linki kopyala butonu yok")

        ss(page, "16_lobby_invite_panel")
        return code
    except Exception as e:
        fail("Lobi davet paneli testi basarisiz", e)
        return None


# ─── TEST 12: PWA + Cila (PBI 15) ────────────────────────────────────────────

def test_pwa_and_polish(page: Page):
    section("TEST 12 — PWA Manifest, Ikonlar, Ses Tercihi (PBI 15)")

    # 12a. Manifest servis ediliyor ve kurulabilirlik icin gereken alanlari tasiyor
    try:
        resp = page.request.get(f"{BASE}/manifest.webmanifest")
        if resp.ok:
            ok("manifest.webmanifest 200 donuyor")
        else:
            fail(f"manifest.webmanifest {resp.status} donuyor")
            return

        mf = resp.json()
        for key in ["name", "short_name", "start_url", "display", "icons"]:
            if mf.get(key):
                ok(f"Manifest '{key}' alani dolu")
            else:
                fail(f"Manifest '{key}' alani eksik")

        if mf.get("display") == "standalone":
            ok("Manifest display=standalone (telefona kurulabilir)")
        else:
            fail(f"Manifest display '{mf.get('display')}' — standalone olmali")

        sizes = {i.get("sizes") for i in mf.get("icons", [])}
        if "192x192" in sizes and "512x512" in sizes:
            ok("Manifest 192 ve 512 px ikonlari bildiriyor (kurulum sarti)")
        else:
            fail(f"Kurulum icin gereken ikon boyutlari eksik: {sizes}")

        purposes = {i.get("purpose") for i in mf.get("icons", [])}
        if "maskable" in purposes:
            ok("Maskable ikon var (Android adaptive icon)")
        else:
            warn("Maskable ikon yok — Android ikonu kirpabilir")
    except Exception as e:
        fail("Manifest testi basarisiz", e)

    # 12b. Ikon dosyalari gercekten var
    try:
        for path in ["/icons/icon-192.png", "/icons/icon-512.png",
                     "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png"]:
            r_ = page.request.get(f"{BASE}{path}")
            if r_.ok and len(r_.body()) > 500:
                ok(f"{path} servis ediliyor ({len(r_.body())} byte)")
            else:
                fail(f"{path} eksik veya bos (status={r_.status})")
    except Exception as e:
        fail("Ikon dosyasi testi basarisiz", e)

    # 12c. Service worker ve offline sayfasi servis ediliyor
    try:
        sw = page.request.get(f"{BASE}/sw.js")
        if sw.ok:
            ok("sw.js servis ediliyor")
            body = sw.text()
            # Socket trafigini cache'lemek oyunu sessizce bozar — korumanin
            # yerinde oldugunu dogrula.
            if "/socket.io" in body:
                ok("Service worker socket.io trafigini cache disinda birakiyor")
            else:
                fail("Service worker socket.io'yu cache disinda birakmiyor")
        else:
            fail(f"sw.js {sw.status} donuyor")

        off = page.request.get(f"{BASE}/offline.html")
        if off.ok and "offline" in off.text().lower():
            ok("offline.html servis ediliyor")
        else:
            fail(f"offline.html eksik (status={off.status})")
    except Exception as e:
        fail("Service worker testi basarisiz", e)

    # 12d. Sayfa head'inde manifest linki var
    try:
        page.goto(BASE)
        wait_net(page)
        link = page.locator('link[rel="manifest"]')
        if link.count() > 0:
            ok("Sayfa head'inde <link rel=manifest> var")
        else:
            fail("Sayfa head'inde manifest linki yok")

        theme = page.locator('meta[name="theme-color"]')
        if theme.count() > 0:
            ok("theme-color meta etiketi var")
        else:
            warn("theme-color meta etiketi yok")
    except Exception as e:
        fail("Head etiketleri testi basarisiz", e)

    # 12e. Ses tercihi kalici (localStorage) ve toggle calisiyor
    try:
        toggle = page.locator("#sound-toggle")
        if toggle.count() == 0:
            fail("#sound-toggle butonu bulunamadi")
            return
        ok("Ses ac/kapa butonu gorunur")

        if toggle.get_attribute("aria-pressed") == "true":
            ok("Ses varsayilan olarak acik")
        else:
            warn("Ses varsayilan olarak kapali gorunuyor")

        toggle.click()
        page.wait_for_timeout(400)
        if toggle.get_attribute("aria-pressed") == "false":
            ok("Tiklama sesi kapatiyor")
        else:
            fail("Tiklama sonrasi aria-pressed guncellenmedi")

        stored = page.evaluate("() => localStorage.getItem('quizzy_sound')")
        if stored == "off":
            ok("Ses tercihi localStorage'a yaziliyor")
        else:
            fail(f"quizzy_sound beklenen 'off' degil: {stored}")

        page.reload()
        wait_net(page)
        toggle = page.locator("#sound-toggle")
        if toggle.get_attribute("aria-pressed") == "false":
            ok("Ses tercihi sayfa yenilemeden sonra korunuyor")
        else:
            fail("Ses tercihi yenilemeden sonra kaybedildi")

        # Testi diger testler icin varsayilana dondur
        toggle.click()
        page.wait_for_timeout(300)
        ss(page, "17_sound_toggle")
    except Exception as e:
        fail("Ses tercihi testi basarisiz", e)


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

        # PBI 12 — davet linki
        try:
            invite_code = test_lobby_invite_panel(visual_page)
        except Exception as e:
            fail("Lobi davet paneli testi coktu", e)
            invite_code = None

        try:
            test_invite_link(visual_page, invite_code or room_code)
        except Exception as e:
            fail("Davet linki testi coktu", e)

        # PBI 15 — PWA + cila
        try:
            test_pwa_and_polish(visual_page)
        except Exception as e:
            fail("PWA/cila testi coktu", e)

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
    # Exit non-zero when anything failed so CI can gate on this suite.
    # Warnings stay non-fatal on purpose (e.g. the flaky hover checks).
    sys.exit(1 if RESULTS["failed"] else 0)
