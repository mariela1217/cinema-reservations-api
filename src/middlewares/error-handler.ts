import type { ErrorRequestHandler, RequestHandler } from "express";

// Responde en JSON a las rutas que no existen.
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ message: "Ruta no encontrada" });
};

// Devuelve el estado HTTP del error solo si es un entero entre 400 y 499.
function getClientErrorStatus(err: unknown): number | null {
  if (typeof err !== "object" || err === null) {
    return null;
  }

  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown };
  const value = status ?? statusCode;

  if (Number.isInteger(value) && (value as number) >= 400 && (value as number) <= 499) {
    return value as number;
  }

  return null;
}

// Atiende los errores que ninguna ruta manejó, por ejemplo los de express.json().
// Nunca envía al cliente el mensaje original ni el stack trace.
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const type = (err as { type?: unknown } | null)?.type;

  if (type === "entity.parse.failed") {
    return res.status(400).json({
      message: "El cuerpo de la solicitud no es un JSON válido",
    });
  }

  if (type === "entity.too.large") {
    return res.status(413).json({
      message: "El cuerpo de la solicitud es demasiado grande",
    });
  }

  // Otros errores del cliente que marcan expose (charset o encoding no soportados, etc.).
  const clientStatus = getClientErrorStatus(err);

  if (clientStatus !== null && (err as { expose?: unknown }).expose === true) {
    return res.status(clientStatus).json({
      message: "Solicitud inválida",
    });
  }

  console.error("Error no controlado:", err);

  return res.status(500).json({
    message: "Error interno del servidor",
  });
};
