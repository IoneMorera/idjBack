const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, adminMiddleware, userController.getAllUsers);
router.get('/:id', authMiddleware, adminMiddleware, userController.getUserById);
router.patch('/:id/role', authMiddleware, adminMiddleware, userController.updateUserRole);
router.delete('/:id', authMiddleware, adminMiddleware, userController.deleteUser);

module.exports = router;
