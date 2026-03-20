import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import { getGeos, createGeo, deleteGeo } from './geo.controller';
import { createGeoValidators } from '../../validators/geo.validators';
import { idParamValidators } from '../../validators/idParam.validators';

const router = Router();

router.get('/geos', authenticate, asyncHandler(getGeos));
router.post('/geos', authenticate, validate(createGeoValidators), asyncHandler(createGeo));
router.delete('/geos/:id', authenticate, validate(idParamValidators), asyncHandler(deleteGeo));

export default router;
