require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ PostgreSQL Connection
if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR: Missing DATABASE_URL in environment variables!");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

// ✅ CORS Configuration
const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:3000", "https://expensaver.netlify.app"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS Policy: Not allowed"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// 🔑 JWT Token Generation
const generateToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
};

// 🔐 Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) return res.status(401).json({ error: "Access denied, token missing" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Invalid token format" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    console.log("✅ Authenticated User:", verified);
    next();
  } catch (error) {
    console.error("❌ Invalid Token:", error.message);
    res.status(403).json({ error: "Invalid or expired token" });
  }
};

// 🟢 REGISTER USER
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required" });
    }

    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email",
      [username, email, hashedPassword]
    );

    const token = generateToken(newUser.rows[0]);
    res.status(201).json({ message: "Registration successful!", token, user: newUser.rows[0] });
  } catch (error) {
    console.error("Register Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// 🔵 LOGIN USER
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const userQuery = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userQuery.rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = userQuery.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user);
    res.json({
      message: "Login successful",
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error("Login Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ ADMIN: Get All Users and Their Expenses
app.get("/admin/users-expenses", authenticateToken, async (req, res) => {
  try {
    if (req.user.email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: "Access denied: Admins only" });
    }

    const usersWithExpenses = await pool.query(`
      SELECT users.id, users.username, users.email, 
             COALESCE(json_agg(expenses) FILTER (WHERE expenses.id IS NOT NULL), '[]') AS expenses
      FROM users
      LEFT JOIN expenses ON users.id = expenses.user_id
      GROUP BY users.id, users.username, users.email
    `);

    res.json(usersWithExpenses.rows);
  } catch (error) {
    console.error("❌ Admin Users-Expenses Error:", error.message);
    res.status(500).json({ error: "Server error", details: error.message });
  }
});

// 🟡 ADD EXPENSE
app.get("/expenses", authenticateToken, async (req, res) => {
  try {
    const expenses = await pool.query("SELECT * FROM expenses WHERE user_id = $1", [req.user.userId]);
    res.json(expenses.rows);
  } catch (error) {
    console.error("Fetch Expenses Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// 🟡 ADD EXPENSE (Protected)
app.post("/expenses", authenticateToken, async (req, res) => {
  try {
    const { title, amount, quantity } = req.body;

    if (!title || !amount) {
      return res.status(400).json({ error: "Title and amount are required" });
    }

    // Find user by email
    const userQuery = await pool.query("SELECT id FROM users WHERE email = $1", [req.user.email]);

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = userQuery.rows[0].id;

    // Insert expense into database
    const newExpense = await pool.query(
      "INSERT INTO expenses (user_id, title, amount, quantity) VALUES ($1, $2, $3, $4) RETURNING *",
      [userId, title, amount, quantity || 1]
    );

    res.status(201).json({ message: "Expense added successfully!", expense: newExpense.rows[0] });
  } catch (error) {
    console.error("Add Expense Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});



// 🔴 DELETE EXPENSE (Protected)
app.put("/expenses/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, amount, quantity } = req.body;

    const updatedExpense = await pool.query(
      "UPDATE expenses SET title = $1, amount = $2, quantity = $3 WHERE id = $4 AND user_id = $5 RETURNING *",
      [title, amount, quantity, id, req.user.userId]
    );

    if (updatedExpense.rowCount === 0) {
      return res.status(404).json({ error: "Expense not found or unauthorized" });
    }

    res.json({ message: "Expense updated successfully!", expense: updatedExpense.rows[0] });
  } catch (error) {
    console.error("Update Expense Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

// 🔹 Delete Expense
app.delete("/expenses/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedExpense = await pool.query(
      "DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING *",
      [id, req.user.userId]
    );

    if (deletedExpense.rowCount === 0) {
      return res.status(404).json({ error: "Expense not found or unauthorized" });
    }

    res.json({ message: "Expense deleted successfully!" });
  } catch (error) {
    console.error("Delete Expense Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});


app.put("/update-expense/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, amount, quantity } = req.body;
    await pool.query(
      "UPDATE expenses SET title = $1, amount = $2, quantity = $3 WHERE id = $4",
      [title, amount, quantity, id]
    );
    res.json({ message: "Expense updated successfully" });
  } catch (error) {
    console.error("Update Expense Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});


app.delete("/delete-expense/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM expenses WHERE id = $1", [id]);
    res.json({ message: "Expense deleted successfully" });
  } catch (error) {
    console.error("Delete Expense Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/comments", async (req, res) => {
  const { gmail, text } = req.body;

  if (!gmail || !text) {
      return res.status(400).json({ error: "Gmail and comment text are required" });
  }

  try {
      const result = await db.query(
          "INSERT INTO comments (gmail, text) VALUES ($1, $2) RETURNING *",
          [gmail, text]
      );
      res.json(result.rows[0]);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});

app.post("/comments", async (req, res) => {
  const { gmail, text } = req.body;

  if (!gmail || !text) {
      return res.status(400).json({ error: "Gmail and comment text are required" });
  }

  try {
      const result = await db.query(
          "INSERT INTO comments (gmail, text) VALUES ($1, $2) RETURNING *",
          [gmail, text]
      );
      res.json(result.rows[0]);
  } catch (error) {
      console.error("Database error:", error);
      res.status(500).json({ error: error.message });
  }
});

app.get("/comments", async (req, res) => {
  try {
      const result = await db.query("SELECT * FROM comments ORDER BY created_at DESC");
      res.json(result.rows);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
});



// 🚀 Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
