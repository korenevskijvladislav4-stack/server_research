/** Connection type for an email account. */
export type ConnectionType = 'imap' | 'gmail_oauth';

/** Row from the `imap_accounts` table. */
export interface ImapAccount {
  id: number;
  name: string;
  connection_type: ConnectionType;
  host: string;
  port: number;
  user: string;
  password_encrypted: string;
  oauth_refresh_token_encrypted?: string | null;
  tls: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Body for creating a new email account (IMAP). */
export interface CreateImapAccountDto {
  name: string;
  host: string;
  port?: number;
  user: string;
  password: string;
  tls?: boolean;
  is_active?: boolean;
}

/** Body for updating an existing email account. */
export interface UpdateImapAccountDto {
  name?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  tls?: boolean;
  is_active?: boolean;
}
