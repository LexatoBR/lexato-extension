# Política de Privacidad - Extensión Chrome Lexato

**Fecha de vigencia:** 10 de febrero de 2026
**Última actualización:** 10 de febrero de 2026
**Versión:** 1.0.0

---

## 1. Introducción

Esta Política de Privacidad describe cómo la extensión Chrome **Lexato - Registro de Pruebas Digitales** ("Extensión") recopila, utiliza, almacena y protege los datos de sus usuarios.

**Responsable del tratamiento de datos:**
Lexato Tecnologia Ltda.
Correo electrónico: privacidade@lexato.com.br
Sitio web: https://lexato.com.br

La Extensión es una herramienta de captura y certificación de pruebas digitales con validez jurídica, desarrollada en conformidad con la **Ley General de Protección de Datos de Brasil (LGPD - Ley 13.709/2018)**, el **Reglamento General de Protección de Datos de la UE (RGPD/GDPR)** y la norma **ISO/IEC 27037** para identificación, recopilación, adquisición y preservación de evidencias digitales.

El uso de la Extensión implica el conocimiento y la aceptación de esta Política de Privacidad. Recomendamos la lectura integral de este documento antes de utilizar nuestros servicios.

---

## 2. Datos Recopilados

### 2.1 Datos recopilados activamente durante capturas

La Extensión recopila los siguientes datos **exclusivamente cuando el usuario inicia explícitamente una captura de prueba digital**:

- **Capturas de pantalla**: Imágenes de la pantalla capturadas por el usuario
- **Videos**: Grabaciones de navegación realizadas por el usuario
- **Metadatos forenses**:
  - URL de la página capturada
  - Título de la página
  - Marca temporal (fecha y hora exactas de la captura, con zona horaria)
  - Dirección IP del usuario
  - Geolocalización (cuando es autorizada por el usuario)
  - DNS inverso del servidor de la página capturada
  - Información WHOIS del dominio capturado
  - Registro del Wayback Machine (Internet Archive) de la página
- **URLs visitadas durante captura de video**: Registro de navegación forense registrado únicamente durante grabaciones de video activas

### 2.2 Datos de autenticación

- **Tokens OAuth2**: Tokens de autenticación obtenidos a través de Supabase (auth.lexato.com.br) para identificación del usuario y acceso a los servicios de la plataforma

### 2.3 Datos opcionales (recopilados solo con permiso explícito)

- **Lista de extensiones instaladas**: Recopilada únicamente cuando el usuario concede el permiso `management`, utilizada para aislamiento de extensiones durante capturas (garantía de integridad forense)
- **Geolocalización**: Recopilada únicamente cuando el usuario concede el permiso `geolocation`, utilizada como metadato forense complementario

### 2.4 Datos NO recopilados

La Extensión **NO** recopila, bajo ninguna circunstancia:

- Historial de navegación fuera de capturas activas
- Cookies o datos de sesión de sitios web visitados
- Datos de formularios completados por el usuario
- Contraseñas o credenciales de acceso a otros servicios
- Datos financieros (números de tarjeta de crédito, datos bancarios)

---

## 3. Finalidad del Tratamiento

| Dato | Finalidad | Base Legal (LGPD / RGPD) |
|------|-----------|--------------------------|
| Capturas de pantalla y videos | Constitución de prueba digital con validez jurídica | Ejecución de contrato (LGPD Art. 7, V / RGPD Art. 6(1)(b)) |
| Metadatos forenses (URL, título, marca temporal) | Garantía de la cadena de custodia y autenticidad de la prueba | Ejecución de contrato (LGPD Art. 7, V / RGPD Art. 6(1)(b)) |
| Dirección IP | Identificación del origen de la captura con fines forenses | Interés legítimo (LGPD Art. 7, IX / RGPD Art. 6(1)(f)) |
| Geolocalización | Metadato forense complementario para localización de la captura | Consentimiento (LGPD Art. 7, I / RGPD Art. 6(1)(a)) |
| DNS inverso y WHOIS | Verificación de la identidad del servidor y dominio capturado | Ejecución de contrato (LGPD Art. 7, V / RGPD Art. 6(1)(b)) |
| Wayback Machine | Registro histórico de la página para comparación temporal | Ejecución de contrato (LGPD Art. 7, V / RGPD Art. 6(1)(b)) |
| URLs durante captura de video | Registro de navegación forense para integridad de la grabación | Ejecución de contrato (LGPD Art. 7, V / RGPD Art. 6(1)(b)) |
| Tokens OAuth2 | Autenticación e identificación del usuario en la plataforma | Ejecución de contrato (LGPD Art. 7, V / RGPD Art. 6(1)(b)) |
| Lista de extensiones instaladas | Aislamiento de extensiones durante captura (integridad forense) | Consentimiento (LGPD Art. 7, I / RGPD Art. 6(1)(a)) |

---

## 4. Cómo se Procesan los Datos

