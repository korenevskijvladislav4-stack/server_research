import { OAuth2Client } from 'google-auth-library';

/**
 * Gmail OAuth2 service for connecting Gmail accounts via OAuth.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID      – OAuth2 client ID from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET   – OAuth2 client secret
 *   GOOGLE_REDIRECT_URI    – Redirect URI registered in Google Cloud Console
 *                            (e.g. http://localhost:3000/emails/oauth/callback)
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Gmail OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in .env',
    );
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether Gmail OAuth is configured on the server.
 */
export function isGmailOAuthConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Generate the Google OAuth consent URL that the frontend should redirect to.
 */
export function getGmailAuthUrl(): string {
  const client = getOAuth2Client();

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://mail.google.com/', // Full IMAP/SMTP access
      'https://www.googleapis.com/auth/userinfo.email', // Get user email
    ],
  });
}

/**
 * Exchange an authorization code for tokens and return email + refresh token.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  email: string;
  refreshToken: string;
  accessToken: string;
}> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token received. Make sure access_type=offline and prompt=consent.',
    );
  }
  if (!tokens.access_token) {
    throw new Error('No access token received.');
  }

  // Get user email from token info
  client.setCredentials(tokens);
  const tokenInfo = await client.getTokenInfo(tokens.access_token);
  const email = tokenInfo.email;

  if (!email) {
    throw new Error('Could not determine email address from OAuth tokens.');
  }

  return {
    email,
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
  };
}

/**
 * Refresh an access token using a stored refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token.');
  }

  return credentials.access_token;
}

/**
 * Build the XOAUTH2 string needed by the IMAP library.
 *
 * Format: base64("user=<email>\x01auth=Bearer <token>\x01\x01")
 */
export function buildXOAuth2Token(email: string, accessToken: string): string {
  const authString = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
  return Buffer.from(authString).toString('base64');
}
