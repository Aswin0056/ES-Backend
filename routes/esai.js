// routes/esai.js
const express = require("express");
const router = express.Router();
const pool = require("./db"); // Make sure this is correct


router.post('/', (req, res) => {
  const userInput = req.body.input?.trim().toLowerCase() || '';

  // Handle math
  const mathResult = evaluateMath(userInput);
  if (mathResult !== null) {
    return res.json({ reply: `The answer is ${mathResult}` });
  }

  // Predefined replies
  if (userInput.includes('what is expensaver')) {
    return res.json({
      reply: 'Expensaver is your personal expense tracker app. You can track income, expenses, set budgets, and more!',
    });
  }

  if (userInput.includes('how to add expense')) {
    return res.json({
      reply: 'To add an expense, go to the Home tab, click the "+" button, fill out the amount and category, then save.',
    });
  }

  if (userInput.includes('can i track income')) {
    return res.json({
      reply: 'Yes! You can track both income and expenses easily using the Income tab.',
    });
  }

  if (userInput.includes('is my data safe')) {
    return res.json({
      reply: 'Absolutely! Your data is stored securely and only accessible by you.',
    });
  }

  // Default fallback
  return res.json({
    reply: `I'm ES AI 👋 your assistant for Expensaver! \n\nHow can I help you? 😊`,
  });
});

// Basic math evaluator
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
