# 🇹🇷 Creart TDK Dictionary API - Advanced Node.js Module

[![npm version](https://img.shields.io/npm/v/creart-tdk.svg)](https://www.npmjs.com/package/creart-tdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![Downloads](https://img.shields.io/npm/dm/creart-tdk.svg)](https://www.npmjs.com/package/creart-tdk)

Advanced Node.js module for accessing Turkish Language Institution (TDK) official dictionary data. Provides access to 7 different TDK dictionaries with a single search.

## ✨ Features

- 🚀 **High Performance** - Parallel requests and retry mechanism
- 🛡 **Robust Error Handling** - Comprehensive validation and error handling
- 📚 **7 Different Dictionaries** - Single search across all TDK databases
- 🔧 **Flexible Configuration** - Customizable options
- ⏱ **Timeout & Retry** - Automatic retry for failed requests
- 🎯 **Turkish Character Support** - Automatic character normalization
- 📊 **Detailed Logging** - Advanced debugging capabilities
- 🌍 **Multi-language Support** - English and Turkish responses
- 🔄 **Caching Support** - Optional response caching
- 📖 **Comprehensive Documentation** - Full API documentation

## 📦 Installation

```bash
npm install creart-tdk
```

## 🚀 Usage

### Basic Usage

```javascript
const tdk = require('creart-tdk');

const data = await tdk('pencil');
console.log(data);

tdk('book').then(data => {
  console.log(data);
}).catch(error => {
  console.error(error);
});
```

### Advanced Usage

```javascript
const { TDKDictionary } = require('creart-tdk');

const dictionary = new TDKDictionary();

const data = await dictionary.search('computer', {
  baseURL: 'https://sozluk.gov.tr/',
  timeout: 15000,
  retryCount: 3,
  language: 'tr'
});
```

### Class-based Usage with Options

```javascript
const { TDKDictionary } = require('creart-tdk');

const dictionary = new TDKDictionary({
  baseURL: 'https://sozluk.gov.tr/',
  timeout: 10000,
  retryCount: 2,
  language: 'en',
  enableCache: true,
  cacheTTL: 300000 // 5 minutes
});

const result = await dictionary.search('language', {
  dictionaries: ['gts', 'proverbs', 'etymology'],
  includeExamples: true,
  detailed: true
});
```

## 📋 API Response Structure

```javascript
{
  word: "kalem",           // Main word
  languageOrigin: "Arabic", // Origin language
  definitions: [           // Definitions list
    {
      meaning: "Tool used for writing, drawing, etc. in various forms",
      examples: [...],     // Example usages
      category: "noun",
      definitionNumber: 1
    }
  ],
  compoundWords: ["kalem açacağı", "kalem kutusu"], // Compound words
  proverbs: [...],         // Proverbs and idioms
  compilation: [...],      // Compilation dictionary
  scienceAndArtTerms: [...], // Science and art terms glossary
  westernOriginWords: [...], // Western origin words
  foreignWordEquivalents: [...], // Foreign word equivalents guide
  etymology: [...],        // Etymological dictionary
  metadata: {
    source: "TDK Dictionary",
    version: "2.0.0",
    timestamp: "2024-01-15T10:30:00.000Z",
    searchWord: "kalem",
    dictionariesQueried: ["gts", "proverbs", "etymology"],
    language: "en"
  }
}
```

## ⚙️ Configuration Options

### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseURL` | string | `https://sozluk.gov.tr/` | TDK endpoint URL |
| `timeout` | number | `10000` | Request timeout in ms |
| `retryCount` | number | `2` | Number of retries for failed requests |
| `language` | string | `'tr'` | Response language ('tr' or 'en') |
| `enableCache` | boolean | `false` | Enable response caching |
| `cacheTTL` | number | `300000` | Cache TTL in milliseconds |
| `logLevel` | string | `'info'` | Logging level |

### Search Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `dictionaries` | array | `['all']` | Specific dictionaries to query |
| `includeExamples` | boolean | `true` | Include usage examples |
| `detailed` | boolean | `false` | Include detailed information |
| `language` | string | constructor setting | Override response language |

## 🗂 Available Dictionaries

- **gts** - Main Turkish Dictionary (Güncel Türkçe Sözlük)
- **proverbs** - Proverbs and Idioms Dictionary (Atasözleri ve Deyimler)
- **compilation** - Compilation Dictionary (Derleme Sözlüğü)
- **scienceAndArt** - Science and Art Terms (Bilim ve Sanat Terimleri)
- **westernOrigin** - Western Origin Words (Batı Kökenli Kelimeler)
- **foreignEquivalents** - Foreign Word Equivalents (Yabancı Sözlere Karşılıklar)
- **etymology** - Etymological Dictionary (Etimolojik Sözlük)

## 🛠 Development

### Requirements
- Node.js >= 20.x
- Axios >= 1.0.0

### Local Development

```bash
# Clone repository
git clone https://github.com/hamzadenizyilmaz/Creart-TDK-Dictionary-API.git
cd Creart-TDK-Dictionary-API

# Install dependencies
npm install

# Run tests
npm test

# Run examples
node examples/basic-usage.js
node examples/advanced-search.js
```

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run performance tests
npm run test:performance
```

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines
- Follow JavaScript Standard Style
- Write comprehensive tests for new features
- Update documentation accordingly
- Ensure all tests pass before submitting PR

## 📊 Performance Optimizations

- **Parallel Requests**: All dictionaries queried simultaneously
- **Memory Management**: No unnecessary data copying
- **Connection Pooling**: Axios instance reuse
- **Error Recovery**: Automatic retry for failed requests
- **Caching**: Optional response caching to reduce API calls
- **Request Deduplication**: Prevent duplicate simultaneous requests

## 🐛 Debugging

```javascript
const { TDKDictionary } = require('creart-tdk');

const dictionary = new TDKDictionary({
  logLevel: 'debug'
});

const data = await dictionary.search('test', { 
  retryCount: 3 
});

if (data.error) {
  console.error('Error:', data.error.details);
}

const debugData = await dictionary.search('debug', { debug: true });
```

## 🔧 Advanced Examples

### Batch Processing

```javascript
const { TDKDictionary } = require('creart-tdk');
const dictionary = new TDKDictionary();

const words = ['computer', 'language', 'dictionary', 'technology'];

for (const word of words) {
  const result = await dictionary.search(word);
  console.log(`${word}: ${result.definitions.length} definitions found`);
}

const results = await Promise.all(
  words.map(word => dictionary.search(word))
);
```

### Custom Dictionary Selection

```javascript
const result = await dictionary.search('technology', {
  dictionaries: ['gts', 'scienceAndArt', 'westernOrigin'],
  includeExamples: false,
  detailed: true
});
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Important Notes

- This module is **not** an official TDK API
- Excessive usage may affect TDK servers
- Data structure may change with TDK updates
- Recommended for educational purposes
- Be respectful with request rates
- Commercial use requires careful consideration

## 📞 Support & Contact

- **GitHub Issues**: [Bug Report & Feature Requests](https://github.com/hamzadenizyilmaz/Creart-TDK-Dictionary-API/issues)
- **Email**: support@creart.com
- **Documentation**: [Full API Docs](https://github.com/hamzadenizyilmaz/Creart-TDK-Dictionary-API/docs)
- **Examples**: [Code Examples](https://github.com/hamzadenizyilmaz/Creart-TDK-Dictionary-API/examples)

## 🔄 Changelog

### v1.3.0
- ✅ Complete rewrite with class-based architecture
- ✅ Advanced error handling and recovery
- ✅ Retry mechanism with exponential backoff
- ✅ Detailed logging system
- ✅ Multi-language support (English/Turkish)
- ✅ Optional response caching
- ✅ Comprehensive documentation
- ✅ Improved performance with parallel requests
- ✅ Enhanced TypeScript support
- ✅ Better test coverage

### v1.0.0
- ✅ Added response caching
- ✅ Improved error messages
- ✅ Additional configuration options
- ✅ Enhanced documentation

---

<div align="center">

**Made with Hamza Deniz Yılmaz for the Turkish language community**

[Report Bug](https://github.com/hamzadenizyilmaz/Creart-TDK-Dictionary-API/issues) · 
[Request Feature](https://github.com/hamzadenizyilmaz/Creart-TDK-Dictionary-API/issues) · 
[Contribute](https://github.com/hamzadenizyilmaz/Creart-TDK-Dictionary-API/pulls)

</div>

## 🎯 UPDATED PACKAGE.JSON

```json
{
  {
  "name": "creart-tdk-dictionary-api",
  "version": "1.0.0",
  "description": "Creart-TDK-Dictionary-API is an advanced Node.js module that provides easy access to the Turkish Language Association (TDK) dictionary data. It allows developers to retrieve word definitions, synonyms, antonyms, and other linguistic information programmatically.",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/hamzadenizyilmaz/Creart-TDK-Dictionary-API.git"
  },
  "keywords": [
    "tdk",
    "tdk-api",
    "tdk api",
    "Türk Dil Kurumu",
    "Türkçe Api",
    "Turkis Api",
    "Turkish word api"
  ],
  "author": {
    "name": "Hamza Deniz Yılmaz",
    "url": "https://hamzadenizyilmaz.com",
    "email": "hamzadenizyilmaz@creartcloud.com"
  },
  "license": "ISC",
  "bugs": {
    "url": "https://github.com/hamzadenizyilmaz/Creart-TDK-Dictionary-API/issues"
  },
  "homepage": "https://github.com/hamzadenizyilmaz/Creart-TDK-Dictionary-API#readme",
  "dependencies": {
    "axios": "^0.27.2"
  }
}
}
```