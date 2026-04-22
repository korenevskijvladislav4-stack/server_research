#!/bin/bash

# Скрипт деплоя ResearchCRM на VPS
# Использование: ./deploy.sh

set -e  # Остановка при ошибке

echo "🚀 Начинаем деплой ResearchCRM..."

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка, что мы на сервере
if [ ! -d "/home" ]; then
    echo -e "${YELLOW}⚠️  Похоже, скрипт запущен не на сервере. Продолжаем...${NC}"
fi

# Переменные
PROJECT_DIR="/var/www/research-crm"
REPO_URL="https://github.com/YOUR_USERNAME/YOUR_REPO.git"  # ЗАМЕНИТЕ НА ВАШ РЕПОЗИТОРИЙ
BRANCH="main"  # или master
NODE_VERSION="20"  # Версия Node.js

echo -e "${GREEN}📦 Шаг 1: Обновление кода из Git...${NC}"
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
    git fetch origin
    git reset --hard origin/$BRANCH
    git clean -fd
else
    echo -e "${YELLOW}📥 Клонирование репозитория...${NC}"
    sudo mkdir -p "$PROJECT_DIR"
    sudo git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

echo -e "${GREEN}📦 Шаг 2: Установка зависимостей...${NC}"
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

echo -e "${GREEN}🔨 Шаг 3: Сборка проекта...${NC}"
npm run build

echo -e "${GREEN}📝 Шаг 4: Проверка .env файла...${NC}"
if [ ! -f "$PROJECT_DIR/server/.env" ]; then
    echo -e "${RED}❌ Файл server/.env не найден!${NC}"
    echo -e "${YELLOW}Создайте файл server/.env с необходимыми переменными окружения${NC}"
    exit 1
fi

echo -e "${GREEN}🔄 Шаг 5: Перезапуск приложения через PM2...${NC}"
# Остановка старого процесса, если существует
pm2 delete research-crm 2>/dev/null || true

# Запуск нового процесса через ecosystem.config.js
cd "$PROJECT_DIR"
if [ -f "ecosystem.config.js" ]; then
    pm2 start ecosystem.config.js
else
    # Fallback: запуск напрямую
    cd server
    pm2 start dist/server.js --name research-crm --env production
fi
pm2 save

echo -e "${GREEN}✅ Деплой завершен успешно!${NC}"
echo -e "${YELLOW}Проверьте статус: pm2 status${NC}"
echo -e "${YELLOW}Логи: pm2 logs research-crm${NC}"
