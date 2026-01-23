import Imap from 'imap';
import { simpleParser } from 'mailparser';
import dotenv from 'dotenv';
import pool from '../database/connection';

dotenv.config();

interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
}

export class ImapService {
  private imap: Imap;
  private config: ImapConfig;

  constructor() {
    this.config = {
      host: process.env.IMAP_HOST || 'imap.mail.ru',
      port: parseInt(process.env.IMAP_PORT || '993'),
      user: process.env.IMAP_USER || '',
      password: process.env.IMAP_PASSWORD || '',
      tls: process.env.IMAP_TLS !== 'false' // Default to true if not explicitly false
    };

    // Validate required configuration
    if (!this.config.user || !this.config.password) {
      throw new Error('IMAP_USER and IMAP_PASSWORD must be set in environment variables');
    }

    const isSecurePort = this.config.port === 993 || this.config.port === 995;
    
    // Build IMAP configuration
    // Note: For imap library v0.8.19, use 'tls: true' for port 993, not 'secure'
    const imapConfig: any = {
      user: this.config.user,
      password: this.config.password,
      host: this.config.host,
      port: this.config.port,
      connTimeout: 60000, // 60 seconds connection timeout
      authTimeout: 60000, // 60 seconds authentication timeout
      socketTimeout: 60000, // 60 seconds socket timeout (for read/write operations)
      tlsOptions: { 
        rejectUnauthorized: false
      },
      keepalive: {
        interval: 10000,
        idleInterval: 300000,
        forceNoop: true
      },
      // Enable debug mode to see what's happening
      debug: (info: string) => {
        console.log('IMAP Debug:', info);
      }
    };

    // For imap library, use 'tls' option for secure connections
    if (isSecurePort || this.config.tls) {
      imapConfig.tls = true;
    }

      console.log('IMAP config:', {
        host: imapConfig.host,
        port: imapConfig.port,
        user: imapConfig.user,
        tls: imapConfig.tls,
        connTimeout: imapConfig.connTimeout,
        authTimeout: imapConfig.authTimeout,
        socketTimeout: imapConfig.socketTimeout
      });

    this.imap = new Imap(imapConfig);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      const startTime = Date.now();

      console.log('Attempting IMAP connection to', this.config.host, 'on port', this.config.port);

      // Set up connection timeout (longer timeout for authentication)
      // Should be longer than authTimeout + connTimeout
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const elapsed = Date.now() - startTime;
          const error = new Error(`IMAP connection timeout after ${Math.round(elapsed / 1000)} seconds`);
          console.error('IMAP connection timeout - check credentials and network');
          console.error('Connection details:', {
            host: this.config.host,
            port: this.config.port,
            user: this.config.user,
            elapsedSeconds: Math.round(elapsed / 1000)
          });
          console.error('This usually means:');
          console.error('1. Server is not responding (check IMAP_HOST and IMAP_PORT)');
          console.error('2. Credentials are incorrect (check IMAP_USER and IMAP_PASSWORD)');
          console.error('3. Network/firewall is blocking the connection');
          console.error('4. IMAP access is not enabled in account settings');
          console.error('5. For Mail.ru: use password for external applications if 2FA is enabled');
          this.disconnect();
          reject(error);
        }
      }, 70000); // 70 seconds total timeout (longer than authTimeout)

      this.imap.once('ready', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const elapsed = Date.now() - startTime;
          console.log(`IMAP connected and authenticated successfully in ${Math.round(elapsed / 1000)} seconds`);
          resolve();
        }
      });

      this.imap.once('error', (err: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const elapsed = Date.now() - startTime;
          console.error(`IMAP connection error after ${Math.round(elapsed / 1000)} seconds:`, err);
          console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            code: (err as any).code,
            source: (err as any).source,
            errno: (err as any).errno,
            syscall: (err as any).syscall
          });
          reject(err);
        }
      });

      // Additional event listeners for debugging
      this.imap.on('alert', (alert: string) => {
        console.log('IMAP alert:', alert);
      });

      // Listen for end event
      this.imap.once('end', () => {
        if (!resolved) {
          console.log('IMAP connection ended before ready');
        } else {
          console.log('IMAP connection ended');
        }
      });

      try {
        console.log('Calling imap.connect()...');
        const connectStart = Date.now();
        this.imap.connect();
        console.log(`imap.connect() called (took ${Date.now() - connectStart}ms), waiting for ready/error event...`);
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

  openInbox(): Promise<Imap.Box> {
    return new Promise((resolve, reject) => {
      this.imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          reject(err);
        } else {
          resolve(box);
        }
      });
    });
  }

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

      // Fetch the most recent emails (last N messages)
      // IMAP seq numbers: 1 is oldest, box.messages.total is newest
      const totalMessages = box.messages.total;
      const fetchCount = Math.min(limit, totalMessages);
      const startSeq = Math.max(1, totalMessages - fetchCount + 1);
      const endSeq = totalMessages;
      
      console.log(`Fetching emails: sequences ${startSeq} to ${endSeq} (most recent ${fetchCount} out of ${totalMessages} total)`);

      return new Promise((resolve, reject) => {
        const fetch = this.imap.seq.fetch(`${startSeq}:${endSeq}`, {
          bodies: '',
          struct: true
        });

        const emails: any[] = [];
        let processedCount = 0;
        const totalMessages = fetchCount;
        const parsePromises: Promise<void>[] = [];

        const checkComplete = () => {
          if (processedCount === totalMessages) {
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
                // If we have chunks, use Buffer, otherwise use stream
                if (chunks.length > 0) {
                  const fullBuffer = Buffer.concat(chunks);
                  parsed = await simpleParser(fullBuffer);
                } else if (bodyStream) {
                  parsed = await simpleParser(bodyStream);
                } else {
                  throw new Error('No data to parse');
                }
                
                // Extract 'to' addresses properly
                const toAddress = parsed.to 
                  ? (Array.isArray(parsed.to.value) 
                      ? parsed.to.value.map((v: any) => v.address).join(', ')
                      : (parsed.to.value && parsed.to.value[0]?.address) || '')
                  : '';

                emails.push({
                  messageId: parsed.messageId || `msg-${seqno}`,
                  subject: parsed.subject || '',
                  from: {
                    email: parsed.from?.value?.[0]?.address || '',
                    name: parsed.from?.value?.[0]?.name || ''
                  },
                  to: toAddress,
                  text: parsed.text || '',
                  html: parsed.html || '',
                  date: parsed.date || new Date()
                });

                processedCount++;
                checkComplete();
                resolveParse();
              } catch (parseError: any) {
                console.error(`Error parsing email ${seqno}:`, parseError?.message || parseError);
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
          // Set a timeout to resolve even if some messages didn't complete
          setTimeout(() => {
            if (processedCount < totalMessages) {
              console.warn(`Only processed ${processedCount} of ${totalMessages} messages`);
            }
            this.disconnect();
            resolve(emails);
          }, 5000); // 5 second timeout
        });
      });
    } catch (error) {
      console.error('Error fetching emails:', error);
      if (connected) {
        this.disconnect();
      }
      throw error;
    }
  }

  async syncEmailsToDatabase(): Promise<number> {
    let connection;
    try {
      console.log('Starting email sync...');
      const emails = await this.fetchEmails(100);
      console.log(`Fetched ${emails?.length || 0} emails from IMAP`);
      
      if (!emails || emails.length === 0) {
        console.log('No emails to sync');
        return 0;
      }

      connection = await pool.getConnection();
      let syncedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const email of emails) {
        try {
          // Skip if required fields are missing
          if (!email.messageId || !email.from?.email) {
            console.warn('Skipping email with missing required fields:', {
              messageId: email.messageId,
              fromEmail: email.from?.email
            });
            skippedCount++;
            continue;
          }

          const [existing] = await connection.query(
            'SELECT id FROM emails WHERE message_id = ?',
            [email.messageId]
          );

          if (Array.isArray(existing) && existing.length === 0) {
            // Truncate very long text fields to prevent issues (LONGTEXT can store up to 4GB, but we'll limit to 16MB for safety)
            const MAX_TEXT_LENGTH = 16 * 1024 * 1024; // 16MB
            
            const bodyText = email.text || '';
            const bodyHtml = email.html || '';
            
            const truncatedText = bodyText.length > MAX_TEXT_LENGTH 
              ? bodyText.substring(0, MAX_TEXT_LENGTH) + '...[truncated]'
              : bodyText;
            
            const truncatedHtml = bodyHtml.length > MAX_TEXT_LENGTH
              ? bodyHtml.substring(0, MAX_TEXT_LENGTH) + '...[truncated]'
              : bodyHtml;

            await connection.query(
              `INSERT INTO emails 
               (message_id, subject, from_email, from_name, to_email, body_text, body_html, date_received)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                email.messageId,
                email.subject || '',
                email.from.email || '',
                email.from.name || '',
                email.to || '',
                truncatedText,
                truncatedHtml,
                email.date || new Date()
              ]
            );
            syncedCount++;
          } else {
            skippedCount++;
            // Log why it was skipped for debugging
            if (skippedCount <= 5) {
              console.log(`Skipping existing email: ${email.messageId?.substring(0, 50)}...`);
            }
          }
        } catch (err: any) {
          errorCount++;
          console.error('Error syncing email:', {
            error: err?.message || err,
            messageId: email.messageId,
            sqlMessage: err?.sqlMessage
          });
        }
      }

      if (connection) {
        connection.release();
      }
      
      console.log(`Email sync completed: ${syncedCount} synced, ${skippedCount} skipped, ${errorCount} errors`);
      
      if (skippedCount === emails.length && syncedCount === 0) {
        console.log('All emails were skipped - they may already be in the database');
        console.log('This is normal if you have already synced these emails before');
        console.log('Try syncing again after new emails arrive in your mailbox');
      }
      
      return syncedCount;
    } catch (error: any) {
      console.error('Error syncing emails to database:', {
        error: error?.message || error,
        stack: error?.stack
      });
      if (connection) {
        connection.release();
      }
      throw error;
    }
  }

  disconnect(): void {
    try {
      if (this.imap && this.imap.state !== 'closed' && this.imap.state !== 'logout') {
        this.imap.end();
      }
    } catch (err) {
      console.error('Error disconnecting IMAP:', err);
    }
  }
}
