import express from 'express';
import * as pinController from '../controllers/pin.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);

router.get('/transaction-pin', pinController.getPinStatus);
router.post('/transaction-pin', pinController.setTransactionPin);
router.patch('/transaction-pin', pinController.changeTransactionPin);

export default router;
