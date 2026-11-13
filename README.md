# Harami · Kırbaç Avcısı

React/Vite oyunu. TikTok LIVE açıkken yayına yeni katılan her izleyici, üzerinde adı yazan bir zombi olarak görünür. Beğeniler kısa süreli seri kırbaç saldırısını hızlandırır. Gömülen izleyicinin adı RIP taşına yazılır.

Yeni izleyiciler sol alt, sağ alt veya dağ yönünden dans halkasına girer; diğerleri yer açar. Uzun süre etkinlik göstermeyen izleyiciler yürüyerek çıkar. TikTok bağlantısı kişi bazlı güvenilir ayrılma olayı vermediği için bu çıkış **8 dakika etkinlik olmamasına** dayanır. Bu süre bağlantı yenilendiğinde sıfırlanmaz; kontrol sunucusunun güncel listesinde bulunmayan izleyiciler de oyundan çıkarılır. Beğeni arttıkça o izleyicinin kırbaçlanma aralığı uzar; 100 beğeniye ulaşan veya hediye gönderen izleyici kalpli gözde olur ve hedef alınmaz. Kahraman kırbaç sırasında rastgele replikler söyler. Kontrol panelindeki **Tesbih** sahnesinde kırbaç atmaz, tesbih çeker ve “Tövbe estağfurullah” der. Yeni sözler tarayıcının Türkçe konuşma senteziyle seslendirilir; konuşma sentezi olmayan yayın kaynaklarında altyazı görünür.

## Yerelde çalıştırma

Node.js 22 veya üzerini kullanın. `npm install` ardından `npm run dev` komutunu çalıştırın. TikTok bağlantısı varsayılan olarak açıktır; demo zombilerle oynamak için `VITE_TIKTOK_ENABLED=false` ayarlayın.

TikTok LIVE bağlantısı oyun sayfası açılınca `ersanyakit` hesabı için otomatik başlar. Yayıncı adını kontrol sayfasından değiştirebilirsiniz; seçim tarayıcının yerel depolamasında saklanır. `npm run dev`, TikTok API rotasını yerelde de çalıştırır. Bağlantı kurulmazsa neden kontrol sayfasında görünür ve uygulama artan aralıklarla yeniden dener. **Bağlan** düğmesi elle hemen yeniden denemek veya yeni bir yayıncı seçmek içindir.

`/game` sayfasında yalnızca oyun bulunur; `/control` ve `/` sayfalarında sahne, TikTok ve görüntü ayarları bulunur. Kontrol sayfasındaki **Oyun ekranını aç** düğmesi oyunu ayrı sekmede açar. Oyun tuvali 1080×1920 çözünürlüktedir ve tarayıcıda 9:16 oranında sol üst köşeye yerleşir.

OBS Browser Source için kontrol sayfasındaki **OBS oyun bağlantısı** adresini kullanın. Kaynak boyutunu **1080×1920** ayarlayın. Aynı tarayıcı profilindeki sekmeler BroadcastChannel ile, OBS gibi ayrı tarayıcılar ise `/api/control` üzerinden eşitlenir. Yerelde bu API doğrudan çalışır. Vercel'de kalıcı eşitleme için aşağıdaki Redis değişkenleri gerekir.

Yerel HTTPS için macOS hosts dosyasında `127.0.0.1 game.local test.local` satırı olmalı. `brew install mkcert` ve `npm run setup:local-ssl` komutlarını bir kez çalıştırın; sertifika yerel güven deposuna eklenir ve `.cert/` klasörüne yazılır. Ardından `sudo env "PATH=$PATH" npm run dev:game-local` komutuyla 443 portunda sunucuyu başlatın. `https://game.local`, `https://game.local/game`, `https://game.local/control` ve aynı `test.local` yolları portsuz açılır. Normal `npm run dev` komutu kendi portunda çalışmaya devam eder. Bu `.local` adları yalnızca bu bilgisayarda çözülür. TikTok LIVE Studio yerel adresleri reddediyorsa yerel SSL bunu değiştirmez; yayın için Vercel HTTPS adresini kullanın.

