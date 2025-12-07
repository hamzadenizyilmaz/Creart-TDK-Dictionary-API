const axios = require("axios");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const NodeCache = require("node-cache");

/**
 * Gelişmiş TDK Sözlük API Modülü ve Sunucusu
 * @author Hamza Deniz Yılmaz
 * @version 1.4.0
 * @license MIT
 */
class TDKSozluk {
  constructor(options = {}) {
    this.baseURL = options.baseURL || "https://sozluk.gov.tr/";
    this.timeout = options.timeout || 15000;
    this.retryCount = options.retryCount || 3;
    this.cacheEnabled = options.cache !== false;
    this.cache = new NodeCache({ 
      stdTTL: 3600, 
      checkperiod: 600,
      useClones: false 
    });

    this.axiosConfig = {
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/html, application/xhtml+xml',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      maxRedirects: 5
    };

    this.client = axios.create(this.axiosConfig);
    
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        config.metadata = { startTime: Date.now() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        const endTime = Date.now();
        const duration = endTime - response.config.metadata.startTime;
        console.log(`✅ ${response.config.url} - ${response.status} (${duration}ms)`);
        return response;
      },
      async (error) => {
        const endTime = Date.now();
        const duration = endTime - (error.config?.metadata?.startTime || endTime);
        
        if (error.response) {
          console.error(`❌ ${error.config?.url || 'Unknown'} - ${error.response.status} (${duration}ms)`);
        } else if (error.request) {
          console.error(`🌐 ${error.config?.url || 'Unknown'} - No response (${duration}ms)`);
        } else {
          console.error(`⚠️ Request error: ${error.message}`);
        }
        
        return Promise.reject(error);
      }
    );

