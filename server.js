require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());
app.use(cors());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect((err) => {
  if (err) {
    console.error("PostgreSQL connection failed:", err);
  } else {
    console.log("✅ Connected to PostgreSQL Database");
  }
});

// 🔹 Generate JWT Token with Refresh Token Support
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

// 🔹 Middleware for authentication
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No Token Provided" });
  }
  const extractedToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;
  jwt.verify(extractedToken, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Session expired. Please log in again." });
    }
    req.user = decoded;
    next();
  });
};

// 🔹 User Registration
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  try {
    const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
      [username, email, hashedPassword]
    );
    res.json({ message: "Registration successful!" });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// 🔹 User Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login request received:", email); // Debugging line

    // Correct PostgreSQL query
    const userQuery = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = userQuery.rows[0];

    if (!user) return res.status(401).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid password" });

    // Generate JWT tokens
    const { accessToken, refreshToken } = generateToken(user);

    res.json({ message: "Login successful", accessToken, refreshToken });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 🔹 Refresh Token Route
app.post("/refresh-token", async (req, res) => {
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

// 🔹 Logout Route
app.post("/logout", (req, res) => {
  res.json({ message: "Logged out successfully" });
});

// 🔹 Protected Route Example
app.get("/dashboard", authenticateUser, async (req, res) => {
  try {
    const userQuery = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    if (userQuery.rows.length === 0) return res.status(403).json({ error: "User not found" });

    res.json({ message: `Welcome ${userQuery.rows[0].username}!`, user: userQuery.rows[0] });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});
const cors = require("cors");

app.use(cors({
  origin: "https://expensaver.netlify.app", // Allow frontend origin
  methods: "GET, POST, PUT, DELETE",
  allowedHeaders: "Content-Type, Authorization"
}));


// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
