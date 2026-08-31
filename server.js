"use strict";
const express = require("express");
const path = require("path");

const PORT = process.env.PORT || 10000;
const STATE_KEY = "cargoTrackerState";
const DEFAULT_STATE = JSON.stringify({ ships: [], cargoPresets: [], locationPresets: [] });

let redis = null;
let memoryState = DEFAULT_STATE; // used only if REDIS_URL isn't configured

if (process.env.REDIS_URL) {
  const Redis = require("ioredis");
  redis = new Redis(process.env.REDIS_URL, {
    tls: process.env.REDIS_URL.startsWith("rediss://") ? {} : undefined,
    maxRetriesPerRequest: 3
  });
  redis.on("error", function (e) {
    console.error("[redis] connection error:", e && e.message);
  });
  redis.on("connect", function () {
    console.log("[redis] connected");
  });
} else {
  console.warn("[startup] REDIS_URL not set — using in-memory storage only. Data will NOT survive a restart or redeploy. Attach a Render Key Value instance and set REDIS_URL to persist data.");
}

const app = express();
app.use(express.json({ limit: "3mb" }));

app.get("/healthz", function (req, res) {
  res.type("text/plain").send("ok");
});

app.get("/api/state", async function (req, res) {
  try {
    if (redis) {
      const raw = await redis.get(STATE_KEY);
      res.type("application/json").send(raw || DEFAULT_STATE);
    } else {
      res.type("application/json").send(memoryState);
    }
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

app.post("/api/state", async function (req, res) {
  try {
    const body = req.body;
    if (!body || !Array.isArray(body.ships)) {
      return res.status(400).json({ error: "invalid state: missing ships array" });
    }
    const json = JSON.stringify(body);
    if (redis) {
      await redis.set(STATE_KEY, json);
    } else {
      memoryState = json;
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, function () {
  console.log("cargo-tracker-shared listening on port " + PORT);
});