    // API endpoints mapping
    this.endpoints = {
      gts: 'gts',
      atasozu: 'atasozu',
      deyim: 'deyim',
      derleme: 'derleme',
      terim: 'terim',
      bati: 'bati',
      kilavuz: 'kilavuz',
      etms: 'etms',
      yazim: 'yazim',
      ses: 'ses',
      gunun: 'gunun-sozu'
    };
  }

  // ========== PUBLIC METHODS ==========

  /**
   * Ana kelime arama metodu
   * @param {string} word - Aranacak kelime
   * @param {Object} options - Ek seçenekler
   * @returns {Promise<Object>} - Sözlük verileri
   */
  async ara(word, options = {}) {
    const cacheKey = this.cacheEnabled ? `ara_${word}_${JSON.stringify(options)}` : null;
    
    if (this.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log(`📦 Cache hit: ${word}`);
        return cached;
      }
    }

    try {
      const temizKelime = this.kelimeTemizle(word);
      
      const result = {
        success: true,
        data: await this.tumVerileriGetir(temizKelime, options),
        metadata: {
          source: "TDK Sözlük",
          version: "2.5.0",
          timestamp: new Date().toISOString(),
          searchWord: temizKelime,
          processingTime: null
        }
      };

      if (this.cacheEnabled && cacheKey) {
        this.cache.set(cacheKey, result, options.cacheTTL || 1800);
      }

      return result;

    } catch (error) {
      console.error('Arama hatası:', error);
      return {
        success: false,
        error: {
          message: "Sözlük sorgulanırken hata oluştu",
          details: error.message,
          code: error.code || "UNKNOWN_ERROR"
        },
        metadata: {
          timestamp: new Date().toISOString(),
          searchWord: word
        }
      };
    }
  }

  /**
   * Günün kelimesini getirir
   * @returns {Promise<Object>} - Günün kelimesi
   */
  async gununKelimesi() {
    const cacheKey = 'gunun_kelimesi_daily';
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get(this.endpoints.gunun);
      const result = {
        success: true,
        data: {
          kelime: response.data.madde || response.data.kelime,
          anlam: response.data.anlam,
          tarih: new Date().toISOString().split('T')[0],
          kaynak: 'TDK Günün Sözü'
        },
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'gunun-sozu'
        }
      };

      this.cache.set(cacheKey, result, 86400); // 24 saat cache
      return result;

    } catch (error) {
      return {
        success: false,
        error: "Günün kelimesi alınamadı",
        metadata: { timestamp: new Date().toISOString() }
      };
    }
  }

  /**
   * Yazım denetimi yapar
   * @param {string} metin - Denetlenecek metin
   * @returns {Promise<Object>} - Denetim sonuçları
   */
  async yazimDenetimi(metin) {
    const kelimeler = metin.split(/\s+/).filter(k => k.trim());
    const sonuclar = [];
    
    for (const kelime of kelimeler) {
      try {
        const response = await this.client.get(`${this.endpoints.yazim}?ara=${encodeURIComponent(kelime)}`);
        const dogruMu = response.data && response.data.length > 0;
        
        sonuclar.push({
          kelime: kelime,
          dogru: dogruMu,
          oneriler: dogruMu ? [] : await this._onerilerGetir(kelime)
        });
      } catch (error) {
        sonuclar.push({ kelime: kelime, dogru: false, oneriler: [] });
      }
    }

    return {
      success: true,
      data: {
        metin: metin,
        sonuclar: sonuclar,
        istatistik: {
          toplamKelime: kelimeler.length,
          dogruKelime: sonuclar.filter(s => s.dogru).length,
          hataliKelime: sonuclar.filter(s => !s.dogru).length,
          dogrulukOrani: (sonuclar.filter(s => s.dogru).length / kelimeler.length * 100).toFixed(2)
        }
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Atasözü ve deyim arama
   * @param {string} anahtar - Anahtar kelime
   * @param {Object} options - Seçenekler
   * @returns {Promise<Object>} - Atasözü/deyim sonuçları
   */
  async atasozuAra(anahtar, options = {}) {
    const cacheKey = `atasozu_${anahtar}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      const [atasozuRes, deyimRes] = await Promise.allSettled([
        this.client.get(`${this.endpoints.atasozu}?ara=${encodeURIComponent(anahtar)}`),
        this.client.get(`${this.endpoints.deyim}?ara=${encodeURIComponent(anahtar)}`)
      ]);

      const result = {
        success: true,
        data: {
          anahtar: anahtar,
          atasozleri: atasozuRes.status === 'fulfilled' ? atasozuRes.value.data || [] : [],
          deyimler: deyimRes.status === 'fulfilled' ? deyimRes.value.data || [] : [],
          toplam: (atasozuRes.status === 'fulfilled' ? atasozuRes.value.data?.length || 0 : 0) + 
                  (deyimRes.status === 'fulfilled' ? deyimRes.value.data?.length || 0 : 0)
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      };

      this.cache.set(cacheKey, result, 3600);
      return result;

    } catch (error) {
      return {
        success: false,
        error: "Atasözü/deyim arama hatası",
        metadata: { timestamp: new Date().toISOString() }
      };
    }
  }

  /**
   * Benzer kelimeleri bulur
   * @param {string} kelime - Ana kelime
   * @param {number} limit - Sonuç limiti
   * @returns {Promise<Object>} - Benzer kelimeler
   */
  async benzerKelimeler(kelime, limit = 10) {
    try {
      // TDK'nın benzer kelime endpoint'i yoksa, harfe göre listeleme yapabiliriz
      const temizKelime = this.kelimeTemizle(kelime);
      const ilkHarf = temizKelime.charAt(0);
      
      const response = await this.harfeGoreKelimeler(ilkHarf, 1, 50);
      
      if (!response.success) {
        return response;
      }

      // Benzerlik algoritması (basit versiyon)
      const benzerler = response.data.kelimeler
        .filter(k => {
          const kelimeObj = typeof k === 'string' ? { kelime: k } : k;
          const digerKelime = this.kelimeTemizle(kelimeObj.kelime || '');
          return digerKelime !== temizKelime && 
                 (digerKelime.startsWith(temizKelime.substring(0, 3)) || 
                  digerKelime.includes(temizKelime.substring(1, 4)));
        })
        .slice(0, limit)
        .map(k => typeof k === 'string' ? k : k.kelime);

      return {
        success: true,
        data: {
          anaKelime: kelime,
          benzerKelimeler: benzerler,
          sayi: benzerler.length
        },
        metadata: {
          timestamp: new Date().toISOString(),
          algoritma: 'basit-benzerlik'
        }
      };

    } catch (error) {
      return {
        success: false,
        error: "Benzer kelimeler bulunamadı",
        metadata: { timestamp: new Date().toISOString() }
      };
    }
  }

  /**
   * Harfe göre kelime listesi
   * @param {string} harf - Harf
   * @param {number} sayfa - Sayfa numarası
   * @param {number} limit - Sayfa başına limit
   * @returns {Promise<Object>} - Kelime listesi
   */
  async harfeGoreKelimeler(harf, sayfa = 1, limit = 50) {
    const cacheKey = `harf_${harf}_${sayfa}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      // TDK'da böyle bir endpoint yok, alternatif yaklaşım
      // GTS'den rastgele kelimeler alıp filtreleyebiliriz
      const populerKelimeler = await this.populerAramalar(100);
      
      if (!populerKelimeler.success) {
        return populerKelimeler;
      }

      const filtrelenmis = populerKelimeler.data
        .filter(item => {
          const kelime = item.kelime || item;
          return kelime.toLowerCase().startsWith(harf.toLowerCase());
        })
        .slice((sayfa - 1) * limit, sayfa * limit);

      const result = {
        success: true,
        data: {
          harf: harf.toUpperCase(),
          sayfa: sayfa,
          sayfaBoyutu: limit,
          kelimeler: filtrelenmis,
          toplamKelime: filtrelenmis.length
        },
        metadata: {
          timestamp: new Date().toISOString(),
          not: "TDK harf bazlı endpoint'i olmadığı için popüler kelimelerden filtrelenmiştir"
        }
      };

      this.cache.set(cacheKey, result, 1800);
      return result;

    } catch (error) {
      return {
        success: false,
        error: "Harfe göre kelimeler alınamadı",
        metadata: { timestamp: new Date().toISOString() }
      };
    }
  }

  /**
   * Popüler aramaları getirir
   * @param {number} limit - Limit
   * @returns {Promise<Object>} - Popüler aramalar
   */
  async populerAramalar(limit = 20) {
    const cacheKey = `populer_${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    try {
      // TDK'da popüler aramalar endpoint'i yok, örnek veri
      const populerKelimeler = [
        "merhaba", "teşekkür", "sevgi", "aşk", "mutluluk", "kelime", 
        "türkçe", "dil", "edebiyat", "şiir", "roman", "hikaye",
        "bilim", "teknoloji", "sanat", "müzik", "resim", "heykel",
        "doğa", "hayvan", "bitki", "ağaç", "çiçek", "su", "hava",
        "toprak", "güneş", "ay", "yıldız", "gezegen", "evren"
      ].slice(0, limit).map(kelime => ({ kelime, aramaSayisi: Math.floor(Math.random() * 1000) + 100 }));

      const result = {
        success: true,
        data: populerKelimeler.sort((a, b) => b.aramaSayisi - a.aramaSayisi),
        metadata: {
          timestamp: new Date().toISOString(),
          not: "Örnek popüler kelime listesi"
        }
      };

      this.cache.set(cacheKey, result, 3600);
      return result;

    } catch (error) {
      return {
        success: false,
        error: "Popüler aramalar alınamadı",
        metadata: { timestamp: new Date().toISOString() }
      };
    }
  }

  /**
   * Rastgele kelime getirir
   * @returns {Promise<Object>} - Rastgele kelime
   */
  async rastgeleKelime() {
    try {
      const populer = await this.populerAramalar(100);
      if (!populer.success) throw new Error("Popüler kelimeler alınamadı");

      const rastgeleIndex = Math.floor(Math.random() * populer.data.length);
      const rastgeleKelime = populer.data[rastgeleIndex].kelime;

      const detay = await this.ara(rastgeleKelime);

      return {
        success: true,
        data: {
          kelime: rastgeleKelime,
          detay: detay.success ? detay.data : null
        },
        metadata: {
          timestamp: new Date().toISOString(),
          tip: "rastgele"
        }
      };

    } catch (error) {
      return {
        success: false,
        error: "Rastgele kelime bulunamadı",
        metadata: { timestamp: new Date().toISOString() }
      };
    }
  }

  /**
   * Ses dosyasını getirir (telaffuz)
   * @param {string} kelime - Kelime
   * @returns {Promise<Object>} - Ses bilgileri
   */
  async sesGetir(kelime) {
    try {
      const encodedKelime = encodeURIComponent(kelime);
      const response = await this.client.get(`${this.endpoints.ses}?ara=${encodedKelime}`);

      return {
        success: true,
        data: {
          kelime: kelime,
          sesDosyasi: response.data.sesDosyasi || null,
          telaffuz: response.data.telaffuz || null,
          dinlemeLinki: response.data.link || `${this.baseURL}ses/${encodedKelime}`
        },
        metadata: {
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      return {
        success: false,
        error: "Ses dosyası bulunamadı",
        metadata: { timestamp: new Date().toISOString() }
      };
    }
  }

  /**
   * Cache'i temizler
   * @param {string} pattern - Temizlenecek cache pattern'i
   */
  cacheTemizle(pattern = null) {
    if (!pattern) {
      this.cache.flushAll();
      console.log('✅ Tüm cache temizlendi');
    } else {
      const keys = this.cache.keys().filter(key => key.includes(pattern));
      keys.forEach(key => this.cache.del(key));
      console.log(`✅ "${pattern}" pattern'ine sahip ${keys.length} cache kaydı temizlendi`);
    }
  }

  /**
   * Cache istatistikleri
   * @returns {Object} - Cache istatistikleri
   */
  cacheIstatistik() {
    const stats = this.cache.getStats();
    return {
      success: true,
      data: {
        hits: stats.hits,
        misses: stats.misses,
        keys: stats.keys,
        ksize: stats.ksize,
        vsize: stats.vsize
      },
      metadata: {
        timestamp: new Date().toISOString(),
        cacheEnabled: this.cacheEnabled
      }
    };
  }

  // ========== PRIVATE METHODS ==========

  async tumVerileriGetir(kelime, options) {
    const encodedKelime = encodeURIComponent(kelime);
    const startTime = Date.now();
    
    const requests = [
      { key: 'temel', promise: this.client.get(`${this.endpoints.gts}?ara=${encodedKelime}`) },
      { key: 'atasozleri', promise: this.client.get(`${this.endpoints.atasozu}?ara=${encodedKelime}`) },
      { key: 'deyimler', promise: this.client.get(`${this.endpoints.deyim}?ara=${encodedKelime}`) },
      { key: 'derleme', promise: this.client.get(`${this.endpoints.derleme}?ara=${encodedKelime}`) },
      { key: 'terim', promise: this.client.get(`${this.endpoints.terim}?eser_ad=t%C3%BCm%C3%BC&ara=${encodedKelime}`) },
      { key: 'bati', promise: this.client.get(`${this.endpoints.bati}?ara=${encodedKelime}`) },
      { key: 'kilavuz', promise: this.client.get(`${this.endpoints.kilavuz}?prm=ysk&ara=${encodedKelime}`) },
      { key: 'etimoloji', promise: this.client.get(`${this.endpoints.etms}?ara=${encodedKelime}`) }
    ];

    const results = await Promise.allSettled(requests.map(r => r.promise));
    const endTime = Date.now();

    const processedData = {
      kelime: kelime,
      temelBilgiler: null,
      anlamlar: [],
      ornekler: [],
      atasozleri: [],
      deyimler: [],
      birlesikler: [],
      etimoloji: null,
      telaffuz: null,
      kullanimTuru: []
    };

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.data) {
        const key = requests[index].key;
        
        switch(key) {
          case 'temel':
            this._temelBilgilerIsle(result.value.data, processedData);
            break;
          case 'atasozleri':
            processedData.atasozleri = result.value.data || [];
            break;
          case 'deyimler':
            processedData.deyimler = result.value.data || [];
            break;
          case 'etimoloji':
            processedData.etimoloji = result.value.data || null;
            break;
        }
      }
    });

    // Ek işlemler
    if (options.telaffuz) {
      const sesData = await this.sesGetir(kelime);
      if (sesData.success) {
        processedData.telaffuz = sesData.data.telaffuz;
        processedData.sesDosyasi = sesData.data.sesDosyasi;
      }
    }

    processedData.metadata = {
      islemSuresi: `${endTime - startTime}ms`,
      veriKaynaklari: results.filter(r => r.status === 'fulfilled').length,
      tamVeri: results.every(r => r.status === 'fulfilled')
    };

    return processedData;
  }

  _temelBilgilerIsle(data, processedData) {
    if (!data || data.length === 0) return;

    const [anaVeri] = data;
    
    processedData.temelBilgiler = {
      madde: anaVeri.madde,
      lisan: anaVeri.lisan,
      ozel_mi: anaVeri.ozel_mi,
      cogul_mu: anaVeri.cogul_mu,
      birlesikler: anaVeri.birlesikler
    };

    if (anaVeri.anlamlarListe) {
      processedData.anlamlar = anaVeri.anlamlarListe.map((anlam, index) => ({
        sira: index + 1,
        anlam: anlam.anlam,
        ornekler: anlam.orneklerListe || [],
        kullanim: this._kullanimTuruBelirle(anlam),
        fiiller: anlam.fiiller || [],
        atasozleri: anlam.atasozleri || []
      }));

      // Tüm örnekleri topla
      processedData.ornekler = processedData.anlamlar.flatMap(a => a.ornekler);
      
      // Kullanım türlerini topla
      processedData.kullanimTuru = [...new Set(processedData.anlamlar.map(a => a.kullanim).filter(Boolean))];
    }

    if (anaVeri.birlesikler) {
      processedData.birlesikler = anaVeri.birlesikler.split(',').map(b => b.trim()).filter(Boolean);
    }
  }

  _kullanimTuruBelirle(anlam) {
    const ozellikler = anlam.ozelliklerListe || [];
    
    if (ozellikler.some(o => o.tam_adi && o.tam_adi.includes('isim'))) return 'isim';
    if (ozellikler.some(o => o.tam_adi && o.tam_adi.includes('sıfat'))) return 'sıfat';
    if (ozellikler.some(o => o.tam_adi && o.tam_adi.includes('zarf'))) return 'zarf';
    if (ozellikler.some(o => o.tam_adi && o.tam_adi.includes('fiil'))) return 'fiil';
    if (ozellikler.some(o => o.tam_adi && o.tam_adi.includes('edat'))) return 'edat';
    if (ozellikler.some(o => o.tam_adi && o.tam_adi.includes('bağlaç'))) return 'bağlaç';
    if (ozellikler.some(o => o.tam_adi && o.tam_adi.includes('ünlem'))) return 'ünlem';
    
    return null;
  }

  async _onerilerGetir(kelime) {
    try {
      // Basit bir öneri algoritması
      const benzerler = await this.benzerKelimeler(kelime, 5);
      return benzerler.success ? benzerler.data.benzerKelimeler : [];
    } catch {
      return [];
    }
  }

  kelimeTemizle(word) {
    if (!word || typeof word !== 'string') return '';
    
    return word
      .toString()
      .toLocaleLowerCase('tr-TR')
      .trim()
      .normalize('NFKC')
      .replace(/[^\w\sçğıöşüÇĞİÖŞÜ\-]/g, '')
      .replace(/\s+/g, ' ');
  }
}

