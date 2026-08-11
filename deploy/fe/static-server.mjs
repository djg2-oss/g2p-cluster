import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 5173);
const HOST_ID = process.env.HOST_ID || `fe-${PORT}`;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "public");

const server = http.createServer((req, res) => {
  const reqPath = req.url || "/";
  if (reqPath.startsWith("/fe/health")) {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "X-Host-Id": HOST_ID,
    });
    return res.end(
      JSON.stringify({ ok: true, host: HOST_ID, role: "frontend", port: PORT }),
    );
  }
  const file = path.join(root, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("not found");
    }
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "X-Host-Id": HOST_ID,
    });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[${HOST_ID}] frontend 0.0.0.0:${PORT}`);
});
