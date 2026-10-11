// Persistencia del carrito en un archivo JSON.
import fs from 'node:fs';

export function saveCart(file, cart) {
  fs.writeFileSync(file, JSON.stringify({ items: cart.items }));
}

export function loadCart(file) {
  if (!fs.existsSync(file)) {
    return {};
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { items: data.items, coupons: [] };
}
