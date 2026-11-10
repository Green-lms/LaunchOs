require("dotenv").config();
const express   = require("express");
const http      = require("http");
const mongoose  = require("mongoose");
const cors      = require("cors");
const helmet    = require("helmet");
const morgan    = require("morgan");
const rateLimit = require("express-rate-limit");
const fs        = require("fs");

const wsService = require("./services/ws");

const app    = express();
const server = http.createServer(app);

// ── Security & Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: function(origin, cb) {
    const allowed = (process.env.FRONTEND_URL || "http://localhost:3000").split(",");
    if (!origin || allowed.includes(origin) || process.env.NODE_ENV === "development")
      return cb(null, true);
    cb(new Error("CORS blocked: " + origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const uploadDir = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

// ── Rate Limits
const limiter    = rateLimit({ windowMs: 900000, max: 200, message: { error: "Too many requests" } });
const authLimit  = rateLimit({ windowMs: 900000, max: 20,  message: { error: "Too many auth attempts" } });
const aiLimit    = rateLimit({ windowMs: 60000,  max: 30,  message: { error: "AI rate limit hit" } });
app.use("/api/",      limiter);
app.use("/api/auth/", authLimit);
app.use("/api/ai/",   aiLimit);

// ── Routes
app.use("/api/auth",          require("./routes/auth"));
app.use("/api/users",         require("./routes/users"));
app.use("/api/programme",     require("./routes/programme"));
app.use("/api/sessions",      require("./routes/sessions"));
app.use("/api/messages",      require("./routes/messages"));
app.use("/api/cohorts",       require("./routes/cohorts"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/ai",            require("./routes/ai"));
app.use("/api/reports",       require("./routes/reports"));
app.use("/api/moodle",        require("./routes/moodle"));

// ── Health
app.get("/health", async (req, res) => {
  res.json({
    status: "ok", version: "4.0.0",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    websockets: wsService.totalConnections() + " active",
    uptime: Math.round(process.uptime()) + "s",
    timestamp: new Date().toISOString(),
  });
});

// ── API index
app.get("/api", (req, res) => {
  res.json({
    name: "LaunchOS API", version: "4.0.0",
    roles: ["founder (student)", "trainer", "mentor", "admin"],
    endpoints: {
      auth:     ["POST /api/auth/register", "POST /api/auth/login", "POST /api/auth/refresh", "POST /api/auth/logout", "GET /api/auth/me", "POST /api/auth/forgot-password", "POST /api/auth/reset-password"],
      users:    ["GET /api/users", "GET /api/users/:id", "PUT /api/users/:id", "POST /api/users/:id/assign-trainer", "PUT /api/users/:id/stage", "DELETE /api/users/:id"],
      programme:["GET /api/programme/:founderId", "PUT /api/programme/:founderId/bmc", "PUT .../bmc/:step/trainer-note", "PUT .../offer", "PUT .../assessments", "GET|PUT .../survey", "POST .../survey/response", "PUT .../survey/analysis", "PUT .../scripts", "PUT .../capital", "PUT .../competitor", "PUT .../mvp", "POST .../trainer-feedback", "GET .../trainer-feedback", "POST .../trainer-notes"],
      sessions: ["GET /api/sessions", "POST /api/sessions", "GET /api/sessions/:id", "PUT /api/sessions/:id", "DELETE /api/sessions/:id"],
      messages: ["GET /api/messages", "POST /api/messages", "GET /api/messages/:id/thread", "PUT /api/messages/:id/read", "PUT /api/messages/read-all", "GET /api/messages/unread-count"],
      cohorts:  ["GET /api/cohorts", "POST /api/cohorts", "GET /api/cohorts/:id", "PUT /api/cohorts/:id", "POST /api/cohorts/:id/add-founder", "POST /api/cohorts/:id/remove-founder", "POST /api/cohorts/:id/add-trainer", "GET /api/cohorts/:id/progress"],
      notifications: ["GET /api/notifications", "PUT /api/notifications/:id/read", "PUT /api/notifications/read-all"],
      ai:       ["POST /api/ai/generate", "POST /api/ai/survey-analysis"],
      reports:  ["GET /api/reports/dashboard", "GET /api/reports/founders", "GET /api/reports/trainers", "GET /api/reports/cohorts"],
      moodle:   ["GET /api/moodle/site-info", "GET /api/moodle/courses", "POST /api/moodle/enrol", "POST /api/moodle/create-course", "GET /api/moodle/users/:courseId"],
      websocket:"ws://host/ws?token=<JWT_TOKEN>",
    },
  });
});

app.use((req, res) => res.status(404).json({ error: "Not found", path: req.path }));

app.use((err, req, res, next) => {
  console.error("[Error]", err.message);
  if (err.name === "ValidationError") return res.status(400).json({ error: "Validation error", details: Object.values(err.errors).map(e=>e.message) });
  if (err.code === 11000) return res.status(409).json({ error: Object.keys(err.keyValue)[0] + " already exists" });
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ── Start
const PORT = process.env.PORT || 4000;

async function start() {
  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set — copy .env.example to .env and add your MongoDB Atlas connection string");
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log("✓ MongoDB:", mongoose.connection.host);
    wsService.init(server);
    server.listen(PORT, () => {
      console.log("\n╔════════════════════════════════════╗");
      console.log("║  LaunchOS™ Backend v4.0.0          ║");
      console.log("║  http://localhost:" + PORT + "            ║");
      console.log("║  ws://localhost:"   + PORT + "/ws          ║");
      console.log("╚════════════════════════════════════╝\n");
    });
    process.on("SIGTERM", () => mongoose.connection.close().then(() => process.exit(0)));
    process.on("SIGINT",  () => mongoose.connection.close().then(() => process.exit(0)));
  } catch (err) {
    console.error("Startup failed:", err.message);
    process.exit(1);
  }
}

start();
module.exports = app;
