import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import pool from '../database/connection';

dotenv.config();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

export interface ImapOAuthConfig {
  host: string;
  port: number;
  user: string;
  xoauth2: string; // base64-encoded XOAUTH2 token
  tls: boolean;
}

export type ImapConnectionConfig = ImapConfig | ImapOAuthConfig;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOAuthConfig(cfg: ImapConnectionConfig): cfg is ImapOAuthConfig {
  return 'xoauth2' in cfg;
}

function buildConfigFromEnv(): ImapConfig {
  return {
    host: process.env.IMAP_HOST || 'imap.mail.ru',
    port: parseInt(process.env.IMAP_PORT || '993'),
    user: process.env.IMAP_USER || '',
    password: process.env.IMAP_PASSWORD || '',
    tls: process.env.IMAP_TLS !== 'false',
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ImapService {
  private imap: Imap;
  private config: ImapConnectionConfig;

  constructor(config?: ImapConnectionConfig) {
    this.config = config ?? buildConfigFromEnv();

    const user = this.config.user;
    if (!user) {
      throw new Error('IMAP user is required');
    }

    if (!isOAuthConfig(this.config) && !this.config.password) {
      throw new Error('IMAP password is required (or use OAuth)');
    }

    const isSecurePort = this.config.port === 993 || this.config.port === 995;

    const imapConfig: any = {
      user,
      host: this.config.host,
      port: this.config.port,
      connTimeout: 60_000,
      authTimeout: 60_000,
      socketTimeout: 60_000,
      tlsOptions: { rejectUnauthorized: false },
      keepalive: { interval: 10_000, idleInterval: 300_000, forceNoop: true },
    };

    // Authentication: password or XOAUTH2
    if (isOAuthConfig(this.config)) {
      imapConfig.xoauth2 = this.config.xoauth2;
    } else {
      imapConfig.password = this.config.password;
    }

    if (isSecurePort || this.config.tls) {
      imapConfig.tls = true;
    }

    this.imap = new Imap(imapConfig);
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const startTime = Date.now();

      console.log(
        'Attempting IMAP connection to',
        this.config.host,
        'on port',
        this.config.port,
        isOAuthConfig(this.config) ? '(OAuth)' : '(password)',
      );

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const elapsed = Date.now() - startTime;
          const error = new Error(
            `IMAP connection timeout after ${Math.round(elapsed / 1000)} seconds`,
          );
          console.error('IMAP connection timeout – check credentials and network');
          this.disconnect();
          reject(error);
        }
      }, 70_000);

      this.imap.once('ready', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const elapsed = Date.now() - startTime;
          console.log(
            `IMAP connected and authenticated in ${Math.round(elapsed / 1000)}s`,
          );
          resolve();
        }
      });

      this.imap.once('error', (err: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error('IMAP connection error:', err.message);
          reject(err);
        }
      });

      this.imap.on('alert', (alert: string) => {
        console.log('IMAP alert:', alert);
      });

      this.imap.once('end', () => {
        if (!resolved) {
          console.log('IMAP connection ended before ready');
        }
      });

      try {
        this.imap.connect();
      } catch (err: any) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error('Error calling imap.connect():', err);
          reject(err);
        }
      }
    });
  }

  // -------------------------------------------------------------------------
  // Mailbox helpers
  // -------------------------------------------------------------------------

  openInbox(): Promise<Imap.Box> {
    return new Promise((resolve, reject) => {
      this.imap.openBox('INBOX', false, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });
  }

  // -------------------------------------------------------------------------
  // Fetch emails
  // -------------------------------------------------------------------------

  async fetchEmails(limit: number = 50): Promise<any[]> {
    let connected = false;
    try {
      await this.connect();
      connected = true;
      const box = await this.openInbox();

      if (box.messages.total === 0) {
        this.disconnect();
        return [];
      }

      const totalMessages = box.messages.total;
      const fetchCount = Math.min(limit, totalMessages);
      const startSeq = Math.max(1, totalMessages - fetchCount + 1);
      const endSeq = totalMessages;

      console.log(
        `Fetching emails: seq ${startSeq}–${endSeq} (${fetchCount} of ${totalMessages})`,
      );

      return new Promise((resolve, reject) => {
        const fetch = this.imap.seq.fetch(`${startSeq}:${endSeq}`, {
          bodies: '',
          struct: true,
        });

        const emails: any[] = [];
        let processedCount = 0;
        const expectedCount = fetchCount;
        const parsePromises: Promise<void>[] = [];

        const checkComplete = () => {
          if (processedCount === expectedCount) {
            Promise.all(parsePromises).finally(() => {
              setTimeout(() => {
                this.disconnect();
                resolve(emails);
              }, 200);
            });
          }
        };

        fetch.on('message', (msg, seqno) => {
          const chunks: Buffer[] = [];
          let bodyStream: NodeJS.ReadableStream | null = null;

          msg.on('body', (stream) => {
            bodyStream = stream;
            stream.on('data', (chunk: Buffer) => {
              chunks.push(chunk);
            });
          });

          const parsePromise = new Promise<void>((resolveParse) => {
            msg.once('end', async () => {
              try {
                if (chunks.length === 0 && !bodyStream) {
                  console.warn(`No body data for message ${seqno}`);
                  processedCount++;
                  checkComplete();
                  resolveParse();
                  return;
                }

                let parsed;
                if (chunks.length > 0) {
                  parsed = await simpleParser(Buffer.concat(chunks));
                } else if (bodyStream) {
                  parsed = await simpleParser(bodyStream);
                } else {
                  throw new Error('No data to parse');
                }

                const toAddress = parsed.to
                  ? Array.isArray(parsed.to.value)
                    ? parsed.to.value.map((v: any) => v.address).join(', ')
                    : parsed.to.value?.[0]?.address || ''
                  : '';

                emails.push({
                  messageId: parsed.messageId || `msg-${seqno}`,
                  subject: parsed.subject || '',
                  from: {
                    email: parsed.from?.value?.[0]?.address || '',
                    name: parsed.from?.value?.[0]?.name || '',
                  },
                  to: toAddress,
                  text: parsed.text || '',
                  html: parsed.html || '',
                  date: parsed.date || new Date(),
                });

                processedCount++;
                checkComplete();
                resolveParse();
              } catch (parseError: any) {
                console.error(
                  `Error parsing email ${seqno}:`,
                  parseError?.message || parseError,
                );
                processedCount++;
                checkComplete();
                resolveParse();
              }
            });
          });

          parsePromises.push(parsePromise);
        });

        fetch.once('error', (err) => {
          console.error('IMAP fetch error:', err);
          this.disconnect();
          reject(err);
        });

        fetch.once('end', () => {
          setTimeout(() => {
            if (processedCount < expectedCount) {
              console.warn(
                `Only processed ${processedCount} of ${expectedCount} messages`,
              );
            }
            this.disconnect();
            resolve(emails);
          }, 5000);
        });
      });
    } catch (error) {
      console.error('Error fetching emails:', error);
      if (connected) this.disconnect();
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Sync to database
  // -------------------------------------------------------------------------

  async syncEmailsToDatabase(): Promise<{ synced: number; newIds: number[] }> {
    let connection;
    try {
      console.log('Starting email sync…');
      const emails = await this.fetchEmails(100);
      console.log(`Fetched ${emails?.length || 0} emails from IMAP`);

      if (!emails || emails.length === 0) {
        console.log('No emails to sync');
        return { synced: 0, newIds: [] };
      }

      connection = await pool.getConnection();
      let syncedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const newIds: number[] = [];

      const MAX_TEXT_LENGTH = 16 * 1024 * 1024; // 16 MB

      for (const email of emails) {
        try {
          if (!email.messageId || !email.from?.email) {
            skippedCount++;
            continue;
          }

          const [existing] = await connection.query(
            'SELECT id FROM emails WHERE message_id = ?',
            [email.messageId],
          );

          if (Array.isArray(existing) && existing.length === 0) {
            const bodyText = (email.text || '').slice(0, MAX_TEXT_LENGTH);
            const bodyHtml = (email.html || '').slice(0, MAX_TEXT_LENGTH);

            const [result] = await connection.query(
              `INSERT INTO emails
               (message_id, subject, from_email, from_name, to_email, body_text, body_html, date_received)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                email.messageId,
                email.subject || '',
                email.from.email || '',
                email.from.name || '',
                email.to || '',
                bodyText,
                bodyHtml,
                email.date || new Date(),
              ],
            );
            const insertId = (result as any).insertId;
            if (insertId) newIds.push(insertId);
            syncedCount++;
          } else {
            skippedCount++;
          }
        } catch (err: any) {
          errorCount++;
          console.error('Error syncing email:', err?.message || err);
        }
      }

      connection.release();
      console.log(
        `Email sync completed: ${syncedCount} synced, ${skippedCount} skipped, ${errorCount} errors`,
      );
      return { synced: syncedCount, newIds };
    } catch (error: any) {
      console.error('Error syncing emails to database:', error?.message || error);
      if (connection) connection.release();
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------

  disconnect(): void {
    try {
      if (
        this.imap &&
        this.imap.state !== 'closed' &&
        this.imap.state !== 'logout'
      ) {
        this.imap.end();
      }
    } catch (err) {
      console.error('Error disconnecting IMAP:', err);
    }
  }
}
