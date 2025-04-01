const express = require("express");
const router = express.Router();
const pool = require("./db"); // Make sure the correct pool import is used

// Fetch all comments
router.get("/comments", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM comments ORDER BY date DESC");
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

// Add a comment
router.post("/comments", async (req, res) => {
    const { gmail, text } = req.body;
    if (!gmail || !text) {
        return res.status(400).json({ error: "Gmail and comment text are required" });
    }

    try {
        const newComment = await pool.query(
            "INSERT INTO comments (gmail, text) VALUES ($1, $2) RETURNING *",
            [gmail, text]
        );
        res.json(newComment.rows[0]);
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
});

module.exports = router;
