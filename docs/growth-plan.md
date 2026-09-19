# Quizzy — Geliştirme ve Büyüme Planı

**Tarih:** 2026-09-18 · Faz 2 tamamlandıktan sonra hazırlandı
**Soru:** Uygulamayı geliştirmek için daha ne yapabiliriz? Daha fazla insana nasıl erişiriz?

Bu belge araştırmaya dayanıyor; kaynaklar en sonda. Tahmin olan yerleri **tahmin** diye
işaretledim.

---

## 0. Şu an nerede duruyoruz

Elimizde olan (Faz 1 + Faz 2 sonunda):

- 12 kategori × 280 soru = **3360 soru**, EN + TR tam çeviri
- 4 oyun modu, joker, steal, seyirci, emoji, rematch, davet linki
- PWA (telefona kurulabilir), ses, konfeti
- Misafir profili + liderlik tablosu, oda kalıcılığı, analytics
- Canlıda: https://quizzy-two-jade.vercel.app
- **Kullanıcı: pratikte sıfır.** Vercel Analytics 2026-09-17'de açıldı, veri yeni birikiyor.

Yani sorun ürün eksikliği değil, **dağıtım**. Aşağıdaki sıra bunu yansıtıyor.

---

## 1. En önemli bulgu: bu oyun tipinin trafiği nereden geliyor

Benzer tarayıcı-tabanlı parti oyunlarının trafik dağılımı (Similarweb, gartic.io):

| Kaynak | Pay |
|---|---|
| **Direct** (link paylaşımı, yer imi) | **%51** |
| Organic Search | 2. sırada |
| Organic Social | 3. sırada |

**Bunun anlamı:** bu oyunlarda büyüme SEO'dan değil, **insanların birbirine link atmasından**
geliyor. Tek bir oturumda 1 kişi gelir, 3 kişiye link atar. Faz 2'de davet linkini 1. maddeye
koymamız doğru karardı — ama iş orada bitmiyor, çünkü şu an linki **alan** kişi geliyor,
**atan** kişi hiçbir yerden gelmiyor. Girişi beslemek gerekiyor.

Bir de ölçek referansı: skribbl.io 2026 Nisan'da **1,4M ziyaret/ay**, en büyük pazarı
**Hindistan (%28,6)**. Yani bu kategoride İngilizce + mobil + sıfır-kurulum kombinasyonu
gerçekten büyük bir kitleye çıkıyor.

---

## 2. Rekabet konumu — farkımız ne?

Türkçe "bilgi yarışması oyunu" araması neredeyse tamamen **tek oyunculu mobil uygulamalarla**
dolu (Tarih Bilgi Yarışması, Basic Quiz, Milyonluk Quiz, Genel Kültür Bilgi Yarışması...).
Poki ve Playgama'nın Türkçe quiz kategori sayfaları var ama içerikleri de ağırlıkla tek
oyunculu.

**Quizzy'nin gerçek farkı üç şey:**

1. **Takım halinde, gerçek zamanlı** — rakiplerin çoğu tek oyunculu ya da sıra tabanlı düello
2. **Kurulum yok, kayıt yok** — link at, isim yaz, oyna
3. **Steal + joker + 4 mod** — sadece soru sorup geçmiyor, karar üretiyor

Konumlandırma cümlesi (her yerde bunu kullanmalıyız):
> "Arkadaşlarınla takım kurup oynadığın, kurulum ve kayıt gerektirmeyen canlı bilgi yarışması."

"Quiz uygulaması" değil, **"parti oyunu"** olarak konumlandırmak lazım. Rekabet Kahoot'la
değil, skribbl.io/Gartic Phone/Jackbox'la.

---

## 3. Öncelikli aksiyon planı

Değer/maliyet sırasına göre. **Yüksek / Orta / Düşük** = beklenen etki.

### 3.1 Oyun portallarına gir — YÜKSEK, ~1 hafta

Bu listenin en yüksek getirili maddesi ve hazır kitleye doğrudan çıkış.

**CrazyGames** araştırdığım en uygun kanal, üç nedenle:

- **Çok oyunculu oyunları açıkça destekliyor**: kendi backend'ini kullanıyorsun, CrazyGames
  sadece oyun dosyalarını barındırıyor. Railway'deki socket sunucumuz olduğu gibi kalır.
  Üstüne SDK'sı **oda-katılma dinleyicisi** ve **arkadaş listesi** veriyor — davet linki
  mekanizmamızla birebir örtüşüyor.
- **Münhasırlık istemiyor**: aynı anda Poki'de, itch.io'da, Steam'de, kendi domainimizde
  olabiliriz. İstersek 2 aylık opsiyonel münhasırlık gelir payını %50 artırıyor.
