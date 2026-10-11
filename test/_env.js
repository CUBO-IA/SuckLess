import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Datos de prueba aislados: se importa ANTES que los módulos del motor.
process.env.SUCKLESS_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'suckless-test-'));
