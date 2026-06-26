import express from 'express';
import * as beneficiaryController from '../controllers/beneficiary.controller.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);

router.get('/', beneficiaryController.listBeneficiaries);
router.post('/', beneficiaryController.createBeneficiary);
router.delete('/:id', beneficiaryController.deleteBeneficiary);

export default router;
