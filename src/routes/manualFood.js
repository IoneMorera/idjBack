const express = require('express');
const router = express.Router({ mergeParams: true });
const manualFoodController = require('../controllers/manualFoodController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.patch('/enabled', authMiddleware, adminMiddleware, manualFoodController.setEnabled);
router.patch('/closed', authMiddleware, adminMiddleware, manualFoodController.setClosed);
router.get('/options', authMiddleware, adminMiddleware, manualFoodController.getOptions);
router.post('/options', authMiddleware, adminMiddleware, manualFoodController.createOption);
router.put('/options/:optionId', authMiddleware, adminMiddleware, manualFoodController.updateOption);
router.delete('/options/:optionId', authMiddleware, adminMiddleware, manualFoodController.deleteOption);
router.get('/summary', authMiddleware, adminMiddleware, manualFoodController.getAdminSummary);
router.put('/payments', authMiddleware, adminMiddleware, manualFoodController.setPayment);
router.put('/payments/confirm', authMiddleware, adminMiddleware, manualFoodController.confirmPayment);
router.get('/mine', authMiddleware, manualFoodController.getMine);
router.put('/mine', authMiddleware, manualFoodController.saveMine);

module.exports = router;
