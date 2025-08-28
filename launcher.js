// WPlace AutoBOT - Development Launcher
// Ce script surveille les changements du fichier Auto-Image.js et permet de le recharger
// Usage: javascript:fetch("http://localhost:8000/launcher.js").then(t=>t.text()).then(eval);

(async () => {
    'use strict';

    // Configuration
    const CONFIG = {
        SCRIPTS: {
            'Auto-Image.js': 'http://localhost:8000/Auto-Image.js',
            'Auto-Farm.js': 'http://localhost:8000/Auto-Farm.js'
        },
        POLL_INTERVAL: 1000, // Vérification toutes les secondes
        AUTO_RELOAD: false,  // Rechargement automatique désactivé par défaut
        SELECTED_SCRIPT: 'Auto-Image.js', // Script par défaut
        SCRIPT_PARAMS: '', // Paramètres par défaut
    };

    // Variables globales
    let lastFileHash = null;
    let pollInterval = null;
    let isScriptLoaded = false;
    let launcherUI = null;

    // Fonction pour calculer un hash simple du contenu
    function simpleHash(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convertir en 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }

    // Fonction pour parser les paramètres
    function parseParams(paramString) {
        const params = {};
        if (!paramString) return params;

        paramString.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
                params[key.trim()] = value.trim();
            }
        });
        return params;
    }

    // Fonction pour charger le script principal
    async function loadMainScript() {
        try {
            console.log(`🚀 [Launcher] Chargement du script ${CONFIG.SELECTED_SCRIPT}...`);
            updateStatus('loading', 'Chargement...');

            const scriptUrl = CONFIG.SCRIPTS[CONFIG.SELECTED_SCRIPT];
            const response = await fetch(scriptUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const scriptContent = await response.text();

            // Calculer le hash pour la surveillance des changements
            lastFileHash = simpleHash(scriptContent);

            // Parser et injecter les paramètres
            const params = parseParams(CONFIG.SCRIPT_PARAMS);
            window.scriptParams = params;
            console.log('📋 [Launcher] Paramètres injectés:', params);

            // Exécuter le script
            eval(scriptContent);

            isScriptLoaded = true;
            updateStatus('loaded', 'Script chargé');
            console.log(`✅ [Launcher] Script ${CONFIG.SELECTED_SCRIPT} chargé avec succès`);

        } catch (error) {
            console.error('❌ [Launcher] Erreur lors du chargement:', error);
            updateStatus('error', `Erreur: ${error.message}`);
            isScriptLoaded = false;
        }
    }

    // Fonction pour vérifier les changements
    async function checkForChanges() {
        try {
            const scriptUrl = CONFIG.SCRIPTS[CONFIG.SELECTED_SCRIPT];
            const response = await fetch(scriptUrl, {
                method: 'HEAD',
                cache: 'no-cache'
            });

            if (!response.ok) {
                updateStatus('error', 'Fichier non accessible');
                return;
            }

            // Obtenir le contenu pour calculer le hash
            const contentResponse = await fetch(scriptUrl, {
                cache: 'no-cache'
            });
            const content = await contentResponse.text();
            const currentHash = simpleHash(content);

            if (lastFileHash && currentHash !== lastFileHash) {
                console.log(`🔄 [Launcher] Changements détectés dans ${CONFIG.SELECTED_SCRIPT}`);
                updateStatus('changed', 'Changements détectés!');

                if (CONFIG.AUTO_RELOAD) {
                    console.log('🔄 [Launcher] Rechargement automatique...');
                    await loadMainScript();
                } else {
                    showReloadButton();
                }
            } else if (isScriptLoaded) {
                updateStatus('watching', 'Surveillance active');
            }

        } catch (error) {
            console.error('⚠️ [Launcher] Erreur lors de la vérification:', error);
            updateStatus('error', 'Erreur de surveillance');
        }
    }

    // Fonction pour créer l'interface utilisateur
    function createLauncherUI() {
        // Vérifier si l'UI existe déjà
        if (document.getElementById('wplace-launcher')) {
            return;
        }

        const ui = document.createElement('div');
        ui.id = 'wplace-launcher';
        ui.innerHTML = `
      <div id="launcher-container" style="
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        background: rgba(0,0,0,0.9);
        color: white;
        padding: 8px;
        border-radius: 4px;
        border: 1px solid #333;
        font-family: Arial, sans-serif;
        font-size: 11px;
        width: 180px;
        cursor: move;
        user-select: none;
      ">
        <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 6px;">
          <div id="status-dot" style="
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: #0f0;
          "></div>
          <strong style="font-size: 10px;">AutoBOT Launcher</strong>
        </div>
        
        <div style="margin-bottom: 6px;">
          <select id="script-select" style="
            width: 100%;
            padding: 2px;
            font-size: 10px;
            background: #222;
            color: white;
            border: 1px solid #555;
            border-radius: 2px;
            margin-bottom: 4px;
          ">
            <option value="Auto-Image.js">Auto-Image.js</option>
            <option value="Auto-Farm.js">Auto-Farm.js</option>
          </select>
          
          <input id="params-input" type="text" placeholder="roomId=123&param=value" style="
            width: calc(100% - 6px);
            padding: 2px 3px;
            font-size: 9px;
            background: #222;
            color: white;
            border: 1px solid #555;
            border-radius: 2px;
            margin-bottom: 4px;
          ">
        </div>
        
        <div style="margin-bottom: 6px;">
          <div><span id="launcher-status">Init...</span></div>
          <label style="cursor: pointer; font-size: 10px;">
            <input type="checkbox" id="auto-reload-toggle" ${CONFIG.AUTO_RELOAD ? 'checked' : ''} style="margin-right: 3px;">
            Auto
          </label>
        </div>
        
        <button id="reload-btn" style="
          background: #333;
          color: white;
          border: 1px solid #555;
          padding: 4px 6px;
          border-radius: 2px;
          cursor: pointer;
          font-size: 10px;
          width: 100%;
        ">Load Script</button>
      </div>
    `;

        document.body.appendChild(ui);
        launcherUI = ui;

        // Fonctionnalité de drag
        makeDraggable(document.getElementById('launcher-container'));

        // Event listeners
        document.getElementById('reload-btn').addEventListener('click', loadMainScript);

        document.getElementById('auto-reload-toggle').addEventListener('change', (e) => {
            CONFIG.AUTO_RELOAD = e.target.checked;
            console.log(`🔧 [Launcher] Auto-reload ${CONFIG.AUTO_RELOAD ? 'activé' : 'désactivé'}`);
        });

        document.getElementById('script-select').addEventListener('change', (e) => {
            CONFIG.SELECTED_SCRIPT = e.target.value;
            lastFileHash = null; // Reset hash pour forcer la surveillance du nouveau script
            console.log(`📜 [Launcher] Script sélectionné: ${CONFIG.SELECTED_SCRIPT}`);
        });

        document.getElementById('params-input').addEventListener('input', (e) => {
            CONFIG.SCRIPT_PARAMS = e.target.value;
            console.log(`⚙️ [Launcher] Paramètres: ${CONFIG.SCRIPT_PARAMS}`);
        });

        console.log('🎛️ [Launcher] Interface créée');
    }

    // Fonction pour rendre un élément draggable
    function makeDraggable(element) {
        let isDragging = false;
        let startX, startY, initialX, initialY;

        element.addEventListener('mousedown', (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            const rect = element.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;

            element.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            e.preventDefault();
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;

            element.style.left = (initialX + deltaX) + 'px';
            element.style.top = (initialY + deltaY) + 'px';
            element.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                element.style.cursor = 'move';
            }
        });
    }

    // Fonction pour mettre à jour le status
    function updateStatus(type, message) {
        const statusElement = document.getElementById('launcher-status');
        const statusDot = document.getElementById('status-dot');

        if (statusElement) {
            const colors = {
                loading: '#ff0',
                loaded: '#0f0',
                watching: '#0ff',
                changed: '#f80',
                error: '#f00'
            };

            const messages = {
                loading: 'Loading...',
                loaded: 'Ready',
                watching: 'Watching',
                changed: 'Changed!',
                error: 'Error'
            };

            statusElement.textContent = messages[type] || message;
            if (statusDot) {
                statusDot.style.background = colors[type] || '#0f0';
            }
        }
    }

    // Fonction pour afficher le bouton de rechargement
    function showReloadButton() {
        const reloadBtn = document.getElementById('reload-btn');
        if (reloadBtn) {
            reloadBtn.style.background = '#f80';
            reloadBtn.style.color = '#000';
            reloadBtn.textContent = 'Reload Now!';
        }
    }

    // Fonction pour démarrer la surveillance
    function startWatching() {
        if (pollInterval) {
            clearInterval(pollInterval);
        }

        pollInterval = setInterval(checkForChanges, CONFIG.POLL_INTERVAL);
        console.log(`👀 [Launcher] Surveillance démarrée (intervalle: ${CONFIG.POLL_INTERVAL}ms)`);
    }

    // Fonction pour arrêter la surveillance
    function stopLauncher() {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        console.log('🛑 [Launcher] Surveillance arrêtée');
    }

    // Fonction d'initialisation
    async function initLauncher() {
        console.log('🚀 [Launcher] WPlace AutoBOT Development Launcher v2.0');
        console.log('📝 [Launcher] Scripts disponibles:', Object.keys(CONFIG.SCRIPTS));

        // Créer l'interface
        createLauncherUI();

        // Charger le script initial
        await loadMainScript();

        // Démarrer la surveillance
        startWatching();

        console.log('✅ [Launcher] Launcher initialisé avec succès');
    }

    // Démarrage
    await initLauncher();

    // Exposer quelques fonctions globalement pour le debugging
    window.wpLauncher = {
        reload: loadMainScript,
        start: startWatching,
        stop: stopLauncher,
        status: () => ({ isScriptLoaded, lastFileHash })
    };

})().catch(console.error);
