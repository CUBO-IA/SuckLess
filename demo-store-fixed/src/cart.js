// Mini tienda: versión corregida (referencia para comprobar "antes / después").

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

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function coded(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function createCart() {
  return { items: [], coupons: [] };
}

export function addItem(cart, sku, qty = 1) {
  const product = CATALOG[sku];
  if (!product) {
    throw coded('SKU_UNKNOWN', `SKU desconocido: ${sku}`);
  }
  if (!Number.isInteger(qty) || qty < 1) {
    throw coded('QTY_INVALID', `Cantidad inválida: ${qty}`);
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
  return round2(cart.items.reduce((sum, item) => sum + item.price * item.qty, 0));
}

export function applyCoupon(cart, code, today = new Date()) {
  const coupon = COUPONS[code];
  if (!coupon) {
    throw coded('COUPON_INVALID', `Cupón inválido: ${code}`);
  }
  if (new Date(today) > new Date(`${coupon.expires}T23:59:59`)) {
    throw coded('COUPON_EXPIRED', `Cupón vencido: ${code}`);
  }
  if (cart.coupons.length > 0) {
    throw coded('COUPON_NOT_COMBINABLE', 'Solo se permite un cupón por carrito');
  }
  cart.coupons.push(code);
  return cart;
}

export function discount(cart) {
  const base = subtotal(cart);
  return round2(
    cart.coupons.reduce((sum, code) => {
      const coupon = COUPONS[code];
      return sum + (coupon.type === 'percent' ? (base * coupon.value) / 100 : coupon.value);
    }, 0),
  );
}

export function total(cart) {
  const net = Math.max(subtotal(cart) - discount(cart), 0);
  return round2(net * (1 + TAX_RATE));
}
