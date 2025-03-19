require("dotenv").config();
const express = require("express");
const mysql = require('mysql2');  // or 'mysql'
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cors());

// MySQL Database Connection
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error("Database connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL Database");
  }
});

// Generate JWT Token
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
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

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (results.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
      [username, email, hashedPassword],
      (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ message: "Registration successful!" });
      }
    );
  });
});

// 🔹 **User Login**
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const sql = "SELECT * FROM users WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ error: "Server error" });
    if (results.length === 0) return res.status(400).json({ error: "User not found" });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user);
    res.json({ message: "Login successful", token, username: user.username });
  });
});

// 🔹 **Fetch User Profile**
// Fetch User Profile (Modify this route)
app.get("/user", authenticateUser, (req, res) => {
  const email = req.user.email;
  db.query("SELECT username, email FROM users WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (results.length === 0) return res.status(404).json({ error: "User not found" });

    res.json({ username: results[0].username, email: results[0].email });
  });
});




// 🔹 **Add Expense**
app.post("/add-expense", authenticateUser, (req, res) => {
  const { title, amount, quantity } = req.body;
  const email = req.user.email;

  if (!title || !amount) {
    return res.status(400).json({ error: "Title and Amount are required" });
  }

  const sql = "INSERT INTO expenses (email, title, amount, quantity, created_at) VALUES (?, ?, ?, ?, NOW())";
  db.query(sql, [email, title, amount, quantity || null], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });

    res.status(201).json({ message: "Expense added successfully!", insertId: result.insertId });
  });
});

// 🔹 **Fetch Expenses for Logged-in User**
app.get("/expenses", authenticateUser, (req, res) => {
  const email = req.user.email;

  const sql = "SELECT * FROM expenses WHERE email = ? ORDER BY created_at DESC";
  db.query(sql, [email], (err, results) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json(results);
  });
});

// 🔹 **Update Expense**
app.put("/update-expense/:id", authenticateUser, (req, res) => {
  const { title, amount, quantity } = req.body;
  const { id } = req.params;
  const email = req.user.email;

  const query = "UPDATE expenses SET title = ?, amount = ?, quantity = ? WHERE id = ? AND email = ?";
  db.query(query, [title, amount, quantity, id, email], (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json({ message: "Expense updated successfully" });
  });
});

// 🔹 **Delete Expense**
app.delete("/delete-expense/:id", authenticateUser, (req, res) => {
  const { id } = req.params;
  const email = req.user.email;

  const query = "DELETE FROM expenses WHERE id = ? AND email = ?";
  db.query(query, [id, email], (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json({ message: "Expense deleted successfully" });
  });
});

app.get("/last-expense", authenticateUser, (req, res) => {
  const userId = req.user.id; // ✅ Ensure it uses userId

  db.query("SELECT * FROM expenses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", [userId], (err, results) => {
    if (err) return res.status(500).json({ error: "Failed to fetch last expense" });

    res.json(results.length ? results[0] : null);
  });
});


// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
