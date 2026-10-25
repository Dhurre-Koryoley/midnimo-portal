const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const express = require("express");
const multer = require("multer");

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const uploadDir = path.join(dataDir, "uploads");
const databasePath = path.join(dataDir, "midnimo.sqlite");
const schoolName = "Midnimo Academy For Science & Technology";
const sessionDays = 7;
const loginAttempts = new Map();

class UploadValidationError extends Error {}

fs.mkdirSync(uploadDir, { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY,
    student_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    photo_path TEXT,
    photo_mime_type TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    teacher TEXT NOT NULL DEFAULT '',
    exam_name TEXT NOT NULL,
    score REAL NOT NULL CHECK (score >= 0 AND score <= 100),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    attendance_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
    UNIQUE (student_id, attendance_date)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'student')),
    account_id INTEGER NOT NULL,
    csrf_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS grades_student_idx ON grades(student_id);
  CREATE INDEX IF NOT EXISTS attendance_student_date_idx ON attendance(student_id, attendance_date DESC);
`);
const studentColumns = db.prepare("PRAGMA table_info(students)").all();
if (!studentColumns.some(column => column.name === "photo_mime_type")) {
  db.exec("ALTER TABLE students ADD COLUMN photo_mime_type TEXT");
}
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [ip, attempts] of loginAttempts) {
    if (attempts.startedAt <= cutoff) loginAttempts.delete(ip);
  }
}, 60 * 1000).unref();

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  });
  next();
});
app.use(express.json({ limit: "100kb" }));
app.use((req, _res, next) => {
  if (!req.body) req.body = {};
  next();
});

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, _file, callback) => callback(null, crypto.randomUUID())
  }),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(new UploadValidationError("Sawirka waa inuu noqdaa JPG, PNG ama WebP."));
      return;
    }
    callback(null, true);
  }
});

function sendError(res, status, message) {
  res.status(status).json({ error: message });
}

function isUniqueConstraint(error) {
  return error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.errcode === 2067;
}

function cleanText(value, label, max = 120) {
  if (typeof value !== "string") throw new Error(`${label} waa inuu qoraal noqdaa.`);
  const result = value.trim();
  if (!result || result.length > max) throw new Error(`${label} waa waajib, ugu badnaanna waa ${max} xaraf.`);
  return result;
}

function passwordHash(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 210000, 32, "sha256");
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function passwordMatches(password, stored) {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const actual = crypto.pbkdf2Sync(password, Buffer.from(saltHex, "hex"), 210000, 32, "sha256");
  const expected = Buffer.from(hashHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function readCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return "";
}

function currentSession(req) {
  const token = readCookie(req, "midnimo_session");
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const session = db.prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?").get(tokenHash, Date.now());
  return session || null;
}

function requireAuth(req, res, next) {
  const session = currentSession(req);
  if (!session) return sendError(res, 401, "Fadlan mar kale gal akoonkaaga.");
  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== "admin") return sendError(res, 403, "Qaybtan waxaa geli kara maamulka oo keliya.");
  next();
}

function requireCsrf(req, res, next) {
  if (req.get("X-CSRF-Token") !== req.session.csrf_token) return sendError(res, 403, "Codsiga lama xaqiijin. Dib u cusboonaysii bogga.");
  next();
}

function publicStudent(student) {
  return {
    id: student.id,
    studentNumber: student.student_number,
    username: student.username,
    fullName: student.full_name,
    className: student.class_name,
    photoUrl: student.photo_path ? `/uploads/${encodeURIComponent(student.photo_path)}` : null,
    createdAt: student.created_at
  };
}

function removePhoto(filename) {
  if (!filename || path.basename(filename) !== filename) return;
  const target = path.join(uploadDir, filename);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

function checkImageSignature(filePath, mimeType) {
  const bytes = Buffer.alloc(12);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, bytes, 0, bytes.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function studentRecords(studentId) {
  const grades = db.prepare("SELECT id, subject, teacher, exam_name AS examName, score FROM grades WHERE student_id = ? ORDER BY id DESC").all(studentId);
  const attendance = db.prepare("SELECT id, attendance_date AS date, status FROM attendance WHERE student_id = ? ORDER BY attendance_date DESC, id DESC").all(studentId);
  const total = attendance.length;
  const present = attendance.filter(row => row.status === "present").length;
  const late = attendance.filter(row => row.status === "late").length;
  const average = grades.length ? Math.round(grades.reduce((sum, row) => sum + row.score, 0) / grades.length) : null;
  return {
    grades,
    attendance,
    summary: {
      gradeAverage: average,
      attendanceRate: total ? Math.round((present + late) / total * 100) : 0,
      attendanceCounts: { present, absent: total - present - late, late },
      attendanceTotal: total
    }
  };
}

app.get("/api/auth/status", (_req, res) => {
  res.json({ setupRequired: !db.prepare("SELECT 1 FROM admins LIMIT 1").get(), schoolName });
});

app.post("/api/auth/setup", (req, res) => {
  if (db.prepare("SELECT 1 FROM admins LIMIT 1").get()) return sendError(res, 409, "Maamulka hore ayaa loo dejiyey.");
  try {
    const username = cleanText(req.body.username, "Username", 60);
    const password = req.body.password;
    if (typeof password !== "string" || password.length < 10 || password.length > 200) {
      return sendError(res, 400, "Erayga sirta ah waa inuu ugu yaraan 10 xaraf noqdaa.");
    }
    const result = db.prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)").run(username, passwordHash(password));
    createSession(res, "admin", Number(result.lastInsertRowid));
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

function createSession(res, role, accountId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + sessionDays * 24 * 60 * 60 * 1000;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, role, account_id, csrf_token, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(tokenHash, role, accountId, csrfToken, expiresAt);
  res.cookie("midnimo_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionDays * 24 * 60 * 60 * 1000
  });
  res.json({ csrfToken });
}

app.post("/api/auth/login", (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const attempts = loginAttempts.get(ip);
    if (attempts && attempts.count >= 10 && Date.now() - attempts.startedAt < 15 * 60 * 1000) {
      return sendError(res, 429, "Isku-dayo badan ayaa dhacay. Sug 15 daqiiqo ka hor intaadan mar kale isku dayin.");
    }
    const username = cleanText(req.body.username, "Username", 60);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const admin = db.prepare("SELECT id, password_hash FROM admins WHERE username = ? COLLATE NOCASE").get(username);
    if (admin && passwordMatches(password, admin.password_hash)) {
      loginAttempts.delete(ip);
      return createSession(res, "admin", admin.id);
    }
    const student = db.prepare("SELECT id, password_hash FROM students WHERE username = ? COLLATE NOCASE").get(username);
    if (student && passwordMatches(password, student.password_hash)) {
      loginAttempts.delete(ip);
      return createSession(res, "student", student.id);
    }
    if (!attempts || Date.now() - attempts.startedAt >= 15 * 60 * 1000) {
      loginAttempts.set(ip, { count: 1, startedAt: Date.now() });
    } else {
      attempts.count += 1;
    }
    return sendError(res, 401, "Username-ka ama erayga sirta ah sax ma aha.");
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.get("/api/auth/session", (req, res) => {
  const session = currentSession(req);
  if (!session) return res.json({ authenticated: false });
  if (session.role === "admin") {
    const admin = db.prepare("SELECT id, username FROM admins WHERE id = ?").get(session.account_id);
    if (!admin) return sendError(res, 401, "Akoonka lama helin.");
    return res.json({ authenticated: true, role: "admin", csrfToken: session.csrf_token, user: admin, schoolName });
  }
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(session.account_id);
  if (!student) return sendError(res, 401, "Akoonka lama helin.");
  res.json({ authenticated: true, role: "student", csrfToken: session.csrf_token, user: publicStudent(student), schoolName });
});

app.post("/api/auth/logout", requireAuth, requireCsrf, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(req.session.token_hash);
  res.clearCookie("midnimo_session", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ ok: true });
});

app.get("/api/admin/overview", requireAuth, requireAdmin, (_req, res) => {
  const students = db.prepare("SELECT COUNT(*) AS count FROM students").get().count;
  const grades = db.prepare("SELECT COUNT(*) AS count FROM grades").get().count;
  const attendance = db.prepare("SELECT COUNT(*) AS count FROM attendance").get().count;
  const average = db.prepare("SELECT ROUND(AVG(score)) AS score FROM grades").get().score;
  res.json({ students, grades, attendanceRecords: attendance, gradeAverage: average });
});

app.get("/api/admin/students", requireAuth, requireAdmin, (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
  const rows = search
    ? db.prepare(`SELECT * FROM students WHERE full_name LIKE ? OR student_number LIKE ? OR username LIKE ? OR class_name LIKE ? ORDER BY full_name`)
      .all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
    : db.prepare("SELECT * FROM students ORDER BY full_name").all();
  res.json(rows.map(publicStudent));
});

app.post("/api/admin/students", requireAuth, requireAdmin, requireCsrf, photoUpload.single("photo"), (req, res) => {
  try {
    const studentNumber = cleanText(req.body.studentNumber, "Lambarka ardayga", 40);
    const username = cleanText(req.body.username, "Username", 60);
    const fullName = cleanText(req.body.fullName, "Magaca ardayga", 120);
    const className = cleanText(req.body.className, "Fasalka", 40);
    const password = req.body.password;
    if (typeof password !== "string" || password.length < 8 || password.length > 200) {
      throw new Error("Erayga sirta ah waa inuu ugu yaraan 8 xaraf noqdaa.");
    }
    if (req.file && !checkImageSignature(req.file.path, req.file.mimetype)) {
      removePhoto(req.file.filename);
      return sendError(res, 400, "Faylka la doortay ma aha sawir sax ah.");
    }
    const result = db.prepare(`INSERT INTO students (student_number, username, password_hash, full_name, class_name, photo_path, photo_mime_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(studentNumber, username, passwordHash(password), fullName, className, req.file?.filename || null, req.file?.mimetype || null);
    res.status(201).json(publicStudent(db.prepare("SELECT * FROM students WHERE id = ?").get(Number(result.lastInsertRowid))));
  } catch (error) {
    if (req.file) removePhoto(req.file.filename);
    if (isUniqueConstraint(error)) return sendError(res, 409, "Lambarka ardayga ama username-kan hore ayaa loo isticmaalay.");
    sendError(res, 400, error.message);
  }
});

