const express = require('express');
const router = express.Router({ mergeParams: true });
const tariffController = require('../controllers/tariffController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, tariffController.getTariffs);
router.post('/', authMiddleware, adminMiddleware, tariffController.createTariff);
router.put('/:tariffId', authMiddleware, adminMiddleware, tariffController.updateTariff);
router.delete('/:tariffId', authMiddleware, adminMiddleware, tariffController.deleteTariff);

module.exports = router;