- **Para kazandırıyor**: birincil model reklam gelir paylaşımı. Bu, PBI 5'in (Google Ads)
  muhtemelen daha iyi bir alternatifi — dağıtım ve gelir aynı pakette.

Gereksinimler ve bizim durumumuz:

| Gereksinim | Quizzy |
|---|---|
| İlk indirme ≤ 50 MB (SDK yoksa toplam da 50 MB) | ✅ Next build çok altında |
| ≤ 1.500 dosya | ✅ |
| PEGI 12 uyumlu içerik | ✅ soru bankası temiz |
| Tek tıkla oyuna girme | ⚠️ şu an isim + Create Room. Düzeltilebilir (bkz. 3.3) |

**Yapılacak:** CrazyGames SDK entegrasyonu + developer portal başvurusu.
**Poki** de hedef ama daha zor: davetle çalışan kürasyon modeli ve **ilk indirme ≤ 8 MB**
hedefi var — Next.js bundle'ını o boyuta indirmek ayrı bir iş.
**itch.io** en kolay ilk durak: anında sayfa, küratör yok. Trafiği düşük ama maliyeti de
neredeyse sıfır.

### 3.2 Onboarding sürtünmesini sıfıra indir — YÜKSEK, ~2 gün

Şu an ana sayfada gelen kişi **isim yazmak** zorunda. Trafiğin %51'i link paylaşımından
gelen bir oyunda bu, girişte kaybedilen en büyük yüzde (**tahmin**, ama portal
gereksinimi "tek tıkla oyna" da bunu istiyor).

- İsim alanını **önceden rastgele doldur** ("Mavi Kartal", "Hızlı Zeytin") — değiştirilebilir
  ama boş kalmaz. Profil sistemi zaten ismi hatırlıyor, ikinci gelişte hiç sormaz.
- Ana sayfaya **"Hemen Oyna"** butonu: oda kur + kategori seç + boş oda linkini panoya kopyala,
  tek tıkta.
- Oda linkine tıklayan kişi şu an isim yazıyor; orada da rastgele isimle tek tıkla girilebilsin.

### 3.3 Paylaşımı ürünün içine göm — YÜKSEK, ~2 gün

Davet linki var ama **sonuç paylaşımı** yok. Wordle'ın tüm büyümesi bu mekanizmaydı.

- Kazanan ekranına **"Sonucu paylaş"**: skor + kategori + oda linki içeren kısa metin,
  `navigator.share` (mobil) ve panoya kopyala (masaüstü).
- Skor kartını **PNG olarak üret** (canvas) — WhatsApp/Instagram story'de link metinden
  çok daha iyi yayılır.
- Maç sonu ekranında "rövanş linki" — rematch zaten var, linki de paylaşılabilir olsun.

### 3.4 Sosyal medya için içerik makinesi — YÜKSEK etki / sürekli emek

3360 sorumuz var; bu bir **içerik varlığı**, sadece oyun verisi değil.

- Günde 1 soru: "Bunu bilebilir misin?" formatında kart görseli → Instagram/TikTok/X.
  Cevap yorumda + oyun linki. Soru bankasından otomatik görsel üreten bir script yazılabilir
  (yarım gün iş, sonra günlük maliyet ~0).
