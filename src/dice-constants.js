/**
 * dice-constants.js — Shared constants for the 3D dice system
 */

// Debug mode — enables OrbitControls camera and continuous render loop
export const DEBUG = true;

// Physics
export const GRAVITY = -50;
export const FLOOR_Y = 0;
export const WALL_DISTANCE = 4.5;

// Dice sizing
export const DIE_SIZE = 0.8;
export const THROW_HEIGHT = 8;
export const CHAMFER = 0.85; // Edge chamfer factor (1 = no chamfer, 0.9 = heavy)

// Per-type size multipliers — d10/d12 geometries spread wider, so scale them down
export const DIE_SCALE = { d4: 1, d6: 1, d8: 1, d10: 0.85, d12: 0.88, d20: 1 };

// Settling detection
export const SETTLE_THRESHOLD = 0.05;
export const SETTLE_FRAMES = 30;

// Hexagonal mat
export const MAT_RADIUS = 5;
export const BORDER_HEIGHT = 1.8; // Raised border height (~d20 height)
export const MAT_REFLECTIVITY = 0.9; // Hex mat surface reflectivity (0 = matte, 1 = mirror)

// Dice texture
export const BG_TEXTURE_SCALE = 4; // bg.jpg repeat scale on dice faces
export const DICE_SHININESS = 200; // Phong shininess for glossy plastic look
