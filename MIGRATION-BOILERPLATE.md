# Миграция на шаблон enrise-tech/expressjs-typescript-prisma-boilerplate

Проект частично приведён к структуре шаблона и переведён на Prisma для слоя данных.

## Что уже сделано

1. **Prisma**
   - Установлен Prisma 5, настроен MySQL.
   - Схема получена из существующей БД (`npx prisma db pull`), сгенерирован клиент (`npx prisma generate`).
   - В `.env` добавлена переменная `DATABASE_URL` (можно собирать из `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).

2. **Структура как в шаблоне**
   - `src/lib/prisma.ts` — синглтон Prisma Client.
   - `src/modules/` — модули в стиле шаблона:
     - `src/modules/auth/` — модуль авторизации:
       - `auth.service.ts` — работа с БД через Prisma (findUserByEmail, createUser, validatePassword).
       - `auth.controller.ts` — register, login.
       - `auth.route.ts` — роуты `/register`, `/login`, `/users/*`.
   - `src/modules/index.ts` — монтирует `auth` по пути `/auth` (итого `/api/auth` при `app.use('/api', modules)`).

3. **Роуты**
   - `src/routes/auth.routes.ts` реэкспортирует `src/modules/auth/auth.route.ts`.
   - Регистрация, логин и CRUD пользователей переведены на Prisma (модуль `modules/auth`: `auth.service`, `users.service`, `users.controller`).
   - `src/routes/casino.routes.ts` реэкспортирует `src/modules/casinos/casino.route.ts`. Казино полностью на Prisma (`modules/casinos`: `casino.service`, `casino.controller`).
   - `src/routes/geo.routes.ts` реэкспортирует `src/modules/geos/geo.route.ts`. Гео на Prisma (`modules/geos`: `geo.service`, `geo.controller`).
   - `src/routes/tag.routes.ts` реэкспортирует `src/modules/tags/tag.route.ts`. Теги и связи казино↔теги на Prisma (`modules/tags`: `tag.service`, `tag.controller`).
   - `src/routes/reference.routes.ts` реэкспортирует `src/modules/reference/ref.route.ts`. Справочники (bonus-names, payment-types, payment-methods, promo-types, providers) на Prisma (`modules/reference`: `ref.service`, `ref.controller`).

4. **Старт приложения**
   - В `startServer()` добавлен вызов `await prisma.$connect()` после `connectDatabase()`.

## Скрипты Prisma

- `npm run prisma:generate` — генерация клиента после изменений схемы.
- `npm run prisma:pull` — повторная интроспекция БД в `prisma/schema.prisma`.
- `npm run prisma:studio` — запуск Prisma Studio для просмотра/редактирования данных.

## Уже перенесённые модули (Prisma + modules)

- **auth** — регистрация, логин, CRUD пользователей (`modules/auth`: auth.service, users.service, auth.controller, users.controller).
- **casinos** — список, по id, создание, обновление, удаление (`modules/casinos`: casino.service, casino.controller).
- **geos** — GET/POST `/geos` (`modules/geos`: geo.service, geo.controller).
- **tags** — GET/POST/DELETE `/tags`, GET/PUT `/casinos/:casinoId/tags`, GET `/casino-tags` (`modules/tags`: tag.service, tag.controller).
- **reference** — GET/POST для `/ref/bonus-names`, `/ref/payment-types`, `/ref/payment-methods`, `/ref/promo-types`, `/ref/providers` (`modules/reference`: ref.service, ref.controller).
- **casinoProfile** — поля и значения профиля казино: GET/POST/PUT/DELETE `/fields`, GET `/profile-values`, GET/PUT `/casinos/:casinoId/profile`, GET `/casinos/:casinoId/profile/history` (`modules/casinoProfile`: casinoProfile.service, casinoProfile.controller).
- **casinoBonus** — бонусы: GET/export `/bonuses`, CRUD `/casinos/:casinoId/bonuses`, загрузка/список/удаление изображений (`modules/casinoBonus`: casinoBonus.service, casinoBonus.controller, bonusUpload.middleware).
- **casinoPayment** — платежи: GET/export `/payments`, CRUD `/casinos/:casinoId/payments`, загрузка/список/удаление изображений (`modules/casinoPayment`: casinoPayment.service, casinoPayment.controller, paymentUpload.middleware).

Старые контроллеры `controllers/geo.controller.ts`, `controllers/tag.controller.ts`, `controllers/reference.controller.ts`, `controllers/casinoProfile.controller.ts`, `controllers/casinoBonus.controller.ts`, `controllers/casinoPayment.controller.ts` удалены.

## Что мигрировать дальше (по шаблону)

1. **Остальные модули**
   - По одному домену выносить в `src/modules/<domain>/`:
     - `<domain>.service.ts` — вызовы Prisma (вместо pool/raw SQL).
     - `<domain>.controller.ts` — обработчики запросов.
     - `<domain>.route.ts` — роуты.
   - В `src/modules/index.ts` подключать:  
     `router.use('/casinos', casinosRoute);` и т.д.
   - После переноса всех эндпоинтов можно перейти на единую точку монтирования:  
     `app.use('/api', modulesRouter)` и убрать отдельные `app.use('/api/casinos', ...)`.

2. **Конфиг и окружение**
   - В шаблоне используются `src/config/`, enum окружений (development/test/staging/production), отдельные `.env.dev`, `.env.test` и т.д. При желании можно перенести текущий `src/config/env.ts` под эту схему.

3. **Swagger**
   - В шаблоне используется `express-jsdoc-swagger` (документация из JSDoc). Сейчас у вас свой Swagger в `src/config/swagger.ts` и `swagger-ui-express`. Можно либо оставить текущий вариант, либо постепенно перейти на JSDoc-комментарии и конфиг из шаблона.

4. **Логирование**
   - В шаблоне — Winston. У вас уже есть `src/utils/logger.ts`. При желании можно заменить его на Winston по примеру шаблона.

5. **Обработка ошибок**
   - В шаблоне — свой error-handler middleware. Ваш `src/middleware/errorHandler.ts` и `AppError` можно оставить или привести к формату шаблона.

6. **Полный отказ от MySQL2**
   - После переноса всех модулей на Prisma удалить:
     - `src/database/connection.ts`, `withConnection.ts`;
     - все вызовы `pool`, `getConnection()`, raw SQL;
     - старые репозитории (например `user.repository.ts`), если они больше не используются.
   - Миграции схемы: новые изменения БД делать через `prisma migrate dev` вместо `src/database/migrate.ts` (старый скрипт можно оставить для совместимости со старыми окружениями или удалить после полного перехода).

## Полезные ссылки

- [Шаблон enrise-tech/expressjs-typescript-prisma-boilerplate](https://github.com/enrise-tech/expressjs-typescript-prisma-boilerplate)
- [Prisma — подключение к MySQL](https://www.prisma.io/docs/concepts/database-connectors/mysql)
- [Prisma — интроспекция](https://www.prisma.io/docs/guides/database/introspection)