- Kategori bazlı kısa videolar (anime, oyun, sinema kategorileri TikTok'ta en güçlü).
- Reddit: r/WebGames, r/incremental_games, r/InternetIsBeautiful, r/trivia. **Dikkat:**
  buralara doğrudan reklam atmak ban yer; "kendim yaptım, geri bildirim arıyorum" formatı
  çalışır ve gerçekten öyle.
- **Discord asıl kanal**: quiz/trivia sunucuları ve arkadaş grupları. Oyunun kendisi
  Discord'da oynanacak şekilde tasarlanmış (link at, birlikte oyna). Discord Activity
  olarak paketlemek ayrı ama gerçek bir seçenek (**araştırılmalı**).

### 3.5 SEO: içerik sayfaları — ORTA, ~1 hafta, meyvesi 2–3 ay sonra

Organic search 2. büyük kanal ama şu an **4 rotamız ve neredeyse hiç metnimiz yok**.
Google'a indeksleyecek bir şey vermiyoruz.

Yapılacak, sırayla:

1. **Kategori landing sayfaları**: `/kategori/genel-kultur`, `/kategori/tarih`... Her biri
   o kategoriden örnek sorular, açıklamalar, "hemen oyna" butonu. 12 sayfa, gerçek içerik.
2. **"Nasıl oynanır"** ve **kural sayfası** — hem SEO hem yeni oyuncu için gerçekten gerekli.
3. **`sitemap.xml` + `robots.txt`** — şu an ikisi de yok.
4. Hedef anahtar kelimeler: "online bilgi yarışması", "arkadaşlarla quiz oyunu",
   "takımlı bilgi yarışması", "kurulum gerektirmeyen quiz". EN tarafında "team quiz game
   online", "multiplayer trivia with friends".
5. **Yan fayda:** bu sayfalar AdSense'in "yeterli içerik" eşiğini de açar (bkz. bölüm 5).

### 3.6 Ürün derinliği — ORTA

Bunlar oyunu daha iyi yapar ama kullanıcı yoksa kimse görmez. **Dağıtımdan sonra.**

- **Soru kalitesi döngüsünü çalıştır**: PBI 16 analytics'i canlıda aç
  (`ANALYTICS_TOKEN`), haftada bir `scripts/analytics-report.js` çalıştır, `suspectQuestions`
  listesindeki soruları düzelt ve `difficultySuggestions`'ı uygula. PBI 7'nin etiketleri
  geçici; bu onları gerçek veriyle düzeltir. **Bu iş şimdi başlayabilir, trafik beklemez.**
- **Kullanıcı sorusu ekleme**: moderasyonlu "soru öner" formu. İçerik üretimini
  kullanıcıya devreder ve katkı veren geri gelir.
- **Özel soru setleri**: kullanıcı kendi quiz'ini kurabilsin (düğün, sınıf, iş yeri).
  Kahoot'un tüm iş modeli bu — ve bizim mimarimiz buna hazır.
- **Turnuva / haftalık meydan okuma**: aynı 10 soru herkese, haftalık liderlik. Geri dönüş
  sebebi üretir.
- Redis'i canlıda aç (kod hazır, sadece `REDIS_URL` gerekiyor) — şu an redeploy aktif
  maçları düşürüyor.

### 3.7 Teknik hijyen — DÜŞÜK etki, ucuz

- **Domain al.** `quizzy-two-jade.vercel.app` paylaşılabilir bir link değil; kimse bunu
  WhatsApp'a yazmaz. Bu, 3.3'ün ön koşulu sayılır. (~10 $/yıl)
- Ana sayfadaki `DataGridHero` hydration mismatch'ini düzelt (bilinen, fonksiyonu bozmuyor
  ama dev overlay'de duruyor).
- OG görseli: meta etiketler eklendi ama gerçek bir `og:image` yok — link paylaşımında
  önizleme boş görünüyor. 3.3 ile birlikte yapılmalı.
- `CLIENT_URL` CORS listesi ve Railway port eşleşmesi kırılgan (bkz. teknik notlar).

---

## 4. Sıralanmış yol haritası

| Sıra | İş | Etki | Süre | Not |
|---|---|---|---|---|
| 1 | Domain + OG görseli | Orta | 1 gün | 3'ün ön koşulu |
| 2 | Onboarding sürtünmesi (3.2) | Yüksek | 2 gün | Portal şartı da bu |
| 3 | Sonuç paylaşımı (3.3) | Yüksek | 2 gün | Asıl büyüme motoru |
| 4 | CrazyGames + itch.io (3.1) | Yüksek | 1 hafta | Hazır kitle + gelir |
| 5 | Analytics döngüsü (3.6 ilk madde) | Orta | sürekli | Trafik beklemez |
| 6 | Sosyal içerik scripti (3.4) | Yüksek | 3 gün + sürekli | 3360 soru = içerik |
| 7 | SEO sayfaları (3.5) | Orta | 1 hafta | 2–3 ay gecikmeli meyve |
| 8 | Redis canlı | Orta | 1 gün | Kod hazır |
| 9 | Özel soru setleri (3.6) | Yüksek | 2 hafta | Yeni kullanım alanı |
| 10 | PBI 5 / gelir kararı | — | — | Bkz. bölüm 5 |

---

## 5. Gelir (PBI 5'e dair düzeltme)

Faz 3'e taşınan PBI 5 (Google Ads) hakkında **önceki notumu düzeltiyorum**:

- ❌ "AdSense trafik minimumu ister" — **yanlış.** AdSense'in minimum trafik şartı yok.
- ✅ Gerçek engel **içerik**: onay için pratikte 20–30 dolu sayfa bekleniyor; 4 rotalı ve
  neredeyse metinsiz bir oyun "thin content" olarak reddedilir. **Bölüm 3.5'teki kategori
  sayfaları bu engeli kaldırır** — yani SEO işi aynı zamanda AdSense'in ön koşulu.
- ✅ İstenen **10–20 px yükseklik hiçbir standart birime denk gelmiyor**: en küçük yatay
  birim 320×50 (mobil banner), masaüstünde 728×90 (leaderboard). 10–20 px'lik bir alan
  ya hiç dolmaz ya da politika ihlali olur. Gerçekçi tasarım: soruların **altında**,
  mobilde 320×50, masaüstünde 728×90, oyun alanına bindirmeyen bir şerit.

**Pasif gelir önerisi (istenen):** bu oyun için sıralama şu olmalı —

1. **Oyun portalı gelir paylaşımı (CrazyGames)** — en uygun. Reklamı onlar yönetir,
   politika/onay yükü yok, üstüne dağıtım getiriyor. Oyunlar için tasarlanmış envanter,
   genel web banner'ından daha iyi dönüyor (**tahmin**, ama envanter uyumu gerçek).
2. **Kendi sitende ödüllü/ara reklam** — maç *aralarında* (kazanan ekranı ile rematch
   arasında), soru sırasında değil. Oyunlarda standart ve oyun akışını bozmaz.
   Soru altındaki sabit banner en düşük getirili seçenek.
3. **Özel soru setleri = ücretli özellik** — düğün/sınıf/şirket quiz'i net bir ödeme
   isteği üretir. Reklamdan çok daha yüksek kişi başı gelir, ama önce 3.6'nın yapılması lazım.
4. **Bağış/destek linki** (Buy Me a Coffee vb.) — getirisi düşük ama maliyeti sıfır ve
   trafik olmadan da eklenebilir.

**Öneri:** PBI 5'i "soruların altına AdSense koy" olarak değil, **"CrazyGames gelir
paylaşımı + maç arası reklam"** olarak yeniden yaz. Aynı hedefe (pasif gelir) daha az
politika riski ve üstüne dağıtımla gidiyor.

---

## 6. Ölçeceğimiz şeyler

Şu an Vercel Analytics var ama ürün metriği yok. Bakılacaklar:

- **Davet dönüşümü**: `/join/<kod>` görüntülenmesi → odaya giren. Sürtünmenin tek en iyi ölçüsü.
- **Oda başına oyuncu**: 1'de kalıyorsa davet mekanizması çalışmıyor.
- **Maç tamamlama oranı**: başlayan maçların kaçı bitiyor. Düşükse oyun çok uzun
  (Hızlı modu öne çıkarmak gerekebilir).
- **Rematch oranı**: PBI 8'in gerçekten oturum uzatıp uzatmadığı.
- **Geri dönen oyuncu**: profil sistemi bunu ölçebilir (`matches > 1` olan profil oranı).

İlk üçü Vercel Analytics + birkaç custom event ile ölçülebilir; son ikisi zaten
sunucu tarafında duruyor.

---

## Kaynaklar

- [gartic.io Traffic Analytics — Similarweb](https://www.similarweb.com/website/gartic.io/) — trafik kaynağı dağılımı (direct %51,28)
- [skribbl.io Traffic Analytics — Similarweb](https://www.similarweb.com/website/skribbl.io/) — 1,4M ziyaret, Hindistan %28,6
- [CrazyGames Documentation — Requirements](https://docs.crazygames.com/requirements/intro/) — boyut, dosya sayısı, PEGI 12, tek tıkla oyna
- [CrazyGames Documentation — Multiplayer](https://docs.crazygames.com/requirements/multiplayer/) — kendi backend'in, oda-katılma dinleyicisi, arkadaş listesi
- [CrazyGames Developer Guide (2026) — Cinevva](https://app.cinevva.com/guides/publish-game-crazygames) — münhasırlık yok, 2 aylık opsiyonel münhasırlık %50 gelir artışı
- [How to Submit an HTML5 Game to Web Game Platforms — BountyBoard](https://www.bountyboard.gg/blog/how-to-submit-an-html5-game-to-web-platforms) — Poki'nin ≤8 MB hedefi ve davetli kürasyon modeli
- [Uploading HTML5 games — itch.io](https://itch.io/docs/creators/html5) — index.html, göreli yollar
- [Eligibility requirements for AdSense — Google](https://support.google.com/adsense/answer/9724?hl=en) — uygunluk şartları
- [Google AdSense 2026 Approval Requirements — Innopanda](https://innopanda.com/google-adsense-in-2026/) — trafik minimumu yok; içerik derinliği şartı
- [Guidelines for fixed-sized display ad units — Google](https://support.google.com/adsense/answer/9185043?hl=en) — sabit boyutlu birim kuralları
- [Best-Performing AdSense Banner Sizes — Publift](https://www.publift.com/blog/highest-performing-adsense-banner-sizes-formats) — 320×50 mobil, 728×90 leaderboard
- [Poki — Bilgi Yarışması Oyunları](https://poki.com/en/quiz) ve [Playgama — Quiz](https://playgama.com/category/quiz) — rakip kategori sayfaları
