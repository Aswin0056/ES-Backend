require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// ✅ Proper CORS Configuration
app.use(
  cors({
    origin: "http://localhost:3000", // Allow frontend requests
    methods: "GET,POST,PUT,DELETE",
    allowedHeaders: "Content-Type,Authorization",
  })
);

// ✅ PostgreSQL Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect((err) => {
  if (err) {
    console.error("❌ PostgreSQL connection failed:", err);
  } else {
    console.log("✅ Connected to PostgreSQL Database");
  }
});

// ✅ Generate JWT Token (Access & Refresh)
const generateToken = (user) => {
  const accessToken = jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
  return { accessToken, refreshToken };
};

// ✅ Authentication Middleware
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ error: "Unauthorized - No Token Provided" });

  const extractedToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
  jwt.verify(extractedToken, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Session expired. Please log in again." });

    req.user = decoded;
    next();
  });
};

// 🔹 **User Registration**
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: "All fields are required" });

  try {
    const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userCheck.rows.length > 0) return res.status(400).json({ error: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, email, password) VALUES ($1, $2, $3)", [username, email, hashedPassword]);

    res.json({ message: "Registration successful!" });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// 🔹 **User Login**
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const userQuery = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userQuery.rows.length === 0) return res.status(400).json({ error: "User not found" });

    const user = userQuery.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const { accessToken, refreshToken } = generateToken(user);
    res.json({ message: "Login successful", accessToken, refreshToken, username: user.username });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// 🔹 **Refresh Token Route**
app.post("/refresh-token", (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: "Unauthorized" });

  jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid refresh token" });

    const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [decoded.id]);
    if (userQuery.rows.length === 0) return res.status(403).json({ error: "User not found" });

    const { accessToken, refreshToken: newRefreshToken } = generateToken(userQuery.rows[0]);
    res.json({ accessToken, refreshToken: newRefreshToken });
  });
});

// 🔹 **Logout Route**
app.post("/logout", (req, res) => {
  res.json({ message: "Logged out successfully" });
});

// 🔹 **Add Expense**
app.post("/expenses", authenticateUser, async (req, res) => {
  const { title, amount, quantity, date, time } = req.body;
  if (!title || !amount || !quantity || !date || !time) return res.status(400).json({ error: "All fields are required" });

  try {
    await pool.query(
      "INSERT INTO expenses (email, title, amount, quantity, date, time) VALUES ($1, $2, $3, $4, $5, $6)",
      [req.user.email, title, amount, quantity, date, time]
    );
    res.json({ message: "Expense added successfully" });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// 🔹 **Get Expenses for Logged-in User**
app.get("/expenses", authenticateUser, async (req, res) => {
  try {
    const expensesQuery = await pool.query("SELECT * FROM expenses WHERE email = $1 ORDER BY date DESC, time DESC", [
      req.user.email,
    ]);
    res.json(expensesQuery.rows);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// 🔹 **Delete an Expense**
app.delete("/expenses/:id", authenticateUser, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM expenses WHERE id = $1 AND email = $2", [id, req.user.email]);
    res.json({ message: "Expense deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// 🔹 **Preflight CORS Handling**
app.options("*", cors());

// ✅ **Start Server**
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
