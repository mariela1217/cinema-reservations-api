import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { generateOpenAPIDocument } from "./openapi";

export function setupSwagger(app: Express) {
  const document = generateOpenAPIDocument();

  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(document)
  );
  
  app.get("/api-docs.json", (_req, res) => {
    res.json(generateOpenAPIDocument());
});
  
}