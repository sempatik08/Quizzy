# Quizzy — Büyüme, Trafik ve Gelir Planı (Ekim 2026)

**Tarih:** 2026-10-18 · `docs/growth-plan.md`'nin (2026-09-18) devamı
**Soru:** Ürünü nasıl geliştiririz, trafiği nasıl artırırız, pasif gelire nasıl ulaşırız?
**Yöntem:** Canlı veri (Vercel Analytics, 17 Eylül–18 Ekim) + güncel dış kaynaklar.
Tahmin olan yerler **tahmin** diye işaretli.

---

## 1. Veri ne söylüyor

Son 31 günde canlı site:

| Adım | Ziyaretçi | Önceki adıma göre |
|---|---|---|
| Ana sayfa | 28 | — |
| Lobi (oda kurdu / katıldı) | 13 | %46 |
| Oyun (maç başladı) | 5 | **%38** |
| Davet linkiyle gelen (`/join`) | 4 | — |

| Kaynak | Ziyaretçi |
|---|---|
| Referrer yok ("direct") | 26 |
| facebook.com + m.facebook.com | 4 |
| vercel.com | 2 |
| Google / arama | **0** |

Haftalık ziyaretçi: 4 · 12 · 3 · 1 · 10. Yani trafik var ama **tesadüfi**; her hafta sıfıra
dönebiliyor.

### Üç kök neden

**K1 — Yalnız gelen ziyaretçi oynayamıyor (soğuk başlangıç).** Lobiye giren 13 kişiden 8'i
maça hiç başlamamış. Takımlı mod iki taraf ister; sosyal medyadan tek başına gelen biri oda
kurar, kimse gelmez, çıkar. Bu, skribbl.io gibi oyunların neden **herkese açık odalar** ile
çalıştığının da cevabı: oyuncu bir arkadaş grubu olmadan anında bir odaya düşüyor.
*Hipotez (doğrulanmalı):* Railway servisi `sleepApplication: true` — ilk ziyaretçi uyuyan
sunucuyu uyandırırken birkaç saniye "Creating…"da bekliyor olabilir; bu da düşüşe katkı verir.

**K2 — Kalıcı bir edinme kanalı yok.** Aramadan sıfır ziyaret: sitenin 4 rotası ve neredeyse
hiç metni yok, Google'ın indeksleyeceği bir şey yok. Tek kanal kendi sosyal paylaşımlarımız
(Postdeck). Instagram'ın uygulama içi tarayıcısı referrer'ı silmediği sürece bunlar
"direct" görünüyor — yani hangi gönderinin işe yaradığını **bilmiyoruz**.

**K3 — Geri dönme sebebi yok.** Maç bitince oyuncunun ertesi gün gelmesi için bir neden yok.
Wordle'ın büyümesi iki şeyden geldi: günde bir kez oynanan ortak bulmaca ve paylaşılabilir
sonuç ızgarası.

### Gelir için dürüst tablo

Ayda ~30 ziyaretçiyle hangi reklam modeli seçilirse seçilsin gelir **sıfıra yakın** olur.
Reklam geliri oyun sayısıyla doğru orantılı büyür; önce trafik, sonra gelir. Aşağıdaki sıra
bunu yansıtıyor: önce sızıntıyı kapat (K1), sonra kanal aç (K2), sonra geri getir (K3),
gelir ise kanalla birlikte gelsin (portal gelir paylaşımı).

---

## 2. Önceliklendirilmiş PBI'lar

Etki: **Y**üksek / **O**rta / **D**üşük. Süre kabaca, tek geliştirici.

| # | PBI | Kök neden | Etki | Süre | Bağımlılık |
|---|---|---|---|---|---|
| 22 | Huni ölçümü + UTM | hepsi | O (karar verdirir) | 1 gün | — |
| 23 | Soğuk sunucu kontrolü | K1 | O | 1 saat | — |
| 24 | Yalnız kalanı kurtar | K1 | **Y** | 1 gün | PBI 19 merge |
| 25 | Türkçe karakter düzeltmesi | güven | O | 1 gün | — |
| 26 | Günün Quizi + paylaşım ızgarası | K3, K2 | **Y** | 4 gün | — |
| 27 | Kısa domain | K2 | O | 1 gün | — |
| 28 | CrazyGames yayını | K2, gelir | **Y** | 1–1,5 hafta | 24, 27 |
| 29 | SEO içerik sayfaları | K2, gelir | O (2–3 ay gecikmeli) | 1 hafta | 27 |
| 30 | Herkese açık odalar | K1 | Y (trafik varsa) | 3 gün | 28 |
| 31 | Destek linki | gelir | D | 1 saat | — |
| 32 | Kendi sitede maç arası reklam | gelir | O | 2 gün | 27, 29, trafik |
| 33 | Quizzy Pro (sunucu + özel quiz) | gelir | O–Y | PBI 20–21 + 1 hafta | 20, 21 |
| 34 | Discord Activity | K2 | O | 2 hafta | sonra |

