/**
 * SuckLess · ui/dropzone.js — Zona drag & drop ACCESIBLE (§1.4 del plan).
 * Requisitos del plan:
 *  - estados hover/aceptado/rechazado;
 *  - lista con nombre, tamaño y botón quitar;
 *  - validación de tipo y tamaño en cliente (aviso: "el servidor volverá a validar");
 *  - alternativa accesible con <input type="file"> y teclado (Enter/Espacio).
 * Solo textContent/createElement (§1.2).
 */
import { toastError, toastOk } from './toast.js';

const SIZE_LIMIT_MB = 5;
const SIZE_LIMIT = SIZE_LIMIT_MB * 1024 * 1024;
const EXTENSIONS = ['log', 'txt', 'js', 'bx', 'bxm', 'json'];

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Crea la dropzone con estados y devuelve un controlador { files, remove, onFiles } */
export function initDropzone(root, { onChange = () => {} } = {}) {
  if (!(root instanceof HTMLElement)) throw new TypeError('initDropzone requiere un elemento .dropzone');
  const input = root.querySelector('input[type="file"]');
  const list = root.querySelector('.file-list');
  /** @type {File[]} */
  let files = [];

  const ext = (name) => name.split('.').pop()?.toLowerCase() ?? '';
  const validate = (f) => {
    if (f.size > SIZE_LIMIT) return `Supera ${SIZE_LIMIT_MB} MB`;
    if (!EXTENSIONS.includes(ext(f.name))) return 'Tipo no permitido';
    if (files.some((x) => x.name === f.name && x.size === f.size)) return 'Ya está agregado';
    return null;
  };

  function render() {
    if (!list) return;
    const items = files.map((f, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'file-name';
      name.textContent = f.name; // nombre seguro, nunca HTML
      const size = document.createElement('span');
      size.className = 'file-size';
      size.textContent = humanSize(f.size);
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'file-remove';
      rm.setAttribute('aria-label', `Quitar ${f.name}`);
      rm.textContent = '×';
      rm.addEventListener('click', () => {
        files = files.filter((x) => x !== f);
        render();
        onChange(files);
      });
      li.append(name, size, rm);
      return li;
    });
    list.replaceChildren(...items);
    root.classList.toggle('is-accepted', files.length > 0);
    root.classList.remove('is-rejected');
  }

  function addFiles(incoming) {
    let rejected = 0;
    for (const f of incoming) {
      const err = validate(f);
      if (err) {
        rejected++;
        toastError(`«${f.name}»: ${err}`);
        root.classList.add('is-rejected');
        setTimeout(() => root.classList.remove('is-rejected'), 1400);
        continue;
      }
      files.push(f);
    }
    render();
    if (rejected === 0 && incoming.length > 0) toastOk(`Agregad${incoming.length === 1 ? 'o' : 'os'} ${incoming.length} archivo(s).`);
    onChange(files);
  }

  // Teclado: la zona es enfocable y responde Enter / Espacio abriendo el input.
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.shiftKey) {
      e.preventDefault();
      input?.click();
    }
  });

  // Clic abre el input (sin clic en la lista; dejamos propagar solo fuera de botones).
  root.addEventListener('click', (e) => {
    if (e.target.closest('.file-remove')) return;
    input?.click();
  });

  input?.addEventListener('change', () => {
    addFiles([...(input.files ?? [])]);
    input.value = ''; // permite volver a elegir el mismo archivo
  });

  // Drag & drop: estados hover/leave/drop con dragover preventDefault.
  ['dragenter', 'dragover'].forEach((evt) => root.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    root.classList.add('is-dragover');
  }));
  ['dragleave', 'drop'].forEach((evt) => root.addEventListener(evt, (e) => {
    e.preventDefault(); e.stopPropagation();
    root.classList.remove('is-dragover');
  }));
  root.addEventListener('drop', (e) => {
    e.preventDefault();
    const data = e.dataTransfer;
    if (data?.files?.length) addFiles([...data.files]);
  });

  return { addFiles, render, onChange };
}
