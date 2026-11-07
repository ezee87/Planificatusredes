# Importación de publicaciones — formato JSON exacto

Este documento describe **el formato que acepta realmente** la modalidad «Importar únicamente publicaciones» de Planifica tus redes. Las reglas coinciden con el validador implementado en `index.html` (función `validatePostsImport`). Si cambia uno, hay que actualizar el otro.

Archivo de ejemplo válido: [`ejemplo-importacion-publicaciones.json`](ejemplo-importacion-publicaciones.json). La prueba `tests/qa-multirred-importacion.mjs` lo importa con el importador real.

---

## 1. Cómo se usa en la aplicación

1. Menú lateral (o menú «Exportar» en el celular) → **Importar respaldo**.
2. Elegir **Importar únicamente publicaciones**.
3. Elegir el **cliente de destino**. Debajo se ven las redes configuradas para ese cliente.
4. Seleccionar el archivo `.json`.
5. Revisar la vista previa: cliente, publicaciones detectadas, válidas, ya importadas y errores.
6. Pulsar **Importar N publicaciones**.

Para generar el archivo desde la aplicación: **Exportar publicaciones** (junto a los respaldos) → elegir cliente → **Exportar publicaciones**. Se reutiliza el diálogo y el selector de clientes existentes porque el importador recibe un solo cliente por vez. El archivo incluye todos los contenidos de ese cliente, también las ideas sin fecha, sin aplicar los filtros de red o estado. El nombre del archivo identifica al cliente de origen; no contiene otros clientes, preferencias ni datos generales del respaldo.

El archivo **no indica el cliente**: las publicaciones se agregan al cliente elegido en el paso 3. Esta modalidad no crea clientes, cuentas ni redes, y no modifica ni borra nada de lo que ya existe.

---

## 2. Estructura completa

```json
{
  "format": "planifica-tus-redes-publicaciones",
  "version": 1,
  "items": [
    {
      "importId": "reels-2026-11-001",
      "title": "Título de la publicación",
      "caption": "Texto completo: guion, instrucciones, notas…",
      "networks": ["instagram", "tiktok"],
      "type": "reel",
      "status": "idea",
      "date": null
    }
  ]
}
```

El archivo debe ser un único objeto JSON estándar: sin comentarios, sin comas finales y codificado en UTF-8.

---

## 3. Propiedades

### 3.1 Nivel principal

| Propiedad | Tipo | Obligatoria | Valor |
|---|---|---|---|
| `format` | string | Sí | Exactamente `"planifica-tus-redes-publicaciones"`. |
| `version` | number | Sí | Exactamente `1` (número, no texto). |
| `items` | array de objetos | Sí | Al menos una publicación. |

No se admite **ninguna otra propiedad** en el nivel principal.

### 3.2 Cada publicación (elemento de `items`)

| Propiedad | Tipo | Obligatoria | Si se omite | Campo en la aplicación |
|---|---|---|---|---|
| `importId` | string | **Sí** | — | Identificador interno de importación (no se muestra). |
| `title` | string | **Sí** | — | «Título o tema». |
| `networks` | array | **Sí** | — | «Redes sociales». |
| `caption` | string | No | `""` | «Texto de la publicación». |
| `type` | string | No | `"post"` | «Tipo de contenido». |
| `status` | string | No | `"idea"` | «Estado». |
| `date` | string o `null` | No | `null` (sin fecha) | «Fecha de publicación». |
| `contentUrl` | string | No | Sin enlace | «Enlace al contenido» (URL absoluta HTTP o HTTPS). |

Si se incluye `contentUrl`, debe contener una URL web válida con `http://` o `https://`; no se aceptan valores vacíos, `null` ni otros protocolos. Para quitarlo, borrá el campo del formulario; la propiedad se omite al guardar y exportar. Los archivos anteriores sin esta propiedad siguen siendo válidos. Los enlaces se conservan también en el respaldo completo, sin cambiar su versión. Las versiones anteriores de la aplicación no reconocen `contentUrl` en la importación parcial: ambos usuarios deben usar esta versión para intercambiar archivos con enlaces.

