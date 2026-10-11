// Servidor mínimo de la mini tienda (demo local, sin dependencias).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addItem, applyCoupon, discount, subtotal, total } from './cart.js';
import { loadCart, saveCart } from './store.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CART_FILE = path.join(os.tmpdir(), 'suckless-demo-cart.json');

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(JSON.parse(body || '{}')));
  });
}

function view(cart) {
  return { ...cart, subtotal: subtotal(cart), discount: discount(cart), total: total(cart) };
}

const server = http.createServer(async (req, res) => {
  const json = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(here, '..', 'public', 'index.html')));
  }
  const cart = loadCart(CART_FILE);
  if (req.method === 'GET' && req.url === '/api/cart') return json(200, view(cart));
  if (req.method === 'POST' && req.url === '/api/cart/items') {
    const { sku, qty } = await readBody(req);
    addItem(cart, sku, qty);
    saveCart(CART_FILE, cart);
    return json(200, view(cart));
  }
  if (req.method === 'POST' && req.url === '/api/cart/coupon') {
    const { code } = await readBody(req);
    applyCoupon(cart, code);
    saveCart(CART_FILE, cart);
    return json(200, view(cart));
  }
  return json(404, { error: 'No encontrado' });
});

const port = Number(process.env.PORT || 3100);
server.listen(port, '127.0.0.1', () => console.log(`Mini tienda en http://127.0.0.1:${port}`));
