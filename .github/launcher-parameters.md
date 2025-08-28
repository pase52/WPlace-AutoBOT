# WPlace AutoBOT - Launcher Parameters Guide

## Vue d'ensemble

Le launcher injecte automatiquement les paramètres dans l'objet global `window.scriptParams` avant l'exécution des scripts. Ces paramètres permettent de configurer dynamiquement le comportement des scripts sans modification du code source.

## Format des paramètres

Les paramètres suivent le format URL query string : `key1=value1&key2=value2&key3=value3`

## Récupération des paramètres

### Méthode recommandée

```javascript
// Récupérer l'objet de paramètres (toujours vérifier l'existence)
const params = window.scriptParams || {};

// Extraction avec valeurs par défaut
const roomId = params.roomId || "default-room";
const debugMode = params.debug === "true"; // Boolean depuis string
const speed = parseInt(params.speed) || 5; // Number depuis string
const theme = params.theme || "classic";
```

### Fonction utilitaire complète

```javascript
// Fonction helper pour récupérer les paramètres avec types
function getParam(key, defaultValue, type = "string") {
  const params = window.scriptParams || {};
  const value = params[key];

  if (value === undefined || value === null) {
    return defaultValue;
  }

  switch (type) {
    case "boolean":
      return value === "true" || value === "1";
    case "number":
      const num = parseFloat(value);
      return isNaN(num) ? defaultValue : num;
    case "int":
      const int = parseInt(value);
      return isNaN(int) ? defaultValue : int;
    case "array":
      return value.split(",").map((v) => v.trim());
    case "json":
      try {
        return JSON.parse(value);
      } catch {
        return defaultValue;
      }
    default:
      return value;
  }
}

// Exemples d'utilisation
const roomId = getParam("roomId", "default-room");
const isDebug = getParam("debug", false, "boolean");
const paintSpeed = getParam("speed", 5, "number");
const coordinates = getParam("coords", [0, 0], "array"); // "100,200" -> [100, 200]
const config = getParam("config", {}, "json"); // '{"theme":"dark"}' -> {theme: "dark"}
```

## Paramètres standards recommandés

### Paramètres communs

- `roomId` : Identifiant de la salle/session
- `debug` : Mode debug (true/false)
- `speed` : Vitesse d'exécution (1-1000)
- `theme` : Thème de l'interface (classic/neon)
- `lang` : Langue (en/fr/pt/etc.)

### Auto-Image.js spécifiques

- `x`, `y` : Position de départ de l'image
- `opacity` : Opacité de l'overlay (0.0-1.0)
- `dithering` : Activation du dithering (true/false)
- `batch` : Taille des batches (1-1000)
- `algorithm` : Algorithme de matching couleur (deltaE/euclidean/manhattan)

### Auto-Farm.js spécifiques

- `farmX`, `farmY` : Position de la zone de farm
- `farmSize` : Taille de la zone (défaut: 100)
- `autoRefresh` : Refresh automatique des tokens (true/false)
- `minCharges` : Nombre minimum de charges avant pause

## Exemples d'usage

### Configuration basique

```text
roomId=abc123&debug=true&speed=10
```

### Configuration Auto-Image avancée

```text
roomId=pixel-art-session&x=500&y=300&opacity=0.7&dithering=true&batch=50&algorithm=deltaE
```

### Configuration Auto-Farm

```text
roomId=farm-session&farmX=742&farmY=1148&farmSize=100&autoRefresh=true&minCharges=2
```

### Configuration avec JSON

```text
roomId=advanced&config={"theme":"neon","notifications":true,"overlay":{"opacity":0.8,"blur":true}}
```

## Validation et logging

### Validation des paramètres

```javascript
function validateParams() {
  const params = window.scriptParams || {};
  const errors = [];

  // Validation roomId (requis)
  if (!params.roomId) {
    errors.push("roomId est requis");
  }

  // Validation speed (1-1000)
  const speed = parseInt(params.speed);
  if (speed && (speed < 1 || speed > 1000)) {
    errors.push("speed doit être entre 1 et 1000");
  }

  // Validation coordinates
  const x = parseInt(params.x);
  const y = parseInt(params.y);
  if ((x && x < 0) || (y && y < 0)) {
    errors.push("Les coordonnées doivent être positives");
  }

  return errors;
}

// Utilisation
const validationErrors = validateParams();
if (validationErrors.length > 0) {
  console.error("❌ Erreurs de paramètres:", validationErrors);
  return;
}
```

### Logging des paramètres

```javascript
function logParams() {
  const params = window.scriptParams || {};

  if (Object.keys(params).length === 0) {
    console.log("ℹ️ Aucun paramètre fourni par le launcher");
    return;
  }

  console.group("📋 Paramètres du launcher");
  Object.entries(params).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  console.groupEnd();
}

// Appeler au début du script
logParams();
```

## Intégration dans les scripts existants

### Pattern d'initialisation recommandé

```javascript
(async () => {
  // 1. Logger les paramètres reçus
  logParams();

  // 2. Valider les paramètres
  const validationErrors = validateParams();
  if (validationErrors.length > 0) {
    console.error("❌ Paramètres invalides:", validationErrors);
    return;
  }

  // 3. Récupérer les paramètres avec défauts
  const config = {
    roomId: getParam("roomId", "default"),
    debug: getParam("debug", false, "boolean"),
    speed: getParam("speed", 5, "number"),
    // ... autres paramètres
  };

  // 4. Appliquer la configuration
  if (config.debug) {
    console.log("🐛 Mode debug activé");
  }

  // 5. Continuer l'exécution normale du script
  // ...
})();
```

## Compatibilité

- ✅ Fonctionne avec tous les scripts AutoBOT
- ✅ Rétro-compatible (scripts sans paramètres continuent de fonctionner)
- ✅ Paramètres optionnels (valeurs par défaut)
- ✅ Type safety avec validation

## Debugging

Pour débugger les paramètres, ajoutez ceci au début de votre script :

```javascript
// Debug complet des paramètres
console.log("🔧 Debug paramètres:", {
  raw: window.scriptParams,
  keys: Object.keys(window.scriptParams || {}),
  count: Object.keys(window.scriptParams || {}).length,
});
```
