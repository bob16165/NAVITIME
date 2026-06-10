import "dotenv/config";
import express from "express";
import cors from "cors";
import navigationRoutes from "./routes/navigationRoutes.js";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "tour-bus-nav-backend" });
});

app.use("/api", navigationRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(400).json({ error: message });
});

app.listen(port, () => {
  console.log(`API server started: http://localhost:${port}`);
});
