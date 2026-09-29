const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { neon } = require("@neondatabase/serverless");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || (!process.env.VERCEL ? "kikolink-local-development-secret-change-me" : "");
const OWNER_USERNAME = process.env.OWNER_USERNAME || "KikoEnakTau";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || "AKUNIKO142011";

if (!process.env.DATABASE_URL || !JWT_SECRET || !OWNER_PASSWORD) {
  console.warn("Missing DATABASE_URL, JWT_SECRET, or OWNER_PASSWORD environment variable.");
}

const sql = neon(process.env.DATABASE_URL || "postgresql://invalid:invalid@invalid.invalid/invalid");

app.use(express.json({limit:"100kb"}));
app.use(cookieParser());
app.use((req,res,next) => {
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  next();
});
app.use(express.static(path.join(__dirname, "public")));

async function ensureSchema() {
  if (!process.env.DATABASE_URL) return;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('owner','member')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS links (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      url TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK(visibility IN ('guest','member')),
      gta_category TEXT DEFAULT '',
      gate_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const configuredHash = await bcrypt.hash(OWNER_PASSWORD, 12);
  const owner = await sql`SELECT id FROM users WHERE role='owner' ORDER BY id ASC LIMIT 1`;
  const configuredUser = await sql`SELECT id, role FROM users WHERE LOWER(username)=LOWER(${OWNER_USERNAME}) LIMIT 1`;

  if (!owner.length) {
    if (configuredUser.length && configuredUser[0].role !== 'owner') {
      throw new Error(`OWNER_USERNAME is already used by a member: ${OWNER_USERNAME}`);
    }
    if (configuredUser.length) {
      await sql`UPDATE users SET password_hash=${configuredHash} WHERE id=${configuredUser[0].id}`;
    } else {
      await sql`INSERT INTO users(username,password_hash,role) VALUES(${OWNER_USERNAME},${configuredHash},'owner')`;
    }
  } else {
    if (configuredUser.length && configuredUser[0].id !== owner[0].id) {
      throw new Error(`OWNER_USERNAME is already used by another account: ${OWNER_USERNAME}`);
    }
    await sql`UPDATE users SET username=${OWNER_USERNAME}, password_hash=${configuredHash} WHERE id=${owner[0].id}`;
  }
}

let schemaPromise;
function dbReady() {
  if (!schemaPromise) schemaPromise = ensureSchema();
  return schemaPromise;
}

function sign(user) {
  return jwt.sign(
    {id:user.id, username:user.username, role:user.role},
    JWT_SECRET,
    {expiresIn:"7d"}
  );
}

function getSession(req) {
  try {
    if (!JWT_SECRET) return null;
    return jwt.verify(req.cookies.kikolink_session || "", JWT_SECRET);
  } catch {
    return null;
  }
}

async function auth(req,res,next) {
  try {
    await dbReady();
    req.user = getSession(req);
    if (!req.user) return res.status(401).json({error:"Login diperlukan"});
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"Database error"});
  }
}

function ownerOnly(req,res,next) {
  if (req.user?.role !== "owner") return res.status(403).json({error:"Owner only"});
  next();
}

app.get("/api/health", async (req,res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ok:false,error:"DATABASE_URL belum diatur"});
    if (!JWT_SECRET) return res.status(503).json({ok:false,error:"JWT_SECRET belum diatur"});
    await dbReady();
    const rows = await sql`SELECT username, role FROM users WHERE role='owner' LIMIT 1`;
    res.json({ok:true, owner:rows[0] ? rows[0].username : null});
  } catch (e) {
    console.error(e);
    res.status(500).json({ok:false,error:e?.message || "Database error"});
  }
});

app.get("/api/session", async (req,res) => {
  try {
    await dbReady();
    const user = getSession(req);
    res.json(user
      ? {authenticated:true,user:{username:user.username,role:user.role}}
      : {authenticated:false});
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"Database error"});
  }
});

app.post("/api/login", async (req,res) => {
  try {
    if (!JWT_SECRET || !process.env.DATABASE_URL)
      return res.status(503).json({error:"Server belum dikonfigurasi. Isi DATABASE_URL dan JWT_SECRET di Vercel."});
    await dbReady();
    const {username,password} = req.body || {};
    const cleanUsername = String(username || "").trim();
    const rows = await sql`SELECT * FROM users WHERE LOWER(username)=LOWER(${cleanUsername}) LIMIT 1`;
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password || "", user.password_hash)))
      return res.status(401).json({error:"Username atau password salah"});
    res.cookie("kikolink_session", sign(user), {
      httpOnly:true,
      sameSite:"lax",
      secure:Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production",
      maxAge:7*24*3600*1000,
      path:"/"
    });
    res.json({ok:true,user:{username:user.username,role:user.role}});
  } catch (e) {
    console.error(e);
    res.status(500).json({error:`Login gagal: ${e?.message || "server error"}`});
  }
});

app.post("/api/logout", (req,res) => {
  res.clearCookie("kikolink_session",{path:"/"});
  res.json({ok:true});
});

