/**
 * dice-constants.js — Shared constants for the 3D dice system
 */

// Debug mode — enables OrbitControls camera and continuous render loop
export const DEBUG = false;

// Camera
export const CAMERA_POS = [0, 5, 7]; // Default camera position [x, y, z]
export const SCORE_ORBIT_SPEED = 0.15; // Radians per second for score orbit (counterclockwise)

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
export const BORDER_HEIGHT = 0.2; // Raised border height (~d20 height)
export const MAT_REFLECTIVITY = 0.1; // Hex mat surface reflectivity (0 = matte, 1 = mirror)
export const MAT_ROUGHNESS = 0.2;   // Mat roughness (1 = fully matte/no specular, 0 = glossy)
export const MAT_METALNESS = 0;    // Mat metalness (0 = dielectric, 1 = metallic)
export const MAT_COLOR = 0x020204;   // Mat base color

// Dice texture
export const BG_TEXTURE_SCALE = 4; // bg.jpg repeat scale on dice faces
export const DICE_SHININESS = 200; // Phong shininess for glossy plastic look

// Orbiting edge lights
export const ORBIT_LIGHT_COUNT = 12;        // Number of orbiting lights
export const ORBIT_LIGHT_SPEED = 0.1;      // Base radians per second (clockwise)
export const ORBIT_LIGHT_INTENSITY = 200;   // PointLight intensity
export const ORBIT_LIGHT_HEIGHT = 4.0;     // Base height above the mat
export const ORBIT_LIGHT_COLOR = 0xffffff; // Light color
export const ORBIT_LIGHT_DISTANCE = 15;     // Distance from center (farther than mat edge)

// Main scene lighting
export const AMBIENT_INTENSITY = 2.6;      // Ambient light intensity
export const MAIN_LIGHT_INTENSITY = 2.2;   // Main directional light intensity
export const MAIN_LIGHT_COLOR = 0xffffff;  // Main light color
export const MAIN_LIGHT_POS = [0, 15, 5];  // Main light position [x, y, z]
export const FILL_LIGHT_1_INTENSITY = 0.8; // Fill light 1 intensity
export const FILL_LIGHT_2_INTENSITY = 0.6; // Fill light 2 intensity
