#!/bin/bash
# Скрипт установки Chromium на Ubuntu для ResearchCRM
# Использование: sudo bash install-chromium.sh
# ВАЖНО: Если получаете ошибку "\r command not found", выполните:
# sed -i 's/\r$//' install-chromium.sh

set -e

echo "🚀 Установка Chromium для ResearchCRM..."

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Проверка, что скрипт запущен от root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}❌ Пожалуйста, запустите скрипт с sudo: sudo bash install-chromium.sh${NC}"
    exit 1
fi

echo -e "${GREEN}📦 Шаг 1: Обновление списка пакетов...${NC}"
apt-get update

echo -e "${GREEN}📦 Шаг 2: Установка системных зависимостей...${NC}"
apt-get install -y \
  ca-certificates \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils

echo -e "${GREEN}📦 Шаг 3: Установка Chromium...${NC}"
apt-get install -y chromium-browser chromium-chromedriver

echo -e "${GREEN}✅ Шаг 4: Проверка установки...${NC}"
if command -v chromium-browser &> /dev/null; then
    CHROMIUM_PATH=$(which chromium-browser)
    CHROMIUM_VERSION=$(chromium-browser --version)
    echo -e "${GREEN}✅ Chromium установлен успешно!${NC}"
    echo -e "${GREEN}   Путь: ${CHROMIUM_PATH}${NC}"
    echo -e "${GREEN}   Версия: ${CHROMIUM_VERSION}${NC}"
else
    echo -e "${YELLOW}⚠️  Chromium установлен, но не найден в PATH${NC}"
    echo -e "${YELLOW}   Попробуйте найти вручную: find /usr -name '*chromium*' 2>/dev/null${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Шаг 5: Настройка прав доступа...${NC}"
chmod +x "$CHROMIUM_PATH"

echo -e "${GREEN}✅ Установка завершена!${NC}"
echo ""
echo -e "${YELLOW}📝 Следующие шаги:${NC}"
echo -e "${YELLOW}1. Добавьте в server/.env:${NC}"
echo -e "   PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true"
echo -e "   PUPPETEER_EXECUTABLE_PATH=${CHROMIUM_PATH}"
echo ""
echo -e "${YELLOW}2. Пересоберите и перезапустите сервер:${NC}"
echo -e "   cd /var/www/research-crm/server"
echo -e "   npm run build"
echo -e "   pm2 restart research-crm"
echo ""
