# cinema-reservations-api

API REST de reservas para un cine, desarrollada con Node.js y TypeScript.

## Stack tecnológico y justificación

| Capa | Tecnología | Justificación |
|---|---|---|
| **Runtime y lenguaje** | Node.js 22 + TypeScript | Son obligatorios en la prueba. Además, TypeScript aporta tipado estricto, detecta errores durante el desarrollo y mantiene el código más organizado. |
| **Framework backend** | Express 5 | Por su enfoque minimalista, permite construir una API REST sin introducir una arquitectura demasiado compleja. Esto me permite concentrarme en las reglas de negocio, la integridad de los datos y la documentación. |
| **Validación** | Zod | Valida los datos de entrada con reglas claras y sus esquemas se integran con TypeScript, manteniendo tipos y validación consistentes. |
| **Documentación** | @asteasolutions/zod-to-openapi + swagger-ui-express | Reutilizo los esquemas de Zod para generar la documentación OpenAPI, manteniéndola sincronizada con la validación real. Swagger UI permite consultar y probar los endpoints de forma interactiva. |
| **Base de datos** | PostgreSQL 16 | Base de datos relacional con transacciones y restricciones de integridad, clave para evitar reservas duplicadas y funciones con horarios solapados. |
| **ORM** | Prisma | Facilita trabajar con PostgreSQL desde TypeScript: modelos tipados, migraciones versionadas y transacciones. Las restricciones que Prisma no modela de forma nativa (exclusion constraint de solapamiento y índices únicos parciales) se agregan editando manualmente las migraciones SQL. |
| **Testing** | Vitest + Supertest | Vitest para pruebas unitarias de la lógica de negocio (caja blanca) y Supertest para verificar el comportamiento de los endpoints (caja negra). |
| **Pruebas de integración** | PostgreSQL real con Docker Compose | Las pruebas contra una base de datos real permiten verificar transacciones, restricciones y solicitudes simultáneas sobre el mismo asiento. |
| **Contenedores** | Docker Compose | Permite levantar los servicios de forma reproducible, facilitando el desarrollo y la instalación por parte de quien evalúe la prueba. |

### Justificación general

Elegí este conjunto de tecnologías buscando un equilibrio entre simplicidad, organización y confiabilidad. Mi prioridad es desarrollar una API que cumpla correctamente las reglas de negocio, mantenga la integridad de la información y cuente con documentación clara y completa.

Busqué herramientas que me permitan concentrarme en lo más importante de la prueba: el manejo de concurrencia, la seguridad, las transacciones y la documentación con Swagger/OpenAPI.

## Diseño de la base de datos

Todas las tablas usan UUID como llave primaria. Salvo reservation_status_history, que solo recibe inserciones, todas llevan created_at y updated_at. Los nombres de tablas y columnas están en inglés y en snake_case.

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

- **UUID en vez de número consecutivo:** con IDs consecutivos alguien podría recorrer `/movies/1`, `/movies/2`, etc. Con UUID no se pueden adivinar.
- **Desactivar en vez de borrar (`is_active`):** una película puede tener funciones asociadas, así que la desactivo y conservo el registro. La API no permite programar funciones nuevas con una película inactiva.
- **`CHECK (duration_minutes > 0)`:** la duración se usa para calcular cuándo termina cada función. Con un valor de 0 o negativo, la detección de solapamientos fallaría.
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

