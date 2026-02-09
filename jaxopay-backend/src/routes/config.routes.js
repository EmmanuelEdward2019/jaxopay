import express from 'express';
import { getPublicFeatureToggles, getPlatformConfig } from '../controllers/config.controller.js';

const router = express.Router();

router.get('/toggles', getPublicFeatureToggles);
router.get('/platform', getPlatformConfig);

export default router;
