# Cinema Reservations API

API REST para gestionar la cartelera y las reservaciones de un cine: películas, salas con asientos REGULAR y VIP, funciones sin solapamientos y reservaciones con expiración, cancelación e historial completo de estados. Está desarrollada con Node.js, TypeScript, Express 5, Prisma y PostgreSQL.

- **Documentación interactiva:** Swagger UI en `http://localhost:3000/api-docs/` (13 rutas, 16 operaciones y 26 esquemas reutilizables, con ejemplos).
- **Pruebas automatizadas:** 306 pruebas (136 unitarias, 155 de integración y 15 de concurrencia) contra una base de datos PostgreSQL real.

## Contenido

- [Requisitos](#requisitos)
- [Inicio rápido desde un clon limpio](#inicio-rápido-desde-un-clon-limpio)
- [Variables de entorno](#variables-de-entorno)
- [Scripts npm](#scripts-npm)
- [Documentación de la API](#documentación-de-la-api)
- [Pruebas automatizadas](#pruebas-automatizadas)
- [Arquitectura](#arquitectura)
- [Stack tecnológico y justificación](#stack-tecnológico-y-justificación)
- [Diseño de la base de datos](#diseño-de-la-base-de-datos)
- [Reglas de negocio](#reglas-de-negocio)
- [Transacciones y concurrencia](#transacciones-y-concurrencia)
- [Expiración de reservaciones](#expiración-de-reservaciones)
- [Seguridad](#seguridad)
- [Manejo de errores](#manejo-de-errores)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Uso de inteligencia artificial](#uso-de-inteligencia-artificial)
- [Verificación desde un clon limpio](#verificación-desde-un-clon-limpio)

## Requisitos

| Herramienta | Versión | Uso |
|---|---|---|
| Node.js | 22.12 o superior (declarado en `engines`) | Ejecutar la API y las pruebas. Vitest 5 y Vite 8 no admiten versiones anteriores. |
| npm | 10 o superior | Instalar dependencias con `npm ci`. |
| Docker con Docker Compose | Reciente | Levantar PostgreSQL 16. |

Los puertos **5433** (PostgreSQL en el host) y **3000** (API) deben estar libres.

## Inicio rápido desde un clon limpio

1. **Clonar el repositorio**

   ```bash
   git clone https://github.com/mariela1217/cinema-reservations-api.git
   cd cinema-reservations-api
   ```

2. **Configurar las variables de entorno**

   ```bash
   cp .env.example .env
   ```

   Edita `.env` y reemplaza `replace_with_password` por una contraseña propia en **dos** lugares: `POSTGRES_PASSWORD` y dentro de `DATABASE_URL`. Ambos valores deben coincidir.

3. **Levantar PostgreSQL**

   ```bash
   docker compose up -d
   docker compose ps   # esperar a que el servicio postgres aparezca como "healthy"
   ```

   Docker Compose crea el usuario y la base `cinema_db` con los valores de `.env`, y publica PostgreSQL en el puerto 5433 del host.

4. **Instalar dependencias**

   ```bash
   npm ci
   ```

   El script `postinstall` ejecuta `prisma generate` y genera Prisma Client. No necesita la base de datos ni el archivo `.env`.

5. **Aplicar las migraciones**

   ```bash
   npm run db:migrate
   ```

   Ejecuta `prisma migrate deploy` sobre `DATABASE_URL`. Crea las siete tablas, sus restricciones e índices, la extensión `btree_gist` y la restricción de exclusión contra solapamientos.

6. **Iniciar la API**

   ```bash
   npm run dev          # desarrollo, con recarga automática (tsx watch)
   # o bien
   npm run build && npm start   # compila a dist/ y ejecuta con Node
   ```

   La consola muestra `Server running at http://localhost:3000`.

7. **Abrir la documentación**

   - Swagger UI: <http://localhost:3000/api-docs/>
   - Documento OpenAPI en JSON: <http://localhost:3000/api-docs.json>
   - Estado del servicio: <http://localhost:3000/health>

## Variables de entorno

Ningún archivo con credenciales reales se versiona: `.gitignore` excluye `.env` y `.env.*`, salvo los archivos de ejemplo.

**`.env`** (a partir de `.env.example`), usado por la API, Prisma y Docker Compose:

| Variable | Ejemplo | Descripción |
|---|---|---|
| `POSTGRES_USER` | `cinema_user` | Usuario que crea el contenedor de PostgreSQL. |
| `POSTGRES_PASSWORD` | `replace_with_password` | Contraseña de ese usuario. |
| `POSTGRES_DB` | `cinema_db` | Base de datos de desarrollo. |
| `DATABASE_URL` | `postgresql://cinema_user:replace_with_password@localhost:5433/cinema_db?schema=public` | Conexión que usan la API y las migraciones. |

**`.env.test`** (a partir de `.env.test.example`), usado solo por las pruebas:

| Variable | Ejemplo | Descripción |
|---|---|---|
| `TEST_DATABASE_URL` | `postgresql://cinema_user:replace_with_password@localhost:5433/cinema_test?schema=public` | Base exclusiva para pruebas. El nombre **debe** ser `cinema_test`; cualquier otro se rechaza. |

## Scripts npm

| Script | Qué hace |
|---|---|
| `npm run dev` | Inicia la API con recarga automática (`tsx watch src/server.ts`). |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm start` | Ejecuta la versión compilada (`node dist/server.js`). |
| `npm run db:migrate` | Aplica las migraciones pendientes (`prisma migrate deploy`). |
| `npm run prisma:generate` | Regenera Prisma Client (también se ejecuta en `postinstall`). |
| `npm run typecheck` | Verifica los tipos de `src/` y `tests/` sin compilar. |
| `npm run test:db:prepare` | Crea, migra y vacía `cinema_test`. Con `-- --check` solo verifica el destino y no escribe. |
| `npm test` | Ejecuta las 306 pruebas: unitarias, de integración y de concurrencia, en ese orden. |
| `npm run test:unit` | Solo las pruebas unitarias. No necesitan base de datos. |
| `npm run test:integration` | Solo las pruebas de integración HTTP contra `cinema_test`. |
| `npm run test:concurrency` | Solo los escenarios de concurrencia contra `cinema_test`. |

## Documentación de la API

Swagger UI (`/api-docs/`) permite probar todos los endpoints sin leer el código. El documento OpenAPI 3.0 se genera a partir de los mismos esquemas Zod que validan las solicitudes, e incluye para cada operación: descripción de las reglas de negocio, parámetros con ejemplo, cuerpos de solicitud con ejemplos, respuestas exitosas y cada error posible con su mensaje real.

**Flujo sugerido para probar la API**

1. `POST /movies`: crear una película.
2. `POST /rooms`: crear una sala con una fila REGULAR y otra VIP. La respuesta incluye los IDs de los asientos.
3. `POST /showtimes`: programar la película en la sala, en una fecha futura.
4. `GET /showtimes/{id}/seats`: consultar la disponibilidad.
5. `POST /reservations`: reservar de 1 a 6 asientos. La reservación queda `PENDING` durante 10 minutos.
6. `PATCH /reservations/{id}/confirm` o `PATCH /reservations/{id}/cancel`, y `GET /reservations/{id}` para ver el historial.

**Endpoints**

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado del servicio (no consulta la base de datos). |
| GET | `/movies` | Listar películas activas e inactivas. |
| POST | `/movies` | Crear una película. |
| GET | `/movies/{id}` | Consultar una película. |
| PATCH | `/movies/{id}` | Actualizar título y/o duración. |
| PATCH | `/movies/{id}/deactivate` | Desactivar una película. |
| POST | `/rooms` | Crear una sala y generar sus asientos. |
| GET | `/rooms/{id}` | Consultar una sala con sus asientos. |
| POST | `/showtimes` | Programar una función. |
| GET | `/showtimes` | Listar funciones (incluidas canceladas y pasadas). |
| GET | `/showtimes/{id}/seats` | Disponibilidad de asientos de una función. |
| PATCH | `/showtimes/{id}/cancel` | Cancelar una función y, en cascada, sus reservaciones activas. |
| POST | `/reservations` | Crear una reservación PENDING. |
| GET | `/reservations/{id}` | Consultar una reservación con su historial. |
| PATCH | `/reservations/{id}/confirm` | Confirmar una reservación PENDING. |
| PATCH | `/reservations/{id}/cancel` | Cancelar una reservación. |

**Convenciones**

- Montos en **centavos** (enteros): `10000` equivale a 100.00.
- Fechas en ISO 8601. Al enviarlas se exige zona horaria (`Z` o `±hh:mm`); las respuestas siempre están en UTC.
- Los IDs son UUID; un ID con formato inválido produce `400`.
- Los cuerpos de solicitud no admiten campos adicionales: enviar, por ejemplo, `total_cents` o `status` produce `400`.

## Pruebas automatizadas

### Preparar la base de pruebas

Las pruebas de integración y de concurrencia escriben en una base **separada**, `cinema_test`, que vive en el mismo contenedor de PostgreSQL.

```bash
cp .env.test.example .env.test                 # ajustar la contraseña; la base debe llamarse cinema_test
npm run test:db:prepare -- --check             # opcional: solo verifica el destino, no escribe
npm run test:db:prepare                        # crea cinema_test si no existe, aplica migraciones y la vacía
```

El usuario de la conexión necesita permiso para crear bases de datos; el usuario que crea Docker Compose lo tiene.

### Barreras de protección

Las pruebas aplican cuatro protecciones independientes, diseñadas para rechazar cualquier conexión que no sea `cinema_test` antes de escribir, incluso si `DATABASE_URL` está mal configurada. Se verificaron con pruebas unitarias y con intentos reales de usar `cinema_db`, que fueron rechazados sin escribir datos:

1. **Variable separada:** las pruebas solo usan `TEST_DATABASE_URL` (de la terminal o de `.env.test`) y sustituyen `DATABASE_URL` antes de cargar la aplicación. Si falta, se detienen antes de conectarse.
2. **Validación de la URL:** el nombre de la base debe ser exactamente `cinema_test`, y la URL no puede apuntar a la misma base que el `DATABASE_URL` de `.env`.
3. **Comprobación de la conexión:** antes de escribir, `SELECT current_database()` debe devolver `cinema_test`.
4. **Guardia SQL:** la limpieza ejecuta, en la misma transacción que el `TRUNCATE`, un bloque que aborta si la base conectada no es `cinema_test`.

Los mensajes de error de estas comprobaciones describen el destino como `host:puerto/base` y ocultan la contraseña si llegara a aparecer en un mensaje externo; están diseñados para no mostrar credenciales.

### Ejecutar las pruebas

```bash
npm test                  # las 306 pruebas, unos 30 segundos
npm run test:unit         # 136 pruebas, sin base de datos
npm run test:integration  # 155 pruebas contra cinema_test
npm run test:concurrency  # 15 escenarios contra cinema_test
npm run typecheck
```

| Grupo | Archivos | Qué verifica |
|---|---|---|
| Unitarias (`tests/unit`) | 6 | Reglas de precio, horarios y plazos (caja blanca); middleware de errores; barreras de protección; estructura y ejemplos del documento OpenAPI. |
| Integración (`tests/integration`) | 8 | Todos los endpoints por HTTP con Supertest (caja negra): casos exitosos, validaciones y sus límites máximos, 404, 409, precios, estados, historial y liberación de asientos; servicio de expiración; contrato entre cada ejemplo de error documentado y la respuesta HTTP real. |
| Concurrencia (`tests/concurrency`) | 1 | 15 escenarios: reservas simultáneas del mismo asiento; crear o confirmar una reservación mientras se cancela su función, en ambos órdenes; transiciones simultáneas y consistencia del historial; límites de expiración y del plazo de 2 horas. |

**Cómo se coordinan los escenarios de concurrencia.** Una transacción "compuerta" retiene un bloqueo de fila concreto. La prueba confirma en `pg_stat_activity` que cada petición quedó detenida exactamente en la sentencia esperada, libera la compuerta y verifica las respuestas HTTP, el estado final, el historial y ocho invariantes de integridad. Ninguna prueba depende de esperas arbitrarias: el paso del tiempo se simula moviendo `starts_at` o `expires_at` en `cinema_test`.

**Detección real de errores.** Durante el desarrollo se comprobó que las pruebas fallan cuando se introduce un error: al quitar el bloqueo `FOR SHARE` fallan los cuatro escenarios de la condición de carrera, y al alterar la regla VIP o el tiempo de limpieza fallan las pruebas de precios, horarios y solapamiento.

Los grupos con base de datos se ejecutan uno después del otro y cada archivo vacía `cinema_test` al empezar, así que las pruebas no dependen de datos previos ni del orden de ejecución.

## Arquitectura

```text
src/
├── server.ts                 Punto de entrada: inicia el servidor y el temporizador de expiración
├── app.ts                    Aplicación Express: rutas, validación y transacciones (sin efectos al importarse)
├── domain/                   Reglas puras: precios, horarios y plazos de reservación
├── services/                 Expiración de reservaciones y bloqueo de funciones (FOR SHARE)
├── middlewares/              Manejo global de errores y rutas inexistentes
├── schemas/                  Esquemas Zod de entrada y salida (validación y documentación)
├── docs/                     Generación de OpenAPI, Swagger UI y ejemplos
└── lib/prisma.ts             Cliente de Prisma
prisma/
├── schema.prisma             Modelo de datos
└── migrations/               Migraciones SQL, con restricciones agregadas a mano
tests/
├── unit/  integration/  concurrency/
├── support/                  Barreras de protección, datos de prueba y coordinación de bloqueos
└── scripts/prepare-test-db.ts
```

**Decisiones principales**

- **`app.ts` separado de `server.ts`:** la aplicación se puede importar en las pruebas sin abrir el puerto ni iniciar el temporizador.
- **Reglas de negocio en `src/domain`:** funciones puras y probadas por separado (precio VIP, fin de la función, vencimiento y plazo de cancelación). Los handlers las usan sin duplicar fórmulas.
- **Una sola fuente para validación y documentación:** los esquemas Zod validan las solicitudes y, mediante metadatos, generan los esquemas de OpenAPI.
- **Integridad en la base de datos:** las reglas que deben cumplirse incluso ante peticiones simultáneas (asiento único, sin solapamientos, coherencia de `expires_at`) son restricciones de PostgreSQL, no solo validaciones en el código.

## Stack tecnológico y justificación

| Capa | Tecnología | Justificación |
|---|---|---|
| **Runtime y lenguaje** | Node.js 22 + TypeScript | Son obligatorios en la prueba. Además, TypeScript aporta tipado estricto, detecta errores durante el desarrollo y mantiene el código más organizado. |
| **Framework backend** | Express 5 | Por su enfoque minimalista y su flexibilidad, permite construir una API REST sin una arquitectura demasiado compleja. |
| **Validación** | Zod | Elegí Zod porque valida que los datos de entrada tengan exactamente la estructura y el tipo esperados antes de procesarlos, y sus esquemas se integran con TypeScript, manteniendo tipos y validación consistentes. |
| **Documentación** | @asteasolutions/zod-to-openapi + swagger-ui-express | Reutilizo los esquemas de Zod para generar la documentación OpenAPI (antes conocida como Swagger), manteniéndola sincronizada con la validación real. Swagger UI permite consultar y probar los endpoints de forma interactiva. |
| **Base de datos** | PostgreSQL 16 | Base de datos relacional con transacciones y restricciones de integridad, clave para evitar reservas duplicadas y funciones con horarios solapados. |
| **ORM** | Prisma | Facilita trabajar con PostgreSQL desde TypeScript: modelos tipados, migraciones versionadas y transacciones. Las restricciones que Prisma no modela de forma nativa (exclusion constraint de solapamiento y índices únicos parciales) se agregan editando manualmente las migraciones SQL. |
| **Testing** | Vitest + Supertest | Vitest para pruebas unitarias de la lógica de negocio (caja blanca) y Supertest para verificar el comportamiento de los endpoints (caja negra). |
| **Pruebas de integración** | PostgreSQL real con Docker Compose | Las pruebas contra una base de datos real permiten verificar transacciones, restricciones y solicitudes simultáneas sobre el mismo asiento. |
| **Contenedores** | Docker Compose | Permite levantar los servicios de forma reproducible, facilitando el desarrollo y la instalación por parte de quien evalúe la prueba. |

### Justificación general

Elegí este conjunto de tecnologías buscando un equilibrio entre simplicidad, organización y confiabilidad. Mi prioridad es desarrollar una API que cumpla correctamente las reglas de negocio, mantenga la integridad de la información y cuente con documentación clara y completa.

Busqué herramientas que me permitan concentrarme en lo más importante de la prueba: el manejo de concurrencia, la seguridad, las transacciones y la documentación con Swagger/OpenAPI.

## Diseño de la base de datos

Todas las tablas usan UUID como llave primaria. Salvo `reservation_status_history`, que solo recibe inserciones, todas llevan `created_at` y `updated_at`. Los nombres de tablas y columnas están en inglés y en snake_case.

```mermaid
erDiagram
    movies ||--o{ showtimes : "tiene"
    rooms ||--o{ showtimes : "aloja"
    rooms ||--o{ seats : "contiene"
    showtimes ||--o{ reservations : "recibe"
    reservations ||--o{ reservation_seats : "incluye"
    seats ||--o{ reservation_seats : "se reserva en"
    showtimes ||--o{ reservation_seats : "referencia"
    reservations ||--o{ reservation_status_history : "registra"
```

### Resumen de restricciones e índices

| Tabla | Restricción o índice | Propósito |
|---|---|---|
| `movies` | `CHECK (duration_minutes > 0)`, `CHECK (length(trim(title)) > 0)` | Duración válida y título no vacío. |
| `rooms` | `UNIQUE (name)`, `CHECK (length(trim(name)) > 0)` | Nombre único y no vacío. |
| `seats` | `UNIQUE (room_id, row_label, seat_number)`, `CHECK (seat_number > 0)`, `CHECK (length(trim(row_label)) > 0)` | Cada asiento existe una sola vez por sala. |
| `showtimes` | `EXCLUDE USING gist (room_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'SCHEDULED')` | Sin funciones solapadas en una sala. |
| `showtimes` | `CHECK (ends_at > starts_at)`, `CHECK (base_price_cents > 0)`; índices `(room_id, starts_at)` y `(movie_id, starts_at)` | Coherencia de fechas y precio; consultas por sala o película. |
| `reservations` | `CHECK ((status = 'PENDING' AND expires_at IS NOT NULL) OR (status <> 'PENDING' AND expires_at IS NULL))` | Solo una PENDING tiene vencimiento. |
| `reservations` | `CHECK (total_cents >= 0)`, nombre y correo no vacíos; índice `(status, expires_at)` | Montos válidos; búsqueda de reservaciones vencidas. |
| `reservation_seats` | Índice único parcial `(showtime_id, seat_id) WHERE is_active = true` | Un asiento no puede estar reservado dos veces en la misma función. |
| `reservation_seats` | `UNIQUE (reservation_id, seat_id)`, `CHECK (price_cents > 0)`; índice `(showtime_id, seat_id)` | Sin asientos repetidos en una reservación; precio positivo. |
| `reservation_status_history` | `CHECK (from_status IS NULL OR from_status <> to_status)`; índice `(reservation_id, changed_at)` | Cada registro es un cambio real; consulta ordenada del historial. |

Todas las llaves foráneas usan `ON DELETE RESTRICT`.

### Tabla `movies`

Guarda el catálogo de películas del sistema.

| Columna | Tipo (Prisma / PostgreSQL) | Restricciones |
|---|---|---|
| `id` | `String` / `UUID` | Llave primaria, generación automática |
| `title` | `String` / `VARCHAR(200)` | Obligatorio, no vacío |
| `duration_minutes` | `Int` / `INTEGER` | Obligatorio, mayor que 0 |
| `is_active` | `Boolean` / `BOOLEAN` | Obligatorio, por defecto `true` |
| `created_at` | `DateTime` / `TIMESTAMPTZ` | Se asigna al crear el registro |
| `updated_at` | `DateTime` / `TIMESTAMPTZ` | Se actualiza al modificar el registro |

**Por qué lo diseñé así**

- **UUID en vez de número consecutivo:** con IDs consecutivos alguien podría recorrer `/movies/1`, `/movies/2`, etc. Los UUID aleatorios son mucho menos predecibles, lo que dificulta enumerar registros, pero no sustituyen los controles de autorización: quien conozca un ID puede usarlo, y esta API no tiene autenticación (ver [Limitaciones conocidas](#limitaciones-conocidas)).
- **Desactivar en vez de borrar (`is_active`):** una película puede tener funciones asociadas, así que la desactivo y conservo el registro. La API no permite programar funciones nuevas con una película inactiva. Desactivarla no cancela ni modifica sus funciones ya programadas (ver [Limitaciones conocidas](#limitaciones-conocidas)).
- **`CHECK (duration_minutes > 0)`:** la duración se usa para calcular cuándo termina cada función. Con un valor de 0 o negativo, la detección de solapamientos fallaría. La API además limita la duración a 1440 minutos (24 h).
- **`title` limitado a 200 caracteres y no vacío:** pongo un `CHECK` para rechazar títulos vacíos o con solo espacios, y el límite de largo ayuda contra datos malformados.

**Relaciones**

Una película tiene muchas funciones (1:N con `showtimes`). La llave foránea `movie_id` está en `showtimes` y usa `ON DELETE RESTRICT`, así que la base de datos no deja eliminar una película con funciones asociadas.

### Tabla `rooms`

Guarda las salas físicas del cine. Cada función se programa en una sala y cada sala tiene sus propios asientos.

| Columna | Tipo (Prisma / PostgreSQL) | Restricciones |
|---|---|---|
| `id` | `String` / `UUID` | Llave primaria, generación automática |
| `name` | `String` / `VARCHAR(100)` | Obligatorio, único, no vacío |
| `created_at` | `DateTime` / `TIMESTAMPTZ` | Se asigna al crear el registro |
| `updated_at` | `DateTime` / `TIMESTAMPTZ` | Se actualiza al modificar el registro |

**Por qué lo diseñé así**

- **`name` único:** si hubiera dos salas con el mismo nombre, una función apuntaría a una sala ambigua. Lo resuelvo con un índice único, así que se respeta aunque alguien inserte datos sin pasar por la API. La API convierte el conflicto en un `409`. La comparación distingue mayúsculas y minúsculas.
- **`name` no vacío:** agregué un `CHECK` para rechazar nombres vacíos o con solo espacios.
- **Los asientos no van en `rooms`:** una sala tiene muchos asientos, así que van en su propia tabla (`seats`). Meterlos aquí me obligaría a repetir columnas o guardar listas.
- **Sin estado de sala:** no agregué un campo activa/en mantenimiento porque el enunciado no lo pide, y no quise sumar reglas y pruebas que no aportan.

**Relaciones**

Una sala tiene muchos asientos (1:N con `seats`) y muchas funciones (1:N con `showtimes`). La llave foránea `room_id` en `showtimes` usa `ON DELETE RESTRICT`, así que no se puede eliminar una sala con funciones asociadas.

### Tabla `seats`

Guarda cada asiento físico de cada sala. Un asiento se identifica por su sala, la letra de su fila y su número dentro de la fila (por ejemplo, fila C, asiento 7).

| Columna | Tipo (Prisma / PostgreSQL) | Restricciones |
|---|---|---|
| `id` | `String` / `UUID` | Llave primaria, generación automática |
| `room_id` | `String` / `UUID` | Llave foránea a `rooms.id`, `ON DELETE RESTRICT` |
| `row_label` | `String` / `VARCHAR(5)` | Obligatorio, no vacío |
| `seat_number` | `Int` / `INTEGER` | Obligatorio, mayor que 0 |
| `type` | `SeatType` / enum | `REGULAR` o `VIP`, por defecto `REGULAR` |
| `created_at` | `DateTime` / `TIMESTAMPTZ` | Se asigna al crear el registro |
| `updated_at` | `DateTime` / `TIMESTAMPTZ` | Se actualiza al modificar el registro |

**Por qué lo diseñé así**

- **`UNIQUE (room_id, row_label, seat_number)`:** sin esta restricción podría existir dos veces el asiento C7 en la misma sala, y una reserva podría apuntar a cualquiera de los dos. La base de datos la hace cumplir aunque alguien inserte datos sin pasar por la API.
- **Tipo de asiento como enum:** usé un enum (`REGULAR`/`VIP`) y no una tabla aparte de tipos. Para dos valores fijos, una tabla extra implicaba un join más y más endpoints sin aportar nada. La contrapartida es que agregar un tercer tipo requeriría una migración, y lo asumo porque el enunciado solo menciona VIP.
- **Fila con letra y asiento con número:** separo `row_label` y `seat_number` para poder validar cada parte por separado y ordenar los asientos de forma natural.
- **`CHECK` en `seat_number` y `row_label`:** rechazo números menores o iguales a 0 y etiquetas vacías o con solo espacios.
- **Los asientos se generan en el servidor:** al crear una sala, la API recibe la descripción de las filas (letra, cantidad de asientos y tipo) y genera los asientos dentro de la misma transacción que crea la sala. Así evito que el cliente repita o se salte números, y nunca queda una sala creada con sus asientos incompletos.
- **El tipo se define por fila, no por asiento:** con este formato una fila entera es de un solo tipo. Me pareció suficiente porque en un cine el VIP suele ser por filas, y a cambio el request queda corto y fácil de probar en Swagger.
- **Límites en la creación:** limito el número de filas (1 a 30) y de asientos por fila (1 a 50) para evitar peticiones abusivas como `"seats": 1000000`.

**Relaciones**

Cada asiento pertenece a una sala (N:1 con `rooms`). La llave foránea `room_id` usa `ON DELETE RESTRICT`. Un asiento puede aparecer en muchas reservas a lo largo del tiempo a través de `reservation_seats`.

### Tabla `showtimes`

Guarda las funciones: una película, en una sala, a una hora y con un precio. Aquí está la regla que impide que dos funciones se pisen en la misma sala.

| Columna | Tipo (Prisma / PostgreSQL) | Restricciones |
|---|---|---|
| `id` | `String` / `UUID` | Llave primaria, generación automática |
| `movie_id` | `String` / `UUID` | Llave foránea a `movies.id`, `ON DELETE RESTRICT` |
| `room_id` | `String` / `UUID` | Llave foránea a `rooms.id`, `ON DELETE RESTRICT` |
| `starts_at` | `DateTime` / `TIMESTAMPTZ` | Obligatorio |
| `ends_at` | `DateTime` / `TIMESTAMPTZ` | Obligatorio, mayor que `starts_at` |
| `base_price_cents` | `Int` / `INTEGER` | Obligatorio, mayor que 0 |
| `status` | `ShowtimeStatus` / enum | `SCHEDULED` o `CANCELLED`, por defecto `SCHEDULED` |
| `created_at` | `DateTime` / `TIMESTAMPTZ` | Se asigna al crear el registro |
| `updated_at` | `DateTime` / `TIMESTAMPTZ` | Se actualiza al modificar el registro |

**Por qué lo diseñé así**

- **Guardo `starts_at` y `ends_at`:** con los dos en la misma fila, la base de datos puede comparar dos funciones directamente, sin buscar la duración en `movies` cada vez.
- **`ends_at` incluye los 20 minutos de limpieza:** lo calcula el servidor (inicio + duración de la película + 20 min) y el cliente nunca lo envía. Así la regla de limpieza queda dentro del dato y la restricción de solapamiento no necesita saber nada de ella. La contrapartida es que si después cambia la duración de una película, las funciones ya creadas conservan su `ends_at` anterior. Lo asumo así.
- **Restricción de exclusión contra el solapamiento:** uso `EXCLUDE USING gist` con `btree_gist` sobre `room_id` y `tstzrange(starts_at, ends_at, '[)')`, solo para funciones `SCHEDULED`. Si dos personas intentan crear funciones solapadas al mismo tiempo, la base de datos rechaza la segunda, y la API convierte ese error en un `409`. Como el rango es semiabierto, una función puede empezar exactamente cuando termina otra. Prisma no modela esta restricción, así que la agrego a mano en la migración SQL.
- **`status` como enum y no un booleano:** una función cancelada tiene significado propio y quise poder distinguirla. Dejé solo `SCHEDULED` y `CANCELLED`; que una función ya terminó se deduce comparando `ends_at` con la hora actual, así que no tengo que guardarlo ni mantenerlo sincronizado.
- **Las funciones canceladas liberan su horario:** como la restricción de solapamiento solo mira las `SCHEDULED`, se puede programar otra función en esa sala a esa hora.
- **Precio base en centavos (entero):** evito los errores de redondeo de los decimales. El precio VIP se calcula con aritmética entera como `round(base × 130 / 100)`.
- **`CHECK` de fechas y precio:** `ends_at > starts_at` y `base_price_cents > 0`. La API además limita el precio base a 10 000 000 centavos, para que el precio VIP y los totales no excedan el rango de `INTEGER`.
- **Reglas que valida la API y no la base de datos:** que la función no esté en el pasado y que la película esté activa. Dependen de la hora actual y de otra tabla, así que van en el código.
- **Índices `(room_id, starts_at)` y `(movie_id, starts_at)`:** aceleran la consulta de funciones por sala o por película y fecha.

**Cancelar una función**

Cancelo la función y, en la misma transacción, sus reservaciones `CONFIRMED` y sus reservaciones `PENDING` que todavía no han vencido. Cada una pasa a `CANCELLED`, sus asientos quedan libres y se inserta una fila en `reservation_status_history` con el motivo `SHOWTIME_CANCELLED`. Las `PENDING` que ya vencieron no se tocan: las procesa la expiración, que las registra como `EXPIRED` con el motivo `PAYMENT_TIMEOUT`. Elegí la cascada y no bloquear la cancelación porque un cine sí cancela funciones, y quienes procesen un reembolso necesitan ver que la cancelación fue del cine y no del cliente. La regla de las 2 horas aplica solo cuando cancela el cliente.

**Relaciones**

Una función pertenece a una película y a una sala (N:1). Una función tiene muchas reservas (1:N con `reservations`). La disponibilidad de asientos no se guarda: se calcula a partir de los asientos de la sala y las reservas activas de esa función.

### Tabla `reservations`

Guarda cada reserva: para qué función es, quién la hizo, en qué estado está y cuánto cuesta. Los asientos de la reserva van en `reservation_seats`.

| Columna | Tipo (Prisma / PostgreSQL) | Restricciones |
|---|---|---|
| `id` | `String` / `UUID` | Llave primaria, generación automática |
| `showtime_id` | `String` / `UUID` | Llave foránea a `showtimes.id`, `ON DELETE RESTRICT` |
| `customer_name` | `String` / `VARCHAR(150)` | Obligatorio, no vacío |
| `customer_email` | `String` / `VARCHAR(254)` | Obligatorio, no vacío; formato y longitud máxima (254) validados por la API |
| `status` | `ReservationStatus` / enum | `PENDING`, `CONFIRMED`, `CANCELLED`, `EXPIRED`; por defecto `PENDING` |
| `total_cents` | `Int` / `INTEGER` | Obligatorio, mayor o igual que 0 |
| `expires_at` | `DateTime?` / `TIMESTAMPTZ` | Solo tiene valor mientras la reserva está `PENDING` |
| `created_at` | `DateTime` / `TIMESTAMPTZ` | Se asigna al crear el registro |
| `updated_at` | `DateTime` / `TIMESTAMPTZ` | Se actualiza al modificar el registro |

**Por qué lo diseñé así**

- **Sin tabla de usuarios:** el enunciado no habla de login ni de cuentas, así que guardo solo lo mínimo para identificar al cliente: nombre y correo. Elegí el correo y no el teléfono porque es más fácil de validar y es el dato habitual para confirmar una reserva. Con un solo dato de contacto guardo menos información personal.
- **`expires_at` es `NULL` fuera de `PENDING`:** una reserva confirmada ya no vence. Lo refuerzo con un `CHECK` para que la base de datos nunca permita una reserva pendiente sin vencimiento ni una confirmada con él. La fecha en que venció una reserva queda en el histórico de estados.
- **El total lo calcula el servidor:** el cliente nunca lo envía. Se guarda en centavos; la base de datos exige que no sea negativo (`total_cents >= 0`) y cada asiento exige un precio mayor que 0, así que en la práctica el total siempre es positivo.
- **`status` como enum:** la base de datos rechaza cualquier estado fuera de los cuatro. Las transiciones válidas entre estados las controla la API mediante actualizaciones condicionadas al estado actual.
- **Índice `(status, expires_at)`:** lo usa la tarea que expira reservas vencidas, para no recorrer toda la tabla.

**Relaciones**

Una reserva pertenece a una función (N:1 con `showtimes`) con `ON DELETE RESTRICT`. Tiene muchos asientos (1:N con `reservation_seats`) y muchos cambios de estado (1:N con `reservation_status_history`).

### Tabla `reservation_seats`

Une cada reserva con los asientos que incluye. Una reserva tiene de 1 a 6 asientos, y un mismo asiento aparece en muchas reservas a lo largo del tiempo (una por función), por eso es una tabla intermedia.

| Columna | Tipo (Prisma / PostgreSQL) | Restricciones |
|---|---|---|
| `id` | `String` / `UUID` | Llave primaria, generación automática |
| `reservation_id` | `String` / `UUID` | Llave foránea a `reservations.id`, `ON DELETE RESTRICT` |
| `seat_id` | `String` / `UUID` | Llave foránea a `seats.id`, `ON DELETE RESTRICT` |
| `showtime_id` | `String` / `UUID` | Llave foránea a `showtimes.id`, `ON DELETE RESTRICT` |
| `price_cents` | `Int` / `INTEGER` | Obligatorio, mayor que 0 |
| `is_active` | `Boolean` / `BOOLEAN` | Obligatorio, por defecto `true` |
| `created_at` | `DateTime` / `TIMESTAMPTZ` | Se asigna al crear el registro |
| `updated_at` | `DateTime` / `TIMESTAMPTZ` | Se actualiza al modificar el registro |

**Por qué lo diseñé así**

- **Índice único parcial `(showtime_id, seat_id) WHERE is_active`:** es la regla que impide reservar el mismo asiento dos veces para la misma función, incluso si dos clientes lo piden al mismo tiempo. Si dos transacciones intentan insertar la misma pareja, la base de datos acepta una y rechaza la otra, y la API convierte ese error en un `409`. Lo resuelvo en la base de datos y no con una consulta previa en el código, porque entre "revisar si está libre" y "guardar" hay un hueco de tiempo en el que otra petición puede colarse.
- **`showtime_id` repetido a propósito:** la reserva ya guarda su función, pero un índice único solo puede comparar columnas de su propia tabla. Para decir "este asiento, en esta función, una sola vez" necesito las dos columnas en la misma fila, por eso repito `showtime_id` en `reservation_seats`. Es una desnormalización. El valor lo toma el backend de la reserva dentro de la misma transacción que crea los asientos, el cliente nunca lo envía y no se modifica después. No agregué una llave foránea compuesta `(reservation_id, showtime_id)` que lo garantice en la base de datos, porque complicaba el modelo de Prisma y prefería no arriesgar las migraciones. La coincidencia queda cubierta por el código y por las pruebas de concurrencia, que verifican esta invariante después de cada escenario.
- **`is_active` en lugar de borrar la fila:** al cancelar o expirar una reserva, sus asientos pasan a `is_active = false` dentro de la misma transacción que cambia el estado de la reserva y escribe el histórico. Lo mismo ocurre cuando se cancela una función. El índice único parcial ignora las filas inactivas, así que el asiento queda libre, pero conservo qué asientos y a qué precio tenía la reserva.
- **`price_cents` por asiento:** guardo en centavos lo que se cobró por cada asiento, para no trabajar con decimales. El VIP cuesta 30 % más que el precio base y lo calculo como `round(base × 130 / 100)` por asiento. El total de la reserva lo calcula el servidor y es la suma de estos importes.
- **`UNIQUE (reservation_id, seat_id)`:** una misma reserva no puede incluir dos veces el mismo asiento.

**Restricción en SQL**

Prisma no modela índices parciales, así que lo agrego a mano en la migración:

```sql
CREATE UNIQUE INDEX reservation_seats_active_unique
  ON reservation_seats (showtime_id, seat_id)
  WHERE is_active = true;
```

**Relaciones**

Cada fila pertenece a una reserva, a un asiento y a una función (N:1 con `reservations`, `seats` y `showtimes`), todas con `ON DELETE RESTRICT`.

### Tabla `reservation_status_history`

Registra cada cambio de estado de una reserva. Sirve para saber qué le pasó a una reserva, cuándo y por qué, por ejemplo si hay que atender un reembolso.

| Columna | Tipo (Prisma / PostgreSQL) | Restricciones |
|---|---|---|
| `id` | `String` / `UUID` | Llave primaria, generación automática |
| `reservation_id` | `String` / `UUID` | Llave foránea a `reservations.id`, `ON DELETE RESTRICT` |
| `from_status` | `ReservationStatus?` / enum | Opcional, `NULL` solo en el primer registro de la reserva |
| `to_status` | `ReservationStatus` / enum | Obligatorio |
| `reason` | `ReservationStatusReason` / enum | Obligatorio: `CREATED`, `CONFIRMED_BY_CUSTOMER`, `CANCELLED_BY_CUSTOMER`, `SHOWTIME_CANCELLED` o `PAYMENT_TIMEOUT` |
| `changed_at` | `DateTime` / `TIMESTAMPTZ` | Se asigna al insertar el registro |

**Por qué lo diseñé así**

- **`from_status` y `to_status`:** guardo el estado anterior y el nuevo, no solo el nuevo, para que cada fila se entienda sin mirar las demás. Una reserva recién creada no tiene estado anterior, por eso `from_status` puede ser `NULL` en ese primer registro.
- **`reason` como enum obligatorio:** cada cambio de estado tiene un motivo de un conjunto cerrado de cinco valores. Así se distingue, por ejemplo, una cancelación del cliente (`CANCELLED_BY_CUSTOMER`) de una del cine (`SHOWTIME_CANCELLED`), y la base de datos rechaza motivos mal escritos o vacíos. La contrapartida es que agregar un motivo nuevo requiere una migración.
- **No guardo el nombre ni el correo del cliente:** ya están en `reservations`, y como cada cambio apunta a su reserva, se obtienen con un join. Copiarlos aquí repetiría datos personales y podrían quedar desactualizados.
- **Sin `created_at` ni `updated_at`:** la tabla solo recibe inserciones y una fila nunca se modifica, así que `changed_at` cumple el papel de `created_at` y un `updated_at` no tendría sentido.
- **Se escribe en la misma transacción que el cambio de estado:** si el cambio falla, no queda histórico de algo que no pasó, y si el histórico falla, no queda un cambio sin registrar. Esto incluye la expiración automática y la cancelación en cascada de una función. Además, el registro solo se inserta cuando la actualización del estado realmente afectó a la reserva, de modo que dos operaciones simultáneas no producen transiciones duplicadas.
- **`CHECK (from_status IS NULL OR from_status <> to_status)`:** evita registrar un cambio de un estado a sí mismo.
- **Índice `(reservation_id, changed_at)`:** lo usa la consulta del histórico de una reserva, ordenado por fecha.
- **Solo se inserta desde la API:** no hay endpoints que modifiquen o borren filas del histórico. No agregué un trigger que lo impida en la base de datos, porque el enunciado no lo pide y prefería no sumar SQL adicional. Si alguien tuviera acceso directo a la base de datos podría alterarlo, y lo dejo como una limitación conocida.

**Relaciones**

Cada fila pertenece a una reserva (N:1 con `reservations`) con `ON DELETE RESTRICT`.

## Reglas de negocio

**Películas y salas**

- Las películas se crean activas, se pueden actualizar (título y duración) y se desactivan en lugar de borrarse. La duración es un entero de 1 a 1440 minutos.
- Una sala se crea con sus filas; el servidor genera los asientos numerados desde 1. Cada fila es completamente REGULAR o VIP.
- No existen endpoints para borrar películas ni salas, y la base de datos impide borrar las que tienen funciones (`ON DELETE RESTRICT`).

**Funciones**

- Solo se programan películas activas y en fechas futuras.
- El precio base es un entero de 1 a 10 000 000 centavos. Con ese máximo, el precio VIP y el total de una reservación de 6 asientos VIP (78 000 000) caben en las columnas `INTEGER`.
- La sala queda ocupada durante la duración de la película más 20 minutos de limpieza; no se permiten funciones solapadas en una misma sala.
- Cancelar una función cancela en cascada sus reservaciones activas y libera sus horarios y asientos.

**Reservaciones**

- De 1 a 6 asientos distintos, todos de la sala de la función.
- Nombre del cliente de 1 a 150 caracteres y correo válido de hasta 254 caracteres.
- Solo sobre funciones `SCHEDULED` que no han comenzado.
- Un asiento no puede estar en dos reservaciones activas de la misma función.
- Precio calculado en el servidor: REGULAR = precio base; VIP = base × 1,3, redondeado al centavo (0,5 hacia arriba). El total es la suma de los asientos.
- Se crea como `PENDING` y vence a los 10 minutos si no se confirma. Al vencer pasa a `EXPIRED` y libera sus asientos.
- Solo se confirma una `PENDING` vigente cuya función siga programada y no haya comenzado.
- Una `CONFIRMED` se puede cancelar hasta 2 horas antes del inicio de la función (inclusive). Una `PENDING` vigente se puede cancelar en cualquier momento antes de vencer.

**Estados y transiciones válidas**

| Desde | Hacia | Motivo |
|---|---|---|
| (alta) | `PENDING` | `CREATED` |
| `PENDING` | `CONFIRMED` | `CONFIRMED_BY_CUSTOMER` |
| `PENDING` | `CANCELLED` | `CANCELLED_BY_CUSTOMER` o `SHOWTIME_CANCELLED` |
| `PENDING` | `EXPIRED` | `PAYMENT_TIMEOUT` |
| `CONFIRMED` | `CANCELLED` | `CANCELLED_BY_CUSTOMER` o `SHOWTIME_CANCELLED` |

`CANCELLED` y `EXPIRED` son estados finales. Cada transición queda registrada en `reservation_status_history` y se consulta con `GET /reservations/{id}`.

## Transacciones y concurrencia

**Operaciones transaccionales.** Cada operación que modifica varias filas se ejecuta en una sola transacción:

- Crear una sala y todos sus asientos.
- Crear una reservación, sus asientos y su primer registro de historial.
- Confirmar o cancelar una reservación junto con su historial y la liberación de asientos.
- Expirar cada reservación vencida, liberar sus asientos y registrar el cambio.
- Cancelar una función y, en cascada, sus reservaciones.

**Protección ante peticiones simultáneas**

| Riesgo | Solución |
|---|---|
| Dos clientes reservan el mismo asiento a la vez | Índice único parcial `(showtime_id, seat_id) WHERE is_active`. PostgreSQL acepta una inserción y rechaza la otra; la transacción perdedora se revierte completa y la API responde `409`, sin reservas parciales. |
| Dos funciones solapadas se crean a la vez | Restricción de exclusión sobre `(room_id, tstzrange(starts_at, ends_at))`. La segunda se rechaza con `409`. |
| Se crea o confirma una reservación mientras se cancela su función | La creación y la confirmación revalidan la función dentro de su transacción con `SELECT … FOR SHARE`. La cancelación actualiza la función y bloquea sus reservaciones activas con `SELECT … FOR UPDATE`. Así, o la reservación termina primero y la cancelación la incluye, o espera y recibe `409`. |
| Confirmar, cancelar y expirar la misma reservación a la vez | Cada transición es un `UPDATE` condicionado al estado actual sobre la propia fila. En `READ COMMITTED`, PostgreSQL vuelve a evaluar esa condición sobre la fila bloqueada, así que solo una operación gana; el historial se escribe solo si la actualización afectó a la fila. |

Los bloqueos siempre se adquieren en el mismo orden (primero la función y después la reservación), lo que evita interbloqueos entre estos flujos.

**Por qué `READ COMMITTED` y no `SERIALIZABLE`.** Con bloqueos explícitos sobre las dos filas que importan (función y reservación) y restricciones en la base de datos, `READ COMMITTED` basta y es más simple: `SERIALIZABLE` obligaría a reintentar las transacciones ante errores de serialización en cada endpoint.

Los 15 escenarios de `tests/concurrency` reproducen estas situaciones en ambos órdenes y verifican, después de cada uno, ocho invariantes: ninguna reservación activa en una función cancelada, ningún asiento reservado dos veces, asientos activos solo en reservaciones activas, `showtime_id` coherente, historial coherente con el estado actual y cadena de historial sin huecos, entre otras.

## Expiración de reservaciones

Una reservación `PENDING` vence 10 minutos después de crearse (`expires_at`). La API la marca como `EXPIRED`, libera sus asientos y registra el motivo `PAYMENT_TIMEOUT` en dos momentos:

1. **Al inicio de las operaciones que dependen del estado de las reservaciones:** `GET /showtimes/{id}/seats`, `POST /reservations`, `GET /reservations/{id}`, `PATCH /reservations/{id}/confirm` y `PATCH /reservations/{id}/cancel`.
2. **Cada 30 segundos**, mediante un temporizador que inicia `src/server.ts` (no se ejecuta durante las pruebas).

Cada reservación se expira en su propia transacción, con una actualización condicionada a que siga `PENDING` y vencida, así que una confirmación o cancelación simultánea no puede producir dos transiciones. Una `PENDING` vencida nunca puede confirmarse, aunque todavía no se haya procesado.

`GET /showtimes` y `PATCH /showtimes/{id}/cancel` no disparan la expiración. Entre el vencimiento y su procesamiento, una reservación vencida puede seguir registrada como `PENDING` en la base de datos hasta que el temporizador o alguna de las operaciones anteriores la procese; mientras tanto ya no puede confirmarse.

## Seguridad

- **Inyección SQL:** todas las consultas pasan por Prisma con parámetros. Las únicas consultas SQL escritas a mano usan `$queryRaw` con plantillas etiquetadas, que también parametrizan los valores.
- **Validación estricta:** los cuerpos se validan con Zod en modo estricto (se rechazan los campos desconocidos), con UUID y correo válidos, y con límites de longitud y valores máximos acordes con las columnas de la base de datos (por ejemplo, duración hasta 1440 minutos, precio base hasta 10 000 000 centavos y correo hasta 254 caracteres). Un valor fuera de rango responde `400`, no `500`. Los IDs de ruta se validan como UUID; un formato inválido responde `400` sin buscar el recurso.
- **Manipulación del payload:** el cliente no puede enviar precios, totales, estados ni `ends_at`; el servidor los calcula.
- **Integridad en la base de datos:** restricciones `CHECK`, `UNIQUE`, de exclusión y llaves foráneas que se cumplen aunque alguien escriba sin pasar por la API.
- **Filtración de errores internos:** las rutas y el middleware global responden con mensajes predefinidos, sin mensajes internos ni *stack traces*; las pruebas automatizadas lo verifican para errores síncronos y asíncronos. Los errores inesperados devuelven un `500` genérico y el detalle solo queda en el registro del servidor. El JSON malformado devuelve `400` en formato JSON, no HTML.
- **Exposición de secretos:** las credenciales solo viven en `.env` y `.env.test`, que no se versionan. El repositorio incluye únicamente archivos de ejemplo.
- **Otros:** la cabecera `X-Powered-By` está desactivada y los cuerpos JSON están limitados a 100 KB (`413` si se excede).

La API no implementa autenticación, autorización ni límite de peticiones (ver [Limitaciones conocidas](#limitaciones-conocidas)).

## Manejo de errores

Las rutas responden sus propios errores y un middleware global (`src/middlewares/error-handler.ts`) atiende los que no maneja ninguna ruta: JSON malformado, cuerpos demasiado grandes, rutas inexistentes y errores inesperados.

**Formatos**

```json
{ "message": "Película no encontrada" }
```

```json
{
  "message": "Datos inválidos",
  "errors": {
    "formErrors": [],
    "fieldErrors": { "seat_ids": ["No puedes reservar más de seis asientos"] }
  }
}
```

| Código | Cuándo |
|---|---|
| `400` | Datos inválidos (con `errors`), ID con formato inválido, JSON malformado, fecha de función en el pasado o asientos de otra sala. |
| `404` | Recurso inexistente o ruta inexistente. |
| `409` | Conflicto con el estado actual: sala duplicada, película inactiva o ya desactivada, horario empalmado, asiento ocupado, función cancelada o iniciada, transición de estado inválida o cancelación fuera del plazo de 2 horas. |
| `413` | Cuerpo mayor de 100 KB. |
| `500` | Error inesperado, con mensaje genérico. |

Swagger documenta, para cada operación, qué códigos puede devolver y el mensaje exacto de cada caso; una prueba de contrato verifica que esos mensajes coinciden con las respuestas reales.

## Limitaciones conocidas

Estas son limitaciones reales del estado actual; ninguna se presenta como resuelta.

- **Sin autenticación ni autorización:** cualquier cliente puede crear películas, salas y funciones o cancelarlas. Tampoco hay límite de peticiones.
- **Sin endpoints de borrado:** las películas se desactivan, y desactivar una película **no** cancela ni modifica sus funciones ya programadas, que siguen aceptando reservaciones.
- **Cancelación de funciones sin restricción temporal:** se puede cancelar una función que ya comenzó. Una reservación `PENDING` se puede cancelar después del inicio de la función mientras no haya vencido.
- **Unicidad de salas sensible a mayúsculas:** `Sala 1` y `sala 1` se aceptan como salas distintas.
- **Cambiar la duración de una película no recalcula `ends_at`** de las funciones ya programadas.
- **Crear una función y desactivar su película no se serializan:** si ocurren exactamente a la vez, podría programarse una función de una película que se está desactivando. La ventana es mínima.
- **Expiración dentro del proceso de la API:** el temporizador corre en cada instancia del servidor. Con varias instancias habría varios temporizadores (es seguro, porque cada expiración es condicionada, pero redundante), y las reglas de tiempo dependen del reloj del servidor.
- **Docker solo para la base de datos:** no hay Dockerfile de la API ni integración continua.
- **Dependencias de desarrollo:** `npm audit` reporta vulnerabilidades altas en la cadena de herramientas de Prisma (`prisma` → `@prisma/config`), que solo se usa en desarrollo y migraciones.
- **Pruebas de concurrencia acopladas a Prisma 6:** reconocen los puntos de espera por el texto del SQL que genera Prisma; una actualización mayor podría requerir ajustar esos patrones.
- **Notas de entorno:** los scripts de prueba usan `--root .` porque Vitest falla en Windows cuando la ruta de trabajo empieza con la letra de unidad en minúscula. Con npm 10.9.3, agregar dependencias de desarrollo nuevas puede requerir `--legacy-peer-deps` por un error interno de npm; `npm ci` no lo necesita.

## Uso de inteligencia artificial

Este proyecto se desarrolló con apoyo de herramientas de inteligencia artificial en distintas fases. La IA participó en la generación y modificación de código, no solo en consultas.

**Desarrollo inicial.** El diseño de la base de datos y la primera implementación de la API (modelos, migraciones, validaciones y endpoints de películas, salas, funciones y reservaciones) se desarrollaron guiados por ChatGPT, que proporcionó explicaciones y fragmentos de código. Ese código lo incorporé, adapté y probé manualmente.

**Auditoría y mejoras posteriores.** Después trabajé con Claude Code (Anthropic) directamente sobre el repositorio. Primero completó la documentación de errores de Swagger; luego realizó, a petición mía, una auditoría técnica del proyecto frente a los requisitos de la prueba, y a partir de ella el proyecto se mejoró por etapas. En todas ellas Claude Code propuso, escribió y modificó código, pruebas y documentación:

1. Preparación para ejecutar el proyecto desde cero (scripts, generación de Prisma Client y separación de `app.ts` y `server.ts`).
2. Middleware global de errores y respuesta `409` para salas duplicadas.
3. Corrección de condiciones de carrera entre reservaciones, confirmaciones, expiración y cancelación de funciones.
4. Suite de pruebas unitarias, de integración y de concurrencia, con barreras que protegen la base de desarrollo.
5. Documentación completa de Swagger/OpenAPI con ejemplos y pruebas de contrato.

**Supervisión humana.** Cada etapa siguió el mismo proceso: la IA presentaba un análisis y un plan; yo revisaba, pedía ajustes y aprobaba antes de que se modificara cualquier archivo; después se verificaban los resultados y yo revisaba los cambios antes de cada commit, que se registraron con mi autoría. Las decisiones de negocio las tomé yo, por ejemplo rechazar la confirmación de reservaciones cuando la función ya comenzó o mantener la posibilidad de cancelar funciones iniciadas.

**Cómo se evaluaron las decisiones.** Cada propuesta se valoró considerando:

- **Requisitos:** que cumpliera el enunciado sin agregar funcionalidades no solicitadas.
- **Alternativas:** comparando opciones antes de elegir; por ejemplo, bloqueos explícitos frente a aislamiento `SERIALIZABLE`, o la forma de resolver un error de instalación de npm sin desactivar de forma permanente la verificación de dependencias.
- **Integridad:** priorizando restricciones en la base de datos y transacciones sobre comprobaciones solo en el código.
- **Seguridad:** sin exponer credenciales ni detalles internos, y con barreras que impiden que las pruebas escriban en la base de desarrollo.
- **Pruebas:** reproduciendo cada problema antes de corregirlo cuando era posible, y comprobando que las pruebas fallan si se introduce un error a propósito.

## Verificación desde un clon limpio

Para comprobar que el proyecto funciona sin depender de archivos locales no versionados:

```bash
git clone https://github.com/mariela1217/cinema-reservations-api.git
cd cinema-reservations-api
cp .env.example .env              # definir la contraseña en POSTGRES_PASSWORD y DATABASE_URL
cp .env.test.example .env.test    # misma contraseña; la base debe ser cinema_test
docker compose up -d
npm ci
npm run db:migrate
npm run typecheck
npm run build
npm run test:db:prepare
npm test                          # 306 pruebas
npm run dev                       # y abrir http://localhost:3000/api-docs/
```

Resultado esperado:

- `npm ci` termina sin errores y genera Prisma Client.
- `npm run db:migrate` aplica las 4 migraciones.
- `npm run typecheck` y `npm run build` terminan sin errores.
- `npm test` informa 306 pruebas aprobadas.
- `GET /health` responde `200` y Swagger UI muestra las 16 operaciones.
