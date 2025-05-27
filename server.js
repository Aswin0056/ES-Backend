require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const compression = require("compression");
const helmet = require("helmet");
const app = express();
const PORT = process.env.PORT || 5000;
const router = express.Router();
const { createBackup } = require('./database'); // adjust path if needed

// ✅ PostgreSQL Connection
if (!process.env.DATABASE_URL) {
  console.error("❌ ERROR: Missing DATABASE_URL in environment variables!");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ✅ Middleware
app.use(compression()); // Enable Gzip Compression
app.use(helmet()); // Security Headers
app.use(express.json()); // Parse JSON Requests
app.use(bodyParser.json()); // Parse JSON
app.use(express.urlencoded({ extended: true })); // Parse URL-Encoded Data


app.use(
  cors({
    origin: "*", // Allow any domain
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);


app.use(express.json());

// // Token creation:
// const generateToken = (user) => {
//   return jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: "1h" });
// };

const generateToken = (user) => {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET
    // No expiresIn
  );
};




// Authentication middleware:
const authenticateToken = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  if (!authHeader) return res.status(401).json({ error: "Access denied, token missing" });

  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Invalid token format" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;

    // 🔒 Verify token matches stored token in DB (only for regular users)
    if (verified.userId) {
      const result = await pool.query("SELECT token FROM users WHERE id = $1", [verified.userId]);

      if (result.rows.length === 0 || result.rows[0].token !== token) {
        return res.status(403).json({ error: "Token mismatch. Please log in again." });
      }
    }

    console.log("✅ Authenticated User:", verified);
    next();
  } catch (error) {
    console.error("❌ Invalid Token:", error.message);
    res.status(403).json({ error: "Invalid or expired token" });
  }
};



app.post('/export', async (req, res) => {
  const {
    fileFormat, includeHeaders, selectedSheets,
    dateFormat, includeFormulas, passwordProtect, password
  } = req.body;

  // Generate a workbook using exceljs or similar
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Export');

  // Fill worksheet here based on options...

  res.setHeader(
    'Content-Disposition',
    `attachment; filename=export.${fileFormat}`
  );
  res.setHeader(
    'Content-Type',
    fileFormat === 'csv' ? 'text/csv' : 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  if (fileFormat === 'csv') {
    await workbook.csv.write(res);
  } else {
    await workbook.xlsx.write(res);
  }
});


let bannerText = " Welcome to ExpenSaver if you got any updates you can see in this banner "; // Default banner text

// GET /banner-text - returns current banner text
app.get('/banner-text', (req, res) => {
  res.json({ text: bannerText });
});

// POST /banner-text - update banner text (you can add auth here)
app.post('/banner-text', (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Invalid banner text' });
  }
  bannerText = text;
  res.json({ message: 'Banner text updated', text: bannerText });
});


