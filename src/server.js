import http from "node:http";
import path from "node:path";
import { readFile, stat } from "node:fs/promises";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function encodePathname(filePath) {
  return filePath.split(path.sep).map(encodeURIComponent).join("/");
}

function dashboardPath(root, dashboard) {
  if (!dashboard || /^https?:\/\//i.test(dashboard)) return "/";

  const relative = path.relative(root, dashboard);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return "/";

  return `/${encodePathname(relative)}`;
}

function responseError(response, statusCode, message) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(`${message}\n`);
}

async function resolveRequestPath(root, requestUrl, dashboard) {
  const url = new URL(requestUrl, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const defaultPath = dashboardPath(root, dashboard);
  const requested = pathname === "/" ? defaultPath : pathname;
  const target = path.resolve(root, `.${requested}`);

  if (!isInside(root, target)) return null;

  let info = await stat(target);
  if (info.isDirectory()) {
    const indexPath = path.join(target, "index.html");
    if (!isInside(root, indexPath)) return null;
    info = await stat(indexPath);
    return { path: indexPath, info };
  }
  if (!info.isFile()) return null;
  return { path: target, info };
}

function fileEtag(info) {
  return `W/"${info.size}-${Math.trunc(info.mtimeMs)}"`;
}

function responseHeaders(target, info) {
  return {
    "content-type": contentTypes[path.extname(target).toLowerCase()] || "application/octet-stream",
    etag: fileEtag(info),
    "last-modified": info.mtime.toUTCString()
  };
}

function isNotModified(request, info) {
  const etag = fileEtag(info);
  if (request.headers["if-none-match"]?.split(",").map((value) => value.trim()).includes(etag)) return true;

  const modifiedSince = request.headers["if-modified-since"];
  if (!modifiedSince) return false;

  const modifiedSinceTime = Date.parse(modifiedSince);
  return !Number.isNaN(modifiedSinceTime) && Math.trunc(info.mtimeMs / 1000) <= Math.trunc(modifiedSinceTime / 1000);
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

export async function startStaticServer({ root, dashboard = null, host = "127.0.0.1", port = 8080 } = {}) {
  const serverRoot = path.resolve(root);
  const server = http.createServer(async (request, response) => {
    if (!request.url || (request.method !== "GET" && request.method !== "HEAD")) {
      responseError(response, 405, "Method not allowed.");
      return;
    }

    let target;
    try {
      target = await resolveRequestPath(serverRoot, request.url, dashboard);
    } catch {
      responseError(response, 404, "Not found.");
      return;
    }

    if (!target) {
      responseError(response, 403, "Forbidden.");
      return;
    }

    const headers = responseHeaders(target.path, target.info);
    if (isNotModified(request, target.info)) {
      response.writeHead(304, headers);
      response.end();
      return;
    }

    response.writeHead(200, headers);
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    response.end(await readFile(target.path));
  });

  const address = await listen(server, host, port);
  const actualPort = typeof address === "object" && address ? address.port : port;
  const url = `http://${host}:${actualPort}${dashboardPath(serverRoot, dashboard)}`;

  return {
    root: serverRoot,
    url,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}
