// Container capacities
export const BAG_CAPACITY = 5;
export const CART_CAPACITY = 10;

// History tracking
export const MAX_HISTORY = 30;

// Container dimensions (percentages for responsive layout)
export const CONTAINER_DIMENSIONS = {
  bag: {
    width: 80,
    height: 100,
  },
  cart: {
    width: 120,
    height: 80,
  },
};

// Colors
export const COLORS = {
  soccer: '#f5f5dc', // beige/cream for soccer ball
  basketball: '#e87025', // orange for basketball
  bag: '#8b4513', // saddle brown for bag
  bagHandle: '#654321', // darker brown for handle
  cart: '#4a4a4a', // dark gray for cart
  cartWheels: '#2a2a2a', // darker gray for wheels
  shelf: '#d4a574', // wood color for shelf
  playArea: '#90ee90', // light green for grass/court
  success: '#4caf50',
  error: '#f44336',
  warning: '#ff9800',
  info: '#2196f3',
};

// Animation durations (ms)
export const ANIMATIONS = {
  ballDrop: 300,
  containerSlide: 400,
  bundleCreate: 500,
  celebration: 1500,
  hintDelay: 5000,
};

// Play area bounds (percentages)
export const PLAY_AREA = {
  minX: 5,
  maxX: 95,
  minY: 10,
  maxY: 90,
  ballSize: 40, // pixels
};

// Shelf configuration
export const SHELF = {
  height: 120,
  padding: 10,
};

// Z-index layers
export const Z_INDEX = {
  playArea: 1,
  balls: 10,
  containers: 20,
  draggedItem: 100,
  modal: 1000,
};
