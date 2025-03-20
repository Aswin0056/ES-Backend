require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
app.use(express.json());
app.use(cors());

// PostgreSQL Database Connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("✅ Connected to PostgreSQL Database");
  }
});

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username }, // Include username
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
};

// Middleware to Authenticate User
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No Token Provided" });
  }

  const extractedToken = token.startsWith("Bearer ") ? token.split(" ")[1] : token;

  jwt.verify(extractedToken, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = decoded;
    next();
  });
};

// 🔹 **User Registration**
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

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user);
    res.json({ message: "Login successful", token, username: user.username });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// 🔹 **Fetch User Profile (Returns Username)**
app.get("/user", authenticateUser, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT username, email FROM users WHERE email = $1",
      [req.user.email]
    );
    res.json(result.rows[0] || {});
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// 🔹 **Add Expense**
app.post("/add-expense", authenticateUser, async (req, res) => {
  const { title, amount, quantity } = req.body;
  const email = req.user.email;

  if (!title || !amount) {
    return res.status(400).json({ error: "Title and Amount are required" });
  }

  try {
    const result = await pool.query(
      "INSERT INTO expenses (email, title, amount, quantity, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *",
      [email, title, amount, quantity || null]
    );
    res.status(201).json({ message: "Expense added successfully!", expense: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// 🔹 **Fetch All Expenses for Logged-in User**
app.get("/expenses", authenticateUser, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, title, amount, quantity, created_at FROM expenses WHERE email = $1 ORDER BY created_at DESC",
      [req.user.email]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// 🔹 **Update Expense**
app.put("/update-expense/:id", authenticateUser, async (req, res) => {
  const { title, amount, quantity } = req.body;
  const { id } = req.params;
  const email = req.user.email;

  try {
    await pool.query(
      "UPDATE expenses SET title = $1, amount = $2, quantity = $3 WHERE id = $4 AND email = $5",
      [title, amount, quantity, id, email]
    );
    res.json({ message: "Expense updated successfully" });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// 🔹 **Delete Expense**
app.delete("/delete-expense/:id", authenticateUser, async (req, res) => {
  const { id } = req.params;
  const email = req.user.email;

  try {
    await pool.query("DELETE FROM expenses WHERE id = $1 AND email = $2", [id, email]);
    res.json({ message: "Expense deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