No se admite **ninguna otra propiedad** dentro de una publicación. En particular, **no** incluyas `id`, `clientId`, `accountId`, `platform`, `createdAt`, `updatedAt` ni campos inventados como `script`, `guion`, `instrucciones` o `descripcion`: el archivo se rechaza. Esta regla evita que un texto escrito en una propiedad desconocida se pierda sin aviso.

---

## 4. Valores permitidos

### 4.1 `status` (estado)

| Valor JSON | Se muestra como |
|---|---|
| `"idea"` | Idea |
| `"preparation"` | En preparación |
| `"ready"` | Listo |
| `"published"` | Publicado |

Los valores son exactos: minúsculas, en inglés, sin acentos. `"Idea"`, `"borrador"` o `"en preparación"` se rechazan.

### 4.2 `type` (tipo de contenido)

| Valor JSON | Se muestra como |
|---|---|
| `"post"` | Post |
| `"reel"` | Reel |
| `"carrusel"` | Carrusel |
| `"historia"` | Historia |
| `"video"` | Video |
| `"otro"` | Otro |

Para guiones de Reels usá `"type": "reel"`.

### 4.3 Redes (`networks`)

Identificadores de plataforma admitidos:

| Valor JSON | Red |
|---|---|
| `"instagram"` | Instagram |
| `"tiktok"` | TikTok |
| `"linkedin"` | LinkedIn |
| `"facebook"` | Facebook |
| `"youtube"` | YouTube |
| `"pinterest"` | Pinterest |
| `"twitter"` | X / Twitter |
| `"otra"` | Otra red |

---

## 5. Fechas

- Formato: `"AAAA-MM-DD"` (año de 4 dígitos, mes y día con 2 dígitos). Ejemplo: `"2026-11-20"`.
- Debe ser una fecha real del calendario: `"2026-02-30"` se rechaza.
- Sin hora ni zona horaria: `"2026-11-20T10:00:00Z"` o `"20/11/2026"` se rechazan.

### Publicaciones sin fecha

Usá `"date": null` u omití la propiedad `date`. Las publicaciones sin fecha van al **Banco de ideas** y conservan su estado. Una cadena vacía `""` **no** es válida.

```json
{ "importId": "reels-2026-11-002", "title": "Idea sin fecha", "networks": ["tiktok"], "date": null }
```

Con fecha (aparece en el Calendario y en Seguimiento):

```json
{ "importId": "reels-2026-11-003", "title": "Publicación con fecha", "networks": ["instagram"], "status": "ready", "date": "2026-11-20" }
```

---

## 6. Una o varias redes sociales

`networks` es una lista con **al menos una** red y **como máximo 20**. Cada red debe estar configurada como cuenta del **cliente de destino** (sección «Clientes y cuentas»).

**Una red:**

```json
"networks": ["instagram"]
```

**Varias redes** (se crea **una sola publicación** asociada a todas; no se duplica):

```json
"networks": ["instagram", "tiktok"]
```

**Cliente con más de una cuenta en la misma plataforma.** Si el cliente tiene, por ejemplo, dos cuentas de Instagram, `"instagram"` es ambiguo y se rechaza. Indicá la cuenta con un objeto que tenga exactamente `platform` y `username`:

```json
"networks": [
  { "platform": "instagram", "username": "@marca_principal" },
  "tiktok"
]
```

El `username` se compara sin distinguir mayúsculas y minúsculas, ignorando espacios en los extremos y la `@` inicial (`"@Marca"` equivale a `"marca"`). Las formas texto y objeto pueden combinarse en la misma lista.

Reglas:

- Si el cliente no tiene configurada una red, la publicación se rechaza con un error que nombra la red (por ejemplo: «el cliente «X» no tiene configurada la red Facebook (facebook)»). **Nunca se asocia con otra red automáticamente.**
- Una misma cuenta no puede repetirse en la lista.
- Si el cliente no tiene ninguna cuenta configurada, no se puede importar en él: primero hay que agregar sus cuentas.

---

## 7. Títulos y textos extensos (guiones)

### `title`

- Obligatorio, de 1 a 120 caracteres (contados después de quitar los espacios de los extremos, que se eliminan al importar).
- Una sola línea: sin saltos de línea (`\n`, `\r`) ni tabulaciones (`\t`).
- Puede incluir acentos, signos de apertura (¿¡), comillas tipográficas y raya (—).

