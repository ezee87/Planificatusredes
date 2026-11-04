# Configuración pendiente en Netlify

## Verificación de esta entrega, después de publicar manualmente

El propietario confirmó que Form detection ya está habilitado: no volver a activarlo. Esta intervención no cambió el hosting ni envió mensajes reales.

1. Publicar únicamente el contenido actualizado de dist, después de revisarlo. No usar el ZIP antiguo. Los hashes CSP ya se regeneraron mediante node tools/prepare-dist.mjs.
2. Al terminar el despliegue, abrir Forms del proyecto. Comprobar los nombres planifica-soporte, planifica-reclamos y planifica-arrepentimiento, sus campos y el honeypot bot-field. Si no aparecen, revisar que se publicó dist/index.html, con sus tres declaraciones `method="POST" netlify netlify-honeypot="bot-field"`, y el registro de procesamiento del despliegue.
3. En Forms > Submission notifications > Add notification (o Project configuration > Notifications > Form submission notifications, según el panel), crear una notificación de email para cada formulario hacia soporte.planificatusredes@gmail.com.
4. Desde la URL HTTPS publicada: Ayuda y soporte > Solicitar ayuda. Enviar una consulta identificada como prueba, con un correo propio y sin datos sensibles.
5. Desde Ayuda y soporte > Realizar solicitud: enviar una prueba de reclamos claramente identificada. Coordinar que no se interprete operativamente como devolución real.
6. Desde /arrepentimiento: realizar una prueba claramente identificada, usando correo propio. Coordinar su identificación para no tramitarla como solicitud comercial real.
7. Para cada prueba, abrir el formulario correspondiente en Forms y verificar el registro en Verified submissions, campos y fecha. Si falta, revisar Spam submissions y la solicitud POST/respuesta en DevTools > Network. Una pantalla de éxito no demuestra por sí sola recepción.
8. Confirmar la llegada de las tres notificaciones a la casilla de soporte, incluyendo spam. La aceptación HTTP no demuestra entrega del email.
9. En DevTools > Network, recargar aplicación y ruta legal: comprobar CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy y Cache-Control. script-src debe usar self y hashes sha256, sin unsafe-inline. Incluye el hash exacto del script del badge inyectado por Netlify. Revisar consola sin errores CSP y probar el footer/licencia. No transformar scripts inline después de calcular hashes.

Referencias: [declaración y AJAX](https://docs.netlify.com/manage/forms/setup/), [honeypot](https://docs.netlify.com/manage/forms/spam-filters/), [notificaciones](https://docs.netlify.com/manage/forms/notifications/).

Las pruebas de esta entrega son locales: no certifican recepción en producción. No se requiere MailerLite, CAPTCHA ni servicios adicionales.

La aplicación contiene formularios HTML estáticos para que Netlify detecte estos nombres durante el despliegue:

- `planifica-soporte`
- `planifica-reclamos`
- `planifica-arrepentimiento`

## Activar la recepción y las notificaciones

1. Publicar la carpeta `dist` en el sitio de Netlify.
2. En el panel del sitio, abrir **Forms** y comprobar que aparecen los tres formularios.
3. Realizar un envío de prueba real de cada formulario desde la URL publicada y comprobar que figura en **Forms > Form submissions**.
4. Abrir **Project configuration > Notifications > Emails and webhooks** (en algunas interfaces aparece como **Forms > Form notifications**).
5. Crear una notificación de tipo **Email notification** para cada formulario y usar `soporte.planificatusredes@gmail.com` como destinatario.
6. Repetir un envío real y comprobar tanto el registro en Netlify como la recepción del correo.

Hasta completar esas pruebas no debe considerarse verificada la entrega de notificaciones por correo.

## Acuse e identificador de arrepentimiento

Netlify Forms registra cada envío en el panel, pero esta implementación no envía automáticamente al comprador un identificador trazable ni un acuse por correo. Para completar ese circuito se debe configurar y probar una automatización que, ante cada envío de `planifica-arrepentimiento`:

1. Obtenga el identificador real del envío registrado por Netlify.
2. Envíe un acuse al correo informado, incluyendo ese identificador y la fecha de recepción.
3. Registre el resultado del envío del acuse para auditoría.
4. Permita gestionar manualmente la devolución desde la operación original en Mercado Pago o PayPal.

Puede implementarse posteriormente con una automatización externa o una función serverless, después de definir y validar el plazo legal aplicable. La pantalla actual confirma únicamente que Netlify aceptó la solicitud; no afirma que el reembolso haya sido aprobado o procesado.

## Validaciones previas al lanzamiento

- Revisar y confirmar la identificación fiscal y el domicilio publicados en los documentos legales.
- Obtener revisión legal de los textos y del circuito de arrepentimiento.
- Probar las rutas públicas desde enlaces externos de systeme.io.
- Confirmar la recepción real de los tres formularios y las notificaciones configuradas.
- Verificar el acuse con identificador trazable antes de afirmar cumplimiento integral del mecanismo de arrepentimiento.
