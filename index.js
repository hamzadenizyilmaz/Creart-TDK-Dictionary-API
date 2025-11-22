const axios = require("axios");

/**
 * Gelişmiş TDK Sözlük API Modülü
 * @author Hamza Deniz Yılmaz
 * @version 2.0.0
 * @license MIT
 */
class TDKSozluk {
  constructor() {
    this.baseURL = "https://sozluk.gov.tr/";
    this.timeout = 10000;
    this.retryCount = 2;
    
    this.axiosConfig = {
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'User-Agent': 'TDKSozlukAPI/2.0.0',
        'Accept': 'application/json',
        'Accept-Language': 'tr-TR,tr;q=0.9'
      }
    };

    this.client = axios.create(this.axiosConfig);
    
    this.client.interceptors.response.use(
      (response) => {
        console.log(`${response.config.url} başarılı`);
        return response;
      },
      (error) => {
        console.error(`${error.config?.url} hatası:`, error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Ana arama metodü
   * @param {string} word - Aranacak kelime
   * @param {Object} options - Ek seçenekler
   * @returns {Promise<Object>} - Sözlük verileri
   */
  async ara(word, options = {}) {
    const {
      uri = this.baseURL,
      timeout = this.timeout,
      retryCount = this.retryCount
    } = options;

    if (!word || typeof word !== 'string') {
      throw new Error('Geçersiz kelime parametresi');
    }

    const temizKelime = this.kelimeTemizle(word);
    
    const responseStructure = {
      word: null,
      lisan: null,
      means: [],
      compounds: [],
      proverbs: [],
      compilation: [],
      glossaryOfScienceAndArtTerms: [],
      westOpposite: [],
      guide: [],
      etymological: [],
      metadata: {
        source: "TDK Sözlük",
        version: "2.0.0",
        timestamp: new Date().toISOString(),
        searchWord: temizKelime
      }
    };

    try {
      const endpoints = this.endpointOlustur(temizKelime);
      const requests = this.istekleriHazirla(endpoints, retryCount);
      
      const results = await Promise.allSettled(requests);
      const processedData = this.sonuclariIsle(results, responseStructure);
      
      return processedData;

    } catch (error) {
      console.error('Ana arama hatası:', error);
      return {
        ...responseStructure,
        error: {
          message: "Sözlük sorgulanırken hata oluştu",
          details: error.message
        }
      };
    }
  }

  /**
   * Kelimeyi temizler ve normalize eder
   * @param {string} word - Temizlenecek kelime
   * @returns {string} - Temizlenmiş kelime
   */
  kelimeTemizle(word) {
    return word
      .toString()
      .toLocaleLowerCase('tr-TR')
      .trim()
      .normalize('NFKC')
      .replace(/[^\w\sçğıöşüÇĞİÖŞÜ]/g, '');
  }

  /**
   * Tüm endpoint'leri oluşturur
   * @param {string} word - Temizlenmiş kelime
   * @returns {Object} - Endpoint listesi
   */
  endpointOlustur(word) {
    const encodedWord = encodeURI(word);
    return {
      gts: `gts?ara=${encodedWord}`,
      atasozu: `atasozu?ara=${encodedWord}`,
      derleme: `derleme?ara=${encodedWord}`,
      terim: `terim?eser_ad=t%C3%BCm%C3%BC&ara=${encodedWord}`,
      bati: `bati?ara=${encodedWord}`,
      kilavuz: `kilavuz?prm=ysk&ara=${encodedWord}`,
      etms: `etms?ara=${encodedWord}`
    };
  }

  /**
   * İstek promiselerini hazırlar
   * @param {Object} endpoints - Endpoint listesi
   * @param {number} retryCount - Retry sayısı
   * @returns {Array} - İstek promiseleri
   */
  istekleriHazirla(endpoints, retryCount) {
    const requests = [];
    
    for (const [key, endpoint] of Object.entries(endpoints)) {
      const request = this.retryIstek(() => this.client.get(endpoint), retryCount);
      requests.push({ key, promise: request });
    }
    
    return requests;
  }

  /**
   * Retry mekanizmalı istek
   * @param {Function} requestFn - İstek fonksiyonu
   * @param {number} retries - Retry sayısı
   * @returns {Promise} - İstek promise'ı
   */
  async retryIstek(requestFn, retries) {
    try {
      return await requestFn();
    } catch (error) {
      if (retries > 0) {
        console.log(`Retry: ${retries} deneme kaldı`);
        await this.bekle(1000);
        return this.retryIstek(requestFn, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Bekleme fonksiyonu
   * @param {number} ms - Milisaniye
   * @returns {Promise}
   */
  bekle(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Sonuçları işler ve birleştirir
   * @param {Array} results - Promise sonuçları
   * @param {Object} structure - Temel yapı
   * @returns {Object} - İşlenmiş veri
   */
  sonuclariIsle(results, structure) {
    const processed = { ...structure };

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { key } = result.value;
        const data = result.value.data || result.value.promise?.data;

        if (!data || data.error) {
          processed[key] = null;
          return;
        }

        switch (key) {
          case 'gts':
            this.gtsIsle(data, processed);
            break;
          case 'atasozu':
            processed.proverbs = data;
            break;
          case 'derleme':
            processed.compilation = data;
            break;
          case 'terim':
            processed.glossaryOfScienceAndArtTerms = data;
            break;
          case 'bati':
            processed.westOpposite = data;
            break;
          case 'kilavuz':
            processed.guide = data;
            break;
          case 'etms':
            processed.etymological = data;
            break;
        }
      } else {
        console.warn(`⚠️ ${Object.keys(structure)[index]} yüklenemedi`);
      }
    });

    return processed;
  }

  /**
   * GTS verisini işler
   * @param {Array} data - Ham GTS verisi
   * @param {Object} processed - İşlenmiş veri nesnesi
   */
  gtsIsle(data, processed) {
    if (!data || data.length === 0) {
      processed.word = null;
      return;
    }

    const [result] = data;
    const { anlamlarListe, birlesikler, lisan, madde } = result;

    processed.word = madde || null;
    processed.lisan = lisan || null;
    processed.means = anlamlarListe || [];
    processed.compounds = birlesikler?.split(', ').filter(Boolean) || [];
  }
}

module.exports = async function (word, uri = "https://sozluk.gov.tr/") {
  const sozluk = new TDKSozluk();
  return sozluk.ara(word, { uri });
};

module.exports.TDKSozluk = TDKSozluk;