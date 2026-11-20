import "dotenv/config";
import { app } from "./app";
import { expirePendingReservations } from "./services/reservation-expiration.service";

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Revisa reservaciones vencidas cada 30 segundos.
setInterval(async () => {
  try {
    const expiredCount = await expirePendingReservations();

    if (expiredCount > 0) {
      console.log(
        `Se expiraron ${expiredCount} reservaciones pendientes`
      );
    }
  } catch (error) {
    console.error("Error al expirar reservaciones:", error);
  }
}, 30_000);
