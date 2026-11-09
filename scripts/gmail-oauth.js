require('dotenv').config()
const http = require('http')

const clientId = (process.env.GMAIL_CLIENT_ID || '').trim()
const clientSecret = (process.env.GMAIL_CLIENT_SECRET || '').trim()
const port = 42813
const redirectUri = `http://127.0.0.1:${port}/oauth/callback`

if (!clientId || !clientSecret) {
  console.error('Añade GMAIL_CLIENT_ID y GMAIL_CLIENT_SECRET del cliente de escritorio en el .env del backend')
  process.exit(1)
}

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', redirectUri)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send')
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent select_account')

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri)
  if (url.pathname !== '/oauth/callback') {
    res.writeHead(404)
    res.end()
    return
  }

  const oauthError = url.searchParams.get('error')
  const code = url.searchParams.get('code')
  if (oauthError || !code) {
    res.end('Google no autorizó el envío. Puedes cerrar esta pestaña.')
    console.error(oauthError || 'Google no devolvió el código')
    server.close()
    process.exit(1)
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const payload = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok || !payload.refresh_token) {
    res.end('Google no entregó el token. Mira el mensaje en la terminal.')
    console.error(payload.error || tokenResponse.status, payload.error_description || '')
    server.close()
    process.exit(1)
  }

  res.end('Autorización lista. Vuelve a la terminal, copia el token y cierra esta pestaña.')
  console.log('\nCopia este valor en Railway como GMAIL_REFRESH_TOKEN:\n')
  console.log(payload.refresh_token)
  server.close()
  process.exit(0)
})

server.listen(port, '127.0.0.1', () => {
  console.log('Abre esta dirección e inicia sesión con la cuenta que envía los correos:\n')
  console.log(authUrl.toString())
})
