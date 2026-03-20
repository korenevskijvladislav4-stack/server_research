import { body } from 'express-validator';
import { ValidationChain } from 'express-validator';

/** Совпадает с geos.code @db.VarChar(10) и полями geo в бонусах/платежах */
const GEO_CODE_MAX = 10;
/** Совпадает с geos.name @db.VarChar(100) */
const GEO_NAME_MAX = 100;

export const createGeoValidators: ValidationChain[] = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Код GEO обязателен')
    .isLength({ max: GEO_CODE_MAX })
    .withMessage(`Код GEO — не более ${GEO_CODE_MAX} символов`),
  body('name').optional().trim().isLength({ max: GEO_NAME_MAX }).withMessage(`Название — не более ${GEO_NAME_MAX} символов`),
];
