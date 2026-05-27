const express = require('express');
const router = express.Router();
const fareController = require('../controllers/fareController');
const authMiddleware = require('../middleware/auth');

router.post('/calculate', authMiddleware, fareController.calculateFare);
router.get('/preview', authMiddleware, fareController.previewFares);

module.exports = router;