### `caption`

- Texto libre de hasta **20 000 caracteres**, el mismo límite que el formulario. Si se supera, la publicación se rechaza: **nunca se recorta**.
- Se guarda **exactamente** como está en el archivo, incluidos los espacios y saltos de línea.
- Los caracteres se cuentan como en el navegador (unidades UTF-16): letras, acentos, signos y saltos de línea cuentan 1; la mayoría de los emojis cuentan 2.

Escritura dentro de una cadena JSON:

| Querés escribir | En JSON |
|---|---|
| Salto de línea | `\n` |
| Línea en blanco (separar bloques) | `\n\n` |
| Comillas dobles `"` | `\"` |
| Barra invertida `\` | `\\` |
| Tabulación | `\t` |

Las comillas tipográficas « » “ ” y los acentos se escriben tal cual, sin escapes.

**Guion de Reel + instrucciones de grabación.** No existen campos específicos para Reels: ambos textos van juntos en `caption`, separados por títulos en mayúsculas y una línea en blanco. Formato recomendado:

```json
"caption": "GUION DE NARRACIÓN\nPrimera frase del guion.\nSegunda frase del guion.\n\nINSTRUCCIONES DE GRABACIÓN\n- Formato vertical 9:16.\n- Plano medio mirando a cámara."
```

En la aplicación se muestra así, en «Texto de la publicación»:

```
GUION DE NARRACIÓN
Primera frase del guion.
Segunda frase del guion.

