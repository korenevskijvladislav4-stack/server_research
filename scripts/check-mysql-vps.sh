#!/bin/bash
# Скрипт для проверки MySQL на VPS
# Запустите этот скрипт на VPS через SSH или VNC

echo "=== Проверка MySQL на VPS ==="
echo ""

# 1. Проверка статуса MySQL
echo "1. Статус MySQL:"
sudo systemctl status mysql --no-pager | head -5
echo ""

# 2. Проверка, слушает ли MySQL порт 3306
echo "2. Проверка порта 3306:"
sudo ss -lntp | grep 3306 || echo "❌ MySQL не слушает порт 3306"
echo ""

# 3. Проверка bind-address в конфиге
echo "3. Проверка bind-address:"
if [ -f /etc/mysql/mysql.conf.d/mysqld.cnf ]; then
    grep -i "bind-address" /etc/mysql/mysql.conf.d/mysqld.cnf || echo "bind-address не найден (по умолчанию 127.0.0.1)"
elif [ -f /etc/my.cnf ]; then
    grep -i "bind-address" /etc/my.cnf || echo "bind-address не найден (по умолчанию 127.0.0.1)"
else
    echo "❌ Файл конфигурации MySQL не найден"
fi
echo ""

# 4. Проверка firewall (ufw)
echo "4. Статус UFW:"
sudo ufw status | head -10
echo ""

# 5. Проверка правил iptables для порта 3306
echo "5. Правила iptables для порта 3306:"
sudo iptables -L -n | grep 3306 || echo "Нет правил для порта 3306"
echo ""

# 6. Тест локального подключения
echo "6. Тест локального подключения к MySQL:"
mysql -u root -p -e "SELECT 'MySQL работает локально' as status;" 2>/dev/null && echo "✅ Локальное подключение работает" || echo "❌ Локальное подключение не работает"
echo ""

# 7. Показать пользователей MySQL
echo "7. Пользователи MySQL (первые 5):"
mysql -u root -p -e "SELECT user, host FROM mysql.user LIMIT 5;" 2>/dev/null || echo "Не удалось получить список пользователей"
echo ""

echo "=== Конец проверки ==="
