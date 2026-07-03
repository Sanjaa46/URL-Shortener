import express from "express";
import Redis from "ioredis";
import shortid from "shortid";
import QRCode from "qrcode";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { LMSClient, AppLogRequest, LogLevel } from "lms-logger";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.set("trust proxy", 1);
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, 
    message: {error: "Too many requests, please try again later."},
    standardHeaders: true,
    legacyHeaders: false,
})

app.use(limiter);
app.use(cors({
  origin: "https://url.voicollo.com",
  methods: ["GET", "POST"],
}));
app.use(express.json());
app.use(express.static(__dirname + "/public"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// Connect to Redis
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || "toor",
});

// LMS logging client
let lmsClient = null;
const SOURCE_SERVICE = process.env.LMS_SERVICE_ID || "url-shortener";
const ENVIRONMENT = process.env.NODE_ENV || "development";

if (process.env.LMS_BASE_URL && process.env.LMS_SERVICE_ID && process.env.LMS_SECRET) {
  lmsClient = new LMSClient({
    baseUrl: process.env.LMS_BASE_URL,
    serviceId: process.env.LMS_SERVICE_ID,
    secret: process.env.LMS_SECRET,
  });
} else {
  console.warn("[lms-logger] LMS_BASE_URL/LMS_SERVICE_ID/LMS_SECRET not set — app logging to LMS is disabled");
}

function logAppInfo(message, { traceId, context } = {}) {
  if (!lmsClient) return; // logging disabled, don't block or crash anything

  const req = new AppLogRequest({
    source_service: SOURCE_SERVICE,
    environment: ENVIRONMENT,
    level: LogLevel.INFO,
    message,
    trace_id: traceId || randomUUID(),
    context_json: context ?? null,
  });

  lmsClient.logApp(req).catch((err) => {
    console.error("[lms-logger] failed to send app log:", err.message);
  });
}

const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const getShortUrl = (req, shortId) => `${req.protocol}://${req.get("host")}/${shortId}`;

function validateUrl(url) {
  if (!url || typeof url !== "string") return "URL is required";
  const trimmed = url.trim();
  if (!trimmed.startsWith("https://")) return "URL must start with https://";
  try {
    const parsed = new URL(trimmed);
    if (parsed.host === "") return "URL must include a valid host";
    return null;
  } catch {
    return "Invalid URL format";
  }
}

// URL Shortener
app.post("/shorten", async (req, res) => {
  const { url } = req.body;
  const error = validateUrl(url);
  if (error) return res.status(400).json({ error });

  const shortId = shortid.generate();
  try {
    await redis.set(`short:${shortId}`, url.trim(), "EX", TTL_SECONDS);

    const shortUrl = getShortUrl(req, shortId);

    // Send INFO app log to LMS (non-blocking)
    logAppInfo("URL shortened", {
      traceId: shortId,
      context: {
        shortId,
        targetHost: new URL(url.trim()).host, // avoid logging full destination URL
        ttlSeconds: TTL_SECONDS,
        ip: req.ip,
      },
    });

    res.json({ shortUrl });
  } catch (err) {
    console.error("Redis error:", err);
    res.status(500).json({ error: "Failed to shorten URL" });
  }
});

// Redirect short URL
const ALLOWED_PROTOCOLS = ["http:", "https:"];

app.get("/:shortId", async (req, res) => {
  const { shortId } = req.params;

  if (!/^[a-zA-Z0-9_-]+$/.test(shortId)) {
    return res.status(400).json({ error: "Invalid short ID" });
  }

  try {
    const originalUrl = await redis.get(`short:${shortId}`);
    if (!originalUrl) return res.status(404).json({ error: "URL not found" });

    const parsed = new URL(originalUrl);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return res.status(400).json({ error: "Invalid URL protocol" });
    }

    res.redirect(301, originalUrl);
  } catch (err) {
    if (err instanceof TypeError) {
      console.log(err)
      return res.status(500).json({ error: "Stored URL is malformed" });
    }
    console.error("Error retrieving URL from Redis:", err);
    res.status(500).json({ error: "Failed to retrieve URL" });
  }
});

// URL → QR Code
app.post("/qr", async (req, res) => {
  const { url } = req.body;
  const error = validateUrl(url);
  if (error) return res.status(400).json({ error });

  try {
    const qr = await QRCode.toDataURL(url.trim());
    res.json(qr);
  } catch (err) {
    console.error("QR error:", err);
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

app.listen(process.env.PORT || 3000, () => console.log(`URL service running on port ${process.env.PORT || 3000}`));