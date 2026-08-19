import type { HouseSpec } from '../house';
import { DEFAULT_OFFICE_FURNITURE, DEFAULT_OFFICE_SPEC } from '../../../shared/office-default';

/** Escritório modelo. O arquivo é o seed; a cópia viva fica no SQLite. Ver docs/houses/AUTHORING.md. */

export const OFFICE_HOUSE: HouseSpec = {
  ...DEFAULT_OFFICE_SPEC,
  furniture: DEFAULT_OFFICE_FURNITURE,
};
