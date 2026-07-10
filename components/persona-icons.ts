import Ionicons from '@expo/vector-icons/Ionicons';
import type { Persona } from '../lib/personas';

/** Icon per persona — a UI concern kept out of the pure `lib/personas` registry
 *  (which stays React-free) so the glyph name is typed against Ionicons here.
 *  Shared by the onboarding "Chi sei?" picker and the Settings persona row so the
 *  role→glyph mapping has a single source and cannot drift between the two. */
export const PERSONA_ICONS: Record<Persona, keyof typeof Ionicons.glyphMap> = {
  professionista: 'construct-outline',
  compravendita: 'home-outline',
  impresa: 'business-outline',
  cittadino: 'people-outline',
  esplora: 'compass-outline',
};
