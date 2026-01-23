# Парсер слотов с поддержкой прокси

Парсер автоматически собирает список слотов с главной страницы казино для разных GEO, используя прокси-серверы.

## Возможности

- ✅ Парсинг слотов с главной страницы казино
- ✅ Поддержка прокси для работы из-под разных GEO
- ✅ Автоматическая ротация прокси
- ✅ Парсинг динамического контента (JavaScript)
- ✅ Обход детекции ботов (stealth mode)
- ✅ Сохранение слотов с привязкой к GEO
- ✅ Поддержка множественных GEO за один запрос

## Установка

Библиотеки уже установлены:
- `puppeteer` - автоматизация браузера
- `puppeteer-extra` - расширенная версия
- `puppeteer-extra-plugin-stealth` - обход детекции
- `cheerio` - парсинг HTML

## Настройка прокси

### Вариант 1: Через переменные окружения (.env)

Добавьте в `server/.env`:

```env
# Формат: host:port или host:port:username:password
# Можно указать несколько через запятую для ротации
PROXY_RU=proxy1.example.com:8080:user:pass,proxy2.example.com:8080:user:pass
PROXY_DE=proxy.example.com:8080
PROXY_BR=proxy.example.com:8080:user:pass
PROXY_EN=proxy.example.com:8080
# ... и т.д. для других GEO
```

### Вариант 2: Прокси-провайдеры

Можно интегрировать с прокси-провайдерами:
- **Bright Data** (luminati) - https://brightdata.com
- **Oxylabs** - https://oxylabs.io
- **Smartproxy** - https://smartproxy.com
- **ProxyMesh** - https://proxymesh.com

Для интеграции отредактируйте `server/src/config/proxy.config.ts`

## Использование API

### 1. Запустить миграцию БД

```bash
cd server
npm run migrate
```

### 2. Парсинг слотов для нескольких GEO

```http
POST /api/casinos/:casinoId/slots/parse
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://casino.example.com",
  "geos": ["RU", "DE", "BR", "EN"]
}
```

**Ответ:**
```json
{
  "message": "Successfully parsed and saved 150 slots",
  "summary": [
    { "geo": "RU", "count": 45 },
    { "geo": "DE", "count": 38 },
    { "geo": "BR", "count": 42 },
    { "geo": "EN", "count": 25 }
  ],
  "total": 150
}
```

### 3. Получить слоты казино

```http
GET /api/casinos/:casinoId/slots?geo=RU
Authorization: Bearer <token>
```

## Как это работает

1. **Выбор прокси**: Для каждого GEO выбирается случайный прокси из списка
2. **Открытие страницы**: Puppeteer открывает страницу через прокси
3. **Настройка GEO**: URL модифицируется с параметром `?geo=RU` (или другой способ)
4. **Ожидание загрузки**: Ожидается загрузка динамического контента
5. **Парсинг**: HTML парсится через Cheerio для извлечения слотов
6. **Сохранение**: Слоты сохраняются в БД с привязкой к GEO

## Настройка парсера

В `server/src/services/slot-parser-proxy.service.ts` можно настроить:

- **Селекторы слотов**: Добавьте свои селекторы в `slotSelectors`
- **Таймауты**: Измените `defaultTimeout`
- **Задержки**: Настройте задержку между GEO в `parseSlotsForMultipleGeos`
- **Способ указания GEO**: Настройте `buildUrlWithGeo` для вашего формата URL

## Структура данных

Слоты сохраняются в таблице `slots`:
- `casino_id` - ID казино
- `geo` - GEO код (RU, DE, BR и т.д.)
- `name` - Название слота
- `provider` - Провайдер
- `image_url` - URL изображения
- `description` - Описание
- `features` - JSON массив фич
- `is_featured`, `is_new`, `is_popular` - Флаги

## Примеры прокси

### Бесплатные прокси (не рекомендуется для продакшена)
```env
PROXY_RU=185.199.229.156:7492:user:pass
```

### Платные прокси-провайдеры
```env
# Bright Data
PROXY_RU=zproxy.lum-superproxy.io:22225:username-country-ru:password

# Oxylabs
PROXY_RU=customer-username:password@pr.oxylabs.io:7777
```

## Troubleshooting

**Проблема**: Прокси не работает
- Проверьте формат в .env
- Убедитесь что прокси доступен
- Проверьте логи сервера

**Проблема**: Не находит слоты
- Проверьте селекторы в коде
- Убедитесь что страница загружается полностью
- Проверьте что JavaScript выполняется

**Проблема**: Детекция ботов
- Stealth plugin должен помочь
- Попробуйте другой прокси
- Увеличьте задержки между запросами
