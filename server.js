require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;

// 🛠️ PostgreSQL Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

// ✅ CORS Configuration
app.use(cors({
  origin: [process.env.FRONTEND_URL || "http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// 🔑 JWT Token Generation
const generateToken = (user) => {
  return jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });
};

// 🟢 REGISTER USER
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) return res.status(400).json({ error: "User already exists" });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query("INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email", [email, hashedPassword]);
    
    const token = generateToken(newUser.rows[0]);
    res.status(201).json({ message: "Registration successful!", token });
  } catch (error) {
    console.error("Register Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// 🔵 LOGIN USER
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
    
    const userQuery = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userQuery.rows.length === 0) return res.status(401).json({ error: "User not found" });
    
    const user = userQuery.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });
    
    const token = generateToken(user);
    res.json({ message: "Login successful", token });
  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// 🟠 AUTHENTICATION MIDDLEWARE
const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) return res.status(401).json({ error: "Access denied" });

  try {
    const verified = jwt.verify(token.split(" ")[1], process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid token" });
  }
};

// 🟣 GET USER DASHBOARD (Protected Route)
app.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    const user = await pool.query("SELECT id, email FROM users WHERE id = $1", [req.user.userId]);
    res.json(user.rows[0]);
  } catch (error) {
    console.error("Dashboard Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// 🛑 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// 🚀 Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});