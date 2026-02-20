import pool from './connection';
import dotenv from 'dotenv';

dotenv.config();

const createTables = async () => {
  try {
    const connection = await pool.getConnection();
    
    // Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'user') DEFAULT 'user',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure is_active column exists on users table (for older databases)
    const [isActiveColRows] = await connection.query<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
        AND COLUMN_NAME = 'is_active'
    `);
    const isActiveColExists = Array.isArray(isActiveColRows) && isActiveColRows[0]?.cnt > 0;
    if (!isActiveColExists) {
      await connection.query(`
        ALTER TABLE users
        ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER role
      `);
    }

    // Casinos table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casinos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        website VARCHAR(255),
        description TEXT,
        status ENUM('active', 'inactive', 'pending') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by INT,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure geo column exists on casinos table (for older databases)
    const [geoColRows] = await connection.query<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'casinos'
        AND COLUMN_NAME = 'geo'
    `);
    const geoColExists = Array.isArray(geoColRows) && geoColRows[0]?.cnt > 0;
    if (!geoColExists) {
      await connection.query(`
        ALTER TABLE casinos
        ADD COLUMN geo JSON NULL AFTER description
      `);
    }

    // Ensure is_our column exists on casinos table
    const [isOurColRows] = await connection.query<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'casinos'
        AND COLUMN_NAME = 'is_our'
    `);
    const isOurColExists = Array.isArray(isOurColRows) && isOurColRows[0]?.cnt > 0;
    if (!isOurColExists) {
      await connection.query(`
        ALTER TABLE casinos
        ADD COLUMN is_our BOOLEAN DEFAULT FALSE AFTER geo
      `);
    }

    // Promo campaigns table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS promo_campaigns (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        geo VARCHAR(10) NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        start_date DATE,
        end_date DATE,
        promo_code VARCHAR(100),
        bonus_type VARCHAR(100),
        bonus_amount DECIMAL(10, 2),
        wagering_requirement DECIMAL(10, 2),
        status ENUM('active', 'expired', 'upcoming') DEFAULT 'upcoming',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by INT,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_casino_geo (casino_id, geo),
        INDEX idx_promo_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Emails table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id VARCHAR(255) UNIQUE NOT NULL,
        subject VARCHAR(500),
        from_email VARCHAR(255),
        from_name VARCHAR(255),
        to_email VARCHAR(255),
        body_text LONGTEXT,
        body_html LONGTEXT,
        date_received DATETIME,
        is_read BOOLEAN DEFAULT FALSE,
        is_archived BOOLEAN DEFAULT FALSE,
        related_casino_id INT,
        related_promo_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (related_casino_id) REFERENCES casinos(id) ON DELETE SET NULL,
        FOREIGN KEY (related_promo_id) REFERENCES promo_campaigns(id) ON DELETE SET NULL,
        INDEX idx_message_id (message_id),
        INDEX idx_date_received (date_received),
        INDEX idx_from_email (from_email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Update existing emails table columns to LONGTEXT if they are not already LONGTEXT
    try {
      const [textColRows] = await connection.query<any[]>(`
        SELECT COLUMN_NAME, COLUMN_TYPE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'emails'
          AND COLUMN_NAME IN ('body_text', 'body_html')
          AND COLUMN_TYPE NOT LIKE '%LONGTEXT%'
      `);
      
      if (Array.isArray(textColRows) && textColRows.length > 0) {
        console.log(`Found ${textColRows.length} columns to update to LONGTEXT`);
        for (const row of textColRows) {
          const columnName = row.COLUMN_NAME;
          console.log(`Updating emails.${columnName} from ${row.COLUMN_TYPE} to LONGTEXT`);
          await connection.query(`
            ALTER TABLE emails
            MODIFY COLUMN ${columnName} LONGTEXT
          `);
          console.log(`Successfully updated emails.${columnName} to LONGTEXT`);
        }
      } else {
        console.log('All email body columns are already LONGTEXT or table does not exist yet');
      }
    } catch (err: any) {
      console.error('Error updating email columns:', err?.message || err);
      // Try direct ALTER TABLE as fallback
      try {
        console.log('Attempting direct ALTER TABLE...');
        await connection.query(`
          ALTER TABLE emails
          MODIFY COLUMN body_text LONGTEXT,
          MODIFY COLUMN body_html LONGTEXT
        `);
        console.log('Successfully updated email columns using direct ALTER TABLE');
      } catch (alterErr: any) {
        console.error('Direct ALTER TABLE also failed:', alterErr?.message || alterErr);
        // Ignore error if columns already have correct type
        if (!alterErr?.message?.includes('Unknown column') && !alterErr?.message?.includes('Duplicate column name')) {
          throw alterErr;
        }
      }
    }

    // Add ai_summary column to emails table
    try {
      const [aiSumCol] = await connection.query<any[]>(`
        SELECT COUNT(*) AS cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'emails'
          AND COLUMN_NAME = 'ai_summary'
      `);
      if (Array.isArray(aiSumCol) && (aiSumCol[0] as any).cnt === 0) {
        await connection.query(`ALTER TABLE emails ADD COLUMN ai_summary TEXT`);
        console.log('Added ai_summary column to emails table');
      }
    } catch (err: any) {
      console.error('Error adding ai_summary column:', err?.message || err);
    }

    // Add screenshot_url column to emails table
    try {
      const [scrCol] = await connection.query<any[]>(`
        SELECT COUNT(*) AS cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'emails'
          AND COLUMN_NAME = 'screenshot_url'
      `);
      if (Array.isArray(scrCol) && (scrCol[0] as any).cnt === 0) {
        await connection.query(`ALTER TABLE emails ADD COLUMN screenshot_url VARCHAR(500)`);
        console.log('Added screenshot_url column to emails table');
      }
    } catch (err: any) {
      console.error('Error adding screenshot_url column:', err?.message || err);
    }

    // Email topics (themes) — configurable list for AI classification
    await connection.query(`
      CREATE TABLE IF NOT EXISTS email_topics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    try {
      const [topicIdCol] = await connection.query<any[]>(`
        SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'emails' AND COLUMN_NAME = 'topic_id'
      `);
      if (Array.isArray(topicIdCol) && (topicIdCol[0] as any).cnt === 0) {
        await connection.query(`ALTER TABLE emails ADD COLUMN topic_id INT NULL`);
      }
    } catch (err: any) {
      console.error('Error adding topic_id to emails:', err?.message || err);
    }

    // Email attachments table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS email_attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        content_type VARCHAR(100),
        size INT,
        file_path VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (email_id) REFERENCES emails(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // IMAP accounts (подключения почты с фронта)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS imap_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        connection_type ENUM('imap','gmail_oauth') NOT NULL DEFAULT 'imap',
        host VARCHAR(255) NOT NULL,
        port INT NOT NULL DEFAULT 993,
        user VARCHAR(255) NOT NULL,
        password_encrypted TEXT NOT NULL,
        oauth_refresh_token_encrypted TEXT NULL,
        tls BOOLEAN NOT NULL DEFAULT TRUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Migrate: add connection_type column if it doesn't exist
    const [connTypeColRows] = await connection.query<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'imap_accounts'
        AND COLUMN_NAME = 'connection_type'
    `);
    if (Array.isArray(connTypeColRows) && connTypeColRows[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE imap_accounts
        ADD COLUMN connection_type ENUM('imap','gmail_oauth') NOT NULL DEFAULT 'imap' AFTER name
      `);
      console.log('Added connection_type column to imap_accounts');
    }

    // Migrate: add oauth_refresh_token_encrypted column if it doesn't exist
    const [oauthColRows] = await connection.query<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'imap_accounts'
        AND COLUMN_NAME = 'oauth_refresh_token_encrypted'
    `);
    if (Array.isArray(oauthColRows) && oauthColRows[0]?.cnt === 0) {
      await connection.query(`
        ALTER TABLE imap_accounts
        ADD COLUMN oauth_refresh_token_encrypted TEXT NULL AFTER password_encrypted
      `);
      console.log('Added oauth_refresh_token_encrypted column to imap_accounts');
    }

    // Casino profile field definitions (editable by users/admins)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_profile_fields (
        id INT AUTO_INCREMENT PRIMARY KEY,
        key_name VARCHAR(100) UNIQUE NOT NULL,
        label VARCHAR(255) NOT NULL,
        description TEXT,
        field_type ENUM('text','textarea','number','boolean','select','multiselect','rating','date','url') NOT NULL DEFAULT 'text',
        options_json JSON NULL,
        group_name VARCHAR(100) NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_required BOOLEAN NOT NULL DEFAULT FALSE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_by INT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_group_name (group_name),
        INDEX idx_sort_order (sort_order),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Casino profile values (per casino, per field)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_profile_values (
        casino_id INT NOT NULL,
        field_id INT NOT NULL,
        value_json JSON NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by INT NULL,
        PRIMARY KEY (casino_id, field_id),
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (field_id) REFERENCES casino_profile_fields(id) ON DELETE CASCADE,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_updated_at (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Casino profile history (audit trail)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_profile_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        field_id INT NULL,
        action ENUM('set_value','clear_value','create_field','update_field','delete_field') NOT NULL,
        old_value_json JSON NULL,
        new_value_json JSON NULL,
        meta_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actor_user_id INT NULL,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (field_id) REFERENCES casino_profile_fields(id) ON DELETE SET NULL,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_casino_created_at (casino_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // GEO dictionary
    await connection.query(`
      CREATE TABLE IF NOT EXISTS geos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(10) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_is_active (is_active),
        INDEX idx_sort_order (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Casino bonuses per geo
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_bonuses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        geo VARCHAR(10) NOT NULL,
        name VARCHAR(255) NOT NULL,
        bonus_kind ENUM('deposit','nodeposit','cashback','rakeback') NULL,
        bonus_type ENUM('cash','freespin','combo') NULL,
        bonus_value DECIMAL(10,2) NULL,
        bonus_unit ENUM('percent','amount') DEFAULT 'amount',
        currency VARCHAR(10) NULL,
        freespins_count INT NULL,
        freespin_value DECIMAL(10,2) NULL,
        freespin_game VARCHAR(255) NULL,
        cashback_percent DECIMAL(5,2) NULL,
        cashback_period VARCHAR(50) NULL,
        min_deposit DECIMAL(10,2) NULL,
        max_bonus DECIMAL(10,2) NULL,
        max_cashout DECIMAL(10,2) NULL,
        wagering_requirement DECIMAL(10,2) NULL,
        wagering_games VARCHAR(255) NULL,
        promo_code VARCHAR(100) NULL,
        valid_from DATE NULL,
        valid_to DATE NULL,
        status ENUM('active','paused','expired','draft') DEFAULT 'active',
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_by INT NULL,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_casino_geo (casino_id, geo),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Add bonus_category column if it doesn't exist
    const [categoryColRows] = await connection.query<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'casino_bonuses'
        AND COLUMN_NAME = 'bonus_category'
    `);
    const categoryColExists = Array.isArray(categoryColRows) && categoryColRows[0]?.cnt > 0;
    if (!categoryColExists) {
      await connection.query(`
        ALTER TABLE casino_bonuses
        ADD COLUMN bonus_category ENUM('casino','sport') DEFAULT 'casino' AFTER name
      `);
    }

    // Add new columns to casino_bonuses if they don't exist (for older databases)
    const bonusColumns = ['bonus_kind', 'freespins_count', 'freespin_value', 'freespin_game', 'cashback_percent', 'cashback_period'];
    for (const col of bonusColumns) {
      const [colRows] = await connection.query<any[]>(`
        SELECT COUNT(*) AS cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'casino_bonuses'
          AND COLUMN_NAME = ?
      `, [col]);
      const colExists = Array.isArray(colRows) && colRows[0]?.cnt > 0;
      if (!colExists) {
        let colDef = '';
        switch (col) {
          case 'bonus_kind':
            colDef = "ENUM('deposit','nodeposit','cashback','rakeback') NULL AFTER name";
            break;
          case 'freespins_count':
            colDef = 'INT NULL AFTER currency';
            break;
          case 'freespin_value':
            colDef = 'DECIMAL(10,2) NULL AFTER freespins_count';
            break;
          case 'freespin_game':
            colDef = 'VARCHAR(255) NULL AFTER freespin_value';
            break;
          case 'cashback_percent':
            colDef = 'DECIMAL(5,2) NULL AFTER freespin_game';
            break;
          case 'cashback_period':
            colDef = 'VARCHAR(50) NULL AFTER cashback_percent';
            break;
        }
        if (colDef) {
          await connection.query(`ALTER TABLE casino_bonuses ADD COLUMN ${col} ${colDef}`);
          console.log(`Added column ${col} to casino_bonuses`);
        }
      }
    }

    // Update bonus_type column to new ENUM if needed
    try {
      await connection.query(`
        ALTER TABLE casino_bonuses MODIFY COLUMN bonus_type ENUM('cash','freespin','combo') NULL
      `);
    } catch (e) {
      // Might fail if data exists with old values, that's ok
    }

    // Add max_win columns for cash, freespins and percent part (combo), fixed or coefficient
    const maxWinBonusColumns = [
      { name: 'max_win_cash_value', def: 'DECIMAL(12,2) NULL AFTER max_cashout' },
      { name: 'max_win_cash_unit', def: "VARCHAR(20) NULL AFTER max_win_cash_value" },
      { name: 'max_win_freespin_value', def: 'DECIMAL(12,2) NULL AFTER max_win_cash_unit' },
      { name: 'max_win_freespin_unit', def: "VARCHAR(20) NULL AFTER max_win_freespin_value" },
      { name: 'max_win_percent_value', def: 'DECIMAL(12,2) NULL AFTER max_win_freespin_unit' },
      { name: 'max_win_percent_unit', def: "VARCHAR(20) NULL AFTER max_win_percent_value" },
    ];
    for (const col of maxWinBonusColumns) {
      const [colRows] = await connection.query<any[]>(`
        SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'casino_bonuses' AND COLUMN_NAME = ?
      `, [col.name]);
      const colExists = Array.isArray(colRows) && colRows[0]?.cnt > 0;
      if (!colExists) {
        await connection.query(`ALTER TABLE casino_bonuses ADD COLUMN ${col.name} ${col.def}`);
        console.log(`Added column ${col.name} to casino_bonuses`);
      }
    }

    // Wagering: отдельно на кэш и на фриспины + время на отыгрыш
    const wageringBonusColumns = [
      { name: 'wagering_freespin', def: 'DECIMAL(10,2) NULL AFTER wagering_requirement' },
      { name: 'wagering_time_limit', def: 'VARCHAR(100) NULL AFTER wagering_games' },
    ];
    for (const col of wageringBonusColumns) {
      const [colRows] = await connection.query<any[]>(`
        SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'casino_bonuses' AND COLUMN_NAME = ?
      `, [col.name]);
      const colExists = Array.isArray(colRows) && colRows[0]?.cnt > 0;
      if (!colExists) {
        await connection.query(`ALTER TABLE casino_bonuses ADD COLUMN ${col.name} ${col.def}`);
        console.log(`Added column ${col.name} to casino_bonuses`);
      }
    }

    // Casino payment methods per geo
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        geo VARCHAR(10) NOT NULL,
        direction ENUM('deposit','withdrawal') NOT NULL DEFAULT 'deposit',
        type VARCHAR(100) NOT NULL,
        method VARCHAR(100) NOT NULL,
        min_amount DECIMAL(12,2) NULL,
        max_amount DECIMAL(12,2) NULL,
        currency VARCHAR(10) NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_by INT NULL,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_casino_geo (casino_id, geo),
        INDEX idx_direction (direction)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Add new columns to casino_payments if they don't exist (for older databases)
    const paymentColumns = ['min_amount', 'max_amount', 'currency', 'direction'];
    for (const col of paymentColumns) {
      const [colRows] = await connection.query<any[]>(`
        SELECT COUNT(*) AS cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'casino_payments'
          AND COLUMN_NAME = ?
      `, [col]);
      const colExists = Array.isArray(colRows) && colRows[0]?.cnt > 0;
      if (!colExists) {
        let colDef = '';
        switch (col) {
          case 'min_amount':
            colDef = 'DECIMAL(12,2) NULL AFTER method';
            break;
          case 'max_amount':
            colDef = 'DECIMAL(12,2) NULL AFTER min_amount';
            break;
          case 'currency':
            colDef = 'VARCHAR(10) NULL AFTER max_amount';
            break;
          case 'direction':
            colDef = "ENUM('deposit','withdrawal') NOT NULL DEFAULT 'deposit' AFTER geo";
            break;
        }
        if (colDef) {
          await connection.query(`ALTER TABLE casino_payments ADD COLUMN ${col} ${colDef}`);
          console.log(`Added column ${col} to casino_payments`);
        }
      }
    }

    // Remove status column from casino_payments if it exists
    const [statusColRows] = await connection.query<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'casino_payments'
        AND COLUMN_NAME = 'status'
    `);
    const statusColExists = Array.isArray(statusColRows) && statusColRows[0]?.cnt > 0;
    if (statusColExists) {
      await connection.query(`ALTER TABLE casino_payments DROP COLUMN status`);
      console.log('Removed column status from casino_payments');
    }

    // Casino comments
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_comments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        user_id INT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_casino_id (casino_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Images attached to casino comments
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_comment_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        comment_id INT NULL,
        file_path VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (comment_id) REFERENCES casino_comments(id) ON DELETE SET NULL,
        INDEX idx_casino_id (casino_id),
        INDEX idx_comment_id (comment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Images attached to casino bonuses
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_bonus_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        bonus_id INT NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (bonus_id) REFERENCES casino_bonuses(id) ON DELETE CASCADE,
        INDEX idx_casino_id (casino_id),
        INDEX idx_bonus_id (bonus_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Images attached to casino payments
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_payment_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        payment_id INT NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (payment_id) REFERENCES casino_payments(id) ON DELETE CASCADE,
        INDEX idx_casino_id (casino_id),
        INDEX idx_payment_id (payment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Images attached to casino promos
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_promo_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        promo_id INT NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        original_name VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (promo_id) REFERENCES casino_promos(id) ON DELETE CASCADE,
        INDEX idx_casino_id (casino_id),
        INDEX idx_promo_id (promo_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Reference tables for bonus names, payment types, payment methods
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ref_bonus_names (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ref_payment_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ref_payment_methods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ref_promo_types (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS providers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_providers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        provider_id INT NOT NULL,
        geo VARCHAR(32) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_casino_provider_geo (casino_id, provider_id, geo),
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
        INDEX idx_casino_geo (casino_id, geo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Profile settings fields (rows in the settings table)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS profile_fields (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sort_order (sort_order),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Profile settings contexts (columns in the settings table)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS profile_contexts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sort_order (sort_order),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Profile settings values (intersection of field and context for each casino + geo)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS profile_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        geo VARCHAR(10) NOT NULL,
        field_id INT NOT NULL,
        context_id INT NOT NULL,
        value BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (field_id) REFERENCES profile_fields(id) ON DELETE CASCADE,
        FOREIGN KEY (context_id) REFERENCES profile_contexts(id) ON DELETE CASCADE,
        UNIQUE KEY unique_casino_geo_field_context (casino_id, geo, field_id, context_id),
        INDEX idx_casino_geo (casino_id, geo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Add geo column to profile_settings if it doesn't exist (for older databases)
    const [geoSettingsColRows] = await connection.query<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'profile_settings'
        AND COLUMN_NAME = 'geo'
    `);
    const geoSettingsColExists = Array.isArray(geoSettingsColRows) && geoSettingsColRows[0]?.cnt > 0;
    if (!geoSettingsColExists) {
      // Drop the old unique key first
      await connection.query(`
        ALTER TABLE profile_settings DROP INDEX unique_casino_field_context
      `).catch(() => {});
      // Add geo column
      await connection.query(`
        ALTER TABLE profile_settings
        ADD COLUMN geo VARCHAR(10) NOT NULL DEFAULT 'ALL' AFTER casino_id
      `);
      // Add new unique key
      await connection.query(`
        ALTER TABLE profile_settings
        ADD UNIQUE KEY unique_casino_geo_field_context (casino_id, geo, field_id, context_id)
      `);
      console.log('Added geo column to profile_settings');
    }

    // Casino accounts table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        geo VARCHAR(10) NOT NULL,
        email VARCHAR(255) NULL,
        phone VARCHAR(50) NULL,
        password VARCHAR(255) NOT NULL,
        owner_id INT NULL,
        last_modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_casino_id (casino_id),
        INDEX idx_geo (geo),
        INDEX idx_owner_id (owner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Account transactions (deposit/withdrawal) per account
    await connection.query(`
      CREATE TABLE IF NOT EXISTS account_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        type ENUM('deposit','withdrawal') NOT NULL,
        amount DECIMAL(14,2) NOT NULL,
        currency VARCHAR(10) NULL,
        transaction_date DATE NOT NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INT NULL,
        FOREIGN KEY (account_id) REFERENCES casino_accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_account_id (account_id),
        INDEX idx_transaction_date (transaction_date),
        INDEX idx_type (type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Slot selectors table - для хранения селекторов по GEO и категориям
    await connection.query(`
      CREATE TABLE IF NOT EXISTS slot_selectors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        geo VARCHAR(10) NOT NULL,
        section VARCHAR(255) NOT NULL,
        category VARCHAR(255) NULL,
        selector VARCHAR(500) NOT NULL,
        url VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        INDEX idx_casino_id (casino_id),
        INDEX idx_geo (geo),
        INDEX idx_casino_geo (casino_id, geo)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Check if section column exists
    const [sectionColRows] = await connection.query<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'slot_selectors'
        AND COLUMN_NAME = 'section'
    `);
    const sectionColExists = Array.isArray(sectionColRows) && sectionColRows[0]?.cnt > 0;
    
    if (!sectionColExists) {
      try {
        await connection.query(`
          ALTER TABLE slot_selectors
          ADD COLUMN section VARCHAR(255) NOT NULL DEFAULT 'Основной' AFTER geo
        `);
        console.log('Added section column to slot_selectors');
      } catch (e: any) {
        console.error('Error adding section column:', e.message);
      }
    }

    // Check if url column exists
    const [urlColRows] = await connection.query<any[]>(`
      SELECT COUNT(*) AS cnt
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'slot_selectors'
        AND COLUMN_NAME = 'url'
    `);
    const urlColExists = Array.isArray(urlColRows) && urlColRows[0]?.cnt > 0;
    
    if (!urlColExists) {
      try {
        await connection.query(`
          ALTER TABLE slot_selectors
          ADD COLUMN url VARCHAR(500) NULL AFTER selector
        `);
        console.log('Added url column to slot_selectors');
      } catch (e: any) {
        console.error('Error adding url column:', e.message);
      }
    }

    // Update category to be nullable if it's not already
    try {
      await connection.query(`
        ALTER TABLE slot_selectors
        MODIFY COLUMN category VARCHAR(255) NULL
      `);
      console.log('Updated category column to be nullable');
    } catch (e: any) {
      if (!e.message?.includes('Duplicate column name') && !e.message?.includes('does not exist')) {
        console.log('Note: category column modification may have failed:', e.message);
      }
    }

    // Slot screenshots table - для хранения скриншотов селекторов
    await connection.query(`
      CREATE TABLE IF NOT EXISTS slot_screenshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        selector_id INT NOT NULL,
        screenshot_path VARCHAR(500) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (selector_id) REFERENCES slot_selectors(id) ON DELETE CASCADE,
        INDEX idx_selector_id (selector_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Drop slot_screenshot_fields table if it exists (removed feature)
    try {
      await connection.query(`DROP TABLE IF EXISTS slot_screenshot_fields`);
      console.log('Dropped slot_screenshot_fields table (feature removed)');
    } catch (e: any) {
      // Ignore errors if table doesn't exist
    }

    // Casino tasks (to-do per casino)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        status ENUM('todo','in_progress','done','cancelled') NOT NULL DEFAULT 'todo',
        priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
        assigned_to INT NULL,
        due_date DATE NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_casino_id (casino_id),
        INDEX idx_status (status),
        INDEX idx_assigned_to (assigned_to)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Tags
    await connection.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL,
        color VARCHAR(20) DEFAULT '#1677ff',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Casino ↔ Tag junction
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_tags (
        casino_id INT NOT NULL,
        tag_id INT NOT NULL,
        PRIMARY KEY (casino_id, tag_id),
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Casino promos (tournaments & promotions)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS casino_promos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        casino_id INT NOT NULL,
        geo VARCHAR(10) NOT NULL,
        promo_category ENUM('tournament','promotion') NOT NULL DEFAULT 'tournament',
        name VARCHAR(255) NOT NULL,
        promo_type VARCHAR(100) NULL,
        period_start DATE NULL,
        period_end DATE NULL,
        provider VARCHAR(255) NULL,
        prize_fund VARCHAR(100) NULL,
        mechanics TEXT NULL,
        min_bet VARCHAR(100) NULL,
        wagering_prize VARCHAR(100) NULL,
        status ENUM('active','paused','expired','draft') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        created_by INT NULL,
        updated_by INT NULL,
        FOREIGN KEY (casino_id) REFERENCES casinos(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_promo_casino_geo (casino_id, geo),
        INDEX idx_promo_status (status),
        INDEX idx_promo_category (promo_category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Drop removed columns from casino_promos if they exist (migration for existing DBs)
    for (const col of ['promo_kind', 'participation_button', 'notes']) {
      const [rows] = await connection.query<any[]>(
        `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'casino_promos' AND COLUMN_NAME = ?`,
        [col]
      );
      if (Array.isArray(rows) && rows[0]?.cnt > 0) {
        await connection.query(`ALTER TABLE casino_promos DROP COLUMN \`${col}\``);
        console.log(`Dropped column casino_promos.${col}`);
      }
    }

    console.log('Database tables created successfully');
    connection.release();
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
};

createTables().then(() => {
  console.log('Migration completed');
  process.exit(0);
}).catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