// ========== EXPRESS SERVER SETUP ==========

function createServer(options = {}) {
  const app = express();
  const tdk = new TDKSozluk(options.tdk || {});
  
  const serverPort = options.port || process.env.PORT || 3000;
  const apiPath = options.apiPath || '/api';
  
  // Middleware'ler
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
      },
    },
  }));
  
  app.use(cors({
    origin: options.corsOrigin || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Rate limiting
  const limiter = rateLimit({
    windowMs: options.rateLimitWindow || 15 * 60 * 1000,
    max: options.rateLimitMax || 100,
    message: {
      success: false,
      error: 'Çok fazla istek gönderdiniz. Lütfen 15 dakika sonra tekrar deneyin.'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
  
  app.use(`${apiPath}/`, limiter);
  
  // ========== API ROUTES ==========
  
  // Health check
  app.get(`${apiPath}/health`, (req, res) => {
    res.json({
      success: true,
      data: {
        service: 'Creart TDK API',
        version: '2.5.0',
        status: 'operational',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cacheStats: tdk.cacheIstatistik().data
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  });
  
  // Ana kelime arama
  app.get(`${apiPath}/kelime/:kelime`, async (req, res) => {
    try {
      const options = {
        telaffuz: req.query.telaffuz === 'true',
        cacheTTL: parseInt(req.query.cacheTTL) || undefined
      };
      
      const sonuc = await tdk.ara(req.params.kelime, options);
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Sunucu hatası",
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  });
  
  // Günün kelimesi
  app.get(`${apiPath}/gunun-kelimesi`, async (req, res) => {
    try {
      const sonuc = await tdk.gununKelimesi();
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Günün kelimesi alınamadı",
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  });
  
  // Yazım denetimi (POST)
  app.post(`${apiPath}/yazim-denetimi`, async (req, res) => {
    try {
      const { metin } = req.body;
      
      if (!metin || typeof metin !== 'string') {
        return res.status(400).json({
          success: false,
          error: "Geçersiz metin parametresi",
          metadata: { timestamp: new Date().toISOString() }
        });
      }
      
      const sonuc = await tdk.yazimDenetimi(metin);
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Yazım denetimi hatası",
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  });
  
  // Atasözü arama
  app.get(`${apiPath}/atasozu/:anahtar`, async (req, res) => {
    try {
      const sonuc = await tdk.atasozuAra(req.params.anahtar);
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Atasözü arama hatası",
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  });
  
  // Benzer kelimeler
  app.get(`${apiPath}/benzer/:kelime`, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const sonuc = await tdk.benzerKelimeler(req.params.kelime, limit);
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Benzer kelimeler bulunamadı",
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  });
  
  // Harfe göre kelimeler
  app.get(`${apiPath}/harf/:harf`, async (req, res) => {
    try {
      const sayfa = parseInt(req.query.sayfa) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const sonuc = await tdk.harfeGoreKelimeler(req.params.harf, sayfa, limit);
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Harfe göre kelimeler alınamadı",
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  });
  
  // Popüler aramalar
  app.get(`${apiPath}/populer`, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const sonuc = await tdk.populerAramalar(limit);
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Popüler aramalar alınamadı",
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  });
  
  // Rastgele kelime
  app.get(`${apiPath}/rastgele`, async (req, res) => {
    try {
      const sonuc = await tdk.rastgeleKelime();
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Rastgele kelime bulunamadı",
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  });
  
  // Ses/telaffuz
  app.get(`${apiPath}/ses/:kelime`, async (req, res) => {
    try {
      const sonuc = await tdk.sesGetir(req.params.kelime);
      res.json(sonuc);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Ses dosyası bulunamadı",
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  });
  
  // Cache yönetimi (admin)
  app.delete(`${apiPath}/cache`, (req, res) => {
    const { pattern } = req.query;
    tdk.cacheTemizle(pattern);
    
    res.json({
      success: true,
      message: pattern ? `"${pattern}" cache temizlendi` : 'Tüm cache temizlendi',
      metadata: { timestamp: new Date().toISOString() }
    });
  });
  
  // Cache istatistikleri
  app.get(`${apiPath}/cache/stats`, (req, res) => {
    const stats = tdk.cacheIstatistik();
    res.json(stats);
  });
  
  // Batch işlemler (çoklu kelime arama)
  app.post(`${apiPath}/batch`, async (req, res) => {
    try {
      const { kelimeler } = req.body;
      
      if (!Array.isArray(kelimeler) || kelimeler.length > 50) {
        return res.status(400).json({
          success: false,
          error: "Geçersiz kelime listesi (max 50 kelime)",
          metadata: { timestamp: new Date().toISOString() }
        });
      }
      
      const sonuclar = await Promise.all(
        kelimeler.map(kelime => tdk.ara(kelime, { cacheTTL: 300 }))
      );
      
      res.json({
        success: true,
        data: sonuclar,
        metadata: {
          timestamp: new Date().toISOString(),
          toplamKelime: kelimeler.length,
          basarili: sonuclar.filter(s => s.success).length
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Batch işlemi hatası",
        metadata: { timestamp: new Date().toISOString() }
      });
    }
  });
  
  // 404 handler
  app.use(`${apiPath}/*`, (req, res) => {
    res.status(404).json({
      success: false,
      error: "Endpoint bulunamadı",
      metadata: {
        timestamp: new Date().toISOString(),
        requestedPath: req.originalUrl
      }
    });
  });
  
  // Error handler
  app.use((err, req, res, next) => {
    console.error('🚨 Sunucu hatası:', err);
    
    res.status(err.status || 500).json({
      success: false,
      error: err.message || "Sunucu hatası",
      metadata: {
        timestamp: new Date().toISOString(),
        path: req.path
      }
    });
  });
  
  // Start server
  const server = app.listen(serverPort, () => {
    console.log(`
    🚀 Creart TDK API v1.4.0
    📡 Port: ${serverPort}
    🔗 Ana URL: http://localhost:${serverPort}
    📚 API Path: ${apiPath}
    🏓 Health: http://localhost:${serverPort}${apiPath}/health
    📦 Cache: ${tdk.cacheEnabled ? 'Aktif' : 'Pasif'}
    
    📋 Kullanılabilir Endpoint'ler:
    GET  ${apiPath}/kelime/:kelime
    GET  ${apiPath}/gunun-kelimesi
    POST ${apiPath}/yazim-denetimi
    GET  ${apiPath}/atasozu/:anahtar
    GET  ${apiPath}/benzer/:kelime
    GET  ${apiPath}/harf/:harf
    GET  ${apiPath}/populer
    GET  ${apiPath}/rastgele
    GET  ${apiPath}/ses/:kelime
    POST ${apiPath}/batch
    GET  ${apiPath}/cache/stats
    DELETE ${apiPath}/cache
    
    ⚡ Hazır!
    `);
  });
  
  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🔄 SIGTERM alındı, sunucu kapatılıyor...');
    server.close(() => {
      console.log('✅ Sunucu kapatıldı');
      process.exit(0);
    });
  });
  
  return { app, server, tdk };
}

// ========== MODULE EXPORTS ==========

module.exports = TDKSozluk;
module.exports.TDKSozluk = TDKSozluk;
module.exports.createServer = createServer;
module.exports.default = TDKSozluk;

if (require.main === module) {
  createServer();
}