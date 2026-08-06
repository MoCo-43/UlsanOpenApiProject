import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

import rawRouter from "./routes/raw.js";
import sensorsRouter from "./routes/sensors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());

// 요청 로그 — 시연 중 호출 흐름을 확인하기 위한 최소 로깅
app.use((req, _res, next) => {
  if (req.path.startsWith("/api")) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  }
  next();
});

app.use("/api/raw", rawRouter);
app.use("/api/sensors", sensorsRouter);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    keyConfigured: Boolean(
      process.env.DATA_GO_KR_SERVICE_KEY &&
      !process.env.DATA_GO_KR_SERVICE_KEY.startsWith("여기에"),
    ),
    uptimeSec: Math.round(process.uptime()),
  });
});

// 운영 환경: Vite로 빌드된 정적 파일을 같은 서버에서 서빙
// 프런트와 API가 같은 오리진이 되므로 별도의 CORS 설정은 필요 X
const clientDist = path.resolve(__dirname, "../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA 라우팅: API가 아닌 경로는 모두 index.html로 넘김
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res
      .type("text")
      .send("개발 모드입니다. 프런트는 http://localhost:5173 에서 확인하세요.");
  });
}

app.use((err, _req, res, _next) => {
  console.error("처리되지 않은 오류:", err);
  res.status(500).json({ ok: false, error: "서버 내부 오류가 발생했습니다." });
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  if (!process.env.DATA_GO_KR_SERVICE_KEY) {
    console.warn(
      "경고: DATA_GO_KR_SERVICE_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.",
    );
  }
});
