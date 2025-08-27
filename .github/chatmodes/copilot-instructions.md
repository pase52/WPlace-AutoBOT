# WPlace AutoBOT - AI Assistant Instructions

## Project Overview

WPlace AutoBOT is a suite of browser automation scripts for the collaborative pixel art platform wplace.live. The project consists of two main JavaScript bookmarklets (`Auto-Farm.js` and `Auto-Image.js`) and a Chrome extension for multi-account management.

## Core Architecture

### Script Distribution Model

- **Bookmarklet Deployment**: Scripts are hosted on GitHub and loaded via `javascript:fetch(...).then(eval)` URLs
- **Single-File Architecture**: Each script is self-contained with embedded UI, CSS, and all dependencies
- **No Build Process**: Scripts run directly in browser without compilation or bundling

### WPlace API Integration

- **Backend Endpoint**: `https://backend.wplace.live/s0/pixel/{regionX}/{regionY}`
- **Pixel Format**: `{ coords: [x, y], colors: [colorId], t: turnstileToken }`
- **Region-Based System**: Canvas divided into regions for batch processing
- **Charge System**: Users have limited "charges" with cooldown periods (typically 30-second cycles)

### Authentication & CAPTCHA

- **Turnstile Integration**: Cloudflare Turnstile tokens required for pixel placement
- **Token Generation**: Automatic invisible widget generation with interactive fallback
- **Multi-Modal Approach**: Generator → Browser automation → Manual pixel placement fallback
- **Token Lifecycle**: 4-minute validity with automatic refresh

## Key Components

### Auto-Farm.js (625 lines)

- **Purpose**: Automatic charge farming for leveling
- **Core Logic**: Random pixel placement in fixed 100x100 region at coordinates (742, 1148)
- **Token Handling**: Intercepts manual pixel placements to capture CAPTCHA tokens
- **Localization**: Portuguese/English based on IP geolocation

### Auto-Image.js (7,844 lines)

- **Purpose**: Large-scale pixel art painting from uploaded images
- **Color System**: 64-color palette with advanced matching algorithms (deltaE, chroma penalty)
- **Batch Processing**: Dynamic batch sizes (1-1000 pixels) with region management
- **Overlay System**: Real-time canvas overlay for positioning and progress tracking
- **Multi-Language**: 13 languages (EN, PT, RU, UK, FR, DE, NL, VI, ID, ZH-CN, ZH-TW, JA, KO, TR)

### AccountSwapper Extension

- **Purpose**: Multi-account cookie management
- **Architecture**: Background script + content script + manifest v3
- **Cookie Management**: Preserves 'j' authentication cookies while clearing Cloudflare tokens
- **Auto-Switching**: Triggers on page navigation to wplace.live

## Development Patterns

### Configuration Objects

```javascript
const CONFIG = {
  COOLDOWN_DEFAULT: 31000,
  PAINTING_SPEED: { MIN: 1, MAX: 1000, DEFAULT: 5 },
  COLOR_MAP: {
    /* 64-color definitions with RGB values */
  },
};
```

### State Management

```javascript
const state = {
  running: false,
  paintedPixels: 0,
  currentCharges: 0,
  language: "en",
};
```

### Async Painting Loop Pattern

```javascript
while (state.running && !state.stopFlag) {
  // Check charges and cooldown
  // Process pixel batches
  // Handle token refresh
  // Update UI and statistics
}
```

### Error Handling Strategies

- **Token Errors**: Return "token_error" for 403 responses, trigger regeneration
- **Network Failures**: Exponential backoff with MAX_BATCH_RETRIES (10 attempts)
- **Graceful Degradation**: Multiple fallback methods for CAPTCHA solving

## Critical Implementation Details

### Turnstile Token Management

- **Generator Class**: `Utils.executeTurnstile()` with widget reuse and cleanup
- **Invisible First**: Attempts invisible widget before interactive fallback
- **Caching Strategy**: 4-minute token lifetime with proactive refresh
- **Sitekey Detection**: Auto-detection with fallback to hardcoded value

### Color Matching Algorithm

```javascript
function findClosestColor(targetRgb, availableColors) {
  // Uses deltaE color distance with optional chroma penalty
  // Supports multiple algorithms: "deltaE", "euclidean", "manhattan"
  // Caches results for performance
}
```

### Region-Based Coordinate System

- Canvas divided into regions for API efficiency
- Pixel coordinates are region-relative
- Batch processing optimizes network requests
- Cross-region batching handled automatically

### Multi-Language Implementation

- **TEXT Object**: Nested structure with language codes as keys
- **Auto-Detection**: Browser locale → IP geolocation → English fallback
- **Persistent Storage**: `localStorage.getItem('wplace_language')`
- **Runtime Switching**: UI recreation on language change

## File Organization

```
Auto-Farm.js           # Charge farming automation
Auto-Image.js          # Image painting automation
AccountSwapper/        # Chrome extension for multi-account
├── manifest.json      # Extension configuration
├── background.js      # Cookie management service worker
└── content.js         # Page script communication bridge
README.md              # Main documentation (English)
[LANG].md             # Localized documentation files
```

## Development Workflow

### Testing Scripts

1. Load via bookmarklet on wplace.live
2. Monitor browser console for errors/debugging
3. Test CAPTCHA token generation
4. Verify pixel placement and charge consumption

### Extension Development

1. Load unpacked extension in Chrome
2. Test cookie preservation/clearing
3. Verify message passing between scripts

### Debugging Patterns

- **Console Logging**: Extensive use of emoji prefixes (🔑, ❌, ✅)
- **State Inspection**: Global `state` object accessible in DevTools
- **Performance Timing**: Token generation timing logged
- **Error Categorization**: Specific error types for different failure modes

## Performance Considerations

- **Overlay Optimization**: ImageData caching and OffscreenCanvas when available
- **Token Reuse**: Widget reuse to avoid recreation overhead
- **Smart Batching**: Dynamic batch sizes based on charges and performance
- **Memory Management**: Cleanup of Turnstile widgets and overlay data
- **Notification Throttling**: Rate-limited desktop notifications

## Browser Compatibility

- **Primary Target**: Chrome/Chromium browsers
- **Mobile Support**: Responsive UI with touch-friendly controls
- **API Requirements**: Fetch, async/await, ES6+ features
- **Extension**: Manifest V3 for Chrome extensions
