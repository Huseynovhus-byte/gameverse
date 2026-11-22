// Gameverse server: serves the app and emails password reset codes through Gmail.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = process.env.PORT || 3000;
const USER = process.env.GMAIL_USER, PASS = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const PUB = path.join(__dirname, 'public');
const transport = USER && PASS
  ? require('nodemailer').createTransport({ service: 'gmail', auth: { user: USER, pass: PASS } })
  : null;
if (!transport) console.log('[dev mode] GMAIL_USER / GMAIL_APP_PASSWORD not set: codes are printed here instead of emailed.');

const codes = new Map();   // email -> { hash, exp, tries }
const sends = new Map();   // ip|email -> [timestamps]
const TTL = 10 * 60 * 1000, MAX_SENDS = 3, MAX_TRIES = 5;
const hash = (c, e) => crypto.createHash('sha256').update(c + '|' + e).digest('hex');
const okEmail = e => typeof e === 'string' && e.length < 120 && /^\S+@\S+\.\S+$/.test(e);
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of codes) if (v.exp < now) codes.delete(k);
  for (const [k, v] of sends) { const f = v.filter(t => now - t < TTL); f.length ? sends.set(k, f) : sends.delete(k); }
}, 60000).unref();

const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const readBody = req => new Promise((ok, no) => {
  let d = ''; req.on('data', c => { d += c; if (d.length > 10000) { no(new Error('big')); req.destroy(); } });
  req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { no(e); } });
});
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function sendCode(req, res) {
  let b; try { b = await readBody(req); } catch (e) { return send(res, 400, { error: 'bad request' }); }
  const email = String(b.email || '').trim().toLowerCase();
  if (!okEmail(email)) return send(res, 400, { error: 'invalid email' });
  const key = req.socket.remoteAddress + '|' + email, now = Date.now();
  const recent = (sends.get(key) || []).filter(t => now - t < TTL);
  if (recent.length >= MAX_SENDS) return send(res, 429, { error: 'too many requests' });
  recent.push(now); sends.set(key, recent);
  const code = String(crypto.randomInt(100000, 1000000));
  codes.set(email, { hash: hash(code, email), exp: now + TTL, tries: 0 });
  if (!transport) { console.log(`[dev mode] code for ${email}: ${code}`); return send(res, 200, { ok: true, dev: true }); }
  try {
    await transport.sendMail({
      from: `"Gameverse" <${USER}>`, to: email, subject: 'Your Gameverse password reset code',
      text: `Hi ${b.username || ''},\n\nYour Gameverse code is ${code}. It is valid for 10 minutes.\nIf you did not ask for this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px"><h2 style="margin:0 0 8px">Gameverse</h2><p>Hi ${esc(b.username || '')}, use this code to reset your password:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f1f5f9;padding:14px;border-radius:10px;text-align:center">${code}</p><p style="color:#64748b;font-size:13px">Valid for 10 minutes. If you did not ask for this, ignore this email.</p></div>`
    });
    send(res, 200, { ok: true });
  } catch (e) { console.error('mail error:', e.message); codes.delete(email); send(res, 502, { error: 'mail failed' }); }
}

async function verifyCode(req, res) {
  let b; try { b = await readBody(req); } catch (e) { return send(res, 400, { error: 'bad request' }); }
  const email = String(b.email || '').trim().toLowerCase(), code = String(b.code || '').trim();
  const e = codes.get(email);
  if (!e || e.exp < Date.now()) return send(res, 400, { error: 'expired' });
  if (++e.tries > MAX_TRIES) { codes.delete(email); return send(res, 429, { error: 'too many attempts' }); }
  const a = Buffer.from(hash(code, email)), c = Buffer.from(e.hash);
  if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return send(res, 400, { error: 'wrong' });
  codes.delete(email); send(res, 200, { ok: true });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/api/send-code') return sendCode(req, res);
  if (req.method === 'POST' && url.pathname === '/api/verify-code') return verifyCode(req, res);
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  let f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
  if (!f.startsWith(PUB)) return send(res, 403, { error: 'forbidden' });
  fs.readFile(f, (err, d) => {
    if (err) return send(res, 404, { error: 'not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d);
  });
}).listen(PORT, () => console.log(`Gameverse running: http://localhost:${PORT}`));
