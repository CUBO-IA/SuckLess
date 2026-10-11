// Pruebas base escritas a mano (no dependen de ningún requisito aprobado).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = process.env.SUCKLESS_STORE_DIR;
const load = (f) => import(pathToFileURL(path.join(dir, 'src', f)).href);
const cart = await load('cart.js');
const store = await load('store.js');
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'suckless-')), 'cart.json');

export const checks = [
  {
    id: 'BASE-ADD',
    title: 'El carrito admite productos',
    criterion: 'Agregar dos productos distintos suma 28.50',
    tags: ['add'],
    run() {
      const c = cart.createCart();
      cart.addItem(c, 'SKU-1', 1);
      cart.addItem(c, 'SKU-2', 1);
      assert.equal(c.items.length, 2);
      assert.equal(cart.subtotal(c), 28.5);
    },
  },
  {
    id: 'BASE-PERSIST-ITEMS',
    title: 'Los ítems persisten al recargar',
    criterion: 'Guardar y cargar conserva los ítems',
    tags: ['persist-items'],
    run() {
      const f = tmp();
      const c = cart.createCart();
      cart.addItem(c, 'SKU-1', 2);
      store.saveCart(f, c);
      const back = store.loadCart(f);
      assert.equal(back.items.length, 1);
      assert.equal(back.items[0].qty, 2);
    },
  },
  {
    id: 'BASE-FRESH-LOAD',
    title: 'Un carrito nuevo (sin archivo guardado) acepta productos',
    criterion: 'Primera visita: cargar sin archivo y agregar un producto no falla',
    tags: ['fresh-load'],
    run() {
      const f = tmp();
      const c = store.loadCart(f);
      cart.addItem(c, 'SKU-1', 1);
      assert.equal(c.items.length, 1);
    },
  },
];
