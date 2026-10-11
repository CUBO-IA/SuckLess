# Verificación: Cupón -10% · versión buggy

**Resultado:** FAIL (1 PASS · 2 FAIL · 1 ERROR)
**Fecha:** 2026-10-10T14:03:00Z

## Checks

| Check | Estado | Duración |
|---|---|---|
| BASE-FRESH-LOAD | FAIL | 142 ms |
| DISCOUNT-10 | PASS | 52 ms |
| COUPON-EXCLUSIVE | FAIL | 61 ms |
| PRICE-BAD-INPUT | ERROR | 12 ms |

## Traza

```
TypeError: Cannot read properties of undefined (reading 'find')
    at addItem (demo-store/src/cart.js:27)
```

> PASS/FAIL procede del ejecutor de checks, no de una respuesta generada por el modelo.