### PBI 22 — Huni ölçümü + UTM
- **Sebep:** Düşüşün *var olduğunu* biliyoruz (13 → 5), *nerede ve neden* olduğunu bilmiyoruz.
  Sosyal gönderilerin hangisinin işe yaradığını da bilmiyoruz (referrer'sız).
- **Yapılacak:** Vercel custom event'leri: `room_created(mode)`, `invite_copied`,
  `join_opened`, `match_started(mode, players)`, `match_finished`, `lobby_abandoned(saniye)`.
  Postdeck gönderilerine ve biyografi linkine `?utm_source=instagram&utm_campaign=<gönderi>`.
- **Sonuç:** Bu listedeki diğer her maddenin işe yarayıp yaramadığı ölçülebilir hâle gelir.
- **Kabul:** Vercel'de 6 event görünür; UTM'li bir link `utmSource` kırılımında çıkar.

### PBI 23 — Soğuk sunucu kontrolü
- **Sebep:** Railway servisi boştayken uyuyor. Oda kuran ilk kişi sunucu uyanırken bekliyor
  olabilir (**hipotez**).
- **Yapılacak:** Uyandırma süresini ölç (`/health` 20 dk boşluktan sonra). 3 sn'den uzunsa
  uykuyu kapat (aylık maliyet artışı küçük) ya da ana sayfa açılır açılmaz `/health`'e
  ön-ısıtma isteği at.
- **Kabul:** Ana sayfa açıldıktan sonra oda kurma 1 sn altında.

### PBI 24 — Yalnız kalanı kurtar
- **Sebep:** K1. Lobiye girenlerin %62'si maça başlamıyor.
- **Yapılacak:** Lobide 30 sn boyunca tek kişi kalınca bir kart çıkar: "Arkadaşın gelmedi mi?"
  → (a) **WhatsApp'ta paylaş** butonu (Türkiye'de birincil mesajlaşma), (b) **"Tek başına
  başla"**: odayı Herkes Kendine moduna çevirip hemen başlat. Ana sayfadaki Hızlı Oyna da
  tek kişiyse Herkes Kendine'yi önersin.
- **Sonuç:** Gelen her ziyaretçi en az bir maç oynar; maç sonu paylaşım ekranına ulaşan
  kişi sayısı artar → paylaşım → direct trafik.
- **Kabul:** `lobby_abandoned` oranı ölçülebilir şekilde düşer (PBI 22 ile).

### PBI 25 — Türkçe karakter düzeltmesi
- **Sebep:** Bugün oynarken bulundu: ~240 sorunun Türkçe metni Türkçe karakter içermiyor
  ("Yaklasik … yuzolcumu"). En çok matematik 97, anime 57, coğrafya 51. Türk kitlesinde bu
  "özensiz uygulama" izlenimi verir ve sosyal kartlara da taşınır.
- **Yapılacak:** Etkilenen soruları listele, düzelt; `question_bank_test.js`'e "uzun `text_tr`
  en az bir Türkçe karakter içersin ya da izin listesinde olsun" kontrolü ekle.
- **Kabul:** Test geçer, liste sıfır.

### PBI 26 — Günün Quizi + paylaşım ızgarası
- **Sebep:** K3 (geri dönme sebebi yok) ve K1 (tek kişi oynayabilmeli). Wordle'ın viral
  olması, sonuç paylaşımı eklendikten sonra başladı.
- **Yapılacak:** `/gunun-quizi`: herkese aynı 10 soru (tarihten deterministik seçim), günde
  bir kez, kayıt yok. Sonuçta `Quizzy #142 🟩🟩🟥🟩⬜… 8/10 ⚡ 41 sn` gibi emoji ızgarası
  + link; WhatsApp/kopyala. Günlük sıralama (misafir profiliyle). Ertesi gün için geri sayım.
- **Sonuç:** Günlük alışkanlık + her paylaşım yeni bir giriş noktası. Ayrıca tek başına
  oynanabilir ilk Quizzy deneyimi; sosyal gönderilerin hedef linki bu olur.
- **Kabul:** Aynı gün iki cihaz aynı soruları görür; ızgara metni panoya kopyalanır; aynı
  profil ikinci kez puanlanmaz.

