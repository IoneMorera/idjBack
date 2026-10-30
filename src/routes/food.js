const express = require('express');
const router = express.Router({ mergeParams: true });
const foodController = require('../controllers/foodController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.post('/catalog/sync', authMiddleware, adminMiddleware, foodController.syncCatalog);
router.get('/dishes', authMiddleware, foodController.getDishes);
router.get('/orders/export', authMiddleware, adminMiddleware, foodController.exportOrdersCsv);
router.get('/orders', authMiddleware, adminMiddleware, foodController.getAllOrders);
router.get('/orders/mine', authMiddleware, foodController.getMyOrders);
router.post('/orders', authMiddleware, foodController.upsertOrder);
router.delete('/orders/:itemId', authMiddleware, foodController.deleteOrderItem);

module.exports = router;