TikTok LIVE Studio'da eski yatay ekran/pencere yakalama kaynağını kaldırın. Yeni **Link/Bağlantı** kaynağına `/game` adresini ekleyin, **Özel çözünürlük** seçeneğini açıp genişliği **1080**, yüksekliği **1920** yapın. Kaynağı sahneye sığdırın; **Uzat** seçeneği yatay görüntüyü dikey yönde bozacaktır.

Kontrol sayfası `localhost` veya `127.0.0.1` üzerinden açıksa kopyalama alanı LIVE Studio için yerel ağ IP'sini kullanır (örneğin `http://192.168.1.120:1453/game`). LIVE Studio yerel HTTP bağlantılarını kabul etmiyorsa Vercel'deki HTTPS `/game` adresini kullanın.

## Vercel

Projeyi Vercel'e Vite projesi olarak bağlayın. Kök dizin bu klasör, build komutu `npm run build`, çıktı dizini `dist` olmalı. `vercel.json`, `/game` ve `/control` adreslerini SPA giriş dosyasına yönlendirir; ayrıca Node.js fonksiyonunu ve en fazla 300 saniyelik çalışma süresini tanımlar. Vercel'de Fluid Compute açık olmalı.

Environment Variables bölümüne şunları ekleyin ve yeniden deploy edin:

| Değişken | Değer |
| --- | --- |
| `VITE_TIKTOK_ENABLED` | `true` (kapatmak için `false`) |
| `EULER_SIGN_API_KEY` | İsteğe bağlı; sunucuda kalan Euler Stream anahtarı |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST adresi |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST anahtarı |
| `CONTROL_SECRET` | Uzun, rastgele kontrol anahtarı |

Eski Vercel KV entegrasyonunda `KV_REST_API_URL` ve `KV_REST_API_TOKEN` adları kullanılıyorsa kontrol API'si bunları da kabul eder. Canlı `/api/control` 503 dönerse Redis bağlantı değişkenleri eksiktir; iki ayrı tarayıcı arasında sahne eşitlemesi bunlar olmadan çalışmaz.

Vercel'de kontrol sayfasını `/control` adresinden açın ve **Vercel kontrol anahtarı** alanına `CONTROL_SECRET` değerini girin. Paneldeki OBS bağlantısı aynı anahtarı oyun adresine ekler. API, oyun durumunu saniyede bir eşitler; aynı tarayıcıdaki kontroller ayrıca anında aktarılır. Kontrol API'si yazma veya okuma hatası döndürürse panelin üst kısmında görünür.

Yerel `/control` sayfasındaki **Vercel yayın adresi** alanına yayınlanan HTTPS site adresini veya tam `/control?key=...` bağlantısını girip **Vercel kontrolünü aç** düğmesine basın. Bu, paneli Vercel sitesinde açar; oradaki OBS oyun bağlantısı da aynı Vercel sitesinin `/game` adresini gösterir. Vercel API erişimi için Redis değişkenleri ve `CONTROL_SECRET` tanımlı olmalıdır; eksikse hata panelde görünür.

Yayıncı adını oyundaki ayarlardan girin. Connector'ın `MEMBER` olayı her yeni izleyici için isimli zombi oluşturur; `LIKE` olayındaki `count` değeri beğeni hızlandırmasını artırır. Beğeni gönderen izleyicinin katılım olayı kaçırılmışsa o da zombi listesine eklenir. Aynı kullanıcı tekrar geldiğinde ikinci bir zombi oluşturulmaz.

