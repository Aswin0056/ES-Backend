const express = require("express");
const router = express.Router();
const pool = require("./db"); // Make sure this is correct

// Get all comments
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM comments ORDER BY date DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Post a new comment
router.post("/", async (req, res) => {
  try {
    const { gmail, text } = req.body;

    if (!gmail || !text) {
      return res.status(400).json({ error: "Gmail and comment text are required" });
    }

    const result = await pool.query(
      "INSERT INTO comments (gmail, text) VALUES ($1, $2) RETURNING *",
      [gmail, text]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to save comment" });
  }
});

module.exports = router;
