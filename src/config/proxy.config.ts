import { GeoProxyMapping, ProxyConfig } from '../models/SlotSelector';

/**
 * Proxy configuration for different GEOs
 * Можно загружать из БД или .env файла
 */
export const getProxyConfig = (): GeoProxyMapping => {
  // Пример конфигурации - замените на свои прокси
  // Формат: { GEO: [{ host, port, username?, password?, protocol? }] }
  
  const config: GeoProxyMapping = {};

  // Загрузка из переменных окружения
  // Формат: PROXY_RU=host:port:user:pass, PROXY_DE=host:port и т.д.
  
  if (process.env.PROXY_RU) {
    config.RU = parseProxyString(process.env.PROXY_RU);
  }
  if (process.env.PROXY_DE) {
    config.DE = parseProxyString(process.env.PROXY_DE);
  }
  if (process.env.PROXY_BR) {
    config.BR = parseProxyString(process.env.PROXY_BR);
  }
  if (process.env.PROXY_EN) {
    config.EN = parseProxyString(process.env.PROXY_EN);
  }
  if (process.env.PROXY_FR) {
    config.FR = parseProxyString(process.env.PROXY_FR);
  }
  if (process.env.PROXY_ES) {
    config.ES = parseProxyString(process.env.PROXY_ES);
  }
  if (process.env.PROXY_IT) {
    config.IT = parseProxyString(process.env.PROXY_IT);
  }
  if (process.env.PROXY_PL) {
    config.PL = parseProxyString(process.env.PROXY_PL);
  }

  // Если нет прокси в env, можно использовать дефолтные (для тестирования)
  // В продакшене лучше использовать реальные прокси-сервисы
  
  return config;
};

/**
 * Parse proxy string from environment variable
 * Формат: host:port или host:port:username:password
 * Можно указать несколько через запятую: host1:port1,host2:port2
 */
function parseProxyString(proxyStr: string): ProxyConfig[] {
  const proxies: ProxyConfig[] = [];
  const parts = proxyStr.split(',');

  for (const part of parts) {
    const [host, port, username, password] = part.trim().split(':');
    if (host && port) {
      proxies.push({
        host,
        port: parseInt(port),
        username: username || undefined,
        password: password || undefined,
        protocol: 'http', // Можно добавить определение протокола
      });
    }
  }

  return proxies;
}

/**
 * Country code to ISO country code mapping
 */
const countryCodeMap: { [key: string]: string } = {
  RU: 'RU', // Russia
  DE: 'DE', // Germany
  BR: 'BR', // Brazil
  EN: 'GB', // United Kingdom (English)
  US: 'US', // United States
  FR: 'FR', // France
  ES: 'ES', // Spain
  IT: 'IT', // Italy
  PL: 'PL', // Poland
  NL: 'NL', // Netherlands
  CA: 'CA', // Canada
  AU: 'AU', // Australia
};

/**
 * Get proxy from built-in proxy providers
 * Автоматически выбирает прокси для указанной страны (DE, RU, EN и т.д.)
 * 
 * Поддерживаемые провайдеры:
 * - Bright Data / Luminati - использует country в username
 * - Oxylabs - использует country в параметрах
 * - Smartproxy - использует country в параметрах
 */
export const getProxyFromProvider = async (geo: string): Promise<ProxyConfig | null> => {
  const provider = process.env.PROXY_PROVIDER?.toLowerCase();
  const countryCode = countryCodeMap[geo.toUpperCase()] || geo.toUpperCase();

  // Bright Data / Luminati
  // Правильный формат: brd-customer-{customerID}-zone-{zoneName}-country-{countryCode}
  // Session не добавляется в username для Bright Data (используется для ротации IP)
  if (provider === 'brightdata' && process.env.BRIGHTDATA_USER && process.env.BRIGHTDATA_PASS) {
    const username = process.env.BRIGHTDATA_USER;
    const zone = process.env.BRIGHTDATA_ZONE || 'datacenter';
    
    // Определяем формат username
    let proxyUsername: string;
    if (username.includes('brd-customer')) {
      // Новый формат Bright Data: brd-customer-{customerID}-zone-{zoneName}-country-{countryCode}
      // Если username уже содержит zone, используем как есть, иначе добавляем zone
      if (username.includes('-zone-')) {
        // Username уже содержит zone, просто добавляем country
        proxyUsername = `${username}-country-${countryCode.toLowerCase()}`;
      } else {
        // Извлекаем customerID из username (формат: brd-customer-{customerID})
        // Убираем "brd-customer-" и берем все до конца (на случай если там уже есть что-то)
        const customerId = username.replace('brd-customer-', '');
        proxyUsername = `brd-customer-${customerId}-zone-${zone}-country-${countryCode.toLowerCase()}`;
      }
    } else {
      // Старый формат Luminati: {username}-country-{country}
      // Для старых аккаунтов может потребоваться session, но для Bright Data обычно не нужен
      proxyUsername = `${username}-country-${countryCode.toLowerCase()}`;
    }
    
    console.log(`Bright Data proxy username: ${proxyUsername}`);
    console.log(`Bright Data proxy host:port: ${process.env.BRIGHTDATA_HOST || 'brd.superproxy.io'}:${process.env.BRIGHTDATA_PORT || '33335'}`);
    
    return {
      host: process.env.BRIGHTDATA_HOST || 'brd.superproxy.io',
      port: parseInt(process.env.BRIGHTDATA_PORT || '33335'),
      username: proxyUsername,
      password: process.env.BRIGHTDATA_PASS,
      protocol: 'http',
    };
  }

  // Oxylabs
  // Использует country через параметры в password или через endpoint
  if (provider === 'oxylabs' && process.env.OXYLABS_USER && process.env.OXYLABS_PASS) {
    // Oxylabs использует формат: customer-{user}:{pass}@pr.oxylabs.io:7777
    // Country указывается через параметры в запросе или через endpoint
    return {
      host: 'pr.oxylabs.io',
      port: 7777,
      username: `customer-${process.env.OXYLABS_USER}-country-${countryCode.toLowerCase}`,
      password: process.env.OXYLABS_PASS,
      protocol: 'http',
    };
  }

  // Smartproxy
  // Использует country через параметры
  if (provider === 'smartproxy' && process.env.SMARTPROXY_USER && process.env.SMARTPROXY_PASS) {
    // Smartproxy использует формат: username-country-{country}@gate.smartproxy.com
    return {
      host: 'gate.smartproxy.com',
      port: 10000,
      username: `${process.env.SMARTPROXY_USER}-country-${countryCode.toLowerCase()}`,
      password: process.env.SMARTPROXY_PASS,
      protocol: 'http',
    };
  }

  return null;
};