Sohbette cümle içinde geçen `kırbaç`, `göm`, `cehennem`, `patlat` veya `bomba` sözcükleri görev oluşturur. Türkçe karakterli ve karaktersiz yazımlar eşleştirilir. `göm nickname` veya `gom @kullanıcıadı` belirtilen izleyiciyi hedefler; emojili ve süslü isimler de eşleştirilir. Nickname içindeki regex özel karakterleri düz metin olarak değerlendirilir. Mesajda bir izleyici adı varsa hedef o izleyicidir; yoksa mesajı yazan izleyicidir. Panelden açılan gömme sahnesinde son yorum yazan izleyiciye öncelik verilir. Görevler sırayla çalışır ve aynı bekleyen komut tekrar eklenmez. Sohbet mesajları kahramanın üzerinde görünür. Bir hediye gömülü göndereni mezardan çıkarır ve göndereni kalpli gözde yapar. Tekrar eden hediye serisi yalnızca bittiğinde işlenir.

`kırbaç`, `kırbaçla`, `kirbac`, `kirbacla` ve karışık Türkçe/ASCII yazımları aynı komuttur. Örneğin `kirbacla 🔥Ali👑` veya `kırbaçla @kralali` belirtilen izleyiciye kilitlenir; üst üste duran karakterler hedefi değiştirmez. İsim eşleştirme Unicode harfleri, farklı alfabeleri, emojileri ve süslü yazı tiplerini destekler.

`cehennem nickname`, `kirbacla nickname`, `gom nickname` ve `deveyebin nickname` komutlarında isim komuttan sonra çıkarılır ve büyük/küçük harf farkı kaldırılarak eşleştirilir. Nickname verilmezse mesajı yazan kişi seçilir. `kirbacla Ela` önce Ela'yı kementle yakalar, gömme sahnesindeki gibi sürükler, üç kez kırbaçlar ve dans halkasına geri bırakır. `deveyebin Ela` deve sahnesini açar; inişten sonraki ilk hedef Ela olur. Kırbaç ekranında normal mesaj yazan son izleyici de öncelikli hedeftir.

Kontrol panelindeki **Gül ve Lale** sahnesinde kahraman izleyicilere sırayla kırmızı güller ve sarı laleler atar; çiçekler yere düşer ve yapraklar saçılır. **Altın ve Dolar** sahnesinde gökten dönen altın paralar ve dolar banknotları yağar. Bu sahnelerde kırbaç kullanılmaz. Sahne seçimi oyun/OBS ekranına eşitlenir.

**Savaş Alanı / Harita Seçimi** bölümünde **Cehennem** ve **Cennet** haritaları da bulunur. Cehennem kızıl lavlar, yanan harabeler ve hareketli közlerle; Cennet ise aydınlık bahçeler, şelaleler, uçuşan çiçek yaprakları ve ışık parıltılarıyla gösterilir. Harita seçimi sahneden bağımsızdır ve OBS oyun ekranına eşitlenir.

Kahraman sohbet mesajlarını gönderenin adıyla birlikte sırayla sesli okur: “Ela diyor ki: merhaba”. Seslendirme tarayıcının konuşma sentezini kullanır; tarayıcıda bu özellik ve uygun ses bulunmalıdır. Oyunun ses seviyesi, sessize alma ve duraklatma kontrolleri mesaj okumaya da uygulanır.

Yayıncı canlı değilse bağlantı durumu panelde hata olarak görünür ve tarayıcı bağlantıyı yeniden dener. Vercel'de Chrome'daki `/control` sayfası TikTok olaylarını alır; sunucu izleyicileri, beğenileri, sohbet komutlarını ve hediyeleri Redis'e yazar. TikTok LIVE Studio içindeki `/game` sayfası bunları kontrol API'sinden okur. Kontrol sayfası kapanırsa oyun kendi TikTok bağlantısına geri döner. Katılım olayları mevcut izleyici listesinin tamamı değildir; ayrılma animasyonu son etkinlik zamanına göre başlar. `tiktok-live-connector` resmî TikTok API'si değildir; TikTok protokol değişiklikleri bağlantıyı etkileyebilir.

## Kontrol

`npm run lint`, `npm run build`, `npm run check:loop` ve `npm run check:live`.
