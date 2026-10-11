// Persistencia del carrito (versión corregida).
import fs from 'node:fs';
import { createCart } from './cart.js';

export function saveCart(file, cart) {
  fs.writeFileSync(file, JSON.stringify({ items: cart.items, coupons: cart.coupons }));
}

export function loadCart(file) {
  if (!fs.existsSync(file)) {
    return createCart();
  }
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { items: data.items ?? [], coupons: data.coupons ?? [] };
  } catch {
    return createCart();
  }
}