- **`name` único:** si hubiera dos salas con el mismo nombre, una función apuntaría a una sala ambigua. Lo resuelvo con un índice único, así que se respeta aunque alguien inserte datos sin pasar por la API.
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
- **Límites en la creación:** limito el número de filas y de asientos por fila para evitar peticiones abusivas como `"seats": 1000000`.

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
- **Restricción de exclusión contra el solapamiento:** uso `EXCLUDE USING gist` con `btree_gist` sobre `room_id` y `tstzrange(starts_at, ends_at)`, solo para funciones `SCHEDULED`. Si dos personas intentan crear funciones solapadas al mismo tiempo, la base de datos rechaza la segunda, y la API convierte ese error en un `409`. Prisma no modela esta restricción, así que la agrego a mano en la migración SQL.
- **`status` como enum y no un booleano:** una función cancelada tiene significado propio y quise poder distinguirla. Dejé solo `SCHEDULED` y `CANCELLED`; que una función ya terminó se deduce comparando `ends_at` con la hora actual, así que no tengo que guardarlo ni mantenerlo sincronizado.
- **Las funciones canceladas liberan su horario:** como la restricción de solapamiento solo mira las `SCHEDULED`, se puede programar otra función en esa sala a esa hora.
- **Precio base en centavos (entero):** evito los errores de redondeo de los decimales. El precio VIP se calcula como `round(base × 130 / 100)`.
- **`CHECK` de fechas y precio:** `ends_at > starts_at` y `base_price_cents > 0`.
- **Reglas que valida la API y no la base de datos:** que la función no esté en el pasado y que la película esté activa. Dependen de la hora actual y de otra tabla, así que van en el código.
- **Índice `(room_id, starts_at)`:** acelera la consulta de funciones por sala y fecha.

**Cancelar una función**

Cancelo la función y, en la misma transacción, todas sus reservas `PENDING` y `CONFIRMED`. Cada reserva pasa a `CANCELLED`, sus asientos quedan libres y se inserta una fila en `reservation_status_history` con el motivo "Función cancelada". Elegí la cascada y no bloquear la cancelación porque un cine sí cancela funciones, y quienes procesen un reembolso necesitan ver que la cancelación fue del cine y no del cliente. La regla de las 2 horas aplica solo cuando cancela el cliente.

**Relaciones**

Una función pertenece a una película y a una sala (N:1). Una función tiene muchas reservas (1:N con `reservations`). La disponibilidad de asientos no se guarda: se calcula a partir de los asientos de la sala y las reservas activas de esa función.

### Tabla `reservations`

Guarda cada reserva: para qué función es, quién la hizo, en qué estado está y cuánto cuesta. Los asientos de la reserva van en `reservation_seats`.

| Columna | Tipo (Prisma / PostgreSQL) | Restricciones |
|---|---|---|
| `id` | `String` / `UUID` | Llave primaria, generación automática |
| `showtime_id` | `String` / `UUID` | Llave foránea a `showtimes.id`, `ON DELETE RESTRICT` |
| `customer_name` | `String` / `VARCHAR(100)` | Obligatorio, no vacío |
| `customer_email` | `String` / `VARCHAR(254)` | Obligatorio, formato validado por la API |
| `status` | `ReservationStatus` / enum | `PENDING`, `CONFIRMED`, `CANCELLED`, `EXPIRED`; por defecto `PENDING` |
| `total_cents` | `Int` / `INTEGER` | Obligatorio, mayor que 0 |
| `expires_at` | `DateTime?` / `TIMESTAMPTZ` | Solo tiene valor mientras la reserva está `PENDING` |
| `created_at` | `DateTime` / `TIMESTAMPTZ` | Se asigna al crear el registro |
| `updated_at` | `DateTime` / `TIMESTAMPTZ` | Se actualiza al modificar el registro |

**Por qué lo diseñé así**

