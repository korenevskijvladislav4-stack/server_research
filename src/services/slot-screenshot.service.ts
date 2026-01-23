import { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { ProxyConfig, GeoProxyMapping } from '../models/SlotSelector';
import { getProxyConfig } from '../config/proxy.config';
import path from 'path';
import fs from 'fs/promises';

// Используем stealth plugin для обхода детекции ботов
puppeteerExtra.use(StealthPlugin());

/**
 * Slot Screenshot Service
 * Делает скриншоты элементов по селекторам для разных GEO
 */
export class SlotScreenshotService {
  private geoProxyMap: GeoProxyMapping = {};

  constructor() {
    this.geoProxyMap = getProxyConfig();
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
   * ВАЖНО: Аутентификация прокси теперь устанавливается в takeScreenshot() ДО вызова этого метода
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
   * Normalize selector - преобразует упрощенный формат data-testid в правильный CSS селектор
   * Пример: [casino-category-1win games] -> [data-testid="casino-category-1win games"]
   */
  private normalizeSelector(selector: string): string {
    // Если селектор начинается с [ и не содержит data-testid, пробуем преобразовать
    if (selector.trim().startsWith('[') && !selector.includes('data-testid')) {
      // Убираем квадратные скобки
      const content = selector.trim().slice(1, -1);
      
      // Если это не стандартный CSS селектор (не содержит точку, #, :, =), 
      // то это скорее всего data-testid
      if (!content.includes('.') && !content.includes('#') && !content.includes(':') && !content.includes('=')) {
        // Преобразуем в [data-testid="..."]
        return `[data-testid="${content}"]`;
      }
    }
    
    // Если уже правильный формат или другой тип селектора, возвращаем как есть
    return selector;
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
   * Build URL (without GEO parameter - GEO is determined by proxy)
   */
  private buildUrlWithGeo(baseUrl: string, _geo: string): string {
    // Return URL as-is, GEO is determined by proxy settings
    return baseUrl;
  }

  /**
   * Take screenshot of selector element
   */
  async takeScreenshot(
    url: string,
    selector: string,
    geo: string,
    outputDir: string
  ): Promise<string> {
    const proxy = await this.getProxyForGeo(geo);
    const geoUrl = this.buildUrlWithGeo(url, geo);

    console.log(`\n=== Taking screenshot ===`);
    console.log(`GEO: ${geo}`);
    console.log(`Selector: ${selector}`);
    console.log(`URL: ${geoUrl}`);
    if (proxy) {
      console.log(`Proxy: ${proxy.host}:${proxy.port}`);
      console.log(`Proxy username (first 80 chars): ${proxy.username?.substring(0, 80)}...`);
      console.log(`Proxy protocol: ${proxy.protocol || 'http'}`);
    } else {
      console.log(`No proxy configured, using direct connection`);
    }
    console.log(`========================\n`);

    const browser = await this.launchBrowserWithProxy(proxy);
    const page = await browser.newPage();

    try {
      // КРИТИЧНО: Аутентификация прокси должна быть установлена ДО любых других действий
      if (proxy && proxy.username && proxy.password) {
        console.log(`\n=== Setting up proxy authentication ===`);
        console.log(`Proxy: ${proxy.host}:${proxy.port}`);
        console.log(`Username (first 80 chars): ${proxy.username.substring(0, 80)}...`);
        console.log(`Password: ${proxy.password ? '***' + proxy.password.substring(proxy.password.length - 3) : 'not set'}`);
        
        // Проверяем формат username для Bright Data
        if (proxy.username.includes('brd-customer')) {
          const zoneMatch = proxy.username.match(/-zone-([^-]+)/);
          if (zoneMatch) {
            const zone = zoneMatch[1];
            console.log(`Detected Bright Data zone: ${zone}`);
            if (zone.includes('datacenter')) {
              console.warn(`⚠️ WARNING: Using datacenter zone. Some websites block datacenter IPs.`);
              console.warn(`   Consider using 'residential' zone for better compatibility.`);
            }
          }
        }
        
        try {
          // Метод 1: через page.authenticate (стандартный способ)
          await page.authenticate({
            username: proxy.username,
            password: proxy.password,
          });
          console.log(`✅ Proxy authentication set via page.authenticate()`);
          
          // Дополнительно: пробуем через CDP для надежности
          try {
            const client = await page.target().createCDPSession();
            await client.send('Network.enable');
            console.log(`✅ CDP Network enabled`);
          } catch (cdpError: any) {
            console.warn(`⚠️ CDP Network.enable failed (non-critical): ${cdpError.message}`);
          }
          
          // Небольшая задержка для стабилизации соединения с прокси
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log(`✅ Proxy setup complete`);
        } catch (authError: any) {
          console.error(`❌ Proxy authentication failed: ${authError.message}`);
          console.error(`Error stack: ${authError.stack?.substring(0, 300)}`);
          console.error(`\n💡 Troubleshooting:`);
          console.error(`1. Check if proxy host/port is correct: ${proxy.host}:${proxy.port}`);
          console.error(`2. Verify username format matches Bright Data requirements`);
          console.error(`3. Check if password is correct`);
          console.error(`4. Ensure proxy server is accessible from your network`);
          throw new Error(`Proxy authentication failed: ${authError.message}`);
        }
      } else {
        console.log(`No proxy authentication required (no credentials provided)`);
      }
      
      // Настраиваем остальные параметры страницы
      await this.configurePage(page, geo, proxy);

      // Navigate to page with increased timeout for proxy connections
      console.log(`\n=== Starting navigation ===`);
      console.log(`URL: ${geoUrl}`);
      console.log(`Proxy configured: ${proxy ? `${proxy.host}:${proxy.port}` : 'none'}`);
      if (proxy) {
        console.log(`Proxy auth: ${proxy.username ? 'configured' : 'not configured'}`);
      }
      console.log(`===========================\n`);
      
      let navigationSuccess = false;
      let responseStatus: number | null = null;
      
      try {
        // Пробуем навигацию с несколькими стратегиями ожидания
        let response = null;
        
        // Стратегия 1: networkidle2 (ожидание завершения сетевых запросов)
        try {
          response = await page.goto(geoUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000,
          });
        } catch (networkIdleError: any) {
          console.warn(`⚠️ networkidle2 failed, trying domcontentloaded: ${networkIdleError.message}`);
          // Стратегия 2: domcontentloaded (более быстрая, менее надежная)
          response = await page.goto(geoUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
          });
        }
        
        if (response) {
          responseStatus = response.status();
          console.log(`✅ Page response status: ${responseStatus}`);
          
          // Log response headers for debugging
          const headers = response.headers();
          console.log(`Response headers:`, Object.keys(headers).slice(0, 10).join(', '));
          
          // Проверяем важные заголовки
          if (headers['content-type']) {
            console.log(`Content-Type: ${headers['content-type']}`);
          }
          if (headers['content-length']) {
            console.log(`Content-Length: ${headers['content-length']}`);
          }
          
          if (responseStatus >= 400) {
            console.warn(`⚠️ HTTP error status: ${responseStatus}`);
            try {
              const responseText = await response.text();
              console.warn(`Response preview (first 500 chars): ${responseText.substring(0, 500)}...`);
            } catch (textError) {
              console.warn(`Unable to read response text: ${textError}`);
            }
          } else {
            navigationSuccess = true;
            console.log(`✅ Navigation successful, status: ${responseStatus}`);
          }
        } else {
          console.warn(`⚠️ No response object returned from navigation`);
          // Если нет response, но страница загрузилась, считаем успехом
          const currentUrl = page.url();
          if (currentUrl && currentUrl !== 'about:blank') {
            console.log(`Page URL changed to: ${currentUrl}, considering navigation successful`);
            navigationSuccess = true;
          }
        }
      } catch (navError: any) {
        console.error(`❌ Navigation error: ${navError.message}`);
        console.error(`Error type: ${navError.name}`);
        console.error(`Error stack: ${navError.stack?.substring(0, 300)}`);
        
        // Check if it's a proxy connection error
        if (navError.message.includes('net::ERR_PROXY') || 
            navError.message.includes('TUNNEL') ||
            navError.message.includes('CONNECTION')) {
          console.error(`🔴 Proxy connection error detected!`);
          console.error(`This usually means:`);
          console.error(`1. Proxy host/port is incorrect`);
          console.error(`2. Proxy authentication failed (wrong username/password)`);
          console.error(`3. Proxy server is down or unreachable`);
          console.error(`4. Network firewall blocking proxy connection`);
        }
        
        // Try with domcontentloaded as fallback
        console.log(`Trying fallback navigation with domcontentloaded...`);
        try {
          const fallbackResponse = await page.goto(geoUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000,
          });
          
          if (fallbackResponse) {
            responseStatus = fallbackResponse.status();
            console.log(`Fallback response status: ${responseStatus}`);
            if (responseStatus < 400) {
              navigationSuccess = true;
            }
          }
        } catch (fallbackError: any) {
          console.error(`❌ Fallback navigation also failed: ${fallbackError.message}`);
          throw new Error(`Failed to navigate to ${geoUrl}. Original error: ${navError.message}, Fallback error: ${fallbackError.message}`);
        }
      }
      
      if (!navigationSuccess && responseStatus) {
        console.warn(`⚠️ Navigation completed but HTTP status ${responseStatus} indicates an error`);
      }

      // Check if page loaded successfully (not blocked by proxy)
      const pageTitle = await page.title();
      const pageUrl = page.url();
      const pageContent = await page.content();
      
      console.log(`\n=== Page loaded ===`);
      console.log(`Title: ${pageTitle}`);
      console.log(`Current URL: ${pageUrl}`);
      console.log(`Expected URL: ${geoUrl}`);
      console.log(`Content length: ${pageContent.length} characters`);
      console.log(`URL match: ${pageUrl === geoUrl || pageUrl.includes(new URL(geoUrl).hostname) ? '✅' : '❌'}`);
      console.log(`==================\n`);
      
      // Check for error pages (proxy connection issues, page unavailable, etc.)
      // НЕ проверяем на ошибки, если страница успешно загрузилась (статус 200 и правильный URL)
      const isPageSuccessfullyLoaded = responseStatus && responseStatus < 400 && 
        (pageUrl === geoUrl || pageUrl.includes(new URL(geoUrl).hostname));
      
      if (isPageSuccessfullyLoaded) {
        // Страница успешно загрузилась - логируем успех и пропускаем проверку на ошибки
        console.log(`✅ Page successfully loaded - Status: ${responseStatus}, URL matches: ${pageUrl === geoUrl || pageUrl.includes(new URL(geoUrl).hostname)}`);
        console.log(`✅ Skipping error detection - page loaded successfully`);
      } else {
        // Проверяем на ошибки только если страница НЕ загрузилась успешно
        console.log(`⚠️ Page may not have loaded successfully - checking for error indicators...`);
        const pageTextLower = (pageTitle + ' ' + pageContent.substring(0, 5000)).toLowerCase();
        
        // Более специфичные индикаторы ошибок (только реальные ошибки, не общие слова)
        const errorPatterns = [
          /страница недоступна/i,
          /page unavailable/i,
          /this site can't be reached/i,
          /err_proxy_connection_failed/i,
          /err_tunnel_connection_failed/i,
          /err_connection_refused/i,
          /err_connection_timed_out/i,
          /access denied/i,
          /connection.*refused/i,
          /connection.*failed/i,
          /network.*error/i,
          /proxy.*error/i,
        ];
        
        // Проверяем также наличие типичных элементов страниц ошибок
        const errorPageIndicators = [
          'страница недоступна',
          'page unavailable',
          'this site can\'t be reached',
          'err_proxy',
          'err_tunnel',
          'err_connection',
          'access denied',
        ];
        
        const foundErrors: string[] = [];
        
        // Проверяем паттерны
        errorPatterns.forEach(pattern => {
          if (pattern.test(pageTextLower)) {
            foundErrors.push(pattern.toString());
          }
        });
        
        // Проверяем простые индикаторы (но только если они в контексте ошибки)
        errorPageIndicators.forEach(indicator => {
          const lowerIndicator = indicator.toLowerCase();
          if (pageTextLower.includes(lowerIndicator)) {
            // Проверяем контекст - не должно быть обычного контента рядом
            const index = pageTextLower.indexOf(lowerIndicator);
            const context = pageTextLower.substring(Math.max(0, index - 50), Math.min(pageTextLower.length, index + 100));
            // Если это не часть обычного текста (например, "timeout" в названии игры)
            if (!context.includes('game') && !context.includes('игра') && 
                !context.includes('slot') && !context.includes('слот')) {
              foundErrors.push(indicator);
            }
          }
        });
        
        if (foundErrors.length > 0) {
        console.error(`\n❌❌❌ ERROR PAGE DETECTED ❌❌❌`);
        console.error(`Indicators found: ${foundErrors.join(', ')}`);
        console.error(`Page Title: "${pageTitle}"`);
        console.error(`Page URL: ${pageUrl}`);
        console.error(`Expected URL: ${geoUrl}`);
        console.error(`Response Status: ${responseStatus || 'unknown'}`);
        
        // Проверяем, что именно вернул прокси
        const pageTextPreview = pageContent.substring(0, 1000);
        console.error(`\nPage content preview (first 1000 chars):`);
        console.error(pageTextPreview);
        console.error(`\n==========================================\n`);
        
        // Check if URL changed (redirect to error page)
        if (pageUrl !== geoUrl && !pageUrl.includes(new URL(geoUrl).hostname)) {
          console.error(`⚠️ URL mismatch! Expected: ${geoUrl}, Got: ${pageUrl}`);
          console.error(`This might indicate a proxy redirect to an error page`);
        }
        
        // Проверяем, не блокирует ли прокси сам сайт
        if (proxy) {
          console.error(`\n🔍 Proxy Debug Info:`);
          console.error(`Proxy Host: ${proxy.host}`);
          console.error(`Proxy Port: ${proxy.port}`);
          console.error(`Proxy Username (first 80): ${proxy.username?.substring(0, 80)}...`);
          console.error(`Proxy Protocol: ${proxy.protocol || 'http'}`);
          console.error(`GEO: ${geo}`);
          
          // Проверяем, какая зона используется
          const username = proxy.username || '';
          if (username.includes('-zone-')) {
            const zoneMatch = username.match(/-zone-([^-]+)/);
            if (zoneMatch) {
              console.error(`Current Bright Data Zone: ${zoneMatch[1]}`);
              console.error(`\n💡 TIP: If using 'datacenter' or 'datacenter_proxy1' zone, try switching to 'residential' zone:`);
              console.error(`   Set BRIGHTDATA_ZONE=residential in .env file`);
              console.error(`   Residential proxies are less likely to be blocked by websites`);
            }
          }
          
          console.error(`\n💡 Possible issues and solutions:`);
          console.error(`1. ❌ Proxy might be blocked by target website`);
          console.error(`   → Solution: Try 'residential' zone instead of 'datacenter'`);
          console.error(`2. ❌ Proxy zone/country might not have access to this site`);
          console.error(`   → Solution: Check if country code is correct (${geo})`);
          console.error(`3. ❌ Proxy credentials might be incorrect`);
          console.error(`   → Solution: Verify BRIGHTDATA_USER and BRIGHTDATA_PASS in .env`);
          console.error(`4. ❌ Target website might require different proxy configuration`);
          console.error(`   → Solution: Some sites block datacenter IPs, use residential zone`);
          console.error(`5. ❌ Website might be detecting automation`);
          console.error(`   → Solution: Anti-detection measures are already enabled`);
        }
        
        // Save error page screenshot for debugging
        try {
          await fs.mkdir(outputDir, { recursive: true });
          const errorScreenshotPath = path.join(outputDir, `error_page_${geo}_${Date.now()}.png`);
          await page.screenshot({
            path: errorScreenshotPath,
            fullPage: true,
          });
          console.error(`\n📸 Error page screenshot saved: ${errorScreenshotPath}`);
        } catch (screenshotError) {
          console.error('Failed to save error screenshot:', screenshotError);
        }
        
          throw new Error(`Page unavailable or proxy connection failed. Error indicators: ${foundErrors.join(', ')}. Page URL: ${pageUrl}, Title: "${pageTitle}". Check proxy configuration, zone settings (try 'residential' zone), and target website accessibility.`);
        } else {
          // Не найдено явных индикаторов ошибок, но страница не загрузилась успешно
          console.warn(`⚠️ Page may have issues, but no clear error indicators found. Status: ${responseStatus}, URL: ${pageUrl}`);
        }
      }

      // Wait for page to be fully interactive
      await page.waitForFunction(
        // @ts-ignore - This code runs in browser context, not Node.js
        () => document.readyState === 'complete',
        { timeout: 10000 }
      ).catch(() => {
        console.warn('Page readyState check timeout, continuing...');
      });

      // Simulate human-like mouse movements and scrolling (только если страница загрузилась успешно)
      if (navigationSuccess && responseStatus && responseStatus < 400) {
        console.log('Simulating human behavior...');
        
        try {
          // Random mouse movements
          await page.mouse.move(Math.random() * 500, Math.random() * 500);
          await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
          
          // Scroll page to load all content (especially for lazy-loaded elements)
          console.log('Scrolling page to load dynamic content...');
          await page.evaluate(async () => {
            // @ts-ignore - This code runs in browser context, not Node.js
            await new Promise<void>((resolve) => {
              let totalHeight = 0;
              const distance = 50 + Math.random() * 50; // Variable scroll distance
              const timer = setInterval(() => {
                // @ts-ignore
                const scrollHeight = document.body.scrollHeight;
                // @ts-ignore
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                  clearInterval(timer);
                  // Scroll back to top with smooth behavior
                  // @ts-ignore
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  setTimeout(() => resolve(), 500);
                }
              }, 100 + Math.random() * 100); // Variable scroll speed
            });
          });
          
          // Additional random mouse movements
          await page.mouse.move(Math.random() * 800, Math.random() * 600);
          await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        } catch (behaviorError) {
          console.warn('⚠️ Error during human behavior simulation, continuing...', behaviorError);
        }
      } else {
        console.warn('⚠️ Skipping human behavior simulation due to navigation issues');
      }

      // Wait for dynamic content to load after scrolling
      console.log('Waiting for dynamic content to load...');
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Increased wait time

      // Normalize selector (преобразуем упрощенный формат data-testid)
      let normalizedSelector = this.normalizeSelector(selector);
      if (normalizedSelector !== selector) {
        console.log(`Selector normalized: "${selector}" -> "${normalizedSelector}"`);
      }

      // Try to find element with multiple attempts and better error handling
      console.log(`Looking for selector: ${normalizedSelector}`);
      let element = await page.$(normalizedSelector);
      
      if (!element) {
        console.log(`Element not found immediately, waiting for selector...`);
        try {
          await page.waitForSelector(normalizedSelector, {
            timeout: 20000,
            visible: true,
          });
          element = await page.$(normalizedSelector);
        } catch (waitError: any) {
          console.warn(`waitForSelector failed: ${waitError.message}`);
          
          // Пробуем найти элемент без требования видимости
          try {
            await page.waitForSelector(normalizedSelector, {
              timeout: 10000,
              visible: false,
            });
            element = await page.$(normalizedSelector);
            console.log(`Element found but not visible`);
          } catch (waitError2: any) {
            console.error(`Element not found even without visibility requirement: ${waitError2.message}`);
            
            // Попробуем альтернативные варианты для data-testid
            let foundWithAlternative = false;
            if (normalizedSelector.includes('data-testid')) {
              const testIdMatch = normalizedSelector.match(/data-testid=["']([^"']+)["']/);
              if (testIdMatch) {
                const testIdValue = testIdMatch[1];
                console.log(`Trying alternative selectors for data-testid="${testIdValue}"...`);
                
                // Вариант 1: без кавычек
                const altSelector1 = `[data-testid=${testIdValue}]`;
                element = await page.$(altSelector1).catch(() => null);
                if (element) {
                  console.log(`✅ Found with alternative selector: ${altSelector1}`);
                  normalizedSelector = altSelector1;
                  foundWithAlternative = true;
                } else {
                  // Вариант 2: с одинарными кавычками
                  const altSelector2 = `[data-testid='${testIdValue}']`;
                  element = await page.$(altSelector2).catch(() => null);
                  if (element) {
                    console.log(`✅ Found with alternative selector: ${altSelector2}`);
                    normalizedSelector = altSelector2;
                    foundWithAlternative = true;
                  }
                }
              }
            }
            
            if (!element && !foundWithAlternative) {
              // Сохраняем скриншот для отладки
              try {
                await fs.mkdir(outputDir, { recursive: true });
                const debugScreenshotPath = path.join(outputDir, `debug_selector_not_found_${geo}_${Date.now()}.png`);
                await page.screenshot({
                  path: debugScreenshotPath,
                  fullPage: true,
                });
                console.error(`Debug screenshot saved: ${debugScreenshotPath}`);
                
                // Показываем доступные элементы с data-testid
                const info = await page.evaluate(() => {
                  // @ts-ignore - Browser context
                  const elements = document.querySelectorAll('[data-testid]');
                  const result: any[] = [];
                  elements.forEach((el: any) => {
                    result.push({
                      tag: el.tagName,
                      testid: el.getAttribute('data-testid'),
                      classes: el.className,
                    });
                  });
                  return result;
                });
                
                console.error(`Available elements with data-testid (first 10):`, JSON.stringify(info.slice(0, 10), null, 2));
              } catch (debugError) {
                console.error('Failed to save debug screenshot:', debugError);
              }
              
              throw new Error(`Selector "${normalizedSelector}" not found on page. Please check if the selector is correct and the page has loaded completely.`);
            }
          }
        }
      }
      
      if (!element) {
        console.log('Selector not found immediately, waiting...');
        // Try waiting for selector with longer timeout
        try {
          await page.waitForSelector(selector, {
            timeout: 20000, // Increased timeout
            visible: false, // Don't require visibility, just existence
          });
          element = await page.$(selector);
          console.log('Selector found after waiting');
        } catch (waitError: any) {
          console.warn(`waitForSelector failed: ${waitError.message}`);
          
          // If still not found, try simpler selectors
          const selectorParts = selector.split(',').map(s => s.trim());
          console.log(`Trying simplified selectors: ${selectorParts.join(', ')}`);
          for (const part of selectorParts) {
            try {
              element = await page.$(part);
              if (element) {
                console.log(`Found element using simplified selector: ${part}`);
                break;
              }
            } catch {
              // Continue trying
            }
          }
        }
      } else {
        console.log('Selector found immediately');
      }

      if (!element) {
        // Get more debug information
        const finalPageTitle = await page.title();
        const finalPageUrl = page.url();
        // @ts-ignore - This code runs in browser context, not Node.js
        const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
        
        // Try to find similar selectors for debugging
        // @ts-ignore - This code runs in browser context, not Node.js
        const allSelectors = await page.evaluate(() => {
          // @ts-ignore - Browser context
          const elements = document.querySelectorAll('[class*="registration"], [class*="wrapper"], [class*="body"]');
          return Array.from(elements).slice(0, 10).map((el: any) => ({
            tag: el.tagName,
            classes: el.className,
            id: el.id,
          }));
        });
        
        // Save full page screenshot for debugging
        try {
          await fs.mkdir(outputDir, { recursive: true });
          const debugScreenshotPath = path.join(outputDir, `debug_fullpage_${geo}_${Date.now()}.png`);
          await page.screenshot({
            path: debugScreenshotPath,
            fullPage: true,
          });
          console.error(`Full page screenshot saved for debugging: ${debugScreenshotPath}`);
        } catch (screenshotError) {
          console.error('Failed to save debug screenshot:', screenshotError);
        }
        
        console.error(`Selector "${selector}" not found.`);
        console.error(`Page title: ${finalPageTitle}`);
        console.error(`Page URL: ${finalPageUrl}`);
        console.error(`Page body preview: ${bodyText.substring(0, 200)}...`);
        console.error(`Found similar elements:`, JSON.stringify(allSelectors, null, 2));
        
        throw new Error(`Selector "${selector}" not found on page. Page URL: ${finalPageUrl}, Title: ${finalPageTitle}. Please check if the selector is correct and the page has loaded completely.`);
      }

      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Generate filename
      const timestamp = Date.now();
      const filename = `screenshot_${geo}_${timestamp}.png`;
      const filepath = path.join(outputDir, filename);

      // Take screenshot of element
      await element.screenshot({
        path: filepath,
        type: 'png',
      });

      // Verify file was created
      try {
        await fs.access(filepath);
        console.log(`Screenshot saved successfully: ${filepath}`);
        console.log(`File exists: ${await fs.stat(filepath).then(s => s.size)} bytes`);
      } catch (err) {
        console.error(`Warning: Screenshot file may not exist: ${filepath}`, err);
      }
      
      return filepath;
    } catch (error: any) {
      console.error(`Error taking screenshot for GEO ${geo}:`, error.message);
      throw new Error(`Failed to take screenshot: ${error.message}`);
    } finally {
      await browser.close();
    }
  }
}
