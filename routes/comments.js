const express = require("express");
const router = express.Router();
const pool = require("./db"); // Make sure this is correct

// Get all comments (ordered by the latest)
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM comments ORDER BY created_at DESC");
    res.json(result.rows); // Send the comments back as a response
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Post a new comment (with name and email)
router.post("/", async (req, res) => {
  try {
    const { name, email, text } = req.body; // Get name, email, and comment text from request body

    if (!name || !email || !text) {
      return res.status(400).json({ error: "Name, email, and comment text are required" });
    }

    // Insert comment into the database
    const result = await pool.query(
      "INSERT INTO comments (name, email, text) VALUES ($1, $2, $3) RETURNING *",
      [name, email, text]
    );

    res.status(201).json(result.rows[0]); // Return the newly created comment
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to save comment" });
  }
});

module.exports = router;