Los datos capturados por la Extensión pasan por el siguiente flujo de procesamiento para garantizar integridad y validez jurídica:

1. **Hashing SHA-256**: Cada evidencia capturada recibe un hash criptográfico SHA-256 que garantiza la integridad del contenido. Cualquier modificación en el archivo invalida el hash.

2. **Organización en Merkle Tree**: Los hashes individuales se organizan en una estructura de Merkle Tree, permitiendo la verificación eficiente de la integridad de conjuntos de evidencias.

3. **Certificación en Blockchain**: El hash raíz del Merkle Tree se registra en redes blockchain públicas (Polygon, Arbitrum u Optimism), creando un registro inmutable y verificable de la existencia de la prueba en un momento determinado.

4. **Almacenamiento**:
   - **Base de datos**: Supabase (PostgreSQL) alojado en infraestructura gestionada, accedido a través del dominio personalizado auth.lexato.com.br
   - **Archivos**: AWS S3 en la región sa-east-1 (São Paulo, Brasil), garantizando que los datos permanezcan en territorio brasileño

---

## 5. Compartición con Terceros

La Extensión comparte datos con los siguientes terceros, exclusivamente para las finalidades descritas:

| Tercero | Finalidad | Datos Compartidos | Ubicación |
|---------|-----------|-------------------|-----------|
| **Supabase** | Autenticación y base de datos | Tokens OAuth2, metadatos de evidencias | A través del dominio personalizado *.lexato.com.br |
| **AWS S3** | Almacenamiento de archivos de evidencias | Capturas de pantalla, videos, certificados | sa-east-1 (São Paulo, Brasil) |
| **Sentry** | Monitoreo de errores y estabilidad | Datos técnicos de errores (sin datos personales de capturas) | EE.UU. |
| **ipinfo.io** | Identificación de la dirección IP pública del usuario | Dirección IP (para metadatos forenses de la captura) | EE.UU. |
| **Redes Blockchain** (Polygon, Arbitrum, Optimism) | Certificación inmutable de evidencias | Solo hashes criptográficos (sin datos personales identificables) | Descentralizado |

**Importante**: Los hashes registrados en blockchain son públicos e inmutables, pero no contienen datos personales identificables - son únicamente resúmenes criptográficos que permiten verificar la integridad de las evidencias.

---

## 6. Permisos de la Extensión

### 6.1 Permisos obligatorios