INSTRUCCIONES DE GRABACIÓN
- Formato vertical 9:16.
- Plano medio mirando a cámara.
```

---

## 8. Identificadores y duplicados

`importId` identifica de forma estable cada publicación del archivo y protege contra importaciones repetidas.

- Obligatorio. De 1 a 120 caracteres.
- Sólo letras sin acentos (`A-Z`, `a-z`), números, punto (`.`), guion (`-`) y guion bajo (`_`), y debe empezar por letra o número. Expresión regular exacta: `^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$`.
- Distingue mayúsculas de minúsculas: `Reel-1` y `reel-1` son distintos.
- Debe ser **único dentro del archivo**; si se repite, el archivo se rechaza.
- Debe ser **estable**: si se genera otra vez el mismo contenido, usá el mismo `importId`. Nunca uses el mismo `importId` para contenidos distintos.
- Convención recomendada: `<serie>-<año>-<mes>-<número>`, por ejemplo `reels-2026-11-010`.

Comportamiento:

- La exportación conserva el `importId` original. Para contenidos creados en la aplicación, usa su `id` como `importId`, sin modificar el contenido ni el almacenamiento. Si algún dato antiguo no cumple las reglas del importador (por ejemplo, un identificador incompatible), informa el error y no descarga un archivo inválido; el respaldo completo sigue disponible.
- La aplicación guarda el `importId` en cada publicación importada.
- Si en el **cliente de destino** ya existe una publicación con el mismo `importId`, esa publicación del archivo se informa como **«Ya importada»** y se **omite**. La publicación existente no se modifica ni se sobrescribe, aunque se haya editado después.
- Al reimportar en el cliente de origen, también se reconoce el `id` de los contenidos creados en la aplicación que todavía no tienen `importId`.
- Importar dos veces el mismo archivo no crea duplicados. Si todo el archivo ya fue importado, no se agrega nada.
- Los títulos **no** se usan para detectar duplicados: dos publicaciones con el mismo título y distinto `importId` se importan las dos.
- Si se elimina una publicación importada, volver a importar el archivo la crea de nuevo.
- La detección es por cliente: el mismo archivo importado en **otro** cliente crea publicaciones nuevas en ese cliente.
- El identificador interno (`id`) de cada publicación importada lo genera la aplicación; no se incluye como propiedad `id` en el archivo. Los clientes y cuentas de destino conservan sus identificadores locales. La exportación identifica las cuentas vinculadas con objetos `{platform, username}`; una red sin cuenta específica se exporta como texto y el importador la vincula a la cuenta única de esa red en el destino. Si no existe o es ambigua, se debe configurar antes de importar.

---

## 9. Restricciones y validaciones

La importación es **todo o nada**:

- Se valida el archivo completo **antes** de escribir.
- Si **cualquier** publicación tiene un error, **no se importa ninguna** y los datos existentes no cambian. La vista previa lista cada error con el número de publicación, su `importId` y su título.
- Las publicaciones «ya importadas» no son errores: se omiten y se informan.
- Al confirmar, se vuelve a validar contra los datos actuales y se guarda todo en una sola operación.

Validaciones completas:

| Regla | Detalle |
|---|---|
| Archivo | Extensión `.json`, máximo 20 MB, JSON válido. |
| Propiedades prohibidas | `__proto__`, `prototype` y `constructor` no pueden aparecer en ningún nivel. |
| Nivel principal | Sólo `format`, `version` e `items`, con los valores exactos de la sección 3.1. |
| Respaldo completo | Un respaldo exportado por la aplicación se rechaza en esta modalidad (debe usarse «Restauración completa»). |
| `items` | Lista no vacía de objetos. |
| Propiedades de cada publicación | Sólo las 8 de la sección 3.2. |
| `importId` | Ver sección 8. |
| `title` | Texto de 1 a 120 caracteres, una sola línea. |
| `caption` | Texto de hasta 20 000 caracteres (si está presente). |
| `type` / `status` | Uno de los valores de la sección 4 (si está presente). |
| `date` | `null`, ausente o fecha real `AAAA-MM-DD`. |
| `contentUrl` | Ausente o URL web absoluta HTTP/HTTPS no vacía. |
| `networks` | De 1 a 20 redes; cada una existente y no ambigua en el cliente; sin repetir. |
| Capacidad | El total de contenidos guardados en el navegador no puede superar 10 000. |

---

## 10. Ejemplo válido con tres publicaciones

Una para Instagram, una para TikTok y una para Instagram y TikTok. Las tres se agregan al cliente elegido en la importación, que debe tener configuradas una cuenta de Instagram y una de TikTok. Es el mismo contenido de [`ejemplo-importacion-publicaciones.json`](ejemplo-importacion-publicaciones.json).

```json
{
  "format": "planifica-tus-redes-publicaciones",
  "version": 1,
  "items": [
    {
      "importId": "ejemplo-reel-01-instagram",
      "title": "Reel 1 — Tres errores al planificar tu contenido",
      "caption": "GUION DE NARRACIÓN\n¿Te pasa que llegás al lunes sin saber qué publicar?\nHoy te cuento los tres errores más comunes al planificar tu contenido.\nUno: improvisar cada día.\nDos: no guardar las ideas cuando aparecen.\nTres: no revisar qué está listo antes de publicar.\nGuardá este video y empezá a planificar tu semana.\n\nINSTRUCCIONES DE GRABACIÓN\n- Formato vertical 9:16, luz natural de frente.\n- Plano medio mirando a cámara durante la introducción.\n- Mostrar en pantalla «1», «2» y «3» al nombrar cada error.\n- Cierre con el texto «Guardalo para tu próxima planificación».",
      "networks": ["instagram"],
      "type": "reel",
      "status": "idea",
      "date": null
    },
    {
      "importId": "ejemplo-reel-02-tiktok",
      "title": "Reel 2 — Cómo guardar una idea en diez segundos",
      "caption": "GUION DE NARRACIÓN\nSe te ocurrió una idea y no querés perderla.\nAbrí tu banco de ideas, escribí el tema y guardalo sin fecha.\nDespués elegís cuándo publicarlo.\n\nINSTRUCCIONES DE GRABACIÓN\n- Grabación de pantalla del celular.\n- Ritmo rápido: cortes cada dos o tres segundos.\n- Subtítulos grandes durante todo el video.",
      "networks": ["tiktok"],
      "type": "reel",
      "status": "idea",
      "date": null
    },
    {
      "importId": "ejemplo-reel-03-instagram-tiktok",
      "title": "Reel 3 — ¿Qué tengo que publicar hoy?",
      "caption": "GUION DE NARRACIÓN\n«¿Qué tengo que publicar hoy?» es la pregunta que más tiempo nos hace perder.\nLa respuesta está en planificar una vez por semana.\nElegí tus temas, asignales fecha y revisá cada mañana qué está listo.\n\nINSTRUCCIONES DE GRABACIÓN\n- Abrir con la pregunta escrita en pantalla.\n- Plano detalle del calendario semanal.\n- Mismo video para Instagram y TikTok: dejar margen inferior libre para los textos de cada red.",
      "networks": ["instagram", "tiktok"],
      "type": "reel",
      "status": "idea",
      "date": null
    }
  ]
}
```

---

## 11. JSON Schema (validación estructural)

Útil para herramientas que generan JSON a partir de un esquema. Cubre la estructura, los tipos y los valores permitidos. **No puede expresar** cuatro reglas que la aplicación sí comprueba: que las redes existan en el cliente de destino, que `importId` no se repita dentro del archivo, que la fecha sea real (por ejemplo, rechazar `2026-02-30`) y que `title` no supere 120 caracteres después de quitar los espacios de los extremos. Además, JSON Schema cuenta la longitud de `caption` por caracteres y la aplicación por unidades UTF-16 (los emojis cuentan 2), así que un texto lleno de emojis cerca del límite puede pasar el esquema y ser rechazado por la aplicación.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Planifica tus redes — importación de publicaciones v1",
  "type": "object",
  "additionalProperties": false,
  "required": ["format", "version", "items"],
  "properties": {
    "format": { "const": "planifica-tus-redes-publicaciones" },
    "version": { "const": 1 },
    "items": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["importId", "title", "networks"],
        "properties": {
          "importId": { "type": "string", "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$" },
          "title": { "type": "string", "minLength": 1, "maxLength": 120, "pattern": "^[^\\r\\n\\t]*\\S[^\\r\\n\\t]*$" },
          "caption": { "type": "string", "maxLength": 20000 },
          "contentUrl": { "type": "string", "format": "uri", "pattern": "^[Hh][Tt][Tt][Pp][Ss]?://", "minLength": 1 },
          "networks": {
            "type": "array",
            "minItems": 1,
            "maxItems": 20,
            "items": {
              "oneOf": [
                { "$ref": "#/$defs/platform" },
                {
                  "type": "object",
                  "additionalProperties": false,
                  "required": ["platform", "username"],
                  "properties": {
                    "platform": { "$ref": "#/$defs/platform" },
                    "username": { "type": "string", "pattern": "\\S" }
                  }
                }
              ]
            }
          },
          "type": { "enum": ["post", "reel", "carrusel", "historia", "video", "otro"] },
          "status": { "enum": ["idea", "preparation", "ready", "published"] },
          "date": {
            "oneOf": [
              { "type": "null" },
              { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" }
            ]
          }
        }
      }
    }
  },
  "$defs": {
    "platform": { "enum": ["instagram", "tiktok", "linkedin", "facebook", "youtube", "pinterest", "twitter", "otra"] }
  }
}
```