- **Sin tabla de usuarios:** el enunciado no habla de login ni de cuentas, así que guardo solo lo mínimo para identificar al cliente: nombre y correo. Elegí el correo y no el teléfono porque es más fácil de validar y es el dato habitual para confirmar una reserva. Con un solo dato de contacto guardo menos información personal.
- **`expires_at` es `NULL` fuera de `PENDING`:** una reserva confirmada ya no vence. Lo refuerzo con un `CHECK` para que la base de datos nunca permita una reserva pendiente sin vencimiento ni una confirmada con él. La fecha en que venció una reserva queda en el histórico de estados.
- **El total lo calcula el servidor:** el cliente nunca lo envía. Se guarda en centavos y en la base de datos solo exijo que sea mayor que 0.
- **`status` como enum:** la base de datos rechaza cualquier estado fuera de los cuatro. Las transiciones válidas entre estados las controla la API.
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
- **`showtime_id` repetido a propósito:** la reserva ya guarda su función, pero un índice único solo puede comparar columnas de su propia tabla. Para decir "este asiento, en esta función, una sola vez" necesito las dos columnas en la misma fila, por eso repito `showtime_id` en `reservation_seats`. Es una desnormalización. El valor lo toma el backend de la reserva dentro de la misma transacción que crea los asientos, el cliente nunca lo envía y no se modifica después. No agregué una llave foránea compuesta `(reservation_id, showtime_id)` que lo garantice en la base de datos, porque complicaba el modelo de Prisma y prefería no arriesgar las migraciones. La coincidencia queda cubierta por el código y por pruebas.
- **`is_active` en lugar de borrar la fila:** al cancelar o expirar una reserva, sus asientos pasan a `is_active = false` dentro de la misma transacción que cambia el estado de la reserva y escribe el histórico. Lo mismo ocurre cuando se cancela una función. El índice único parcial ignora las filas inactivas, así que el asiento queda libre, pero conservo qué asientos y a qué precio tenía la reserva.
- **`price_cents` por asiento:** guardo en centavos lo que se cobró por cada asiento, para no trabajar con decimales. El VIP cuesta 30 % más que el precio base y lo calculo como `round(base × 130 / 100)` por asiento. El total de la reserva lo calcula el servidor y es la suma de estos importes.
- **`UNIQUE (reservation_id, seat_id)`:** una misma reserva no puede incluir dos veces el mismo asiento.

**Restricción en SQL**

Prisma no modela índices parciales, así que lo agrego a mano en la migración:

​```sql
CREATE UNIQUE INDEX reservation_seats_active_unique
  ON reservation_seats (showtime_id, seat_id)
  WHERE is_active;
​```

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
| `reason` | `String?` / `VARCHAR(200)` | Opcional, texto libre |
| `changed_at` | `DateTime` / `TIMESTAMPTZ` | Se asigna al insertar el registro |

**Por qué lo diseñé así**

- **`from_status` y `to_status`:** guardo el estado anterior y el nuevo, no solo el nuevo, para que cada fila se entienda sin mirar las demás. Una reserva recién creada no tiene estado anterior, por eso `from_status` puede ser `NULL` en ese primer registro.
- **`reason` como texto libre de hasta 200 caracteres:** lo preferí sobre un enum de motivos porque es más simple y me deja distinguir casos como "cancelada por el cliente", "función cancelada" o "expirada por falta de confirmación". La contrapartida es que un error de escritura no lo detecta la base de datos.
- **No guardo el nombre ni el correo del cliente:** ya están en `reservations`, y como cada cambio apunta a su reserva, se obtienen con un join. Copiarlos aquí repetiría datos personales y podrían quedar desactualizados.
- **Sin `created_at` ni `updated_at`:** la tabla solo recibe inserciones y una fila nunca se modifica, así que `changed_at` cumple el papel de `created_at` y un `updated_at` no tendría sentido.
- **Se escribe en la misma transacción que el cambio de estado:** si el cambio falla, no queda histórico de algo que no pasó, y si el histórico falla, no queda un cambio sin registrar. Esto incluye la expiración automática y la cancelación en cascada de una función.
- **`CHECK (from_status IS DISTINCT FROM to_status)`:** evita registrar un cambio de un estado a sí mismo.
- **Índice `(reservation_id, changed_at)`:** lo usa la consulta del histórico de una reserva, ordenado por fecha.
- **Solo se inserta desde la API:** no hay endpoints que modifiquen o borren filas del histórico. No agregué un trigger que lo impida en la base de datos, porque el enunciado no lo pide y prefería no sumar SQL adicional. Si alguien tuviera acceso directo a la base de datos podría alterarlo, y lo dejo como una limitación conocida.

**Relaciones**

Cada fila pertenece a una reserva (N:1 con `reservations`) con `ON DELETE RESTRICT`.