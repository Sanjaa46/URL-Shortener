import express from "express";
import Redis from "ioredis";
import shortid from "shortid";
import QRCode from "qrcode";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname } from "path";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.set("trust proxy", 1);
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, 
    message: {error: "Too many requests, please try again later."},
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})

app.use(limiter);
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname + "/public"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});


// Connect to Redis (default localhost:6379)
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
});

// Helper function to build full short URL
const getShortUrl = (req, shortId) => `${req.protocol}://${req.get("host")}/${shortId}`;

// 1️⃣ URL Shortener
app.post("/shorten", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  const shortId = shortid.generate();

  try {
    // Save mapping in Redis with no expiration
    await redis.set(`short:${shortId}`, url);
    res.json({ shortUrl: getShortUrl(req, shortId) });
  } catch (err) {
    res.status(500).json({ error: "Failed to shorten URL" });
  }
});

// Redirect short URL
const ALLOWED_PROTOCOLS = ["http:", "https:"];

app.get("/:shortId", async (req, res) => {
  const { shortId } = req.params;

  // input sanitation
  if (!/^[a-zA-Z0-9_-]+$/.test(shortId)) {
    return res.status(400).json({ error: "Invalid short ID" });
  }

  try {
    const originalUrl = await redis.get(`short:${shortId}`);
    if (!originalUrl) return res.status(404).json({ error: "URL not found" });

    // Guard against dangerous protocols
    const parsed = new URL(originalUrl);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return res.status(400).json({ error: "Invalid URL protocol" });
    }

    res.redirect(301, originalUrl);
  } catch (err) {
    if (err instanceof TypeError) {
      // new URL() threw — malformed URL in Redis
      return res.status(500).json({ error: "Stored URL is malformed" });
    }
    console.error("Error retrieving URL from Redis:", err);
    res.status(500).json({ error: "Failed to retrieve URL" });
  }
});

// 2️⃣ URL → QR Code
app.post("/qr", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL is required" });

  try {
    const qr = await QRCode.toDataURL(url);
    res.json( qr );
  } catch (err) {
    res.status(500).json({ error: "Failed to generate QR code" });
  }
});

app.listen(process.env.PORT || 3000, () => console.log(`URL service running on port ${process.env.PORT || 3000}`));