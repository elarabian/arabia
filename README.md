# Kırbaç Avcısı

React/Vite oyunu. TikTok LIVE açıkken yayına yeni katılan her izleyici, üzerinde adı yazan bir zombi olarak görünür. Beğeniler kısa süreli seri kırbaç saldırısını hızlandırır. Gömülen izleyicinin adı RIP taşına yazılır.

## Yerelde çalıştırma

Node.js 22 veya üzerini kullanın. `npm install` ardından `npm run dev` komutunu çalıştırın. TikTok bağlantısı varsayılan olarak açıktır; demo zombilerle oynamak için `VITE_TIKTOK_ENABLED=false` ayarlayın.

TikTok LIVE bağlantısı oyun sayfası açılınca `ersanyakit` hesabı için otomatik başlar. Yayıncı adını kontrol sayfasından değiştirebilirsiniz; seçim tarayıcının yerel depolamasında saklanır. `npm run dev`, TikTok API rotasını yerelde de çalıştırır. Bağlantı kurulmazsa neden kontrol sayfasında görünür ve uygulama artan aralıklarla yeniden dener. **Bağlan** düğmesi elle hemen yeniden denemek veya yeni bir yayıncı seçmek içindir.

`/game` sayfasında yalnızca oyun bulunur; `/control` sayfasında sahne, TikTok ve görüntü ayarları bulunur. Kontrol sayfasındaki **Oyun ekranını aç** düğmesi oyunu ayrı sekmede açar. Oyun canvas'ının çizim çözünürlüğü 1080×1920'dir; görüntü ekranın sol kenarına sabitlenir ve 9:16 oranını korur.

OBS Browser Source için kontrol sayfasındaki **OBS oyun bağlantısı** adresini kullanın ve kaynak boyutunu **1080×1920** ayarlayın. Kontrol sayfası ile oyun sekmesi aynı tarayıcı profilinde açıksa ayarlar anında eşitlenir. Ayrı OBS tarayıcı kaynağı, tarayıcı depolamasını paylaşmadığından canlı kontrol için ayrıca bir sunucu eşitlemesi gerekir.

## Vercel

Projeyi Vercel'e Vite projesi olarak bağlayın. Kök dizin bu klasör, build komutu `npm run build`, çıktı dizini `dist` olmalı. `vercel.json` Node.js fonksiyonunu ve en fazla 300 saniyelik çalışma süresini tanımlar. Vercel'de Fluid Compute açık olmalı.

Environment Variables bölümüne şunları ekleyin ve yeniden deploy edin:

| Değişken | Değer |
| --- | --- |
| `VITE_TIKTOK_ENABLED` | `true` (kapatmak için `false`) |
| `EULER_SIGN_API_KEY` | İsteğe bağlı; sunucuda kalan Euler Stream anahtarı |

Yayıncı adını oyundaki ayarlardan girin. Connector'ın `MEMBER` olayı her yeni izleyici için isimli zombi oluşturur; `LIKE` olayındaki `count` değeri beğeni hızlandırmasını artırır. Beğeni gönderen izleyicinin katılım olayı kaçırılmışsa o da zombi listesine eklenir. Aynı kullanıcı tekrar geldiğinde ikinci bir zombi oluşturulmaz.

Sohbette cümle içinde geçen `kırbaç`, `göm`, `cehennem`, `patlat` veya `bomba` sözcükleri görev oluşturur. Türkçe karakterli ve karaktersiz yazımlar eşleştirilir. Mesajda bir izleyici adı varsa hedef o izleyicidir; yoksa mesajı yazan izleyicidir. Görevler sırayla çalışır ve aynı bekleyen komut tekrar eklenmez. Sohbet mesajları kahramanın üzerinde görünür. Bir hediye gömülü göndereni mezardan çıkarır ve gönderen için mevcut sahneden farklı rastgele bir kırbaç, gömme veya cehennem eylemi başlatır. Tekrar eden hediye serisi yalnızca bittiğinde işlenir.

Yayıncı canlı değilse bağlantı durumu panelde hata olarak görünür ve tarayıcı bağlantıyı yeniden dener. Her izleyici tarayıcısı ayrı TikTok bağlantısı açar; oyunu yayın için tek tarayıcı oturumunda çalıştırın. Katılım olayları mevcut izleyici listesinin tamamı değildir ve ayrılma olayı bu entegrasyonda izlenmez. `tiktok-live-connector` resmî TikTok API'si değildir; TikTok protokol değişiklikleri bağlantıyı etkileyebilir.

## Kontrol

`npm run lint`, `npm run build`, `npm run check:loop` ve `npm run check:live`.
