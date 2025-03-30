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
  