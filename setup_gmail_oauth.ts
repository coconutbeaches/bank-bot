import fs from 'fs';
import http from 'http';
import path from 'path';
import os from 'os';

function expandHome(p: string) {
  if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1));
  return p;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const { google } = require('googleapis');
  const args = parseArgs();
  const secretFile = expandHome(
    args['client-secret-file'] ||
    process.env.GMAIL_OAUTH_CLIENT_SECRET_FILE ||
    ''
  );

  if (!secretFile) {
    throw new Error('Provide --client-secret-file or set GMAIL_OAUTH_CLIENT_SECRET_FILE');
  }

  const raw = await fs.promises.readFile(secretFile, 'utf8');
  const parsed = JSON.parse(raw);
  const config = parsed.installed || parsed.web;
  if (!config?.client_id || !config?.client_secret) {
    throw new Error('Could not find client_id/client_secret in OAuth client file');
  }

  const configuredRedirectUri = (config.redirect_uris && config.redirect_uris[0]) || 'http://localhost';
  const configuredUrl = new URL(configuredRedirectUri);
  const callbackPort = Number(args.port || process.env.GMAIL_OAUTH_CALLBACK_PORT || configuredUrl.port || 53682);
  const redirectUri = `${configuredUrl.protocol}//${configuredUrl.hostname}:${callbackPort}${configuredUrl.pathname || ''}`;
  const auth = new google.auth.OAuth2(config.client_id, config.client_secret, redirectUri);

  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
  ];

  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
  });

  const url = new URL(redirectUri);
  const port = Number(url.port || callbackPort);
  const hostname = url.hostname || 'localhost';

  console.log('Open this URL in your browser and approve access:');
  console.log(authUrl);
  console.log('');

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', redirectUri);
        const incomingCode = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        if (error) {
          res.statusCode = 400;
          res.end(`OAuth error: ${error}`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!incomingCode) {
          res.statusCode = 400;
          res.end('Missing code');
          return;
        }

        res.end('Gmail access approved. You can close this tab and return to Codex.');
        server.close();
        resolve(incomingCode);
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(port, hostname, () => {
      console.log(`Waiting for OAuth callback on ${redirectUri} ...`);
    });
  });

  const { tokens } = await auth.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('No refresh_token returned. Remove prior consent or retry with prompt=consent.');
  }

  console.log('');
  console.log('Add these environment variables:');
  console.log(`GMAIL_OAUTH_CLIENT_SECRET_FILE=${secretFile}`);
  console.log(`GMAIL_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
