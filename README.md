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