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

Todas las tablas usan UUID como llave primaria y llevan `created_at` y `updated_at`. Los nombres de tablas y columnas están en inglés y en snake_case.

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