---

## 12. Instrucciones breves para una IA que genere el archivo

Copiá este bloque al pedir a otra IA que genere un archivo de importación:

> Generá un único objeto JSON válido (sin comentarios ni texto fuera del JSON) con esta forma exacta: `{"format": "planifica-tus-redes-publicaciones", "version": 1, "items": [...]}`.
> Cada elemento de `items` tiene sólo estas propiedades: `importId` (obligatorio; único, estable; sólo `A-Z a-z 0-9 . - _`, empieza por letra o número, máximo 120; por ejemplo `reels-2026-11-001`), `title` (obligatorio; una línea, máximo 120 caracteres), `caption` (texto completo de hasta 20 000 caracteres; usá `\n` para saltos de línea; guion e instrucciones juntos: `"GUION DE NARRACIÓN\n…\n\nINSTRUCCIONES DE GRABACIÓN\n…"`), `networks` (obligatorio; lista con una o más redes de `instagram`, `tiktok`, `linkedin`, `facebook`, `youtube`, `pinterest`, `twitter`, `otra`; sólo las que tenga configuradas el cliente), `type` (`"reel"` para Reels), `status` (`"idea"`), `date` (`null` si no tiene fecha; si tiene, `"AAAA-MM-DD"`) y, opcionalmente, `contentUrl` (URL web HTTP/HTTPS no vacía; omitilo si no hay enlace).
> No agregues otras propiedades (ni `id`, ni `clientId`, ni `script`, etc.). No recortes ni resumas los guiones.
