import { RowDataPacket } from 'mysql2';
import pool from '../database/connection';
import { ImapService } from './imap.service';
import { decryptPassword } from '../common/utils/crypto.utils';
import {
  refreshAccessToken,
  buildXOAuth2Token,
} from './gmail-oauth.service';
import { autoLinkEmailsToCasinos } from '../controllers/email.controller';
import { summarizeEmailsByIds, assignEmailTopicsByIds } from './ai-summary.service';
import { screenshotEmailsByIds } from './email-screenshot.service';
import type { ConnectionType } from '../models/ImapAccount';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
const INITIAL_DELAY_MS = 15_000;          // 15 seconds after server start

let intervalId: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;

// ---------------------------------------------------------------------------
// Build ImapService from account row
// ---------------------------------------------------------------------------

async function buildImapServiceForAccount(row: RowDataPacket): Promise<ImapService> {
  const connectionType: ConnectionType = row.connection_type || 'imap';

  if (connectionType === 'gmail_oauth') {
    const refreshToken = decryptPassword(row.oauth_refresh_token_encrypted);
    const accessToken = await refreshAccessToken(refreshToken);
    const xoauth2 = buildXOAuth2Token(row.user, accessToken);

    return new ImapService({
      host: row.host,
      port: row.port,
      user: row.user,
      xoauth2,
      tls: true,
    });
  }

  const password = decryptPassword(row.password_encrypted);
  return new ImapService({
    host: row.host,
    port: row.port,
    user: row.user,
    password,
    tls: !!row.tls,
  });
}

// ---------------------------------------------------------------------------
// Core sync
// ---------------------------------------------------------------------------

async function runSync(): Promise<void> {
  if (isSyncing) {
    console.log('[EmailScheduler] Previous sync still running, skipping');
    return;
  }

  isSyncing = true;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, connection_type, host, port, user,
              password_encrypted, oauth_refresh_token_encrypted, tls
       FROM imap_accounts
       WHERE is_active = 1
       ORDER BY name`,
    );

    const accounts = Array.isArray(rows) ? rows : [];

    const allNewIds: number[] = [];

    if (accounts.length === 0) {
      // Try env-based fallback
      const envUser = process.env.IMAP_USER;
      const envPassword = process.env.IMAP_PASSWORD;
      if (envUser && envPassword) {
        const svc = new ImapService();
        try {
          const { synced, newIds } = await svc.syncEmailsToDatabase();
          if (synced > 0) console.log(`[EmailScheduler] Env sync: ${synced} new emails`);
          allNewIds.push(...newIds);
        } finally {
          try { svc.disconnect(); } catch { /* ignore */ }
        }
      }
    } else {
      let totalSynced = 0;

      for (const acc of accounts) {
        let svc: ImapService | null = null;
        try {
          svc = await buildImapServiceForAccount(acc);
          const { synced, newIds } = await svc.syncEmailsToDatabase();
          totalSynced += synced;
          allNewIds.push(...newIds);
        } catch (err: any) {
          console.error(`[EmailScheduler] Account "${acc.name}" error:`, err?.message || err);
        } finally {
          if (svc) {
            try { svc.disconnect(); } catch { /* ignore */ }
          }
        }
      }

      if (totalSynced > 0) {
        console.log(`[EmailScheduler] Synced ${totalSynced} new emails from ${accounts.length} account(s)`);
      }
    }

    // Auto-link new emails to casinos
    try {
      await autoLinkEmailsToCasinos();
    } catch (e) {
      console.error('[EmailScheduler] Auto-link error:', e);
    }

    // AI-summarize, assign topic, and screenshot only the newly synced emails
    if (allNewIds.length > 0) {
      try {
        await summarizeEmailsByIds(allNewIds);
      } catch (e) {
        console.error('[EmailScheduler] AI summary error:', e);
      }
      try {
        await assignEmailTopicsByIds(allNewIds);
      } catch (e) {
        console.error('[EmailScheduler] AI topic assignment error:', e);
      }
      try {
        await screenshotEmailsByIds(allNewIds);
      } catch (e) {
        console.error('[EmailScheduler] Screenshot error:', e);
      }
    }
  } catch (error: any) {
    console.error('[EmailScheduler] Sync error:', error?.message || error);
  } finally {
    isSyncing = false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startEmailSyncScheduler(): void {
  if (intervalId) {
    console.log('[EmailScheduler] Already running');
    return;
  }

  console.log(
    `[EmailScheduler] Starting — first sync in ${INITIAL_DELAY_MS / 1000}s, then every ${SYNC_INTERVAL_MS / 1000}s`,
  );

  // Delayed first run
  setTimeout(() => {
    runSync();
    intervalId = setInterval(runSync, SYNC_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}

export function stopEmailSyncScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[EmailScheduler] Stopped');
  }
}
