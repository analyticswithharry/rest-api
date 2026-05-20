// Import required libraries for API server, CORS support, file paths, and SQLite DB.
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const crypto = require("crypto");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const sqlite3 = require("sqlite3").verbose();

// Lightweight .env loader (so this project stays dependency-light).
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const rawEnv = fs.readFileSync(envPath, "utf8");
  rawEnv
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .forEach((line) => {
      const idx = line.indexOf("=");
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
}

// Initialize Express app and set server port (uses env var when available).
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET || "replace_with_a_long_random_secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "2h";
const ROLES = new Set(["viewer", "editor", "admin"]);

// Directory paths for uploads, logs, and backups.
const uploadsRoot = path.join(__dirname, "uploads");
const uploadsPhotos = path.join(uploadsRoot, "photos");
const uploadsVideos = path.join(uploadsRoot, "videos");
const uploadsDocs = path.join(uploadsRoot, "documents");
const logsDir = path.join(__dirname, "logs");
const backupsDir = path.join(__dirname, "backups");

// Ensure required directories exist on server startup.
[
  uploadsRoot,
  uploadsPhotos,
  uploadsVideos,
  uploadsDocs,
  logsDir,
  backupsDir,
].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

// Global middleware:
// - cors(): allow cross-origin requests (use stricter policy in production)
// - express.json(): parse incoming JSON request bodies
// - express.static(): serve frontend files from /public
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsRoot));
app.use("/backups", express.static(backupsDir));

// Lightweight request logging middleware.
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const logLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      ip: req.ip,
    });
    fs.appendFile(path.join(logsDir, "access.log"), `${logLine}\n`, () => {});
  });
  next();
});

// Resolve local SQLite database path and open connection.
const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "data", "restapi.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath);

// Configure upload storage based on mime type buckets.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, uploadsPhotos);
    if (file.mimetype.startsWith("video/")) return cb(null, uploadsVideos);
    return cb(null, uploadsDocs);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed =
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/") ||
    [
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
    ].includes(file.mimetype);

  if (!allowed) {
    return cb(new Error("Unsupported file type"));
  }
  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

// Ensure required tables exist before handling requests.
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL CHECK(price >= 0),
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// Promise wrapper for INSERT/UPDATE/DELETE SQL operations.
// Returns SQLite statement context (e.g., lastID, changes).
const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

// Promise wrapper for a SQL query that returns exactly one row.
const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

// Promise wrapper for a SQL query that returns multiple rows.
const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

const verifyPassword = (password, storedHash) => {
  const [salt, originalHash] = String(storedHash).split(":");
  if (!salt || !originalHash) return false;
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(originalHash), Buffer.from(hash));
};

const signToken = (user) =>
  jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
    },
  );

const authenticate = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authorization token is required",
      },
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      },
    });
  }
};

const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action",
        },
      });
    }
    return next();
  };

// Validate product payload.
// - partial = false => full validation (POST/PUT)
// - partial = true  => only validate fields that are present (PATCH)
const validateProduct = (body, partial = false) => {
  const errors = [];

  if (!partial || Object.prototype.hasOwnProperty.call(body, "name")) {
    if (typeof body.name !== "string" || body.name.trim().length < 2) {
      errors.push("'name' must be a string with at least 2 characters");
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "category")) {
    if (typeof body.category !== "string" || body.category.trim().length < 2) {
      errors.push("'category' must be a string with at least 2 characters");
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, "price")) {
    if (
      typeof body.price !== "number" ||
      Number.isNaN(body.price) ||
      body.price < 0
    ) {
      errors.push("'price' must be a non-negative number");
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "description")) {
    if (typeof body.description !== "string") {
      errors.push("'description' must be a string");
    }
  }

  return errors;
};

// Health check endpoint.
// Useful for uptime checks, monitoring tools, and quick smoke tests.
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "REST API is running",
    timestamp: new Date().toISOString(),
  });
});

// Register user and return JWT.
app.post("/api/auth/register", async (req, res, next) => {
  try {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "viewer")
      .trim()
      .toLowerCase();

    if (username.length < 3) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "'username' must be at least 3 characters",
        },
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "'password' must be at least 8 characters",
        },
      });
    }

    if (!ROLES.has(role)) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "'role' must be one of: viewer, editor, admin",
        },
      });
    }

    const existing = await get("SELECT id FROM users WHERE username = ?", [
      username,
    ]);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          code: "CONFLICT",
          message: "Username already exists",
        },
      });
    }

    const passwordHash = hashPassword(password);
    const result = await run(
      "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
      [username, passwordHash, role],
    );

    const user = await get(
      "SELECT id, username, role, created_at FROM users WHERE id = ?",
      [result.lastID],
    );

    const token = signToken(user);

    return res.status(201).json({
      success: true,
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Login user and return JWT.
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const username = String(req.body.username || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "'username' and 'password' are required",
        },
      });
    }

    const user = await get(
      "SELECT id, username, role, password_hash FROM users WHERE username = ?",
      [username],
    );

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid credentials",
        },
      });
    }

    const token = signToken(user);

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Return authenticated user profile from JWT.
app.get("/api/auth/me", authenticate, (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
    },
  });
});

