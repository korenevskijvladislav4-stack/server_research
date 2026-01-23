import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'research_crm',
    connectTimeout: 10000, // 10 секунд таймаут
  };

  console.log('Попытка подключения к MySQL...');
  console.log('Host:', config.host);
  console.log('Port:', config.port);
  console.log('User:', config.user);
  console.log('Database:', config.database);
  console.log('---');

  try {
    const connection = await mysql.createConnection(config);
    console.log('✅ Подключение успешно!');
    
    const [rows] = await connection.query('SELECT VERSION() as version');
    console.log('MySQL версия:', (rows as any[])[0].version);
    
    await connection.end();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Ошибка подключения:');
    console.error('Код:', error.code);
    console.error('Сообщение:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('\n🔍 Диагностика ECONNREFUSED:');
      console.error('1. MySQL не запущен на сервере');
      console.error('2. MySQL не слушает на внешнем интерфейсе (bind-address)');
      console.error('3. Firewall блокирует порт 3306');
      console.error('4. Неверный IP адрес или порт');
    } else if (error.code === 'ETIMEDOUT') {
      console.error('\n🔍 Диагностика ETIMEDOUT:');
      console.error('1. Firewall блокирует подключение');
      console.error('2. Неверный IP адрес');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n🔍 Диагностика ER_ACCESS_DENIED_ERROR:');
      console.error('1. Неверный логин или пароль');
      console.error('2. Пользователь не имеет прав на подключение с этого IP');
    }
    
    process.exit(1);
  }
}

testConnection();