app.put("/api/admin/students/:id", requireAuth, requireAdmin, requireCsrf, photoUpload.single("photo"), (req, res) => {
  const id = Number(req.params.id);
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(id);
  if (!student) {
    if (req.file) removePhoto(req.file.filename);
    return sendError(res, 404, "Ardayga lama helin.");
  }
  try {
    const studentNumber = cleanText(req.body.studentNumber, "Lambarka ardayga", 40);
    const username = cleanText(req.body.username, "Username", 60);
    const fullName = cleanText(req.body.fullName, "Magaca ardayga", 120);
    const className = cleanText(req.body.className, "Fasalka", 40);
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (password && (password.length < 8 || password.length > 200)) throw new Error("Erayga sirta ah waa inuu ugu yaraan 8 xaraf noqdaa.");
    if (req.file && !checkImageSignature(req.file.path, req.file.mimetype)) {
      removePhoto(req.file.filename);
      return sendError(res, 400, "Faylka la doortay ma aha sawir sax ah.");
    }
    const photoPath = req.file ? req.file.filename : student.photo_path;
    const photoMimeType = req.file ? req.file.mimetype : student.photo_mime_type;
    db.prepare(`UPDATE students SET student_number = ?, username = ?, full_name = ?, class_name = ?, photo_path = ?, photo_mime_type = ?,
      password_hash = CASE WHEN ? = '' THEN password_hash ELSE ? END WHERE id = ?`)
      .run(studentNumber, username, fullName, className, photoPath, photoMimeType, password, password ? passwordHash(password) : "", id);
    if (password) db.prepare("DELETE FROM sessions WHERE role = 'student' AND account_id = ?").run(id);
    if (req.file && student.photo_path) removePhoto(student.photo_path);
    res.json(publicStudent(db.prepare("SELECT * FROM students WHERE id = ?").get(id)));
  } catch (error) {
    if (req.file) removePhoto(req.file.filename);
    if (isUniqueConstraint(error)) return sendError(res, 409, "Lambarka ardayga ama username-kan hore ayaa loo isticmaalay.");
    sendError(res, 400, error.message);
  }
});

