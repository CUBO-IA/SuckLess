// Mini tienda: lógica del carrito.
// ⚠ Este archivo contiene errores sembrados a propósito para la demo de SuckLess.

export const CATALOG = {
  'SKU-1': { name: 'Camiseta', price: 20.0 },
  'SKU-2': { name: 'Taza', price: 8.5 },
  'SKU-3': { name: 'Gorra', price: 15.0 },
};

export const COUPONS = {
  SAVE10: { type: 'percent', value: 10, expires: '2026-12-31' },
  OLD20: { type: 'percent', value: 20, expires: '2025-01-01' },
  FIVEOFF: { type: 'fixed', value: 5, expires: '2026-12-31' },
};

export const TAX_RATE = 0.13; // IVA 13 %

export function createCart() {
  return { items: [], coupons: [] };
}

export function addItem(cart, sku, qty = 1) {
  const product = CATALOG[sku];
  if (!product) {
    throw new Error(`SKU desconocido: ${sku}`);
  }
  const existing = cart.items.find((item) => item.sku === sku);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.items.push({ sku, qty, price: product.price });
  }
  return cart;
}

export function subtotal(cart) {
  return cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

export function applyCoupon(cart, code, today = new Date()) {
  const coupon = COUPONS[code];
  if (!coupon) {
    const err = new Error(`Cupón inválido: ${code}`);
    err.code = 'COUPON_INVALID';
    throw err;
  }
  cart.coupons.push(code);
  return cart;
}

export function discount(cart) {
  return cart.coupons.reduce((sum, code) => {
    const coupon = COUPONS[code];
    if (coupon.type === 'percent') {
      return sum + coupon.value;
    }
    return sum + coupon.value;
  }, 0);
}

export function total(cart) {
  const net = subtotal(cart) - discount(cart);
  return net * (1 + TAX_RATE);
}
