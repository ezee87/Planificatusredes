# Publicación segura — actualizado tras la auditoría

Preparar localmente con `node tools/prepare-dist.mjs` después de cualquier edición. Copia los recursos y recalcula los hashes CSP; no publica.

Mis bonos: si cambian los textos de `Bonos/*.md`, ejecutar antes `node tools/build-bonos.mjs` (regenera `bonos-data.js` y falla si alguna línea no queda incorporada). `dist` incluye además `bonos-data.js`, `bonos.js` y `bonos.css`. Validar con `node tests/qa-bonos.mjs`.

**La lista siguiente reemplaza las instrucciones antiguas de este archivo:** publicar exclusivamente `dist`, con `index.html`, `commercial.js`, `commercial.css`, `favicon.svg`, `legal/index.html`, `_headers` y `_redirects`. No publicar la raíz, documentos, capturas ni pruebas. Los ZIP anteriores no deben usarse para esta revisión.

Validar con `node tests/qa-commercial.mjs`, `node tests/qa-file-local.mjs` y `node tests/qa-audit.mjs`. Requieren Node 24 y Chrome en la ruta Windows indicada en las pruebas; usan perfiles temporales y no envían formularios reales.

La CSP ahora usa los hashes de los dos scripts inline propios y el hash exacto del script del badge que Netlify inyecta después del build: `sha256-BkKP2XO6WOEc3kXOiLr2ZoY83hamalKjPY9xBcbXVuw=`. `script-src` no usa `unsafe-inline`; sólo los estilos mantienen esa directiva. No transformar/minificar scripts después de generar los hashes. Verificar las cabeceras efectivas después del despliegue manual.

La caché permite revalidación (`max-age=0, must-revalidate`), evitando versiones antiguas de archivos sin versionado. Respuestas 304 pueden ahorrar transferencia, pero siguen siendo solicitudes. Consultar `AUDITORIA-TECNICA.md` y `CONFIGURACION-NETLIFY.md`.