// Seed endpoint: inserts sample products once (skips if table already contains data).
app.post(
  "/api/seed",
  authenticate,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const existing = await get("SELECT COUNT(*) as count FROM products");
      if (existing.count > 0) {
        return res.status(200).json({
          success: true,
          message: "Database already has data. Seed skipped.",
        });
      }

      const sampleProducts = [
        ["Laptop Stand", "electronics", 39.99, "Ergonomic adjustable stand"],
        [
          "Mechanical Keyboard",
          "electronics",
          79.99,
          "RGB keyboard for developers",
        ],
        ["Notebook", "stationery", 4.5, "Hardcover lined notebook"],
        ["Water Bottle", "lifestyle", 12.75, "Insulated 1L bottle"],
      ];

      for (const p of sampleProducts) {
        await run(
          "INSERT INTO products (name, category, price, description) VALUES (?, ?, ?, ?)",
          p,
        );
      }

      return res
        .status(201)
        .json({ success: true, message: "Seed data inserted" });
    } catch (error) {
      return next(error);
    }
  },
);

// Upload photo/video/document endpoint.
app.post(
  "/api/transfer/upload",
  authenticate,
  requireRole("editor", "admin"),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: "NO_FILE", message: "No file was uploaded" },
      });
    }

    let folder = "documents";
    if (req.file.mimetype.startsWith("image/")) folder = "photos";
    if (req.file.mimetype.startsWith("video/")) folder = "videos";

    return res.status(201).json({
      success: true,
      data: {
        name: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${folder}/${req.file.filename}`,
      },
    });
  },
);

// List uploaded files (photos/videos/documents).
app.get(
  "/api/transfer/files",
  authenticate,
  requireRole("editor", "admin"),
  async (req, res, next) => {
    try {
      const mapFiles = async (dir, type) => {
        const names = await fsPromises.readdir(dir);
        return names.map((name) => ({
          type,
          name,
          url: `/uploads/${type}/${name}`,
        }));
      };

      const photos = await mapFiles(uploadsPhotos, "photos");
      const videos = await mapFiles(uploadsVideos, "videos");
      const documents = await mapFiles(uploadsDocs, "documents");

      return res.status(200).json({
        success: true,
        data: [...photos, ...videos, ...documents].sort((a, b) =>
          b.name.localeCompare(a.name),
        ),
      });
    } catch (error) {
      return next(error);
    }
  },
);

// Create a database backup file and return public download URL.
app.post(
  "/api/transfer/backup/create",
  authenticate,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const stamp = new Date().toISOString().replace(/[.:]/g, "-");
      const backupName = `restapi-backup-${stamp}.db`;
      const backupPath = path.join(backupsDir, backupName);

      await fsPromises.copyFile(dbPath, backupPath);

      return res.status(201).json({
        success: true,
        data: {
          name: backupName,
          url: `/backups/${backupName}`,
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

// List backup files.
app.get(
  "/api/transfer/backups",
  authenticate,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const backups = await fsPromises.readdir(backupsDir);
      const data = backups
        .filter((name) => name.endsWith(".db"))
        .sort((a, b) => b.localeCompare(a))
        .map((name) => ({ name, url: `/backups/${name}` }));

      return res.status(200).json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  },
);

// Return recent API logs from access.log.
app.get(
  "/api/transfer/logs",
  authenticate,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const maxLines = Math.min(
        Math.max(Number(req.query.limit) || 120, 1),
        500,
      );
      const logFile = path.join(logsDir, "access.log");

      if (!fs.existsSync(logFile)) {
        return res.status(200).json({ success: true, data: [] });
      }

      const raw = await fsPromises.readFile(logFile, "utf8");
      const lines = raw
        .split("\n")
        .filter(Boolean)
        .slice(-maxLines)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return { raw: line };
          }
        });

      return res.status(200).json({ success: true, data: lines });
    } catch (error) {
      return next(error);
    }
  },
);

// List products endpoint with query features:
// - filtering (category, min_price, max_price)
// - searching (q)
// - sorting (sort + order)
// - pagination (page + limit)
app.get("/api/products", async (req, res, next) => {
  try {
    const {
      category,
      min_price,
      max_price,
      q,
      sort = "created_at",
      order = "desc",
      page = "1",
      limit = "10",
    } = req.query;

    const validSort = [
      "id",
      "name",
      "category",
      "price",
      "created_at",
      "updated_at",
    ];
    const validOrder = ["asc", "desc"];
    const safeSort = validSort.includes(String(sort).toLowerCase())
      ? String(sort).toLowerCase()
      : "created_at";
    const safeOrder = validOrder.includes(String(order).toLowerCase())
      ? String(order).toLowerCase()
      : "desc";

    // Normalize pagination and enforce safe range.
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clauses dynamically using parameter binding (SQL injection-safe).
    const whereClauses = [];
    const params = [];

    if (category) {
      whereClauses.push("category = ?");
      params.push(category);
    }

    if (min_price !== undefined) {
      whereClauses.push("price >= ?");
      params.push(Number(min_price));
    }

    if (max_price !== undefined) {
      whereClauses.push("price <= ?");
      params.push(Number(max_price));
    }

    if (q) {
      whereClauses.push("(name LIKE ? OR description LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }

    const where = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    // Count total rows for pagination metadata.
    const countRow = await get(
      `SELECT COUNT(*) as count FROM products ${where}`,
      params,
    );

    // Fetch page data with selected filters/sort.
    const rows = await all(
      `SELECT * FROM products ${where} ORDER BY ${safeSort} ${safeOrder} LIMIT ? OFFSET ?`,
      [...params, limitNum, offset],
    );

    return res.status(200).json({
      success: true,
      page: pageNum,
      limit: limitNum,
      total: countRow.count,
      totalPages: Math.ceil(countRow.count / limitNum),
      data: rows,
    });
  } catch (error) {
    return next(error);
  }
});

// Get single product by ID.
app.get("/api/products/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await get("SELECT * FROM products WHERE id = ?", [id]);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Product not found" },
      });
    }
    return res.status(200).json({ success: true, data: row });
  } catch (error) {
    return next(error);
  }
});

// Create product endpoint.
// Validates body, normalizes values, inserts row, and returns created resource.
app.post(
  "/api/products",
  authenticate,
  requireRole("editor", "admin"),
  async (req, res, next) => {
    try {
      const errors = validateProduct(req.body);
      if (errors.length) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: errors.join("; ") },
        });
      }

      const payload = {
        name: req.body.name.trim(),
        category: req.body.category.trim().toLowerCase(),
        price: req.body.price,
        description: (req.body.description || "").trim(),
      };

      const result = await run(
        "INSERT INTO products (name, category, price, description) VALUES (?, ?, ?, ?)",
        [payload.name, payload.category, payload.price, payload.description],
      );

      const created = await get("SELECT * FROM products WHERE id = ?", [
        result.lastID,
      ]);

      return res
        .status(201)
        .location(`/api/products/${result.lastID}`)
        .json({ success: true, data: created });
    } catch (error) {
      return next(error);
    }
  },
);

// Replace product (PUT): expects full product payload.
app.put(
  "/api/products/:id",
  authenticate,
  requireRole("editor", "admin"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await get("SELECT * FROM products WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Product not found" },
        });
      }

      const errors = validateProduct(req.body);
      if (errors.length) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: errors.join("; ") },
        });
      }

      await run(
        `UPDATE products
         SET name = ?, category = ?, price = ?, description = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          req.body.name.trim(),
          req.body.category.trim().toLowerCase(),
          req.body.price,
          (req.body.description || "").trim(),
          id,
        ],
      );

      const updated = await get("SELECT * FROM products WHERE id = ?", [id]);
      return res.status(200).json({ success: true, data: updated });
    } catch (error) {
      return next(error);
    }
  },
);