### PBI 27 — Kısa domain
- **Sebep:** `quizzy-two-jade.vercel.app` paylaşılacak bir link değil; WhatsApp'ta güven
  vermez. SEO, AdSense/H5 başvurusu ve portal sayfası için de gerekli.
- **Yapılacak:** Kısa bir alan adı al (Vercel'e bağla), Railway `CLIENT_URL` ve
  `metadataBase`'i güncelle, eski URL'den 301.
- **Kabul:** Yeni domain'de oda kurulur, OG önizlemesi doğru görünür.

### PBI 28 — CrazyGames yayını
- **Sebep:** K2 ve gelir. Hazır bir oyuncu kitlesi ve reklam gelir paylaşımı aynı pakette;
  reklam onlarca yönetiliyor, AdSense onayı gerekmiyor.
- **Yapılacak:** Önce SDK'sız **Basic Launch** (kalite kontrolü + trafik testi), tutarsa
  **Full Launch**: SDK, oda bilgisini SDK'ya bildirme (platformun Katıl/Davet butonları için),
  davet parametreleri, SDK üzerinden reklam (maç arası). Davetle gelen oyuncuya onboarding
  ekranı gösterilmemeli (platform şartı). Oyunun 50 MB ilk yükleme sınırının çok altında.
- **Risk:** Kitle ağırlıkla İngilizce ve yalnız geliyor → PBI 24 ve Herkes Kendine burada
  kritik. Gelir payı oranı resmî olarak yayınlanmıyor; üçüncü taraf kaynaklar %50–70 diyor
  (**doğrulanmadı**).
- **Kabul:** Oyun CrazyGames'te yayında; platform üzerinden davetle odaya girilebiliyor.

### PBI 29 — SEO içerik sayfaları
- **Sebep:** Aramadan sıfır trafik; 9000 soru bir içerik varlığı ama hiç indekslenmiyor.
  Aynı sayfalar Google'ın reklam başvurularındaki "yeterli içerik" şartını da karşılar.
- **Yapılacak:** 15 kategori sayfası (`/kategori/tarih` — örnek 20 soru + açıklamalı cevap +
  "bu kategoride oyna"), "Nasıl oynanır", "Günün Quizi" arşivi, `sitemap.xml`, `robots.txt`.
  Hedef aramalar: "arkadaşlarla bilgi yarışması", "online bilgi yarışması oyna",
  "takımlı quiz", "sınıf için bilgi yarışması".
- **Sonuç:** 2–3 ay gecikmeli ama birikimli, kendiliğinden gelen trafik.
- **Kabul:** Search Console'da sayfalar indekste.

### PBI 30 — Herkese açık odalar
- **Sebep:** K1'in kalıcı çözümü: arkadaşsız gelen biri dolu bir odaya düşer.
- **Yapılacak:** Herkes Kendine için "Rastgele odaya katıl": açık bir lobi varsa oraya, yoksa
  yeni açık oda; maç ortasında sonraki soruda katılım.
- **Ön koşul:** Aynı anda birden fazla kişi olmalı — bu yüzden portaldan (PBI 28) sonra.
  Boş "açık oda" listesi, hiç olmamasından daha kötü görünür.

### PBI 31 — Destek linki
- **Sebep:** Maliyeti sıfır, trafik beklemez; küçük ama gerçek.
- **Yapılacak:** Footer ve maç sonu ekranında sade bir "Quizzy'yi destekle" linki
  (Buy Me a Coffee / Kreosus).

### PBI 32 — Kendi sitede maç arası reklam
- **Sebep:** Kendi domainimizdeki oyunlardan gelir.
- **Yapılacak:** Google'ın **H5 Games Ads** ürünü (oyunlara özel; başvuruyla). Tam ekran reklam
  yalnızca ekran geçişlerinde (`adBreak()`): maç sonu → tekrar oyna arası. Ödüllü reklam
  yalnızca kullanıcı seçerse (örn. "reklam izle, ek joker"). **Soru sırasında reklam yok.**
- **Neden PBI 5'in yerine:** soru altındaki 10–20 px banner standart bir reklam birimine
  uymuyor ve oyun reklam politikasına göre de doğru yer geçişler.
- **Ön koşul:** domain + içerik + ölçülebilir trafik. Onay garanti değil.

### PBI 33 — Quizzy Pro (sunucu ekranı + özel quiz)
- **Sebep:** En yüksek kişi başı gelir. Öğretmen, eğitmen ve etkinlik düzenleyenler özel quiz
  için ödüyor: Kahoot bireysel planları ~19 $/ay'dan başlıyor, Quizizz/Wayground ~216 $/yıl.
- **Yapılacak:** PBI 20 (sunucu ekranı) ve PBI 21 (odaya özel sorular) ücretsiz kalır; Pro =
  kaydedilen quiz kütüphanesi, 30+ oyuncu, rapor (kim neyi bildi, CSV), marka/logo.
  Önce tek seferlik "etkinlik bileti" (düğün, doğum günü, şirket) — abonelikten satması kolay.
- **Ön koşul:** PBI 20–21 canlıda ve gerçekten kullanılıyor olmalı. Ödeme altyapısı
  (iyzico/Stripe) ve hesap sistemi gerektirir — bu ürünün en büyük kapsam artışı.

### PBI 34 — Discord Activity
- **Sebep:** Arkadaş grupları zaten Discord'da; oyun "link at, birlikte oyna" için tasarlandı.
- **Neden sonra:** Discord'da göz atılacak genel bir vitrin yok, keşif ağızdan ağıza; SDK
  entegrasyonu 2 hafta civarı. Kanıtlanmış bir oyun döngüsünden sonra mantıklı.

### Yapılmaması önerilen
- **Soru altına AdSense banner (eski PBI 5):** standart boyuta uymuyor, en düşük getirili
  yerleşim, "thin content" reddi riski. Yerine PBI 28 + 32.
- **Ücretli reklam kampanyası:** sızıntı (K1) kapanmadan para harcamak, gelenin %62'sini
  lobide kaybetmek demek.

---

## 3. Önerilen sıra ve gerekçe

1. **Bu hafta (ölç + sızıntıyı kapat):** 22 → 23 → 24 → 25 → 31
   Hepsi ucuz; 24, mevcut trafiğin maça dönüşme oranını doğrudan artırır.
2. **Sonraki 2 hafta (geri getir + kanal):** 26 → 27 → 28
   Günün Quizi sosyal gönderilerin hedefi olur; domain ve CrazyGames ilk gerçek kanal ve ilk gelir.
3. **Sonraki ay (birikimli kanal):** 29, ardından trafik geldiyse 30 ve 32.
4. **Kullanım görülünce:** PBI 20 → 21 → 33. Discord (34) ondan sonra.

**Başarı ölçütü (PBI 22 kurulunca):** lobi → maç oranı %38 → %70+, haftalık ziyaretçi
istikrarlı şekilde 50+, Günün Quizi paylaşım oranı.

---

## Kaynaklar
- Vercel Web Analytics, proje `quizzy`, 2026-09-17 – 2026-10-18 (canlı veri)
- [CrazyGames — Requirements](https://docs.crazygames.com/requirements/intro/) ve [Multiplayer](https://docs.crazygames.com/requirements/multiplayer/)
- [CrazyGames Developer Guide (2026) — Cinevva](https://app.cinevva.com/guides/publish-game-crazygames)
- [CrazyGames launches new Developer Portal with revenue share options](https://start-it-x.prezly.com/crazygames-launches-new-developer-portal-with-revenue-share-options)
- [H5 Games Ads — Google AdSense](https://adsense.google.com/start/h5-games-ads/) · [Ad Placement API signup](https://developers.google.com/ad-placement/docs/signup) · [H5 games ad policy](https://support.google.com/publisherpolicies/answer/11975916)
- [Discord — Build where the world plays](https://discord.com/blog/build-where-the-world-plays) · [Publish on Discord Activities (2026) — Cinevva](https://app.cinevva.com/guides/publish-game-discord-activities) · [PocketGamer.biz](https://www.pocketgamer.biz/discord-activities-opens-up-to-all-developers-to-make-games-on-the-platform)
- [Kahoot pricing — Panquiz](https://panquiz.com/en/blog/kahoot-pricing/) · [Kahoot pricing — TriviaMaker](https://triviamaker.com/kahoot-pricing/) · [Best Kahoot alternatives 2026 — Rework](https://resources.rework.com/tools/events/best-kahoot-alternatives)
- [Wordle — Wikipedia](https://en.wikipedia.org/wiki/Wordle) (paylaşım ızgarası ve viral büyüme)
- [Critical Play: Skribbl.io — Mechanics of Magic](https://mechanicsofmagic.com/2024/04/24/critical-play-skribbl-io-krystal-li/) (açık odalar, otomatik doldurma)
- Türkçe rakipler: [Zarta](https://www.bluestacks.com/campaign/com.potensas.zarta/tr), [Trivia Crack](https://www.bluestacks.com/campaign/com.etermax.preguntados.lite/tr/), [QuizDüellosu](https://www.tamindir.com/indir/quizduellosu/amp/) — hepsi kurulum isteyen mobil uygulama
