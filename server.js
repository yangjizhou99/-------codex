const http = require("http");
const path = require("path");
const { readFile } = require("fs/promises");

const PORT = Number(process.env.PORT) || 4173;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

const ALLOWED_HOSTS = [
  "doubao.com",
  "chatgpt.com",
  "chat.openai.com",
  "gemini.google.com",
];

function isAllowedHost(host) {
  if (!host) return false;
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendText(res, status, text, headers = {}) {
  send(res, status, text, { "Content-Type": "text/plain; charset=utf-8", ...headers });
}

function sendJson(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
}

async function handleProxy(req, res, requestUrl) {
  if (req.method === "OPTIONS") {
    send(res, 204, "", {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    return;
  }

  if (req.method !== "GET") {
    sendText(res, 405, "Method Not Allowed", { Allow: "GET, OPTIONS" });
    return;
  }

  const target = requestUrl.searchParams.get("url");
  if (!target) {
    sendJson(res, 400, { error: "missing_url" }, { "Access-Control-Allow-Origin": "*" });
    return;
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch (error) {
    sendJson(res, 400, { error: "invalid_url" }, { "Access-Control-Allow-Origin": "*" });
    return;
  }

  if (!/^https?:$/.test(parsed.protocol)) {
    sendJson(res, 400, { error: "invalid_protocol" }, { "Access-Control-Allow-Origin": "*" });
    return;
  }

  if (!isAllowedHost(parsed.hostname)) {
    sendJson(res, 403, { error: "forbidden_host" }, { "Access-Control-Allow-Origin": "*" });
    return;
  }

  try {
    const response = await fetch(parsed.toString(), {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      sendJson(
        res,
        response.status,
        { error: "fetch_failed", status: response.status },
        { "Access-Control-Allow-Origin": "*" }
      );
      return;
    }

    const contentType = response.headers.get("content-type") || "text/html; charset=utf-8";
    const body = await response.text();
    send(res, 200, body, {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
  } catch (error) {
    sendJson(res, 502, { error: "proxy_error" }, { "Access-Control-Allow-Origin": "*" });
  }
}

async function handleHabit(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 204, "", {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return;
  }

  if (req.method !== "POST") {
    sendText(res, 405, "Method Not Allowed", { Allow: "POST, OPTIONS" });
    return;
  }

  // 读取 Request Body
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString();

  try {
    // 转发给 Python 服务 (Port 8006)
    const pythonRes = await fetch("http://127.0.0.1:8006/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: body,
    });

    if (!pythonRes.ok) {
      throw new Error(`Python service error: ${pythonRes.status}`);
    }

    const data = await pythonRes.json();
    sendJson(res, 200, data, { "Access-Control-Allow-Origin": "*" });

  } catch (error) {
    console.error("Habit Mining Error:", error);
    sendJson(res, 502, { error: "habit_service_unavailable" }, { "Access-Control-Allow-Origin": "*" });
  }
}

async function handleStatic(req, res, requestUrl) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendText(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
    return;
  }

  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.resolve(ROOT, `.${pathname}`);
  const relative = path.relative(ROOT, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(data);
  } catch (error) {
    sendText(res, 404, "Not Found");
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (requestUrl.pathname === "/proxy") {
    await handleProxy(req, res, requestUrl);
    return;
  }
  if (requestUrl.pathname === "/api/habit/analyze") {
    await handleHabit(req, res);
    return;
  }
  await handleStatic(req, res, requestUrl);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