// Partial update product (PATCH): validates only provided fields.
app.patch(
  "/api/products/:id",
  authenticate,
  requireRole("editor", "admin"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await get("SELECT * FROM products WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Product not found" },
        });
      }

      const errors = validateProduct(req.body, true);
      if (errors.length) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: errors.join("; ") },
        });
      }

      const merged = {
        name:
          req.body.name !== undefined ? req.body.name.trim() : existing.name,
        category:
          req.body.category !== undefined
            ? req.body.category.trim().toLowerCase()
            : existing.category,
        price: req.body.price !== undefined ? req.body.price : existing.price,
        description:
          req.body.description !== undefined
            ? req.body.description.trim()
            : existing.description,
      };

      // Reuse same SQL update with merged values to keep DB logic consistent.
      await run(
        `UPDATE products
         SET name = ?, category = ?, price = ?, description = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [merged.name, merged.category, merged.price, merged.description, id],
      );

      const updated = await get("SELECT * FROM products WHERE id = ?", [id]);
      return res.status(200).json({ success: true, data: updated });
    } catch (error) {
      return next(error);
    }
  },
);

// Delete product by ID.
app.delete(
  "/api/products/:id",
  authenticate,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await get("SELECT * FROM products WHERE id = ?", [id]);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: { code: "NOT_FOUND", message: "Product not found" },
        });
      }

      await run("DELETE FROM products WHERE id = ?", [id]);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);

// Centralized error middleware for unexpected failures.
// Keeps API response shape predictable.
app.use((err, req, res, next) => {
  console.error(err);
  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong on the server",
    },
  });
});

const closeDatabase = () =>
  new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) return reject(err);
      return resolve();
    });
  });

// Start HTTP server only when this file is run directly.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  db,
  closeDatabase,
};
