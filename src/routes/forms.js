const express = require('express');
const router = express.Router();
const formController = require('../controllers/formController');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

// Público (para usuarios autenticados): obtener formulario de un evento
router.get('/event/:eventId', authMiddleware, formController.getEventForm);

// Admin: gestión de bloques
router.post('/event/:eventId/blocks', authMiddleware, adminMiddleware, formController.createBlock);
router.put('/blocks/:blockId', authMiddleware, adminMiddleware, formController.updateBlock);
router.delete('/blocks/:blockId', authMiddleware, adminMiddleware, formController.deleteBlock);

// Admin: gestión de campos
router.post('/blocks/:blockId/fields', authMiddleware, adminMiddleware, formController.createField);
router.put('/fields/:fieldId', authMiddleware, adminMiddleware, formController.updateField);
router.delete('/fields/:fieldId', authMiddleware, adminMiddleware, formController.deleteField);

// Admin: opciones de campos
router.put('/fields/:fieldId/options', authMiddleware, adminMiddleware, formController.setFieldOptions);

module.exports = router;
