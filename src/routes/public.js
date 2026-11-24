const express = require('express');
const router = express.Router();
const publicPageController = require('../controllers/publicPageController');
const siteController = require('../controllers/siteController');

router.get('/header', siteController.getPublicHeader);
router.get('/pages/:slug', publicPageController.getPublishedPage);
router.get('/route', publicPageController.getPublishedRoute);

module.exports = router;