| Permiso | Justificación Técnica | Cuándo se Utiliza |
|---------|----------------------|-------------------|
| `host_permissions` (https://*/* y http://*/*) | Acceso a cualquier página web para captura de pantalla e inyección de scripts de bloqueo | Solo cuando el usuario inicia explícitamente una captura |
| `storage` | Almacenamiento local de tokens de autenticación y configuraciones del usuario | Continuamente, para mantener la sesión |
| `tabs` | Obtención de URL y título de la pestaña para metadatos forenses | Durante el proceso de captura |
| `scripting` | Inyección dinámica de scripts para bloqueo de DevTools durante captura (preservación de integridad forense) | Durante el proceso de captura |
| `alarms` | Programación de actualización automática de tokens de autenticación y consulta de estado | Continuamente, en segundo plano |
| `webNavigation` | Monitoreo de navegaciones durante captura de video para registro forense | Solo durante grabación de video |
| `offscreen` | Creación de documento offscreen para acceso a APIs que requieren DOM (ej: geolocalización) en Manifest V3 | Cuando se necesitan APIs DOM |
| `sidePanel` | Visualización de controles de grabación de video fuera del área capturada, permitiendo navegación sin interferir con el video | Durante grabación de video |
| `identity` | Autenticación OAuth2 del usuario con el proveedor de identidad | Durante inicio de sesión y actualización de sesión |

### 6.2 Permisos opcionales (solicitados bajo demanda)

| Permiso | Justificación Técnica | Cuándo se Solicita |
|---------|----------------------|-------------------|
| `management` | Gestión de extensiones para aislamiento durante captura (desactiva temporalmente otras extensiones para garantizar integridad forense) | Cuando el usuario activa el modo de aislamiento |
| `geolocation` | Recopilación de coordenadas geográficas como metadato forense complementario | Cuando el usuario opta por incluir geolocalización en la captura |
| `notifications` | Notificaciones de estado de captura y certificación blockchain | Cuando el usuario activa las notificaciones |
| `tabCapture` | Captura de flujo de video de la pestaña activa para grabación | Cuando el usuario inicia una grabación de video |

---

## 7. Conformidad Legal

### 7.1 ISO/IEC 27037

La Extensión fue desarrollada en conformidad con la norma ISO/IEC 27037, que establece directrices para identificación, recopilación, adquisición y preservación de evidencias digitales. Los procesos de captura, hashing, certificación y almacenamiento siguen las mejores prácticas internacionales para garantizar la admisibilidad de las pruebas en procedimientos judiciales.

### 7.2 LGPD (Ley 13.709/2018)

El tratamiento de datos personales por la Extensión está amparado en las siguientes bases legales de la LGPD:

- **Ejecución de contrato** (Art. 7, V): Para los datos necesarios para la prestación del servicio de captura y certificación de pruebas digitales
- **Consentimiento** (Art. 7, I): Para datos opcionales como geolocalización y lista de extensiones instaladas
- **Interés legítimo** (Art. 7, IX): Para la recopilación de dirección IP como metadato forense

### 7.3 RGPD (Reglamento (UE) 2016/679)

Para usuarios en el Espacio Económico Europeo, el tratamiento de datos personales está adicionalmente amparado en las siguientes bases legales del RGPD:

- **Ejecución de contrato** (Art. 6(1)(b)): Para los datos necesarios para la prestación del servicio contratado
- **Consentimiento** (Art. 6(1)(a)): Para el tratamiento de datos opcionales
- **Interés legítimo** (Art. 6(1)(f)): Para la recopilación de dirección IP como metadato forense

### 7.4 Derechos del Titular de los Datos

Conforme al Artículo 18 de la LGPD y los Artículos 15-22 del RGPD, los titulares de datos tienen derecho a:

- Confirmación de la existencia de tratamiento
- Acceso a los datos personales
- Corrección de datos incompletos, inexactos o desactualizados
- Anonimización, bloqueo o eliminación de datos innecesarios o excesivos
- Portabilidad de los datos
- Eliminación de los datos personales tratados con consentimiento
- Información sobre la compartición de datos con terceros
- Información sobre la posibilidad de no otorgar consentimiento y sus consecuencias
- Revocación del consentimiento

Para ejercer cualquiera de estos derechos, contacte con nosotros en: **privacidade@lexato.com.br**

El plazo de respuesta es de hasta **15 días hábiles**, conforme lo establecido por la LGPD.

---

## 8. Retención y Eliminación de Datos

### 8.1 Período de retención

- **Evidencias digitales** (capturas de pantalla, videos, metadatos): Almacenadas durante el período contratado por el usuario, según el plan de servicio
- **Tokens de autenticación**: Almacenados localmente en el navegador mientras la sesión esté activa
- **Configuraciones del usuario**: Almacenadas localmente hasta la desinstalación de la Extensión o limpieza manual

### 8.2 Eliminación de datos

El usuario puede solicitar la eliminación de sus datos personales en cualquier momento enviando un correo electrónico a privacidade@lexato.com.br.

**Excepción**: Los hashes registrados en blockchain son inmutables por naturaleza y no pueden ser eliminados. Sin embargo, estos hashes no contienen datos personales identificables.

### 8.3 Desinstalación

Al desinstalar la Extensión, todos los datos almacenados localmente (tokens, configuraciones) son eliminados automáticamente por el navegador. Los datos almacenados en los servidores de Lexato permanecen disponibles según el período de retención contratado.

---

## 9. Consentimiento

La Extensión obtiene consentimiento explícito del usuario antes de cada captura de prueba digital. El usuario debe iniciar activamente el proceso de captura (captura de pantalla o video) para que se produzca cualquier recopilación de datos.

Los permisos opcionales (geolocalización, gestión de extensiones, notificaciones, captura de video) se solicitan individualmente en el momento en que la funcionalidad correspondiente es necesaria, y el usuario puede rechazarlos sin perjuicio de las demás funcionalidades.

---

## 10. Seguridad

La Extensión adopta las siguientes medidas de seguridad:

- **Datos almacenados en Brasil**: Archivos de evidencias en AWS S3 región sa-east-1 (São Paulo)
- **Cifrado en tránsito**: Todas las comunicaciones utilizan HTTPS/TLS y WSS (WebSocket Secure)
- **Hashing criptográfico**: SHA-256 para garantía de integridad de las evidencias
- **Certificación en blockchain**: Registro inmutable y verificable en redes públicas
- **Dominio personalizado**: Autenticación a través de auth.lexato.com.br (sin exposición de dominios de terceros)
- **Content Security Policy restrictiva**: La Extensión implementa CSP estricta limitando orígenes de scripts y conexiones

---

## 11. Cambios en esta Política

Esta Política de Privacidad puede ser actualizada periódicamente para reflejar cambios en nuestros servicios o en la legislación aplicable.

En caso de cambios significativos, los usuarios serán notificados con una antelación mínima de **30 días** antes de la entrada en vigor de los cambios.

La versión más reciente estará siempre disponible en: https://lexato.com.br/politica-de-privacidad

---

## 12. Contacto

Para dudas, solicitudes o reclamaciones relacionadas con esta Política de Privacidad o el tratamiento de datos personales:

**Delegado de Protección de Datos (DPO):**
Correo electrónico: privacidade@lexato.com.br
Sitio web: https://lexato.com.br