// 🟢 REGISTER USER
app.post("/register", async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    if (!username || !password || (!email && !phone)) {
      return res.status(400).json({ error: "Username, password, and either email or phone are required." });
    }

    const existingUser = email
      ? await pool.query("SELECT * FROM users WHERE email = $1", [email])
      : await pool.query("SELECT * FROM users WHERE phone = $1", [phone]);

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "User already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 8);

    const newUser = await pool.query(
      "INSERT INTO users (username, email, phone, password) VALUES ($1, $2, $3, $4) RETURNING id, username, email, phone",
      [username, email || null, phone || null, hashedPassword]
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
    const { email, phone, password } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({ error: "Email or phone and password are required." });
    }

    let user;

    if (email) {
      // Admin login check
      const admin = await pool.query("SELECT * FROM admin_settings WHERE admin_email = $1", [email]);
      if (admin.rows.length > 0) {
        const isAdminMatch = await bcrypt.compare(password, admin.rows[0].password);
        if (!isAdminMatch) {
          return res.status(401).json({ error: "Invalid credentials" });
        }
        const token = jwt.sign({ email: admin.rows[0].admin_email, role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1h" });

        return res.json({
          message: "Admin login successful",
          token,
          user: { email: admin.rows[0].admin_email, role: "admin" }
        });
      }

      // Regular user login by email
      const query = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
      if (query.rows.length === 0) {
        return res.status(401).json({ error: "User not found" });
      }
      user = query.rows[0];

    } else {
      // Regular user login by phone
      const query = await pool.query("SELECT * FROM users WHERE phone = $1", [phone]);
      if (query.rows.length === 0) {
        return res.status(401).json({ error: "User not found" });
      }
      user = query.rows[0];
    }

    // Password validation
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email, phone: user.phone, username: user.username, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // ✅ Store the token in the users table (fixes your /expenses issue)
    await pool.query("UPDATE users SET token = $1 WHERE id = $2", [token, user.id]);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone
      }
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
    const { sheet } = req.query;

    const query = sheet
      ? "SELECT * FROM expenses WHERE user_id = $1 AND sheet = $2"
      : "SELECT * FROM expenses WHERE user_id = $1";

    const values = sheet ? [req.user.userId, sheet] : [req.user.userId];

    const expenses = await pool.query(query, values);
    res.json(expenses.rows);
  } catch (error) {
    console.error("Fetch Expenses Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});


// 🟡 ADD EXPENSE (Protected)
app.post("/expenses", authenticateToken, async (req, res) => {
  try {
    const { title, amount, quantity, sheet } = req.body;

    if (!title || !amount || !sheet) {
      return res.status(400).json({ error: "Title, amount, and sheet are required" });
    }

    const userQuery = await pool.query("SELECT id FROM users WHERE email = $1", [req.user.email]);
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = userQuery.rows[0].id;

    const newExpense = await pool.query(
      "INSERT INTO expenses (user_id, title, amount, quantity, sheet) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [userId, title, amount, quantity || 1, sheet]
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
    const { title, amount, quantity, sheet } = req.body;

    const updatedExpense = await pool.query(
      "UPDATE expenses SET title = $1, amount = $2, quantity = $3, sheet = $4 WHERE id = $5 AND user_id = $6 RETURNING *",
      [title, amount, quantity, sheet, id, req.user.userId]
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


app.get("/sheets", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT DISTINCT sheet FROM expenses WHERE user_id = $1",
      [req.user.userId]
    );
    const sheets = result.rows.map(row => row.sheet);
    res.json({ sheets });
  } catch (error) {
    console.error("Fetch Sheets Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/sheets", authenticateToken, async (req, res) => {
  const { sheetName } = req.body;

  if (!sheetName) {
    return res.status(400).json({ error: "Sheet name is required" });
  }

  try {
    // Insert a dummy row in expenses with 0 amount just to register a new sheet
    await pool.query(
      "INSERT INTO expenses (user_id, title, amount, quantity, sheet) VALUES ($1, $2, $3, $4, $5)",
      [req.user.userId, 'Sheet Created', 0, 1, sheetName]
    );

    res.status(201).json({ sheetName });
  } catch (error) {
    console.error("Create Sheet Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});


// comments section
app.use(cors());
app.use(bodyParser.json());

// Import routes
const commentsRouter = require("./routes/comments");  // Ensure this path is correct
app.use("/comments", commentsRouter);  // Make sure this matches the frontend request

// comments section

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/");
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ storage });

// API to upload image
app.post("/upload", upload.single("profileImage"), async (req, res) => {
    try {
        const imageUrl = `/uploads/${req.file.filename}`; // Store relative path
        const userId = req.body.userId;

        // Store in PostgreSQL
        await pool.query("UPDATE users SET profile_image = $1 WHERE id = $2", [imageUrl, userId]);

        res.json({ success: true, imageUrl });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});

// DELETE all expenses for the logged-in user
app.delete('/api/settings/expenses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Delete all expenses for user
    const result = await pool.query(
      'DELETE FROM expenses WHERE user_id = $1',
      [userId]
    );

    res.json({ message: `All expenses deleted for user ${userId}` });
  } catch (error) {
    console.error('Delete All Expenses Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE all sheets for the logged-in user
app.delete('/api/settings/sheets', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Assuming sheets are identified by the distinct 'sheet' value in expenses
    // Delete all expenses (and so sheets) for user
    await pool.query(
      'DELETE FROM expenses WHERE user_id = $1',
      [userId]
    );

    res.json({ message: `All sheets deleted for user ${userId}` });
  } catch (error) {
    console.error('Delete All Sheets Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE a specific sheet (by sheet name or id) for the logged-in user
app.delete('/api/settings/sheets/:sheetName', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sheetName } = req.params;

    // Delete expenses belonging to the specific sheet
    const result = await pool.query(
      'DELETE FROM expenses WHERE user_id = $1 AND sheet = $2 RETURNING *',
      [userId, sheetName]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Sheet not found or unauthorized' });
    }

    res.json({ message: `Sheet '${sheetName}' deleted successfully` });
  } catch (error) {
    console.error('Delete Specific Sheet Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST to update auto-delete setting for user
app.post('/api/settings/auto-delete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { setting } = req.body; // e.g., '12h', '30d', 'off'

    // Upsert user's auto-delete setting in a table, e.g. user_settings
    // Let's assume you have a table user_settings(user_id PK, auto_delete_setting TEXT)

    // First, check if a setting row exists
    const existing = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );

    if (existing.rowCount === 0) {
      // Insert new
      await pool.query(
        'INSERT INTO user_settings (user_id, auto_delete_setting) VALUES ($1, $2)',
        [userId, setting]
      );
    } else {
      // Update existing
      await pool.query(
        'UPDATE user_settings SET auto_delete_setting = $1 WHERE user_id = $2',
        [setting, userId]
      );
    }

    res.json({ message: 'Auto-delete setting updated successfully' });
  } catch (error) {
    console.error('Update Auto-Delete Setting Error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});




app.put('/change-password', authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  if (!userId) return res.status(401).json({ message: "Unauthorized: User ID missing from token" });

  const { oldPassword, newPassword } = req.body;

  try {
    // Fetch user from DB
    const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    if (userResult.rowCount === 0) return res.status(404).json({ message: 'User not found' });

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) return res.status(400).json({ message: 'Old password incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// delete account

app.delete('/delete-account', authenticateToken, async (req, res) => {
  const userId = req.user.userId; // Corrected property name from token
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: 'Password is required' });
  }

  try {
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const passwordHash = result.rows[0].password; // Adjust column name if needed

    const isMatch = await bcrypt.compare(password, passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({ message: 'Account successfully deleted' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});




// Serve uploaded images statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/dashboard", authenticateToken, async (req, res) => {
  try {
    console.log("Fetching last expense for user:", req.user.userId);

    const lastExpense = await pool.query(
      "SELECT * FROM expenses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [req.user.userId]
    );

    if (lastExpense.rows.length === 0) {
      console.log("No expenses found for user.");
      return res.json({ lastExpense: null });
    }

    console.log("Last Expense Found:", lastExpense.rows[0]);
    res.json({ lastExpense: lastExpense.rows[0] });
  } catch (error) {
    console.error("❌ Dashboard Fetch Error:", error.message);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/admin-email", async (req, res) => {
    try {
        const result = await pool.query("SELECT admin_email FROM admin_settings LIMIT 1");
        if (result.rows.length > 0) {
            res.json({ adminEmail: result.rows[0].admin_email });
        } else {
            res.status(404).json({ message: "Admin email not found" });
        }
    } catch (error) {
        console.error("Error fetching admin email:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

module.exports = router;

const saltRounds = 10;
const plainPassword = "Admin056#"; // Change this to your preferred admin password

bcrypt.hash(plainPassword, saltRounds, (err, hash) => {
  if (err) {
    console.error("Error hashing password:", err);
  } else {
    console.log(`UPDATE admin_settings SET password = '${hash}' WHERE admin_email = 'expensaver.admin@gmail.com';`);
  }
});


app.get("/", (req, res) => {
  res.send("Azh Studio Backend is alive! 🚀");
});

router.get("/", (req, res) => {
  res.send("Azh Studio API is running! ✅");
});

app.get('/api/backup', createBackup);

// Backend ping route
app.get("/api/ping", (req, res) => {
  res.json({ message: "pong" });
});


// ✅ Keep Server Warm (Prevent Cold Starts)
setInterval(() => {
  fetch(`${process.env.BACKEND_URL}`).catch(() => {}); 
}, 3 * 60 * 1000); // Every 3 minutes



// 🚀 Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`⚙️ Connected to Postgres database`);
});