app.get("/api/links", async (req,res) => {
  try {
    await dbReady();
    const user = getSession(req);
    const rows = user?.role === "member" || user?.role === "owner"
      ? await sql`SELECT id,title,description,visibility,gta_category,gate_json,created_at FROM links ORDER BY id DESC`
      : await sql`SELECT id,title,description,visibility,gta_category,gate_json,created_at FROM links WHERE visibility='guest' ORDER BY id DESC`;
    res.json(rows.map(x => ({
      id:x.id, title:x.title, description:x.description, visibility:x.visibility,
      gta_category:x.gta_category, gate:Array.isArray(x.gate_json) ? x.gate_json : []
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"Gagal mengambil link"});
  }
});

app.post("/api/members", auth, ownerOnly, async (req,res) => {
  const {username,password} = req.body || {};
  if (!username || !password || password.length < 6)
    return res.status(400).json({error:"Username dan password minimal 6 karakter wajib diisi"});
  try {
    const hash = await bcrypt.hash(password,12);
    await sql`INSERT INTO users(username,password_hash,role) VALUES(${username},${hash},'member')`;
    res.json({ok:true});
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({error:"Username sudah dipakai"});
    console.error(e);
    res.status(500).json({error:"Gagal membuat member"});
  }
});

app.get("/api/members", auth, ownerOnly, async (req,res) => {
  try {
    const rows = await sql`SELECT id,username,created_at FROM users WHERE role='member' ORDER BY id DESC`;
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"Gagal mengambil member"});
  }
});

app.delete("/api/members/:id", auth, ownerOnly, async (req,res) => {
  await sql`DELETE FROM users WHERE id=${req.params.id} AND role='member'`;
  res.json({ok:true});
});

app.post("/api/links", auth, ownerOnly, async (req,res) => {
  const {title,description,url,visibility,gta_category,gate} = req.body || {};
  if (!title || !url || !["guest","member"].includes(visibility))
    return res.status(400).json({error:"Title, URL, dan visibility wajib diisi"});
  try { new URL(url); } catch {
    return res.status(400).json({error:"URL tidak valid"});
  }
  const cleanGate = Array.isArray(gate)
    ? gate.filter(x => x && x.url && x.label).slice(0,8)
    : [];
  try {
    const rows = await sql`
      INSERT INTO links(title,description,url,visibility,gta_category,gate_json,created_by)
      VALUES(${title},${description||""},${url},${visibility},${gta_category||""},${JSON.stringify(cleanGate)}::jsonb,${req.user.id})
      RETURNING id
    `;
    res.json({ok:true,id:rows[0].id});
  } catch (e) {
    console.error(e);
    res.status(500).json({error:"Gagal menyimpan link"});
  }
});

app.delete("/api/links/:id", auth, ownerOnly, async (req,res) => {
  await sql`DELETE FROM links WHERE id=${req.params.id}`;
  res.json({ok:true});
});

app.post("/api/gate/verify", async (req,res) => {
  try {
    await dbReady();
    const {id, completed} = req.body || {};
    const rows = await sql`SELECT id,visibility,gate_json FROM links WHERE id=${id} LIMIT 1`;
    const link = rows[0];
    if (!link) return res.status(404).json({error:"Link tidak ditemukan"});
    const user = getSession(req);
    if (link.visibility === "member" && !user) return res.status(401).json({error:"Login member diperlukan"});
    const gate = Array.isArray(link.gate_json) ? link.gate_json : [];
    if (!gate.length) return res.json({ok:true,token:null});
    if (!Array.isArray(completed) || completed.length !== gate.length || completed.some(v => v !== true))
      return res.status(403).json({error:"Semua langkah proteksi harus diselesaikan"});
    const token = jwt.sign({type:"download",linkId:Number(link.id),nonce:require("crypto").randomBytes(16).toString("hex")},JWT_SECRET,{expiresIn:"5m"});
    res.json({ok:true,token});
  } catch(e){ console.error(e); res.status(500).json({error:"Verifikasi gagal"}); }
});

app.get("/api/download/:id", async (req,res) => {
  try {
    await dbReady();
    const rows = await sql`SELECT * FROM links WHERE id=${req.params.id} LIMIT 1`;
    const link = rows[0];
    if (!link) return res.status(404).send("Link tidak ditemukan");
    const user = getSession(req);
    if (link.visibility === "member" && !user) return res.status(401).json({error:"Login member diperlukan"});
    const gate = Array.isArray(link.gate_json) ? link.gate_json : [];
    if (gate.length) {
      let payload;
      try { payload=jwt.verify(String(req.query.token||""),JWT_SECRET); }
      catch { return res.status(403).json({error:"Token akses tidak valid atau sudah kedaluwarsa"}); }
      if (payload?.type!=="download" || Number(payload.linkId)!==Number(link.id))
        return res.status(403).json({error:"Token akses tidak cocok"});
    }
    res.redirect(link.url);
  } catch(e){ console.error(e); res.status(500).json({error:"Download gagal"}); }
});

// SPA fallback. Do not use app.get("*") because Express 5 path matching can reject it.
app.use((req,res) => {
  if (req.method === "GET" && !req.path.startsWith("/api/")) {
    return res.sendFile(path.join(__dirname,"public","index.html"));
  }
  res.status(404).json({error:"Not found"});
});

const isVercel = Boolean(process.env.VERCEL);
if (!isVercel) {
  app.listen(PORT, () => console.log(`KikoLink running on http://localhost:${PORT}`));
}

module.exports = app;
