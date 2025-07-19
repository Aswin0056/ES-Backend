const express = require("express");
const router = express.Router();
const pool = require("./db"); // DB connection

router.post('/', async (req, res) => {
  const userInput = (req.body.input || '').trim().toLowerCase();

  let reply = '';

  // Math evaluation
  const mathResult = evaluateMath(userInput);
  if (mathResult !== null) {
    reply = `The answer is ${mathResult}`;
  } else if (userInput.includes('what is expensaver')) {
    reply = 'Expensaver is your personal expense tracker app. You can track income, expenses, set budgets, and more!';
  } else if (userInput.includes('how to add expense')) {
    reply = 'To add an expense, go to the Home tab, click the "+" button, fill out the amount and category, then save.';
  } else if (userInput.includes('can i track income')) {
    reply = 'Yes! You can track both income and expenses easily using the Income tab.';
  } else if (userInput.includes('is my data safe')) {
    reply = 'Absolutely! Your data is stored securely and only accessible by you.';
  } else {
    reply = `I'm ES AI 👋 your assistant for Expensaver! \n\nHow can I help you? 😊`;
  }

  // Save to DB
  try {
    await pool.query(
      'INSERT INTO esai_logs (question, answer) VALUES ($1, $2)',
      [userInput, reply]
    );
  } catch (err) {
    console.error('Failed to save ES AI log:', err);
  }

  res.json({ reply });
});

function evaluateMath(text) {
  try {
    const cleaned = text.replace(/[^-()\d/*+.]/g, '');
    if (!cleaned || isNaN(eval(cleaned))) return null;
    return eval(cleaned);
  } catch {
    return null;
  }
}

module.exports = router;