app.delete("/api/admin/students/:id", requireAuth, requireAdmin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  const student = db.prepare("SELECT photo_path FROM students WHERE id = ?").get(id);
  if (!student) return sendError(res, 404, "Ardayga lama helin.");
  db.prepare("DELETE FROM students WHERE id = ?").run(id);
  db.prepare("DELETE FROM sessions WHERE role = 'student' AND account_id = ?").run(id);
  removePhoto(student.photo_path);
  res.json({ ok: true });
});

app.get("/api/admin/students/:id/records", requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare("SELECT 1 FROM students WHERE id = ?").get(id)) return sendError(res, 404, "Ardayga lama helin.");
  res.json(studentRecords(id));
});

app.post("/api/admin/students/:id/grades", requireAuth, requireAdmin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  try {
    if (!db.prepare("SELECT 1 FROM students WHERE id = ?").get(id)) return sendError(res, 404, "Ardayga lama helin.");
    const subject = cleanText(req.body.subject, "Maaddada", 80);
    const teacher = typeof req.body.teacher === "string" ? req.body.teacher.trim().slice(0, 100) : "";
    const examName = cleanText(req.body.examName, "Imtixaanka", 100);
    const score = Number(req.body.score);
    if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("Dhibcuhu waa inay u dhexeeyaan 0 iyo 100.");
    const result = db.prepare("INSERT INTO grades (student_id, subject, teacher, exam_name, score) VALUES (?, ?, ?, ?, ?)")
      .run(id, subject, teacher, examName, score);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.delete("/api/admin/grades/:id", requireAuth, requireAdmin, requireCsrf, (req, res) => {
  const result = db.prepare("DELETE FROM grades WHERE id = ?").run(Number(req.params.id));
  if (!result.changes) return sendError(res, 404, "Natiijada lama helin.");
  res.json({ ok: true });
});

app.post("/api/admin/students/:id/attendance", requireAuth, requireAdmin, requireCsrf, (req, res) => {
  const id = Number(req.params.id);
  try {
    if (!db.prepare("SELECT 1 FROM students WHERE id = ?").get(id)) return sendError(res, 404, "Ardayga lama helin.");
    const date = cleanText(req.body.date, "Taariikhda", 10);
    const parsedDate = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
      throw new Error("Taariikh sax ah dooro.");
    }
    const status = req.body.status;
    if (!["present", "absent", "late"].includes(status)) throw new Error("Xaaladda xaadiriska sax ma aha.");
    db.prepare(`INSERT INTO attendance (student_id, attendance_date, status) VALUES (?, ?, ?)
      ON CONFLICT(student_id, attendance_date) DO UPDATE SET status = excluded.status`).run(id, date, status);
    res.status(201).json({ ok: true });
  } catch (error) {
    sendError(res, 400, error.message);
  }
});

app.delete("/api/admin/attendance/:id", requireAuth, requireAdmin, requireCsrf, (req, res) => {
  const result = db.prepare("DELETE FROM attendance WHERE id = ?").run(Number(req.params.id));
  if (!result.changes) return sendError(res, 404, "Diiwaanka xaadiriska lama helin.");
  res.json({ ok: true });
});

app.get("/api/student/dashboard", requireAuth, (req, res) => {
  if (req.session.role !== "student") return sendError(res, 403, "Qaybtan ardayda ayaa geli karta.");
  const student = db.prepare("SELECT * FROM students WHERE id = ?").get(req.session.account_id);
  if (!student) return sendError(res, 404, "Ardayga lama helin.");
  res.json({ student: publicStudent(student), ...studentRecords(student.id), schoolName });
});

app.post("/api/admin/password", requireAuth, requireAdmin, requireCsrf, (req, res) => {
  const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
  const admin = db.prepare("SELECT * FROM admins WHERE id = ?").get(req.session.account_id);
  if (!admin || !passwordMatches(currentPassword, admin.password_hash)) return sendError(res, 400, "Erayga sirta ah ee hadda jira sax ma aha.");
  if (newPassword.length < 10 || newPassword.length > 200) return sendError(res, 400, "Erayga sirta cusub waa inuu ugu yaraan 10 xaraf noqdaa.");
  db.prepare("UPDATE admins SET password_hash = ? WHERE id = ?").run(passwordHash(newPassword), admin.id);
  db.prepare("DELETE FROM sessions WHERE role = 'admin' AND account_id = ?").run(admin.id);
  res.clearCookie("midnimo_session", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/" });
  res.json({ ok: true });
});

app.get("/uploads/:filename", requireAuth, (req, res, next) => {
  const filename = req.params.filename;
  if (path.basename(filename) !== filename) return sendError(res, 404, "Sawirka lama helin.");
  const owner = db.prepare("SELECT id, photo_path, photo_mime_type FROM students WHERE photo_path = ?").get(filename);
  if (!owner) return sendError(res, 404, "Sawirka lama helin.");
  if (req.session.role === "student") {
    const student = db.prepare("SELECT id, photo_path FROM students WHERE id = ?").get(req.session.account_id);
    if (!student || student.photo_path !== filename) return sendError(res, 403, "Sawirkan ma geli kartid.");
  }
  const filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) return sendError(res, 404, "Sawirka lama helin.");
  res.set("Cache-Control", "private, no-store");
  res.type(owner.photo_mime_type || "image/jpeg");
  const stream = fs.createReadStream(filePath);
  stream.on("error", next);
  stream.pipe(res);
});
app.use(express.static(path.join(__dirname, "public"), { index: "index.html" }));
app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error.type === "entity.parse.failed") return sendError(res, 400, "Xogta codsiga sax ma aha.");
  if (error.type === "entity.too.large") return sendError(res, 413, "Xogta codsiga way ka weyn tahay xadka la oggol yahay.");
  if (error instanceof UploadValidationError) return sendError(res, 400, error.message);
  if (error instanceof multer.MulterError) {
    return sendError(res, error.code === "LIMIT_FILE_SIZE" ? 413 : 400, error.code === "LIMIT_FILE_SIZE" ? "Sawirku waa inuu ka yar yahay 4 MB." : "Faylka sawirka lama aqbalin.");
  }
  console.error(error);
  sendError(res, 500, "Cilad ayaa dhacday. Fadlan mar kale isku day.");
});

app.listen(port, () => {
  console.log(`${schoolName} portal is running at http://localhost:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});
