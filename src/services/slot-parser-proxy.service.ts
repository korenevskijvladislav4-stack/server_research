import { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import { CreateSlotDto, ProxyConfig, GeoProxyMapping } from '../models/Slot';

// Используем stealth plugin для обхода детекции ботов
puppeteerExtra.use(StealthPlugin());

/**
 * Slot Parser Service with Proxy Support
 * Парсит слоты с главной страницы казино используя прокси для разных GEO
 */
export class SlotParserProxyService {
  private geoProxyMap: GeoProxyMapping = {};
  private defaultTimeout = 30000;

  /**
   * Initialize proxy mapping for GEOs
   * Можно загружать из БД или конфига
   */
  setGeoProxies(mapping: GeoProxyMapping) {
    this.geoProxyMap = mapping;
  }

  /**
   * Get proxy for specific GEO
   * Сначала пытается использовать встроенный провайдер, затем конфиг из env
   */
  private async getProxyForGeo(geo: string): Promise<ProxyConfig | null> {
    // Сначала пытаемся использовать встроенный провайдер
    const { getProxyFromProvider } = await import('../config/proxy.config');
    const providerProxy = await getProxyFromProvider(geo);
    if (providerProxy) {
      console.log(`Using built-in proxy provider for GEO: ${geo}`);
      return providerProxy;
    }

    // Если провайдер не настроен, используем конфиг из env
    const proxies = this.geoProxyMap[geo.toUpperCase()];
    if (!proxies || proxies.length === 0) {
      console.log(`No proxy configured for GEO: ${geo}`);
      return null;
    }
    // Ротация прокси - выбираем случайный из списка
    const randomIndex = Math.floor(Math.random() * proxies.length);
    return proxies[randomIndex];
  }

  /**
   * Build proxy server URL (only host:port for --proxy-server flag)
   */
  private buildProxyUrl(proxy: ProxyConfig): string {
    const { host, port, protocol = 'http' } = proxy;
    // Для --proxy-server нужен только host:port, без протокола и credentials
    // Credentials передаются через page.authenticate()
    if (protocol === 'socks4' || protocol === 'socks5') {
      return `${protocol}://${host}:${port}`;
    }
    return `${host}:${port}`;
  }

  /**
   * Launch browser with proxy and anti-detection settings
   */
  private async launchBrowserWithProxy(proxy: ProxyConfig | null): Promise<Browser> {
    const launchOptions: any = {
      headless: 'new', // Use new headless mode (more realistic)
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled', // Hide automation
        '--window-size=1920,1080',
        '--start-maximized',
        '--disable-infobars',
        // Remove automation indicators
        '--exclude-switches=enable-automation',
        // Важно: не отключаем web-security для прокси, это может мешать
        // '--disable-web-security', // УБРАНО - может конфликтовать с прокси
        // '--disable-features=IsolateOrigins,site-per-process', // УБРАНО - может мешать прокси
        // '--disable-features=VizDisplayCompositor', // УБРАНО
        // '--disable-extensions-except', // УБРАНО - не нужен
        // '--disable-plugins-discovery', // УБРАНО - не критично
        // '--disable-default-apps', // УБРАНО - не критично
      ],
      ignoreDefaultArgs: ['--enable-automation'], // Remove automation flag
    };

    if (proxy) {
      const proxyUrl = this.buildProxyUrl(proxy);
      launchOptions.args.push(`--proxy-server=${proxyUrl}`);
      console.log(`Using proxy: ${proxyUrl} (${proxy.host}:${proxy.port})`);
    }

    return await puppeteerExtra.launch(launchOptions);
  }

  /**
   * Get random user agent for better anti-detection
   */
  private getRandomUserAgent(): string {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Configure page for scraping with anti-detection measures
   * ВАЖНО: Аутентификация прокси уже должна быть установлена ДО вызова этого метода
   */
  private async configurePage(page: Page, geo: string, _proxy: ProxyConfig | null) {
    // Remove webdriver property (должно быть до навигации)
    await page.evaluateOnNewDocument(() => {
      // @ts-ignore - Browser context
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Override plugins
      // @ts-ignore
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Override languages
      // @ts-ignore
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Override permissions
      // @ts-ignore
      const originalQuery = window.navigator.permissions.query;
      // @ts-ignore - Browser context
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          // @ts-ignore - Browser context
          Promise.resolve({ state: Notification.permission } as any) :
          originalQuery(parameters)
      );

      // Mock chrome object
      // @ts-ignore
      window.chrome = {
        runtime: {},
      };

      // Override getParameter for WebGL
      // @ts-ignore
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      // @ts-ignore
      WebGLRenderingContext.prototype.getParameter = function(parameter: any) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter.call(this, parameter);
      };
    });

    // Set realistic viewport
    await page.setViewport({ 
      width: 1920, 
      height: 1080,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false,
    });

    // Set random user agent
    const userAgent = this.getRandomUserAgent();
    await page.setUserAgent(userAgent);

    // Set extra HTTP headers for realism
    await page.setExtraHTTPHeaders({
      'Accept-Language': this.getLanguageForGeo(geo),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Charset': 'utf-8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    });

    // Небольшая задержка для применения настроек (но не слишком долгая, чтобы не влиять на прокси)
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Get language code for GEO
   */
  private getLanguageForGeo(geo: string): string {
    const geoLangMap: { [key: string]: string } = {
      RU: 'ru-RU,ru;q=0.9',
      DE: 'de-DE,de;q=0.9',
      BR: 'pt-BR,pt;q=0.9',
      EN: 'en-US,en;q=0.9',
      FR: 'fr-FR,fr;q=0.9',
      ES: 'es-ES,es;q=0.9',
      IT: 'it-IT,it;q=0.9',
      PL: 'pl-PL,pl;q=0.9',
    };
    return geoLangMap[geo.toUpperCase()] || 'en-US,en;q=0.9';
  }

  /**
   * Build URL with GEO parameter
   * Поддерживает различные способы указания GEO в URL
   */
  private buildUrlWithGeo(baseUrl: string, geo: string): string {
    try {
      const url = new URL(baseUrl);
      
      // Вариант 1: Параметр ?geo=RU
      url.searchParams.set('geo', geo.toUpperCase());
      
      // Вариант 2: Параметр ?country=RU (раскомментировать если нужно)
      // url.searchParams.set('country', geo.toUpperCase());
      
      // Вариант 3: Поддомен (ru.example.com)
      // const hostname = url.hostname;
      // if (!hostname.startsWith(geo.toLowerCase())) {
      //   url.hostname = `${geo.toLowerCase()}.${hostname.replace(/^[^.]+\./, '')}`;
      // }
      
      return url.toString();
    } catch {
      // Если невалидный URL, возвращаем как есть
      return baseUrl;
    }
  }

  /**
   * Parse slots from page with specific GEO
   */
  async parseSlotsFromPageWithGeo(
    url: string,
    casinoId: number,
    geo: string
  ): Promise<CreateSlotDto[]> {
    const proxy = await this.getProxyForGeo(geo);
    const geoUrl = this.buildUrlWithGeo(url, geo);
    
    console.log(`Parsing slots for GEO: ${geo}, URL: ${geoUrl}`);
    if (proxy) {
      console.log(`Using proxy: ${proxy.host}:${proxy.port} for country: ${geo}`);
    } else {
      console.log(`No proxy configured, using direct connection for GEO: ${geo}`);
    }

    const browser = await this.launchBrowserWithProxy(proxy);
    const page = await browser.newPage();

    try {
      // КРИТИЧНО: Аутентификация прокси должна быть САМОЙ ПЕРВОЙ операцией на странице
      if (proxy && proxy.username && proxy.password) {
        console.log(`\n=== Setting up proxy authentication FIRST ===`);
        console.log(`Proxy: ${proxy.host}:${proxy.port}`);
        console.log(`Username (first 50): ${proxy.username.substring(0, 50)}...`);
        
        try {
          await page.authenticate({
            username: proxy.username,
            password: proxy.password,
          });
          console.log(`✅ Proxy authentication set successfully`);
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (authError: any) {
          console.error(`❌ Proxy authentication failed: ${authError.message}`);
          throw new Error(`Proxy authentication failed: ${authError.message}`);
        }
        console.log(`==============================================\n`);
      }

      // Теперь настраиваем остальные параметры страницы
      await this.configurePage(page, geo, proxy);

      // Переходим на страницу
      await page.goto(geoUrl, {
        waitUntil: 'networkidle2',
        timeout: this.defaultTimeout,
      });

      // Ждем загрузки слотов (можно настроить селектор)
      try {
        await page.waitForSelector('.game-item, .slot-item, .game-card, [data-game]', {
          timeout: 10000,
        });
      } catch {
        // Если селектор не найден, продолжаем
        console.log('Slot selector not found, continuing...');
      }

      // Дополнительное ожидание для динамического контента
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Получаем HTML
      const html = await page.content();
      const currentUrl = page.url();

      // Парсим через Cheerio
      const slots = this.parseSlotsFromHTML(html, casinoId, geo, currentUrl);

      console.log(`Parsed ${slots.length} slots for GEO: ${geo}`);
      return slots;
    } catch (error: any) {
      console.error(`Error parsing slots for GEO ${geo}:`, error.message);
      throw new Error(`Failed to parse slots for GEO ${geo}: ${error.message}`);
    } finally {
      await browser.close();
    }
  }

  /**
   * Parse slots from multiple GEOs
   */
  async parseSlotsForMultipleGeos(
    url: string,
    casinoId: number,
    geos: string[]
  ): Promise<{ geo: string; slots: CreateSlotDto[] }[]> {
    const results: { geo: string; slots: CreateSlotDto[] }[] = [];

    for (const geo of geos) {
      try {
        const slots = await this.parseSlotsFromPageWithGeo(url, casinoId, geo);
        results.push({ geo, slots });
        
        // Задержка между запросами для разных GEO
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } catch (error: any) {
        console.error(`Failed to parse slots for GEO ${geo}:`, error.message);
        results.push({ geo, slots: [] });
      }
    }

    return results;
  }

  /**
   * Parse slots from HTML using Cheerio
   */
  private parseSlotsFromHTML(html: string, casinoId: number, geo: string, baseUrl: string): CreateSlotDto[] {
    const $ = cheerio.load(html);
    const slots: CreateSlotDto[] = [];

    // Различные селекторы для поиска слотов
    const slotSelectors = [
      '.game-item',
      '.games-list-card',
      '.slot-item',
      '.game-card',
      '.slot-card',
      '[data-game]',
      '[data-slot]',
      '.casino-game',
      '.game',
      '.game-tile',
    ];

    let foundSlots = false;

    for (const selector of slotSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} slots using selector: ${selector}`);
        foundSlots = true;

        elements.each((_, element) => {
          const $el = $(element);
          const slot = this.extractSlotData($el, $, geo, casinoId, baseUrl);
          if (slot && slot.name) {
            slots.push(slot);
          }
        });

        if (slots.length > 0) break;
      }
    }

    // Поиск в JSON-LD или script тегах
    if (!foundSlots || slots.length === 0) {
      $('script[type="application/ld+json"]').each((_, element) => {
        try {
          const jsonData = JSON.parse($(element).html() || '{}');
          if (jsonData['@type'] === 'Game' || jsonData.game) {
            const slot = this.extractSlotFromJSON(jsonData, casinoId, geo);
            if (slot && slot.name) {
              slots.push(slot);
            }
          }
        } catch (e) {
          // Ignore
        }
      });
    }

    // Поиск в inline JavaScript
    if (slots.length === 0) {
      $('script').each((_, element) => {
        const scriptContent = $(element).html() || '';
        const gameListMatches = scriptContent.match(/(?:games|slots|gameList|gameData)\s*[:=]\s*(\[[\s\S]*?\])/);
        if (gameListMatches) {
          try {
            const games = JSON.parse(gameListMatches[1]);
            if (Array.isArray(games)) {
              games.forEach((game: any) => {
                const slot = this.extractSlotFromObject(game, casinoId, geo);
                if (slot && slot.name) {
                  slots.push(slot);
                }
              });
            }
          } catch (e) {
            // Ignore
          }
        }
      });
    }

    return slots;
  }

  /**
   * Extract slot data from HTML element
   */
  private extractSlotData(
    $el: cheerio.Cheerio<any>,
    $: cheerio.CheerioAPI,
    geo: string,
    casinoId: number,
    baseUrl: string
  ): CreateSlotDto | null {
    try {
      const name =
        $el.attr('data-game-name') ||
        $el.attr('data-slot-name') ||
        $el.attr('data-title') ||
        $el.attr('title') ||
        $el.find('.game-name, .slot-name, .title, h3, h4').first().text().trim() ||
        $el.text().trim().split('\n')[0].trim();

      if (!name || name.length < 2) return null;

      const provider =
        $el.attr('data-provider') ||
        $el.attr('data-vendor') ||
        $el.find('.provider, .vendor, .game-provider').first().text().trim() ||
        null;

      let imageUrl =
        $el.attr('data-image') ||
        $el.find('img').first().attr('src') ||
        $el.find('img').first().attr('data-src') ||
        $el.find('img').first().attr('data-lazy-src') ||
        null;

      // Resolve relative URLs
      if (imageUrl && !imageUrl.startsWith('http')) {
        try {
          const base = new URL($('base').attr('href') || baseUrl);
          imageUrl = new URL(imageUrl, base).href;
        } catch {
          // If URL resolution fails, skip image
          imageUrl = null;
        }
      }

      const description =
        $el.find('.description, .game-description, .slot-description').first().text().trim() ||
        null;

      const features: string[] = [];
      $el.find('.tag, .badge, .feature, [class*="tag"], [class*="badge"]').each((_index: number, tagEl: any) => {
        const tagText = $(tagEl).text().trim();
        if (tagText) features.push(tagText);
      });

      const isFeatured =
        $el.hasClass('featured') ||
        $el.hasClass('highlighted') ||
        $el.find('.featured, .highlighted').length > 0 ||
        false;

      const isNew =
        $el.hasClass('new') ||
        $el.find('.new, .new-badge').length > 0 ||
        features.some((f) => /новый|new/i.test(f)) ||
        false;

      const isPopular =
        $el.hasClass('popular') ||
        $el.find('.popular, .top').length > 0 ||
        features.some((f) => /популярный|popular|топ|top/i.test(f)) ||
        false;

      return {
        casino_id: casinoId,
        geo: geo.toUpperCase(),
        name: name.substring(0, 255),
        provider: provider ? provider.substring(0, 255) : null,
        image_url: imageUrl ? imageUrl.substring(0, 500) : null,
        description: description ? description.substring(0, 2000) : null,
        features: features.length > 0 ? features : null,
        is_featured: isFeatured,
        is_new: isNew,
        is_popular: isPopular,
      };
    } catch (error) {
      console.error('Error extracting slot data:', error);
      return null;
    }
  }

  /**
   * Extract slot from JSON-LD
   */
  private extractSlotFromJSON(jsonData: any, casinoId: number, geo: string): CreateSlotDto | null {
    try {
      const name = jsonData.name || jsonData.title || jsonData.game?.name;
      if (!name) return null;

      return {
        casino_id: casinoId,
        geo: geo.toUpperCase(),
        name: String(name).substring(0, 255),
        provider: jsonData.provider || jsonData.vendor || jsonData.game?.provider || null,
        image_url: jsonData.image || jsonData.thumbnail || jsonData.game?.image || null,
        description: jsonData.description || jsonData.game?.description || null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Extract slot from JavaScript object
   */
  private extractSlotFromObject(gameObj: any, casinoId: number, geo: string): CreateSlotDto | null {
    try {
      const name = gameObj.name || gameObj.title || gameObj.gameName;
      if (!name) return null;

      return {
        casino_id: casinoId,
        geo: geo.toUpperCase(),
        name: String(name).substring(0, 255),
        provider: gameObj.provider || gameObj.vendor || gameObj.developer || null,
        image_url: gameObj.image || gameObj.thumbnail || gameObj.img || null,
        description: gameObj.description || null,
        rtp: gameObj.rtp ? parseFloat(gameObj.rtp) : null,
        volatility: gameObj.volatility || gameObj.volatil || null,
        is_new: gameObj.isNew || gameObj.new || false,
        is_popular: gameObj.isPopular || gameObj.popular || false,
        is_featured: gameObj.isFeatured || gameObj.featured || false,
      };
    } catch {
      return null;
    }
  }
}
