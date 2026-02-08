// this file interprets and runs the objects from the created objects in studio.js
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import { 
    ENGINE_VERSION, 
    MINIMUM_COMPATIBLE_VERSION,
    createVersionInfo,
    bustAssetUrl,
    isVersionOlder,
    applyLegacyDefaults,
    applyVersionCompatibility,
    logLegacyGameWarnings,
    getCacheBustParam
} from './version.js';

// Ensure AudioContext is resumed before any THREE.Audio plays.
// We monkey-patch THREE.Audio.prototype.play to attempt a resume first,
// and also add a one-time user-gesture resume to reduce blocked plays.
let __audioPlayPatched = false;
function patchThreeAudioPlay() {
    if (__audioPlayPatched) return;
    __audioPlayPatched = true;
    try {
        const originalPlay = THREE.Audio.prototype.play;
        THREE.Audio.prototype.play = function() {
            try {
                const ctx = this.context || (this.listener && this.listener.context);
                if (ctx && ctx.state === 'suspended') {
                    ctx.resume().then(() => {
                        try { originalPlay.call(this); } catch (e) { console.warn('Audio play failed after resume', e); }
                    }).catch(() => {
                        // swallow
                    });
                    return;
                }
            } catch (err) {
                // ignore
            }
            try { originalPlay.call(this); } catch (e) { console.warn('Audio play failed', e); }
        };
    } catch (err) {
        console.warn('Failed to patch THREE.Audio.play', err);
    }
}

// One-time user gesture handler to resume audio context as early as possible.
let __audioGestureListenerAttached = false;
function attachAudioGestureResume() {
    if (__audioGestureListenerAttached) return;
    __audioGestureListenerAttached = true;
    const resume = () => {
        try {
            // Resume any existing AudioContexts in THREE.Audio/AudioListener
            if (typeof THREE !== 'undefined') {
                // Try to resume common contexts if present on existing listeners
                document.querySelectorAll('*').forEach(() => {}); // no-op to avoid linter
            }
        } catch (e) {}
        // Also try to resume any global audio listener if created later
        try {
            if (window && window.audioListener && window.audioListener.context && window.audioListener.context.state === 'suspended') {
                window.audioListener.context.resume().catch(() => {});
            }
        } catch (e) {}
        window.removeEventListener('pointerdown', resume);
        window.removeEventListener('touchstart', resume);
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });
}

// Apply immediately
patchThreeAudioPlay();
attachAudioGestureResume();

// Log engine version at startup
console.log(`%c RoGold Engine v${ENGINE_VERSION} `, 'background: #1a1a2e; color: #00ff88; font-size: 14px; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
console.log(`[VERSION] Engine initialized. Version: ${ENGINE_VERSION}, Minimum Compatible: ${MINIMUM_COMPATIBLE_VERSION}`);

/**
 * Add a message to the console output
 */
function addOutput(message, type = 'normal') {
    const consoleOutput = document.getElementById('console-output');
    if (!consoleOutput) return;
    
    const msgElement = document.createElement('div');
    msgElement.className = `console-${type}`;
    msgElement.innerHTML = message;
    consoleOutput.appendChild(msgElement);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

/**
 * Load a GLTF/GLB model with automatic cache busting
 * @param {string} url - The model URL
 * @param {Function} onLoad - Callback when loaded
 * @param {Function} onProgress - Optional progress callback
 * @param {Function} onError - Optional error callback
 */
function loadModelWithCacheBust(url, onLoad, onProgress, onError) {
    const loader = new GLTFLoader();
    const cacheBustedUrl = bustAssetUrl(url);
    console.log(`[ASSET] Loading model: ${cacheBustedUrl}`);
    loader.load(cacheBustedUrl, onLoad, onProgress, onError);
}

/**
 * Load a texture with automatic cache busting
 * @param {string} url - The texture URL
 * @param {Function} onLoad - Callback when loaded
 * @param {Function} onProgress - Optional progress callback
 * @param {Function} onError - Optional error callback
 */
function loadTextureWithCacheBust(url, onLoad, onProgress, onError) {
    const loader = new THREE.TextureLoader();
    const cacheBustedUrl = bustAssetUrl(url);
    console.log(`[ASSET] Loading texture: ${cacheBustedUrl}`);
    loader.load(cacheBustedUrl, onLoad, onProgress, onError);
}

let scene, camera, renderer, controls;
let player, velocity, direction;
let playerVelocity = new THREE.Vector3();
let smoothedInputX = 0;
let smoothedInputZ = 0;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;
let canJumpFromGround = false;
let prevCanJumpFromGround = false;
let hasJumpedThisCycle = false;
let groundContactTimer = null;
let isRespawning = false;
let lastJumpTime = 0;
const jumpCooldown = 200; // 200ms cooldown to prevent rapid successive jumps
let fallenParts = [];
let physicsWorld;
const mouse = new THREE.Vector2();
const maxDistance = 10; // distância máxima do foguete
const cooldownTime = 1000; // 1 segundo de cooldown

// Roblox 2011-style physics constants
const ROBLOX_GRAVITY = -196.2;      // Increased for faster gravity feel
const ROBLOX_FRICTION = 0;       // Balanced friction for good traction without being too sticky
const ROBLOX_RESTITUTION = 0;    // Colisões duras, pouco quique
const ROBLOX_LINEAR_DAMPING = 0.1;  // Reduced damping for lighter feel
const ROBLOX_ANGULAR_DAMPING = 0.1; // Reduced damping for lighter rotation

// Increased jump impulse (higher = stronger jump)
const JUMP_IMPULSE = 280; // Adjusted for better feel in 250-350 range

let canShoot = true;
let explosionSound;
const explodingParticles = [];
let nickname = localStorage.getItem('rogold_currentUser') || 'Guest' + Math.floor(Math.random() * 10000);
let isFlying = false;
let speedMultiplier = 1;   // começa normal
let isSpeeding = false;    // controle do modo admin
let playerHealth = 100;
const maxHealth = 100;
let playerNameTags = {};

// Part synchronization tracking
let lastPartSync = {}; // partName -> last sync timestamp
let lastPartState = {}; // partName -> {position: THREE.Vector3, rotation: THREE.Euler}

// Face inventory system
let ownedFaces = JSON.parse(localStorage.getItem('rogold_owned_faces') || '["imgs/OriginalGlitchedFace.webp"]');

// Gear inventory system
let ownedGears = JSON.parse(localStorage.getItem('rogold_owned_gears') || '[]');

let backpackModal;
let backpackToolBtn;

let partMaterial;
let luaObjects = {}; // Global luaObjects for the game environment
let spinningParts = []; // Global list of spinning parts
let isMenuOpen = false;
let isConsoleOpen = false;
let isDancing = false;

// Roblox Environment for Lua scripts
let RobloxEnvironment = {
    Workspace: {
        Children: [],
        FindFirstChild: function(name) {
            // First check if it's a direct property
            if (this[name]) {
                return this[name];
            }
            // Then check children by name
            return this.Children.find(child => child.Name === name);
        }
    },
    connections: [],
    wait: (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000))
};

// Add dynamic property access to workspace for direct part access like workspace.part_1
const originalWorkspace = RobloxEnvironment.Workspace;
RobloxEnvironment.Workspace = new Proxy(originalWorkspace, {
    get: function(target, property) {
        // First check if it's a built-in property
        if (property in target) {
            return target[property];
        }
        // Otherwise, try to find a child with that name
        return target.FindFirstChild(property);
    },
    set: function(target, property, value) {
        // Allow setting properties directly
        target[property] = value;
        return true;
    }
});

// Roblox Instance class for game environment
class RobloxInstance {
    constructor(className, name) {
        this.ClassName = className;
        this.Name = name;
        this.Parent = null;
        this.Children = [];
        this.threeObject = null;
        this.cannonBody = null;
        this.isScriptCreated = false;

        // Roblox properties
        this.Anchored = true;
        this.CanCollide = true;
        this.Size = new THREE.Vector3(4, 2, 2);
        this.Position = new THREE.Vector3(0, 5, 0);
        this.Rotation = new THREE.Euler(0, 0, 0);
        this.Color = new THREE.Color(0.5, 0.5, 0.5);
        this.Transparency = 0;
        this.spinAxis = new THREE.Vector3(0, 1, 0); // Default spin axis (Y)

        // Return a proxy to enable script.ChildName access
        return new Proxy(this, {
            get(target, prop) {
                // First check if it's a regular property
                if (prop in target) {
                    return target[prop];
                }
                // Then check if it's a child with that name
                const child = target.Children.find(child => child.Name === prop);
                if (child) {
                    return child;
                }
                // Return undefined if not found
                return undefined;
            }
        });
    }

    // Roblox-like methods
    Destroy() {
        // Remove from parent
        if (this.Parent) {
            this.Parent.Children = this.Parent.Children.filter(child => child !== this);
        }

        // Remove from scene
        if (this.threeObject && this.threeObject.parent) {
            this.threeObject.parent.remove(this.threeObject);
        }

        // Remove physics body
        if (this.cannonBody && physicsWorld) {
            physicsWorld.removeBody(this.cannonBody);
        }

        // Clean up children
        this.Children.forEach(child => child.Destroy());
    }

    Clone() {
        const clone = new RobloxInstance(this.ClassName, this.Name + '_Clone');
        clone.Size = this.Size.clone();
        clone.Position = this.Position.clone();
        clone.Rotation = this.Rotation.clone();
        clone.Color = this.Color.clone();
        clone.Transparency = this.Transparency;
        clone.Anchored = this.Anchored;
        clone.CanCollide = this.CanCollide;
        
        // Set up physics for the clone
        if (this.cannonBody && physicsWorld) {
            const shape = new CANNON.Box(new CANNON.Vec3(
                clone.Size.x / 2,
                clone.Size.y / 2,
                clone.Size.z / 2
            ));
            
            clone.cannonBody = new CANNON.Body({
                mass: clone.Anchored ? 0 : 1,
                material: partMaterial,
                shape: shape,
                position: new CANNON.Vec3(
                    clone.Position.x,
                    clone.Position.y,
                    clone.Position.z
                ),
                linearDamping: ROBLOX_LINEAR_DAMPING,
                fixedRotation: false
            });
            
            // Apply Roblox-style collision response
            clone.cannonBody.addEventListener('collide', (e) => {
                let impactVelocity = e.contact.getImpactVelocityAlongNormal();
                console.log('Clone collision: impactVelocity =', impactVelocity);
                if (isNaN(impactVelocity) || !isFinite(impactVelocity)) {
                    console.warn('Clone collision: invalid impactVelocity, setting to 0');
                    impactVelocity = 0;
                }
                impactVelocity = Math.max(0, Math.min(impactVelocity, 100)); // clamp to reasonable max
                if (impactVelocity > 5) {
                    let bounceForce = impactVelocity * 0.1;
                    bounceForce = Math.max(0, Math.min(bounceForce, 10)); // clamp bounce force
                    const normal = e.contact.ni;
                    console.log('Clone collision: normal =', normal);
                    if (normal && !isNaN(normal.x) && !isNaN(normal.y) && !isNaN(normal.z)) {
                        const normalLength = Math.sqrt(normal.x*normal.x + normal.y*normal.y + normal.z*normal.z);
                        console.log('Clone collision: normalLength =', normalLength);
                        if (normalLength > 0.001) {
                            const nx = normal.x / normalLength;
                            const ny = normal.y / normalLength;
                            const nz = normal.z / normalLength;
                            const impulseX = nx * bounceForce;
                            const impulseY = ny * bounceForce;
                            const impulseZ = nz * bounceForce;
                            console.log('Clone collision: impulseX,Y,Z =', impulseX, impulseY, impulseZ);
                            if (!isNaN(impulseX) && !isNaN(impulseY) && !isNaN(impulseZ)) {
                                clone.cannonBody.applyImpulse(
                                    new CANNON.Vec3(impulseX, impulseY, impulseZ),
                                    new CANNON.Vec3(0, 0, 0)
                                );
                            } else {
                                console.warn('Clone collision: skipping impulse due to NaN values');
                            }
                        } else {
                            console.warn('Clone collision: skipping impulse due to small normal length');
                        }
                    } else {
                        console.warn('Clone collision: skipping impulse due to invalid normal');
                    }
                }
            });
        }
        
        return clone;
    }

    // Get descendants
    GetDescendants() {
        const descendants = [];
        this.Children.forEach(child => {
            descendants.push(child);
            descendants.push(...child.GetDescendants());
        });
        return descendants;
    }

    // Find first child by name
    FindFirstChild(name) {
        return this.Children.find(child => child.Name === name);
    }

    // Wait for child (simplified)
    WaitForChild(name) {
        return this.FindFirstChild(name);
    }

    // Spin method for parts
    Spin(axis) {
        this.isSpinning = true;
        if (axis) {
            this.spinAxis = axis instanceof THREE.Vector3 ? axis : new THREE.Vector3(axis.X, axis.Y, axis.Z);
        }
        spinningParts.push(this); // Add to global spinning list
    }

    // Roblox-like Spin method (alias for compatibility)
    spin() {
        this.Spin();
    }
}

// ===== LUA SCRIPT INTERPRETER =====

function interpretLuaScript(script) {
    const actions = [];
    const lines = script.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('--'));

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Handle wait statements
        if (line.startsWith('wait')) {
            const match = line.match(/wait\((.*?)\)/);
            const seconds = match ? parseFloat(match[1]) || 0.03 : 0.03;
            actions.push({
                type: 'wait',
                seconds: seconds
            });
            continue;
        }

        // Handle for loops
        if (line.startsWith('for ')) {
            const match = line.match(/for\s+(\w+)\s*=\s*(\d+),\s*(\d+)\s+do/);
            if (match) {
                const loopVar = match[1];
                const start = parseInt(match[2]);
                const end = parseInt(match[3]);
                const loopBody = extractLoopBody(lines, i);
                actions.push({
                    type: 'for_loop',
                    loopVar: loopVar,
                    start: start,
                    end: end,
                    body: loopBody
                });
                // Skip the loop body lines
                i += countLoopLines(lines, i);
                continue;
            }
        }

        // Handle while loops
        if (line.startsWith('while ')) {
            const match = line.match(/while\s+(.+)\s+do/);
            if (match) {
                const condition = match[1];
                const loopBody = extractLoopBody(lines, i);
                actions.push({
                    type: 'while_loop',
                    condition: condition,
                    body: loopBody
                });
                // Skip the loop body lines
                i += countLoopLines(lines, i);
                continue;
            }
        }

        // Handle event connections (object.Event:Connect(function))
        if (line.includes(':Connect(')) {
            const match = line.match(/(\w+)\.(\w+):Connect\(\s*function\s*\(\s*([^)]*)\s*\)/);
            if (match) {
                const varName = match[1];
                const eventName = match[2];
                const params = match[3];
                actions.push({
                    type: 'connect_event',
                    varName: varName,
                    eventName: eventName,
                    params: params,
                    functionLines: extractFunctionBody(lines, i)
                });
                // Skip the function body lines
                i += countFunctionLines(lines, i);
                continue;
            }
        }

        // Handle Instance.new
        if (line.includes('Instance.new')) {
            const match = line.match(/local\s+(\w+)\s*=\s*Instance\.new\(['"]([^'"]+)['"]\)/);
            if (match) {
                const varName = match[1];
                const className = match[2];
                actions.push({
                    type: 'create_instance',
                    varName: varName,
                    className: className
                });
                continue;
            }
        }

        // Handle property assignments
        if (line.includes('=')) {
            const match = line.match(/(\w+)\.(\w+)\s*=\s*(.+)/);
            if (match) {
                const varName = match[1];
                const property = match[2];
                const value = match[3];
                actions.push({
                    type: 'set_property',
                    varName: varName,
                    property: property,
                    value: value
                });
                continue;
            }
        }

        // Handle method calls
        if (line.includes(':')) {
            const match = line.match(/([.\w]+):(\w+)\(([^)]*)\)/);
            if (match) {
                const varName = match[1];
                const method = match[2];
                const args = match[3];
                actions.push({
                    type: 'call_method',
                    varName: varName,
                    method: method,
                    args: args
                });
                continue;
            }
        }

        // Handle function definitions
        if (line.includes('function ')) {
            const match = line.match(/function\s+(\w+)\s*\(/);
            if (match) {
                const funcName = match[1];
                actions.push({
                    type: 'define_function',
                    funcName: funcName,
                    functionLines: extractFunctionBody(lines, i)
                });
                // Skip the function body lines
                i += countFunctionLines(lines, i);
                continue;
            }
        }

        // Handle print statements
        if (line.startsWith('print(')) {
            // Match both single and double quotes
            const match = line.match(/print\(['"]([^'"]+)['"]\)/);
            if (match) {
                actions.push({
                    type: 'print',
                    message: match[1]
                });
                continue;
            }
        }

        // Handle variable assignments (including local)
        if (line.includes('=')) {
            const match = line.match(/(?:local\s+)?(\w+)\s*=\s*(.+)/);
            if (match) {
                const varName = match[1];
                const value = match[2];
                actions.push({
                    type: 'set_variable',
                    varName: varName,
                    value: value
                });
                continue;
            }
        }
    }

    return actions;
}

function extractFunctionBody(lines, startIndex) {
    const body = [];
    let braceCount = 0;
    let inFunction = false;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('function') || line.includes('do')) {
            inFunction = true;
            braceCount++;
            continue; // Skip the function declaration line
        }

        if (inFunction) {
            body.push(line);
        }

        if (line.includes('end')) {
            braceCount--;
            if (braceCount === 0) {
                break;
            }
        }
    }

    return body;
}

function extractLoopBody(lines, startIndex) {
    const body = [];
    let braceCount = 0;
    let inLoop = false;
    let startedBody = false;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('do') && !startedBody) {
            // Found the 'do' keyword, start collecting body after this line
            startedBody = true;
            braceCount++;
            continue; // Skip the 'while ... do' line itself
        }

        if (startedBody) {
            body.push(line);
        }

        if (line.trim() === 'end' && startedBody) {
            // Found the end of the loop
            break;
        }
    }

    return body;
}

function countFunctionLines(lines, startIndex) {
    let count = 0;
    let braceCount = 0;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];

        if (line.includes('function') || line.includes('do')) {
            braceCount++;
            count++; // Include the declaration line in count
            continue;
        }

        count++;

        if (line.includes('end')) {
            braceCount--;
            if (braceCount === 0) {
                break;
            }
        }
    }

    return count;
}

function countLoopLines(lines, startIndex) {
    let count = 0;
    let braceCount = 0;
    let startedBody = false;

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip the 'while ... do' line itself
        if (line.includes('do') && !startedBody) {
            startedBody = true;
            continue;
        }

        count++;

        if (line.trim() === 'end') {
            break;
        }
    }

    return count;
}

// Replace the runScriptWithErrorHandling function with this async version:
async function runScriptWithErrorHandling(scriptName = null, testScript = null) {
    let script;
    let initialVariables = { workspace: RobloxEnvironment.Workspace, game: window.game };

    if (testScript) {
        script = testScript;
    } else if (scriptName) {
        const scriptObj = luaObjects[scriptName];
        if (scriptObj && scriptObj.ClassName === 'Script') {
            script = scriptObj.Source || '';
            // Pass the script object as a 'script' variable for script.ChildName access
            initialVariables.script = scriptObj;
        } else {
            addOutput(`Error: Script "${scriptName}" not found!`, 'error');
            return;
        }
    } else {
        // For main script editor
        if (window.monacoEditor) {
            script = window.monacoEditor.getValue().trim();
        } else {
            addOutput('Error: No script to run!', 'error');
            return;
        }
    }

    if (!script) {
        addOutput('Error: Script is empty!', 'error');
        return;
    }

    // clearOutput(); // Commented out as it's not defined
    // clearErrorHighlighting(scriptName); // Commented out as it's not defined

    try {
        const actions = interpretLuaScript(script);

        // Check for syntax errors before execution
        // const syntaxErrors = checkLuaSyntax(script); // Commented out as it's not defined
        // if (syntaxErrors.length > 0) {
        //     syntaxErrors.forEach(error => {
        //         console.error(`Syntax Error (Line ${error.line}): ${error.message}`);
        //     });
        //     // addErrorHighlighting(scriptName, syntaxErrors); // Commented out as it's not defined
        //     return;
        // }

        await executeLuaActions(actions);

        // Start game loop for continuous execution
        // startGameLoop(); // Commented out as it's not defined
    } catch (error) {
        console.error('RoGold Studio: Script execution error:', error);

        // Try to extract line number from error
        const lineMatch = error.message.match(/line (\d+)/i);
        if (lineMatch) {
            const lineNum = parseInt(lineMatch[1]);
            console.error(`Error at line ${lineNum}: ${error.message}`);
        }
    }
}

function playSoundIfAllowed(soundObj) {
    if (!soundObj) return;

    // Create fresh HTML5 Audio element on user interaction
    if (soundObj.soundUrl) {
        console.log('Creating fresh HTML5 Audio for:', soundObj.soundUrl);
        const audio = new Audio();
        audio.src = soundObj.soundUrl;
        audio.volume = soundObj.Volume || 0.5;
        audio.loop = soundObj.Looping || false;
        audio.preload = 'auto';

        audio.play().then(() => {
            console.log('Fresh HTML5 Audio played successfully');
            soundObj.isPlaying = true;
            soundObj.pendingPlay = false;
            soundObj.html5Audio = audio; // Store for future use
        }).catch(err => {
            console.log('Fresh HTML5 Audio play failed, trying THREE.Audio:', err.message);
            // Fallback to THREE.Audio
            if (soundObj.audio && soundObj.audio.buffer) {
                const ctx = soundObj.audio.context || (soundObj.audio.listener && soundObj.audio.listener.context) || (audioListener && audioListener.context);
                if (ctx && ctx.state === 'suspended') {
                    ctx.resume().then(() => {
                        soundObj.audio.play();
                        soundObj.isPlaying = true;
                        soundObj.pendingPlay = false;
                        console.log('THREE.Audio played successfully after resume');
                    }).catch(err => {
                        console.warn('THREE.Audio resume failed:', err);
                        soundObj.pendingPlay = false;
                    });
                } else {
                    soundObj.audio.play();
                    soundObj.isPlaying = true;
                    soundObj.pendingPlay = false;
                    console.log('THREE.Audio played successfully');
                }
            } else {
                console.log('No audio available to play');
                soundObj.pendingPlay = false;
            }
        });
    }
    // Fallback to existing THREE.Audio if no URL
    else if (soundObj.audio && soundObj.audio.buffer) {
        console.log('Attempting to play existing THREE.Audio');
        const ctx = soundObj.audio.context || (soundObj.audio.listener && soundObj.audio.listener.context) || (audioListener && audioListener.context);
        soundObj.audio.setLoop(soundObj.Looping || false);
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().then(() => {
                soundObj.audio.play();
                soundObj.isPlaying = true;
                soundObj.pendingPlay = false;
                console.log('THREE.Audio played successfully after resume, looping:', soundObj.Looping);
            }).catch(err => {
                console.warn('THREE.Audio resume failed:', err);
                soundObj.pendingPlay = false;
            });
        } else {
            soundObj.audio.play();
            soundObj.isPlaying = true;
            soundObj.pendingPlay = false;
            console.log('THREE.Audio played successfully, looping:', soundObj.Looping);
        }
    } else {
        console.log('Cannot play sound - no URL or audio loaded');
        soundObj.pendingPlay = false;
    }
}

function resolvePropertyAccess(propertyPath, variables = {}) {
    const parts = propertyPath.split('.');
    let current = null;

    for (const part of parts) {
        if (current === null) {
            // First part - check variables, luaObjects, or global objects
            current = variables[part] || luaObjects[part] || window[part];
            if (!current && part === 'workspace') {
                current = RobloxEnvironment.Workspace;
            }
        } else {
            // Subsequent parts - access properties
            current = current[part];
        }

        if (current === undefined) {
            return null;
        }
    }

    return current;
}

async function executeLuaActions(actions, initialVariables = {}) {
    const variables = { ...initialVariables };
    const functions = {};

    for (const action of actions) {
        try {
            switch (action.type) {
                case 'wait':
                    // Convert to milliseconds and wait
                    const waitTime = action.seconds * 1000;
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    break;

                case 'for_loop':
                    // Execute for loop with delays between iterations to prevent blocking
                    const executeForLoopWithDelay = async () => {
                        for (let i = action.start; i <= action.end; i++) {
                            // Set loop variable
                            variables[action.loopVar] = i;
                            
                            // Execute loop body synchronously
                            const loopActions = interpretLuaScript(action.body.join('\n'));
                            executeLuaActions(loopActions, variables);
                            
                            // Small delay to allow browser to render
                            await new Promise(r => setTimeout(r, 0));
                        }
                    };
                    
                    executeForLoopWithDelay();
                    break;

                case 'while_loop':
                    let iterations = 0;
                    const maxIterations = 100000; // Allow more iterations for long-running loops
                    
                    // Execute loop with delays between iterations to prevent blocking
                    const executeLoopWithDelay = async () => {
                        while (iterations < maxIterations) {
                            // Evaluate condition
                            const conditionValue = variables[action.condition] || parseValue(action.condition);
                            if (action.condition !== 'true' && !conditionValue) {
                                break;
                            }
                            
                            // Execute loop body synchronously
                            const loopActions = interpretLuaScript(action.body.join('\n'));
                            executeLuaActions(loopActions, variables);
                            iterations++;
                            
                            // Small delay to allow browser to render
                            await new Promise(r => setTimeout(r, 0));
                        }
                    };
                    
                    executeLoopWithDelay();
                    break;

                case 'create_instance':
                    const instance = new RobloxInstance(action.className, action.varName);
                    instance.isScriptCreated = true;
                    variables[action.varName] = instance;
                    // Ensure script-created instances are also tracked in luaObjects
                    // so they participate in the main update loop (physics/anchored/collision)
                    luaObjects[action.varName] = instance;

                    // Create 3D representation for parts
                    if (action.className === 'Part') {
                        const geometry = new THREE.BoxGeometry(1, 1, 1);
                        const material = new THREE.MeshLambertMaterial({ color: 0xff6600 });
                        const part = new THREE.Mesh(geometry, material);
                        part.position.set(0, 5, 0); // Default position
                        part.scale.set(4, 4, 4); // Default size
                        part.castShadow = true;
                        part.receiveShadow = true;
                        scene.add(part);
                        instance.threeObject = part;
                        instance.CanCollide = true;
                        instance.Size = new THREE.Vector3(4, 4, 4);
                        instance.Position = part.position.clone();

                        // Add physics body
                        if (physicsWorld) {
                            const shape = new CANNON.Box(new CANNON.Vec3(
                                instance.Size.x / 2,
                                instance.Size.y / 2,
                                instance.Size.z / 2
                            ));
                            const body = new CANNON.Body({
                                mass: instance.Anchored ? 0 : 1,
                                type: instance.Anchored ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC,
                                position: new CANNON.Vec3(0, 5, 0),
                                shape: shape,
                                material: partMaterial,
                                linearDamping: ROBLOX_LINEAR_DAMPING,
                                angularDamping: ROBLOX_ANGULAR_DAMPING
                            });
                            body.userData = { mesh: part, instance: instance };

                            // Add collision event listener
                            // Throttle impulses to avoid repeated application while contact persists
                            instance._lastCollisionTime = instance._lastCollisionTime || 0;
                            body.addEventListener('collide', (e) => {
                                const now = Date.now();
                                // short cooldown (ms) to prevent multiple impulses during continuous contact
                                if (now - (instance._lastCollisionTime || 0) < 50) return;
                                instance._lastCollisionTime = now;

                                const otherBody = e.body;
                                const contact = e.contact;

                                // Skip impulse if this instance shouldn't collide or is anchored
                                if (!instance.CanCollide || instance.Anchored) return;

                                // Trigger Touched event if the instance has a Touched connection
                                if (instance.touched && typeof instance.touched === 'function') {
                                    instance.touched(otherBody.userData?.instance || otherBody);
                                }

                                // Apply Roblox-style collision response once per collision event
                                try {
                                    if (!contact || typeof contact.getImpactVelocityAlongNormal !== 'function') return;
                                    let impactVelocity = contact.getImpactVelocityAlongNormal();
                                    if (isNaN(impactVelocity) || !isFinite(impactVelocity)) {
                                        impactVelocity = 0;
                                    }
                                    impactVelocity = Math.max(0, Math.min(impactVelocity, 100)); // clamp to reasonable max
                                    if (impactVelocity > 2) {
                                        // Reduce multiplier to avoid huge impulses and cap to a small max
                                        let bounceForce = impactVelocity * 0.03;
                                        bounceForce = Math.max(0, Math.min(bounceForce, 2)); // much smaller cap
                                        const normal = contact.ni;
                                        if (normal && !isNaN(normal.x) && !isNaN(normal.y) && !isNaN(normal.z)) {
                                            const normalLength = Math.sqrt(normal.x*normal.x + normal.y*normal.y + normal.z*normal.z);
                                            if (normalLength > 0.001) {
                                                const nx = normal.x / normalLength;
                                                const ny = normal.y / normalLength;
                                                const nz = normal.z / normalLength;
                                                const impulseX = nx * bounceForce;
                                                const impulseY = ny * bounceForce;
                                                const impulseZ = nz * bounceForce;
                                                if (!isNaN(impulseX) && !isNaN(impulseY) && !isNaN(impulseZ)) {
                                                    // Prefer applying impulse to the other body if it's dynamic
                                                    if (otherBody && otherBody.type !== CANNON.Body.STATIC) {
                                                        otherBody.applyImpulse(
                                                            new CANNON.Vec3(impulseX * 0.5, impulseY * 0.5, impulseZ * 0.5),
                                                            new CANNON.Vec3(0, 0, 0)
                                                        );
                                                    } else if (body.type !== CANNON.Body.STATIC) {
                                                        // Apply a reduced opposite impulse to this body when other is static/absent
                                                        body.applyImpulse(
                                                            new CANNON.Vec3(-impulseX * 0.3, -impulseY * 0.3, -impulseZ * 0.3),
                                                            new CANNON.Vec3(0, 0, 0)
                                                        );
                                                    }
                                                }
                                            }
                                        }
                                    }
                                } catch (error) {
                                    console.warn('Error in part collision response:', error);
                                }
                            });

                            // Set collision filters based on CanCollide
                            if (!instance.CanCollide) {
                                body.collisionFilterGroup = 2;
                                body.collisionFilterMask = 0;
                            } else {
                                body.collisionFilterGroup = 1;
                                body.collisionFilterMask = -1;
                            }

                            // Configure sleep and collision response so parts can come to rest
                            try {
                                body.allowSleep = true;
                                body.sleepSpeedLimit = 0.1;
                                body.sleepTimeLimit = 1;
                                body.collisionResponse = !!instance.CanCollide;
                                // Make parts dynamic for physics simulation
                                body.type = CANNON.Body.DYNAMIC;
                            } catch (err) {
                                // older cannon builds may not support sleep; ignore
                            }

                            physicsWorld.addBody(body);
                            instance.cannonBody = body;
                        }

                        // Set parent to workspace
                        instance.Parent = RobloxEnvironment.Workspace;
                        RobloxEnvironment.Workspace.Children.push(instance);
                        // Add as direct property for easy access
                        RobloxEnvironment.Workspace[instance.Name] = instance;
                        // addToWorkspaceTree(action.varName, 'part'); // Commented out as it's not defined
                    } else if (action.className === 'Frame' ||
                                action.className === 'TextLabel' ||
                                action.className === 'TextButton' ||
                                action.className === 'ScreenGui') {
                        try {
                            const Constructor = window[action.className];
                            if (!Constructor) {
                                throw new Error(`GUI class ${action.className} not found on window`);
                            }
                            const gui = new Constructor(action.varName);
                            variables[action.varName] = gui;

                            // Ensure GUI is visible by default
                            if (gui.Visible !== false) {
                                gui.Visible = true;
                            }
                            // Force update style after creation
                            gui.updateStyle();
                            if (action.parent === 'game.PlayerGui' || action.parent === 'game.Players.LocalPlayer.PlayerGui') {
                                RobloxEnvironment.PlayerGui.AddGui(gui);
                            }
                        } catch (error) {
                            console.error('Error creating GUI instance:', error.message);
                            addConsoleOutput(`Error creating GUI instance: ${error.message}`, 'error');
                            throw error;
                        }
                    }
                    break;

                case 'set_property':
                    let targetObj = variables[action.varName] || luaObjects[action.varName];

                    // Handle property access like workspace.MySound
                    if (!targetObj && action.varName.includes('.')) {
                        targetObj = resolvePropertyAccess(action.varName, variables);
                    }

                    if (targetObj) {
                        const value = parseValue(action.value);

                        switch (action.property) {
                            case 'Position':
                                if (targetObj instanceof GuiObject) {
                                    if (value instanceof RobloxUDim2) {
                                        const threeVec = value.toVector2();
                                        targetObj.Position = threeVec;
                                        targetObj.updateStyle();
                                    } else if (value instanceof THREE.Vector2 || value instanceof RobloxVector2) {
                                        const threeVec = value instanceof RobloxVector2 ? value.toThreeVector2() : value;
                                        targetObj.Position = threeVec;
                                        targetObj.updateStyle();
                                    }
                                } else if (value instanceof THREE.Vector3 || value instanceof RobloxVector3) {
                                    const threeVec = value instanceof RobloxVector3 ? value.toThreeVector3() : value;
                                    targetObj.Position = threeVec;
                                    if (targetObj.threeObject) {
                                        targetObj.threeObject.position.copy(threeVec);
                                    }
                                    // Update physics body if it exists
                                    if (targetObj.cannonBody) {
                                        targetObj.cannonBody.position.copy(threeVec);
                                    }
                                }
                                break;
                            case 'Size':
                                if (targetObj instanceof GuiObject) {
                                    if (value instanceof RobloxUDim2) {
                                        const threeVec = value.toVector2();
                                        targetObj.Size = threeVec;
                                        targetObj.updateStyle();
                                    } else if (value instanceof THREE.Vector2 || value instanceof RobloxVector2) {
                                        const threeVec = value instanceof RobloxVector2 ? value.toThreeVector2() : value;
                                        targetObj.Size = threeVec;
                                        targetObj.updateStyle();
                                    }
                                } else if (value instanceof THREE.Vector3 || value instanceof RobloxVector3) {
                                    const threeVec = value instanceof RobloxVector3 ? value.toThreeVector3() : value;
                                    targetObj.Size = threeVec;
                                    if (targetObj.threeObject) {
                                        // Geometry is BoxGeometry(1,1,1), so scale = Size to match size
                                        targetObj.threeObject.scale.copy(threeVec);
                                    }
                                    // Update physics shape if it exists
                                    if (targetObj.cannonBody && targetObj.cannonBody.shapes[0]) {
                                        const halfExtents = new CANNON.Vec3(threeVec.x / 2, threeVec.y / 2, threeVec.z / 2);
                                        targetObj.cannonBody.shapes[0] = new CANNON.Box(halfExtents);
                                        targetObj.cannonBody.updateMassProperties();
                                        targetObj.cannonBody.updateAABB();
                                        // Remove and re-add to world to ensure collision detection updates
                                        if (physicsWorld) {
                                            physicsWorld.removeBody(targetObj.cannonBody);
                                            physicsWorld.addBody(targetObj.cannonBody);
                                        }
                                    }
                                }
                                break;
                            case 'Rotation':
                                if (value instanceof THREE.Euler || value instanceof RobloxVector3) {
                                    const threeEuler = value instanceof RobloxVector3 ? new THREE.Euler(value.X, value.Y, value.Z) : value;
                                    targetObj.Rotation = threeEuler;
                                    if (targetObj.threeObject) {
                                        targetObj.threeObject.rotation.copy(threeEuler);
                                    }
                                    // Update physics body if it exists
                                    if (targetObj.cannonBody) {
                                        targetObj.cannonBody.quaternion.setFromEuler(threeEuler.x, threeEuler.y, threeEuler.z);
                                    }
                                }
                                break;
                            case 'Color':
                                if (value instanceof THREE.Color) {
                                    targetObj.Color = value;
                                    if (targetObj.threeObject && targetObj.threeObject.material) {
                                        targetObj.threeObject.material.color = value;
                                    }
                                }
                                break;
                            case 'BackgroundColor3':
                                if (targetObj instanceof GuiObject && value instanceof THREE.Color) {
                                    targetObj.BackgroundColor = value;
                                    targetObj.updateStyle();
                                }
                                break;
                            case 'Transparency':
                            case 'transparency':
                                targetObj.Transparency = parseFloat(value) || 0;
                                if (targetObj.threeObject && targetObj.threeObject.material) {
                                    if (targetObj.Transparency > 0) {
                                        targetObj.threeObject.material.transparent = true;
                                        targetObj.threeObject.material.opacity = 1 - targetObj.Transparency;
                                    } else {
                                        targetObj.threeObject.material.transparent = false;
                                        targetObj.threeObject.material.opacity = 1;
                                    }
                                }
                                // Also apply to GUI DOM elements
                                if (targetObj.element) {
                                    targetObj.element.style.opacity = 1 - targetObj.Transparency;
                                }
                                break;
                            case 'BackgroundTransparency':
                                targetObj.BackgroundTransparency = parseFloat(value) || 0;
                                if (targetObj.updateStyle) {
                                    targetObj.updateStyle();
                                }
                                if (targetObj.element) {
                                    targetObj.element.style.opacity = 1 - targetObj.BackgroundTransparency;
                                }
                                break;
                            case 'TextColor3':
                                // Handle Color3.new(r, g, b) format
                                if (typeof value === 'string' && value.startsWith('Color3.new')) {
                                    const colorMatch = value.match(/Color3\.new\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
                                    if (colorMatch) {
                                        const r = parseFloat(colorMatch[1]) || 0;
                                        const g = parseFloat(colorMatch[2]) || 0;
                                        const b = parseFloat(colorMatch[3]) || 0;
                                        targetObj.TextColor3 = new THREE.Color(r, g, b);
                                    }
                                } else if (value instanceof THREE.Color) {
                                    targetObj.TextColor3 = value;
                                }
                                if (targetObj.updateStyle) {
                                    targetObj.updateStyle();
                                }
                                if (targetObj.element && targetObj.TextColor3) {
                                    const hex = '#' + targetObj.TextColor3.getHexString();
                                    targetObj.element.style.color = hex;
                                }
                                break;
                            case 'TextSize':
                                targetObj.TextSize = parseInt(value) || 14;
                                if (targetObj.updateStyle) {
                                    targetObj.updateStyle();
                                }
                                if (targetObj.element) {
                                    targetObj.element.style.fontSize = targetObj.TextSize + 'px';
                                }
                                break;
                            case 'Anchored':
                                targetObj.Anchored = value === 'true' || value === true;
                                if (targetObj.cannonBody) {
                                    targetObj.cannonBody.mass = targetObj.Anchored ? 0 : 1;
                                    targetObj.cannonBody.type = targetObj.Anchored ? CANNON.Body.STATIC : CANNON.Body.DYNAMIC;
                                    targetObj.cannonBody.updateMassProperties();
                                    // Remove and re-add to world to ensure changes take effect
                                    if (physicsWorld) {
                                        physicsWorld.removeBody(targetObj.cannonBody);
                                        physicsWorld.addBody(targetObj.cannonBody);
                                    }
                                }
                                break;
                            case 'CanCollide':
                                targetObj.CanCollide = value === 'true' || value === true;
                                // Update physics body collision filters
                                if (targetObj.cannonBody) {
                                    if (!targetObj.CanCollide) {
                                        targetObj.cannonBody.collisionFilterGroup = 2; // Non-collidable group
                                        targetObj.cannonBody.collisionFilterMask = 0; // Don't collide with anything
                                        targetObj.cannonBody.collisionResponse = false;
                                    } else {
                                        targetObj.cannonBody.collisionFilterGroup = 1; // Collidable group
                                        targetObj.cannonBody.collisionFilterMask = -1; // Collide with everything
                                        targetObj.cannonBody.collisionResponse = true;
                                    }
                                    // Remove and re-add to world to ensure collision detection updates
                                    if (physicsWorld) {
                                        physicsWorld.removeBody(targetObj.cannonBody);
                                        physicsWorld.addBody(targetObj.cannonBody);
                                    }
                                }
                                break;
                            case 'Parent':
                                if (value === 'workspace') {
                                    targetObj.Parent = RobloxEnvironment.Workspace;
                                    RobloxEnvironment.Workspace.Children.push(targetObj);
                                    // addToWorkspaceTree(targetObj.Name, targetObj.ClassName.toLowerCase()); // Commented out as it's not defined
                                } else if (value === 'game.PlayerGui' || value === 'game.Players.LocalPlayer.PlayerGui') {
                                    if (targetObj instanceof GuiObject) {
                                        RobloxEnvironment.PlayerGui.AddGui(targetObj);
                                    }
                                } else {
                                    // Handle parenting to another GUI object
                                    const parentObj = variables[value] || luaObjects[value];
                                    if (parentObj && parentObj instanceof GuiObject && targetObj instanceof GuiObject) {
                                        try {
                                            parentObj.element.appendChild(targetObj.element);
                                            targetObj.Parent = parentObj;
                                            parentObj.Children.push(targetObj);
                                        } catch (error) {
                                            console.error(`Error parenting ${targetObj.Name} to ${parentObj.Name}:`, error.message);
                                        }
                                    }
                                }
                                break;
                            case 'Name':
                                // Update workspace property if this object is in workspace
                                if (targetObj.Parent === RobloxEnvironment.Workspace) {
                                    // Remove old property name
                                    delete RobloxEnvironment.Workspace[targetObj.Name];
                                    // Set new property name
                                    RobloxEnvironment.Workspace[value] = targetObj;
                                    // Keep luaObjects mapping consistent: remove any keys that pointed to this object and add the new name
                                    try {
                                        for (const k of Object.keys(luaObjects)) {
                                            if (luaObjects[k] === targetObj) delete luaObjects[k];
                                        }
                                        luaObjects[value] = targetObj;
                                    } catch (e) {
                                        console.warn('Failed to update luaObjects mapping for Name change', e);
                                    }
                                }
                                targetObj.Name = value;
                                break;
                            case 'Text':
                                if (targetObj instanceof TextLabel || targetObj instanceof TextButton) {
                                    targetObj.Text = value;
                                    targetObj.updateTextStyle();
                                }
                                break;
                            case 'TextColor3':
                                if (targetObj instanceof TextLabel || targetObj instanceof TextButton) {
                                    if (value instanceof THREE.Color) {
                                        targetObj.TextColor = value;
                                        targetObj.updateTextStyle();
                                    }
                                }
                                break;
                            case 'TextSize':
                                if (targetObj instanceof TextLabel || targetObj instanceof TextButton) {
                                    targetObj.TextSize = parseInt(value) || 14;
                                    targetObj.updateTextStyle();
                                }
                                break;
                        }
                        console.log(`Set ${action.varName}.${action.property} = ${action.value}`);
                    }
                    break;

                case 'connect_event':
                    let eventObj = variables[action.varName] || luaObjects[action.varName];

                    // Handle property access like workspace.MyPart
                    if (!eventObj && action.varName.includes('.')) {
                        eventObj = resolvePropertyAccess(action.varName, variables);
                    }

                    if (eventObj) {
                        // Create event connection
                        const connection = {
                            object: eventObj,
                            eventName: action.eventName,
                            callback: function(...args) {
                                // Execute the function body with access to the current variables scope
                                executeFunctionBody(action.functionLines, action.params, args, variables);
                            }
                        };

                        // Store connection for cleanup
                        if (!eventObj.connections) eventObj.connections = [];
                        eventObj.connections.push(connection);

                        // Set up actual event listeners based on event type
                        if (action.eventName === 'Touched') {
                            // For parts, we'll simulate touch events
                            eventObj.touched = false;
                        } else if (action.eventName === 'MouseButton1Click') {
                            // For GUI objects, use the Connect method if available (TextButton), otherwise direct listener
                            if (eventObj instanceof GuiObject && eventObj.element) {
                                if (eventObj.MouseButton1Click && eventObj.MouseButton1Click.Connect) {
                                    // Use the object's Connect method (for TextButton)
                                    eventObj.MouseButton1Click.Connect(() => {
                                        // Execute the function body with access to the current variables scope
                                        executeFunctionBody(action.functionLines, action.params, [], variables);
                                    });
                                } else {
                                    // Fallback to direct event listener for other GUI objects
                                    eventObj.element.addEventListener('click', () => {
                                        // Execute the function body with access to the current variables scope
                                        executeFunctionBody(action.functionLines, action.params, [], variables);
                                    });
                                }
                            }
                        }

                        RobloxEnvironment.connections = RobloxEnvironment.connections || [];
                        RobloxEnvironment.connections.push(connection);
                    }
                    break;

                case 'define_function':
                    functions[action.funcName] = action.functionLines;
                    break;

                case 'call_method':
                    let methodObj = variables[action.varName] || luaObjects[action.varName];

                    // Handle property access like workspace.MySound
                    if (!methodObj && action.varName.includes('.')) {
                        methodObj = resolvePropertyAccess(action.varName, variables);
                    }

                    if (methodObj) {
                        switch (action.method) {
                            case 'Spin':
                            case 'spin':
                                if (methodObj.Spin) {
                                    let axis = null;
                                    if (action.args && action.args.trim()) {
                                        const args = action.args.split(',').map(arg => arg.trim());
                                        if (args.length > 0 && args[0]) {
                                            axis = parseValue(args[0]);
                                        }
                                    }
                                    methodObj.Spin(axis);
                                }
                                break;
                            case 'Play':
                                if (methodObj.ClassName === 'Sound') {
                                    // Mark sound as pending play - will be played on next user interaction
                                    methodObj.pendingPlay = true;
                                    console.log('Sound marked for playback on next user interaction');

                                    // Try to play immediately (might work if user has interacted recently)
                                    playSoundIfAllowed(methodObj);
                                }
                                break;
                            case 'Stop':
                                if (methodObj.ClassName === 'Sound') {
                                    if (methodObj.html5Audio) {
                                        methodObj.html5Audio.pause();
                                        methodObj.html5Audio.currentTime = 0;
                                    }
                                    if (methodObj.audio) {
                                        methodObj.audio.stop();
                                    }
                                    methodObj.isPlaying = false;
                                    methodObj.pendingPlay = false; // Cancel any pending play
                                }
                                break;
                            case 'Destroy':
                                if (methodObj.Destroy) {
                                    methodObj.Destroy();
                                    delete variables[action.varName];
                                    delete luaObjects[action.varName];
                                }
                                break;
                            case 'wait':
                                // Handle wait() function
                                const waitTime = parseFloat(action.args) || 0.03; // Default to 0.03 seconds
                                await RobloxEnvironment.wait(waitTime);
                                addOutput(`Waited for ${waitTime} seconds`, 'success');
                                break;
                        }
                    } else if (functions[action.varName]) {
                        // Call user-defined function
                        executeFunctionBody(functions[action.varName], '', []);
                    } else {
                        // Check if it's a script object in the workspace
                        const scriptObj = luaObjects[action.varName];
                        if (scriptObj && scriptObj.ClassName === 'Script' && scriptObj.Source) {
                            // Execute the script's source code
                            try {
                                const scriptActions = interpretLuaScript(scriptObj.Source);
                                executeLuaActions(scriptActions);
                                console.log(`Executed script: ${action.varName}`);
                            } catch (error) {
                                console.error(`Error executing script ${action.varName}: ${error.message}`);
                                addConsoleOutput(`Error executing script ${action.varName}: ${error.message}`, 'error');
                            }
                        } else {
                            console.error(`Error: Object '${action.varName}' not found for method call`);
                            addConsoleOutput(`Error: Object '${action.varName}' not found for method call`, 'error');
                        }
                    }
                    break;

                case 'set_variable':
                    // Handle complex property access like game.Workspace.part_1
                    if (action.value.includes('.')) {
                        const parts = action.value.split('.');
                        let currentObj = variables[parts[0]] || window[parts[0]];
                        for (let i = 1; i < parts.length; i++) {
                            if (currentObj && currentObj[parts[i]]) {
                                currentObj = currentObj[parts[i]];
                            } else {
                                console.log(`[DEBUG] Property access failed at "${parts[i]}" in "${action.value}"`);
                                currentObj = undefined;
                                break;
                            }
                        }
                        variables[action.varName] = currentObj;
                        console.log(`[DEBUG] Set variable ${action.varName} to:`, currentObj);
                    } else {
                        variables[action.varName] = parseValue(action.value);
                    }
                    break;

                case 'animate_part':
                    let animObj = variables[action.varName] || luaObjects[action.varName];

                    // Handle property access like workspace.MyPart
                    if (!animObj && action.varName.includes('.')) {
                        animObj = resolvePropertyAccess(action.varName, variables);
                    }

                    if (animObj && animObj.threeObject) {
                        // Simple animation: move in a circle
                        const time = performance.now() * 0.001;
                        const radius = 5;
                        const x = Math.cos(time) * radius;
                        const z = Math.sin(time) * radius;
                        const newPos = new THREE.Vector3(x, animObj.Position.y, z);
                        animObj.Position = newPos;
                        animObj.threeObject.position.copy(newPos);
                        if (animObj.cannonBody) {
                            animObj.cannonBody.position.copy(newPos);
                        }
                    }
                    break;

                case 'spin_part':
                    let spinObj = variables[action.varName] || luaObjects[action.varName];

                    // Handle property access like workspace.MyPart
                    if (!spinObj && action.varName.includes('.')) {
                        spinObj = resolvePropertyAccess(action.varName, variables);
                    }

                    if (spinObj && spinObj.threeObject) {
                        // Spin the part around Y axis
                        const time = performance.now() * 0.001;
                        const rotationSpeed = 2; // radians per second
                        spinObj.threeObject.rotation.y = time * rotationSpeed;
                        spinObj.Rotation.y = time * rotationSpeed;
                        if (spinObj.cannonBody) {
                            spinObj.cannonBody.quaternion.setFromEuler(0, time * rotationSpeed, 0);
                        }
                    }
                    break;

                case 'print':
                    console.log('LUA PRINT:', action.message);
                    // Also show in console
                    addConsoleOutput(action.message, 'info');
                    // Also show in chat or UI if possible
                    if (typeof appendChatBoxMessage === 'function') {
                        appendChatBoxMessage('SYSTEM', '[SCRIPT] ' + action.message);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error executing action:', error);
            // Also show in console
            addConsoleOutput(error.message, 'error');
            throw error;
        }
    }
}

function executeFunctionBody(functionLines, paramString, args, variables = {}) {
    // Simple function execution - for now just execute the lines
    const functionActions = interpretLuaScript(functionLines.join('\n'));
    executeLuaActions(functionActions, variables);
}

function parseValue(valueStr) {
    // Parse Vector2.new(x, y)
    const vector2Match = valueStr.match(/Vector2\.new\(([^,]+),\s*([^)]+)\)/);
    if (vector2Match) {
        return new RobloxVector2(
            parseFloat(vector2Match[1]),
            parseFloat(vector2Match[2])
        );
    }

    // Parse Vector3.new(x, y, z)
    const vectorMatch = valueStr.match(/Vector3\.new\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    if (vectorMatch) {
        return new RobloxVector3(
            parseFloat(vectorMatch[1]),
            parseFloat(vectorMatch[2]),
            parseFloat(vectorMatch[3])
        );
    }

    // Parse UDim2.new(scaleX, offsetX, scaleY, offsetY)
    const udim2Match = valueStr.match(/UDim2\.new\(([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    if (udim2Match) {
        return new RobloxUDim2(
            parseFloat(udim2Match[1]),
            parseFloat(udim2Match[2]),
            parseFloat(udim2Match[3]),
            parseFloat(udim2Match[4])
        );
    }

    // Parse CFrame.new(x, y, z) - simplified, just return position vector for now
    const cframeMatch = valueStr.match(/CFrame\.new\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    if (cframeMatch) {
        return new RobloxVector3(
            parseFloat(cframeMatch[1]),
            parseFloat(cframeMatch[2]),
            parseFloat(cframeMatch[3])
        );
    }

    // Parse Color3.new(r, g, b)
    const colorMatch = valueStr.match(/Color3\.new\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
    if (colorMatch) {
        return new THREE.Color(
            parseFloat(colorMatch[1]),
            parseFloat(colorMatch[2]),
            parseFloat(colorMatch[3])
        );
    }

    // Parse strings (remove both single and double quotes)
    if ((valueStr.startsWith("'") && valueStr.endsWith("'")) ||
        (valueStr.startsWith('"') && valueStr.endsWith('"'))) {
        return valueStr.slice(1, -1);
    }

    // Parse numbers
    if (!isNaN(valueStr)) {
        return parseFloat(valueStr);
    }

    // Return as string for other cases
    return valueStr;
}

// Roblox Vector3 class for Lua scripts
class RobloxVector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.X = x;
        this.Y = y;
        this.Z = z;
    }

    static new(x, y, z) {
        return new RobloxVector3(x, y, z);
    }

    // Convert to THREE.Vector3 for internal use
    toThreeVector3() {
        return new THREE.Vector3(this.X, this.Y, this.Z);
    }

    // Basic operations
    add(other) {
        return new RobloxVector3(this.X + other.X, this.Y + other.Y, this.Z + other.Z);
    }

    multiply(scalar) {
        return new RobloxVector3(this.X * scalar, this.Y * scalar, this.Z * scalar);
    }

    // For debugging
    toString() {
        return `Vector3(${this.X}, ${this.Y}, ${this.Z})`;
    }
}

// Roblox Vector2 class for Lua scripts
class RobloxVector2 {
    constructor(x = 0, y = 0) {
        this.X = x;
        this.Y = y;
    }

    static new(x, y) {
        return new RobloxVector2(x, y);
    }

    // Convert to THREE.Vector2 for internal use
    toThreeVector2() {
        return new THREE.Vector2(this.X, this.Y);
    }

    // Basic operations
    add(other) {
        return new RobloxVector2(this.X + other.X, this.Y + other.Y);
    }

    multiply(scalar) {
        return new RobloxVector2(this.X * scalar, this.Y * scalar);
    }

    // For debugging
    toString() {
        return `Vector2(${this.X}, ${this.Y})`;
    }
}

// Roblox UDim2 class for Lua scripts
class RobloxUDim2 {
    constructor(scaleX = 0, offsetX = 0, scaleY = 0, offsetY = 0) {
        this.ScaleX = scaleX;
        this.OffsetX = offsetX;
        this.ScaleY = scaleY;
        this.OffsetY = offsetY;
    }

    static new(scaleX, offsetX, scaleY, offsetY) {
        return new RobloxUDim2(scaleX, offsetX, scaleY, offsetY);
    }

    // Convert to THREE.Vector2 in pixels (assuming full screen for PlayerGui)
    toVector2() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        return new THREE.Vector2(
            this.ScaleX * width + this.OffsetX,
            this.ScaleY * height + this.OffsetY
        );
    }

    // For debugging
    toString() {
        return `UDim2(${this.ScaleX}, ${this.OffsetX}, ${this.ScaleY}, ${this.OffsetY})`;
    }
}

// Make Vector3, Vector2, and UDim2 available globally for Lua scripts
window.Vector3 = RobloxVector3;
window.Vector2 = RobloxVector2;
window.UDim2 = RobloxUDim2;

// ===== GUI CLASSES =====

class GuiObject extends RobloxInstance {
    constructor(className, name) {
        super(className, name);
        this.Position = new THREE.Vector2(0, 0);
        this.Size = new THREE.Vector2(200, 200);
        this.BackgroundColor = new THREE.Color(0.5, 0.5, 0.5);
        this.BackgroundTransparency = 0;
        this.BorderColor = new THREE.Color(0.1, 0.1, 0.1);
        this.BorderSizePixel = 1;
        this.Visible = true;
        this.ZIndex = 1;

        // Create DOM element
        this.element = document.createElement('div');
        this.element.className = 'rogold-gui ' + className.toLowerCase();
        this.element.style.position = 'absolute';
        this.updateStyle();

        // Add to document if parent is PlayerGui
        if (this.Parent === RobloxEnvironment.PlayerGui) {
            RobloxEnvironment.PlayerGui.AddGui(this);
        }
    }

    updateStyle() {
        try {
            this.element.style.position = 'absolute';
            this.element.style.left = this.Position.x + 'px';
            this.element.style.top = this.Position.y + 'px';
            this.element.style.width = this.Size.x + 'px';
            this.element.style.height = this.Size.y + 'px';
            this.element.style.backgroundColor = `#${this.BackgroundColor.getHexString()}`;
            this.element.style.opacity = 1 - this.BackgroundTransparency;
            this.element.style.border = `${this.BorderSizePixel}px solid #${this.BorderColor.getHexString()}`;
            this.element.style.display = this.Visible ? 'block' : 'none';
            this.element.style.zIndex = this.ZIndex || 1;
            this.element.style.boxSizing = 'border-box';
        } catch (error) {
            console.error(`Error updating style for ${this.ClassName} ${this.Name}:`, error.message);
        }
    }

    Destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        super.Destroy();
    }
}

class Frame extends GuiObject {
    constructor(name) {
        super('Frame', name);
        this.element.style.backgroundColor = '#ffffff';
        this.element.style.border = '1px solid #000000';
    }
}

class TextLabel extends GuiObject {
    constructor(name) {
        super('TextLabel', name);
        this.Text = '';
        this.TextColor = new THREE.Color(0, 0, 0);
        this.TextSize = 14;
        this.Font = 'Arial';
        this.TextWrapped = true;
        this.TextXAlignment = 'Left';
        this.TextYAlignment = 'Top';

        this.element.style.color = '#000000';
        this.element.style.fontSize = this.TextSize + 'px';
        this.element.style.fontFamily = this.Font;
        this.element.style.padding = '5px';
        this.updateTextStyle();
    }

    updateTextStyle() {
        try {
            this.element.textContent = this.Text;
            this.element.style.color = `#${this.TextColor.getHexString()}`;
            this.element.style.fontSize = this.TextSize + 'px';
            this.element.style.fontFamily = this.Font;
            this.element.style.whiteSpace = this.TextWrapped ? 'normal' : 'nowrap';
            this.element.style.textAlign = this.TextXAlignment.toLowerCase();
            this.element.style.verticalAlign = this.TextYAlignment.toLowerCase();
        } catch (error) {
            console.error(`Error updating text style for ${this.ClassName} ${this.Name}:`, error.message);
        }
    }
}

class TextButton extends GuiObject {
    constructor(name) {
        super('TextButton', name);
        this.Text = '';
        this.TextColor = new THREE.Color(0, 0, 0);
        this.TextSize = 14;
        this.Font = 'Arial';
        this.AutoButtonColor = true;

        this.element.style.cursor = 'pointer';
        this.element.style.textAlign = 'center';
        this.element.style.lineHeight = '2';
        this.element.style.userSelect = 'none';
        this.updateTextStyle();

        if (this.AutoButtonColor) {
            this.setupHoverEffects();
        }

        // Event system compatible with Lua :Connect
        this.MouseButton1Click = {
            Connect: (callback) => {
                try {
                    this.element.addEventListener('click', callback);
                    return { Disconnect: () => this.element.removeEventListener('click', callback) };
                } catch (error) {
                    console.error('Error connecting MouseButton1Click event:', error);
                    addOutput(`Error connecting MouseButton1Click for ${this.Name}: ${error.message}`, 'error');
                    return { Disconnect: () => {} };
                }
            }
        };
    }

    updateTextStyle() {
        try {
            this.element.textContent = this.Text;
            this.element.style.color = `#${this.TextColor.getHexString()}`;
            this.element.style.fontSize = this.TextSize + 'px';
            this.element.style.fontFamily = this.Font;
        } catch (error) {
            console.error(`Error updating text style for ${this.ClassName} ${this.Name}:`, error.message);
        }
    }

    setupHoverEffects() {
        try {
            this.element.addEventListener('mouseenter', () => {
                const color = this.BackgroundColor.clone().multiplyScalar(0.9);
                this.element.style.backgroundColor = `#${color.getHexString()}`;
                // Change cursor to cursor2 when hovering
                this.element.style.cursor = "url('imgs/cursor2.png'), pointer";
            });
            this.element.addEventListener('mouseleave', () => {
                this.element.style.backgroundColor = `#${this.BackgroundColor.getHexString()}`;
                // Revert cursor back to pointer
                this.element.style.cursor = 'pointer';
            });
        } catch (error) {
            console.error(`Error setting up hover effects for ${this.ClassName} ${this.Name}:`, error.message);
        }
    }
}

class ScreenGui extends GuiObject {
    constructor(name) {
        super('ScreenGui', name);
        this.element.style.position = 'absolute';
        this.element.style.top = '0';
        this.element.style.left = '0';
        this.element.style.width = '100%';
        this.element.style.height = '100%';
        this.element.style.pointerEvents = 'none';
        this.element.style.zIndex = '1000';
        this.BackgroundTransparency = 1; // ScreenGui should be invisible
        this.updateStyle();

        // In test mode, ScreenGui acts as a container that routes to game GUI container
        if (isTestMode) {
            RobloxEnvironment.PlayerGui.AddGui(this);
        }
    }

    updateStyle() {
        // ScreenGui is always full screen and invisible
        this.element.style.position = 'absolute';
        this.element.style.top = '0';
        this.element.style.left = '0';
        this.element.style.width = '100%';
        this.element.style.height = '100%';
        this.element.style.pointerEvents = 'none';
        this.element.style.zIndex = '1000';
        this.element.style.backgroundColor = 'transparent';
    }
}

// Unified GUI container creation - ensure only one exists
if (!document.getElementById('gui-container')) {
    const container = document.createElement('div');
    container.id = 'gui-container';
    container.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: auto;
        z-index: 100;
        background-color: rgba(0, 0, 0, 0.1);
        border: 2px dashed #666;
        box-sizing: border-box;
    `;
    container.style.display = 'none';
    document.body.appendChild(container);
}

// Create ScreenGui container for test mode
if (!document.getElementById('screen-gui-container')) {
    const screenContainer = document.createElement('div');
    screenContainer.id = 'screen-gui-container';
    screenContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1000;
        background-color: transparent;
        box-sizing: border-box;
    `;
    screenContainer.style.display = 'none';
    document.body.appendChild(screenContainer);
}

// Add GUI container to RobloxEnvironment
RobloxEnvironment.PlayerGui = {
    Children: [],
    AddGui: function(gui) {
        try {
            if (gui instanceof GuiObject) {
                let container;
                if (gui.ClassName === 'ScreenGui') {
                    // ScreenGui uses its own container in test mode
                    container = document.getElementById('screen-gui-container');
                } else {
                    container = document.getElementById('gui-container');
                }

                if (container && gui.element) {
                    if (!container.contains(gui.element)) {
                        container.appendChild(gui.element);
                    }
                    if (!this.Children.includes(gui)) {
                        this.Children.push(gui);
                        if (this.Children.length === 1) {
                            container.style.display = 'block';
                        }
                    }

                    // Force update style after adding to DOM
                    gui.updateStyle();
                }
            }
        } catch (error) {
            console.error('Error adding GUI to PlayerGui:', error.message);
        }
    },
    RemoveGui: function(gui) {
        try {
            const index = this.Children.indexOf(gui);
            if (index > -1) {
                this.Children.splice(index, 1);
                if (gui.element && gui.element.parentNode) {
                    gui.element.parentNode.removeChild(gui.element);
                }
                if (this.Children.length === 0) {
                    const container = document.getElementById('gui-container');
                    if (container) {
                        container.style.display = 'none';
                    }
                    const screenContainer = document.getElementById('screen-gui-container');
                    if (screenContainer) {
                        screenContainer.style.display = 'none';
                    }
                }
            }
        } catch (error) {
            console.error('Error removing GUI from PlayerGui:', error.message);
        }
    }
};

const guiStyle = document.createElement('style');
guiStyle.textContent = `
.rogold-gui {
    position: absolute;
    box-sizing: border-box;
    font-family: Arial, sans-serif;
}

.rogold-gui.frame {
    background-color: #ffffff;
    border: 1px solid #000000;
}

.rogold-gui.textlabel {
    padding: 5px;
}

.rogold-gui.textbutton {
    background-color: #e0e0e0;
    border: 1px solid #000000;
    cursor: pointer;
    transition: background-color 0.1s;
}

.rogold-gui.textbutton:hover {
    background-color: #cccccc;
}
`;
document.head.appendChild(guiStyle);

// Expose GUI classes globally
window.GuiObject = GuiObject;

// Remove duplicate container creation - handled above

// Ensure global PlayerGui references the unified RobloxEnvironment.PlayerGui
window.PlayerGui = RobloxEnvironment.PlayerGui;

// Make Instance.new available globally for Lua scripts
window.Instance = {
    new: function(className) {
        switch (className) {
            case 'Frame':
                return new Frame('Frame');
            case 'TextLabel':
                return new TextLabel('TextLabel');
            case 'TextButton':
                return new TextButton('TextButton');
            case 'ScreenGui':
                return new ScreenGui('ScreenGui');
            case 'Part':
                return new RobloxInstance('Part', 'Part');
            default:
                return new RobloxInstance(className, className);
        }
    }
};

// Ensure ScreenGui is properly recognized as GuiObject for parenting
// ScreenGui inherits from GuiObject, so it should work, but let's make sure

// Make game object available globally for Lua scripts
window.game = {
    PlayerGui: RobloxEnvironment.PlayerGui,
    Workspace: RobloxEnvironment.Workspace
};

// Make GUI classes available globally for Lua scripts (immediately)
window.Frame = Frame;
window.TextLabel = TextLabel;
window.TextButton = TextButton;
window.ScreenGui = ScreenGui;

// Ensure GUI container is above the game canvas
if (RobloxEnvironment.PlayerGui.element) {
    RobloxEnvironment.PlayerGui.element.style.zIndex = '1000';
}

let rotateCameraLeft = false;
let rotateCameraRight = false;
let zoomCameraIn = false;
let zoomCameraOut = false;

let animationTime = 0; // For walking animation

let raycaster;

const objects = [];
let prevTime = performance.now();
const velocidade = 20.0; // Movement speed

let cameraOffset;
let cameraTarget = new THREE.Vector3();
let baseCameraOffset;
let smoothedCameraPosition = new THREE.Vector3();

let audioListener, walkSound, jumpSound, clickSound, spawnSound, deathSound, ouchSound, launchSound, currentDeathSound, danceMusic;
let isMobile = false; // This will be updated dynamically
let controlOverride = localStorage.getItem('controlOverride'); // 'pc', 'mobile', or null

let renderTarget, postScene, postCamera;
let pixelatedEffectEnabled = localStorage.getItem('rogold_pixelated') !== 'false'; // Default to enabled, but check localStorage
let audioMuted = localStorage.getItem('rogold_muted') === 'true'; // Default to not muted
let isTestMode = false; // Will be set in loadStudioTestObjects

function applyMuteSetting() {
    const defaultVolumes = {
        walkSound: 0.5,
        jumpSound: 0.5,
        clickSound: 0.5,
        spawnSound: 0.5,
        deathSound: 0.5,
        ouchSound: 0.5,
        launchSound: 0.5,
        explosionSound: 0.8,
        danceMusic: 0.7
    };

    [walkSound, jumpSound, clickSound, spawnSound, deathSound, ouchSound, launchSound, explosionSound, danceMusic].forEach((sound, index) => {
        if (sound) {
            const soundName = Object.keys(defaultVolumes)[index];
            sound.setVolume(audioMuted ? 0 : defaultVolumes[soundName]);
        }
    });
}

let socket = null;
let otherPlayers = {};
let playerId;
// De-dup and sync caches
let pendingPlayers = new Set();
let headTemplate = null;
const pendingHats = {};
const pendingFaces = {};

let lastSentTime = 0;
const sendInterval = 100; // ms, so 10 times per second

// Physics ownership for parts
let partOwnership = {};
let lastPartUpdate = 0;

function playClickSound() {
    if (clickSound && clickSound.buffer) {
        if (clickSound.isPlaying) {
            clickSound.stop();  
        }
        clickSound.play();
    }
}

function areMobileControlsActive() {
    if (controlOverride === 'mobile') return true;
    if (controlOverride === 'pc') return false;
    // 'auto' mode
    return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    if (msg.toLowerCase() === '/e dance') {
        startDance();
        input.value = '';
        return;
    }
    if (msg.toLowerCase() === '/e daniel' && nickname === 'daniel244') {
        socket.emit('danielCommand');
    }
    if (msg.startsWith('/e explode ') && nickname === 'notrealregi') {
        const target = msg.split(' ')[2];
        socket.emit('adminExplode', { target });
    }
    if (msg && socket && socket.connected) {
        socket.emit('chat', msg);
        input.value = '';
    }
}

// Listen for chat messages from server
// Ensure this runs after DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    const chatSendBtn = document.getElementById('chat-send');
    const chatInput = document.getElementById('chat-input');
    if (chatSendBtn && chatInput) {
        chatSendBtn.addEventListener('click', sendChatMessage);
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') sendChatMessage();
        });
    }

    // Player list is now always visible and simplified
});

// Chat listener is now bound after socket connects inside initSocket()

// Append message to chat box
function appendChatBoxMessage(nickname, message) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    // Use data attribute for player so CSS can render a retro prefix
    msgDiv.setAttribute('data-player', nickname);
    msgDiv.textContent = `${nickname}: ${message}`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}
// Show bubble chat above player
function showBubbleChat(chatPlayerId, nickname, message) {
    let targetPlayer = chatPlayerId === playerId ? player : otherPlayers[chatPlayerId];
    if (!targetPlayer) return;

    // Try to find the head mesh
    let headMesh = null;
    targetPlayer.traverse(child => {
        if (child.isMesh && child.name === "Head") {
            headMesh = child;
        }
    });
    // Fallback to player group if head not found
    const bubbleTarget = headMesh || targetPlayer;

    // Create bubble element
    const bubble = document.createElement('div');
    bubble.className = 'bubble-chat';
    bubble.textContent = message;
    bubble.style.position = 'absolute';
    bubble.style.background = 'rgba(255,255,255,0.85)';
    bubble.style.borderRadius = '16px';
    bubble.style.padding = '6px 14px';
    bubble.style.fontSize = '16px';
    bubble.style.pointerEvents = 'none';
    bubble.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    bubble.style.transition = 'opacity 0.3s';
    bubble.style.zIndex = 200;

    document.body.appendChild(bubble);

    // Position bubble above head
    function updateBubblePosition() {
        let worldPos = new THREE.Vector3();
        bubbleTarget.getWorldPosition(worldPos);
        worldPos.y += 1.2; // Adjust to be above the head

        // Project to screen
        let screenPos = worldPos.clone().project(camera);
        let x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
        let y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

        bubble.style.left = `${x - bubble.offsetWidth / 2}px`;
        bubble.style.top = `${y - bubble.offsetHeight - 10}px`;
    }

    updateBubblePosition();
    let interval = setInterval(updateBubblePosition, 16);

    // Remove bubble after 3 seconds
    setTimeout(() => {
        bubble.style.opacity = '0';
        setTimeout(() => {
            bubble.remove();
            clearInterval(interval);
        }, 300);
    }, 3000);
}

function createPlayer(headModel) {

    const playerGroup = new THREE.Group();
    playerGroup.name = "Player";

    // Materials - Classic Roblox "noob" colors
    const torsoMaterial = new THREE.MeshLambertMaterial({ color: 0x00A2FF }); // Blue
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x80C91C }); // Green

    // Arm Materials - with stud texture on top and bottom
    const textureLoader = new THREE.TextureLoader();

    const topStudsTexture = textureLoader.load('imgs/roblox-stud.png');
    topStudsTexture.wrapS = THREE.RepeatWrapping;
    topStudsTexture.wrapT = THREE.RepeatWrapping;
    topStudsTexture.repeat.set(1, 1);

    const bottomStudsTexture = textureLoader.load('imgs/Studdown.png');
    bottomStudsTexture.wrapS = THREE.RepeatWrapping;
    bottomStudsTexture.wrapT = THREE.RepeatWrapping;
    bottomStudsTexture.repeat.set(1, 1);

    const armTopMaterial = new THREE.MeshLambertMaterial({ color: 0xFAD417, map: topStudsTexture });
    armTopMaterial.name = "ArmTop"; // For color changing

    const armBottomMaterial = new THREE.MeshLambertMaterial({ color: 0xFAD417, map: bottomStudsTexture });
    armBottomMaterial.name = "ArmBottom"; // For color changing

    const armSidesMaterial = new THREE.MeshLambertMaterial({ color: 0xFAD417 });
    armSidesMaterial.name = "ArmSides"; // For color changing

    const armMaterials = [
        armSidesMaterial, // right
        armSidesMaterial, // left
        armTopMaterial,   // top
        armBottomMaterial, // bottom
        armSidesMaterial, // front
        armSidesMaterial  // back
    ];

    // Torso
    const torsoGeometry = new THREE.BoxGeometry(2, 2, 1);
    const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
    torso.castShadow = false;
    torso.receiveShadow = false;
    torso.name = "Torso"; // Name for easy selection
    playerGroup.add(torso);

    // Head
    const head = headModel;
    head.position.y = 1.7;
    head.scale.set(1.15, 1.15, 1.15);
    head.castShadow = false;
    head.receiveShadow = false;
    playerGroup.add(head);
    playerGroup.userData.head = head;

    // -- Roblox 2006 Badge --
    const badgeTextureLoader = new THREE.TextureLoader();
    const badgeTexture = badgeTextureLoader.load('imgs/Roblox_icon_2006.svg');
    const badgeMaterial = new THREE.MeshLambertMaterial({ 
        map: badgeTexture,
        transparent: true,
        opacity: 1
    });
    
    const badgeGeometry = new THREE.PlaneGeometry(0.4, 0.4);
    const badge = new THREE.Mesh(badgeGeometry, badgeMaterial);
    badge.position.set(0.6, 0.75, 0.51);
    badge.rotation.y = 0;
    torso.add(badge);

    // -- Limbs with Pivots for Animation --

    const armGeometry = new THREE.BoxGeometry(1, 2, 1);
    const legGeometry = new THREE.BoxGeometry(1, 2, 1);

    // Left Arm
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-1.5, 1, 0); // Shoulder position
    const leftArm = new THREE.Mesh(armGeometry, armMaterials);
    leftArm.name = "Arm"; // Name for easy selection
    leftArm.position.y = -1; // Move down from pivot
    leftArm.castShadow = false;
    leftArm.receiveShadow = false;
    leftArmPivot.add(leftArm);
    playerGroup.add(leftArmPivot);
    playerGroup.leftArm = leftArmPivot;

    // Right Arm
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(1.5, 1, 0); // Shoulder position
    const rightArm = new THREE.Mesh(armGeometry, armMaterials);
    rightArm.name = "Arm"; // Name for easy selection
    rightArm.position.y = -1; // Move down from pivot
    rightArm.castShadow = false;
    rightArm.receiveShadow = false;
    rightArmPivot.add(rightArm);
    playerGroup.add(rightArmPivot);
    playerGroup.rightArm = rightArmPivot;

    // Left Leg
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.5, -1, 0); // Hip position
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
    leftLeg.name = "Leg"; // Name for easy selection
    leftLeg.position.y = -1; // Move down from pivot
    leftLeg.castShadow = false;
    leftLeg.receiveShadow = false;
    leftLegPivot.add(leftLeg);
    playerGroup.add(leftLegPivot);
    playerGroup.leftLeg = leftLegPivot;

    // Right Leg
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.5, -1, 0); // Hip position
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.name = "Leg"; // Name for easy selection
    rightLeg.position.y = -1; // Move down from pivot
    rightLeg.castShadow = false;
    rightLeg.receiveShadow = false;
    rightLegPivot.add(rightLeg);
    playerGroup.add(rightLegPivot);
    playerGroup.rightLeg = rightLegPivot;

    // The bottom of the legs is at y = -1 (hip) - 2 (leg length) = -3.
    // For physics, keep at y=0 and offset physics body instead.
    playerGroup.position.y = 0;

    // Calculate bounding box for exact dimensions
    const box = new THREE.Box3().setFromObject(playerGroup);
    const size = box.getSize(new THREE.Vector3());
    console.log('Player visual dimensions (width x height x depth):', size.x, size.y, size.z);

    return playerGroup;
}

function updatePlayerColors(player, colors) {
    if (!player || !colors) return;

    player.traverse((child) => {
        if (child.isMesh) {
            switch (child.name) {
                case "Head":
                    child.material.color.set(colors.head);
                    break;
                case "Torso":
                    child.material.color.set(colors.torso);
                    break;
                case "Leg":
                    child.material.color.set(colors.legs);
                    break;
                case "Arm":
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => {
                            if (material.name === "ArmTop" || material.name === "ArmSides" || material.name === "ArmBottom") {
                                material.color.set(colors.arms);
                            }
                        });
                    }
                    break;
            }
        }
    });
}

function createRemotePlayer(headModel, playerData) {
    const playerGroup = createPlayer(headModel);
    playerGroup.position.set(playerData.x, playerData.y + 0.65, playerData.z); // Offset visual upward to align feet with physics body bottom
    playerGroup.rotation.y = playerData.rotation;
    playerGroup.userData.targetPosition = new THREE.Vector3(playerData.x, playerData.y + 0.65, playerData.z);
    playerGroup.userData.targetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, playerData.rotation, 0));
    updatePlayerColors(playerGroup, playerData.colors);
    // Hat application is handled in ensureRemotePlayer() to avoid duplicate loads

    // Salve o nickname para uso na lista
    playerGroup.userData.nickname = playerData.nickname || "Guest";

    // Load face for remote player
    const faceId = playerData.faceId || 'imgs/OriginalGlitchedFace.webp';
    addFaceToPlayer(playerGroup, faceId);

    return playerGroup;
}

function ensureRemotePlayer(playerData) {
    if (!playerData || playerData.id === playerId) return;
    if (otherPlayers[playerData.id] || pendingPlayers.has(playerData.id)) {
        return;
    }
    pendingPlayers.add(playerData.id);

    const build = (head) => {
        // Normalize head mesh properties as in other loaders
        head.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
                child.material = new THREE.MeshLambertMaterial({ color: 0xFAD417 });
                child.name = "Head";
            }
        });
        const remotePlayer = createRemotePlayer(head, playerData);
        remotePlayer.userData.playerId = playerData.id;
        otherPlayers[playerData.id] = remotePlayer;
        scene.add(remotePlayer);

        // Apply any pending hat update, falling back to initial hat from snapshot
        const hatId = pendingHats[playerData.id] ?? playerData.hatId;
        if (hatId) {
            addHatToPlayer(remotePlayer, hatId);
            delete pendingHats[playerData.id];
        }

        // Apply any pending face update, falling back to initial face from snapshot
        const faceId = pendingFaces[playerData.id] ?? playerData.faceId ?? 'imgs/OriginalGlitchedFace.webp';
        addFaceToPlayer(remotePlayer, faceId);
        delete pendingFaces[playerData.id];

        pendingPlayers.delete(playerData.id);
        updatePlayerList();
    };

    if (headTemplate) {
        build(headTemplate.clone(true));
    } else {
        const loader = new GLTFLoader();
        loader.load('old_roblox_head_2007-2009.glb', (gltf) => {
            const head = gltf.scene;
            build(head);
        }, undefined, () => {
            pendingPlayers.delete(playerData.id);
        });
    }
}

function initSocket() {
    // Get the current host for socket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    // Derive a logical room from the game title in the URL, defaulting to "default"
    const params = new URLSearchParams(window.location.search);
    const room = params.get('game') || 'default';

    socket = io(`${protocol}//${host}`, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        // Pass room info to the server so it can isolate traffic per game/room
        auth: { room }
    });
    
    const statusEl = document.getElementById('online-status');
    
    socket.on('connect', () => {
        playerId = socket.id;
        const faceId = localStorage.getItem('rogold_face') || 'imgs/OriginalGlitchedFace.webp';
        socket.emit('register', { nickname, faceId }); // <--- ENVIA O NICKNAME E FACE

        try { socket.emit('requestParts'); } catch (e) { console.warn('requestParts emit failed', e); }

        console.log('Connected to server');
        statusEl.textContent = `Online (${Object.keys(otherPlayers).length + 1} players)`;
        statusEl.className = 'connected';

        const hatId = localStorage.getItem('rogold_equipped_hat');
        // Always inform server of current hat on connect to clear any stale state
        socket.emit('equipHat', { hatId: hatId || null });
        // Apply locally as source of truth (remove if none)
        if (hatId) {
            addHatToPlayer(player, hatId);
        } else {
            addHatToPlayer(player, null);
        }
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        statusEl.textContent = 'Connection Failed';
        statusEl.className = 'disconnected';
        
        // Try to reconnect
        setTimeout(() => {
            if (!socket.connected) {
                socket.connect();
            }
        }, 1000);
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
        statusEl.textContent = 'Disconnected';
        statusEl.className = 'disconnected';
        
        if (reason === 'io server disconnect') {
            // Server initiated disconnect, try to reconnect
            socket.connect();
        }
    });
    
    socket.on('reconnect', (attemptNumber) => {
        console.log('Reconnected after', attemptNumber, 'attempts');
        statusEl.textContent = `Online (${Object.keys(otherPlayers).length + 1} players)`;
        statusEl.className = 'connected';
    });
    
    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log('Reconnection attempt', attemptNumber);
        statusEl.textContent = `Reconnecting... (${attemptNumber}/5)`;
    });
    
    socket.on('reconnect_failed', () => {
        console.error('Failed to reconnect');
        statusEl.textContent = 'Connection Lost';
        statusEl.className = 'disconnected';
    });

    // Bind client listeners that must exist on the active socket instance
    socket.on('chat', ({ playerId: chatPlayerId, nickname, message }) => {
        appendChatBoxMessage(nickname, message);
        showBubbleChat(chatPlayerId, nickname, message);
    });

    // Server-authoritative rocket spawns
    socket.on('spawnRocket', (data) => {
        if (data.owner === playerId) return; // Already spawned locally
        spawnRocket(
            new THREE.Vector3(data.position.x, data.position.y, data.position.z),
            new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z),
            data.owner
        );
    });

    // Keep player list in sync
    socket.on('playerJoined', () => updatePlayerList());
    socket.on('playerLeft', () => updatePlayerList());
    socket.on('connect', () => updatePlayerList());
    socket.on('disconnect', () => updatePlayerList());
    
    socket.on('initialPlayers', (serverPlayers) => {
        console.log('Received initial players:', serverPlayers);
        Object.values(serverPlayers).forEach(playerData => {
            ensureRemotePlayer(playerData);
        });
        statusEl.textContent = `Online (${Object.keys(serverPlayers).length} players)`;
        // Ensure the player list reflects all visible players after initial snapshot
        updatePlayerList();
    });

    // Remote part movement: update local scene when another client moved a part
    socket.on('partMoved', (data) => {
        try {
            if (!data || !data.name) return;
            // Try multiple lookup strategies: direct luaObjects key, workspace property, or matching Name
            let inst = luaObjects[data.name] || RobloxEnvironment.Workspace[data.name];
            if (!inst) {
                inst = Object.values(luaObjects).find(i => i && i.Name === data.name);
            }
            if (!inst) return;
            // Set position directly for moved parts
            if (data.position) {
                inst.threeObject.position.set(data.position.x, data.position.y, data.position.z);
                if (inst.cannonBody) {
                    inst.cannonBody.position.set(data.position.x, data.position.y, data.position.z);
                    inst.cannonBody.velocity.set(0, 0, 0); // Stop velocity when moved
                }
            }
            if (data.rotation) {
                inst.threeObject.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
                if (inst.cannonBody) {
                    inst.cannonBody.quaternion.setFromEuler(data.rotation.x, data.rotation.y, data.rotation.z);
                }
            }
            // Apply velocity for physics momentum
            if (data.velocity && inst.cannonBody) {
                inst.cannonBody.velocity.set(data.velocity.x || 0, data.velocity.y || 0, data.velocity.z || 0);
            }
            // Allow parts to sleep in multiplayer
            if (inst.cannonBody) {
                inst.cannonBody.allowSleep = true;
            }
        } catch (err) {
            console.warn('Error handling partMoved', err);
        }
    });

    // Server-sent initial parts (created in studio or persisted)
    socket.on('initialParts', (parts) => {
        try {
            if (!parts || !Array.isArray(parts)) return;
            parts.forEach(objData => {
                if (!objData || !objData.name) return;
                if (luaObjects[objData.name]) {
                    // Update existing part
                    const inst = luaObjects[objData.name];
                    if (objData.position) {
                        const pos = Array.isArray(objData.position) ? objData.position : [objData.position.x, objData.position.y, objData.position.z];
                        inst.Position = new THREE.Vector3(pos[0], pos[1], pos[2]);
                        if (inst.threeObject) inst.threeObject.position.copy(inst.Position);
                        if (inst.cannonBody) inst.cannonBody.position.copy(inst.Position);
                    }
                    if (objData.rotation) {
                        const rot = Array.isArray(objData.rotation) ? objData.rotation : [objData.rotation.x, objData.rotation.y, objData.rotation.z];
                        inst.Rotation = new THREE.Euler(rot[0], rot[1], rot[2]);
                        if (inst.threeObject) inst.threeObject.rotation.copy(inst.Rotation);
                        if (inst.cannonBody) inst.cannonBody.quaternion.setFromEuler(inst.Rotation.x, inst.Rotation.y, inst.Rotation.z);
                    }
                    return;
                }

                const size = objData.size || (Array.isArray(objData.Size) ? { x: objData.Size[0], y: objData.Size[1], z: objData.Size[2] } : { x: 4, y: 4, z: 4 });
                const position = objData.position || (Array.isArray(objData.Position) ? { x: objData.Position[0], y: objData.Position[1], z: objData.Position[2] } : { x: 0, y: 3, z: 0 });
                const rotation = objData.rotation || (Array.isArray(objData.Rotation) ? { x: objData.Rotation[0], y: objData.Rotation[1], z: objData.Rotation[2] } : { x: 0, y: 0, z: 0 });

                const geometry = new THREE.BoxGeometry(1,1,1);
                let color = 0xff6600;
                if (objData.color) {
                    if (typeof objData.color === 'string') color = new THREE.Color(objData.color).getHex();
                    else if (typeof objData.color === 'object' && 'r' in objData.color) color = new THREE.Color(objData.color.r, objData.color.g, objData.color.b).getHex();
                } else if (objData.Color && Array.isArray(objData.Color)) {
                    color = new THREE.Color(objData.Color[0], objData.Color[1], objData.Color[2]).getHex();
                }
                const material = new THREE.MeshLambertMaterial({ color });
                const part = new THREE.Mesh(geometry, material);
                part.scale.set(size.x, size.y, size.z);
                part.position.set(position.x, position.y, position.z);
                part.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
                part.castShadow = true;
                part.receiveShadow = true;
                scene.add(part);

                const robloxPart = new RobloxInstance('Part', objData.name);
                robloxPart.threeObject = part;
                robloxPart.Position = part.position.clone();
                robloxPart.Size = new THREE.Vector3(size.x, size.y, size.z);
                robloxPart.Color = new THREE.Color(color);
                robloxPart.CanCollide = objData.canCollide !== false;
                robloxPart.Anchored = objData.anchored !== false;

                robloxPart.Parent = RobloxEnvironment.Workspace;
                RobloxEnvironment.Workspace.Children.push(robloxPart);
                RobloxEnvironment.Workspace[objData.name] = robloxPart;
                luaObjects[objData.name] = robloxPart;

                if (robloxPart.CanCollide && physicsWorld) {
                    const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
                    const body = new CANNON.Body({
                        mass: robloxPart.Anchored ? 0 : 1,
                        position: new CANNON.Vec3(part.position.x, part.position.y, part.position.z),
                        shape: shape,
                        material: partMaterial,
                        linearDamping: ROBLOX_LINEAR_DAMPING,
                        angularDamping: ROBLOX_ANGULAR_DAMPING,
                        collisionFilterGroup: 1,
                        collisionFilterMask: -1
                    });
                    body.userData = { mesh: part, instance: robloxPart };
                    body.addEventListener && body.addEventListener('collide', (e) => {
                        if (robloxPart.touched && typeof robloxPart.touched === 'function') {
                            try { robloxPart.touched(e.body.userData?.instance || e.body); } catch (e) {}
                        }
                    });
                    physicsWorld.addBody(body);
                    robloxPart.cannonBody = body;
                }
            });
        } catch (e) {
            console.warn('Error handling initialParts', e);
        }
    });

    // When another client creates a part, make it locally
    socket.on('partCreated', (data) => {
        try {
            if (!data || !data.name) return;
            if (luaObjects[data.name]) return;
            // reuse same logic as initialParts for single item
            const objData = data;
            const size = objData.size || (Array.isArray(objData.Size) ? { x: objData.Size[0], y: objData.Size[1], z: objData.Size[2] } : { x: 4, y: 4, z: 4 });
            const position = objData.position || (Array.isArray(objData.Position) ? { x: objData.Position[0], y: objData.Position[1], z: objData.Position[2] } : { x: 0, y: 3, z: 0 });
            const rotation = objData.rotation || (Array.isArray(objData.Rotation) ? { x: objData.Rotation[0], y: objData.Rotation[1], z: objData.Rotation[2] } : { x: 0, y: 0, z: 0 });
            const geometry = new THREE.BoxGeometry(1,1,1);
            const material = new THREE.MeshLambertMaterial({ color: objData.color ? new THREE.Color(objData.color).getHex() : 0xff6600 });
            const part = new THREE.Mesh(geometry, material);
            part.scale.set(size.x, size.y, size.z);
            part.position.set(position.x, position.y, position.z);
            scene.add(part);
            const robloxPart = new RobloxInstance('Part', objData.name);
            robloxPart.threeObject = part;
            robloxPart.Position = part.position.clone();
            robloxPart.Size = new THREE.Vector3(size.x, size.y, size.z);
            robloxPart.Color = new THREE.Color(material.color.getHex());
            robloxPart.CanCollide = objData.canCollide !== false;
            robloxPart.Anchored = objData.anchored !== false;
            robloxPart.Parent = RobloxEnvironment.Workspace;
            RobloxEnvironment.Workspace.Children.push(robloxPart);
            RobloxEnvironment.Workspace[objData.name] = robloxPart;
            luaObjects[objData.name] = robloxPart;
            if (robloxPart.CanCollide && physicsWorld) {
                const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
                const body = new CANNON.Body({ mass: robloxPart.Anchored ? 0 : 1, position: new CANNON.Vec3(part.position.x, part.position.y, part.position.z), shape: shape, material: partMaterial });
                physicsWorld.addBody(body);
                robloxPart.cannonBody = body;
            }
        } catch (e) {
            console.warn('Error handling partCreated', e);
        }
    });

    socket.on('partDeleted', (data) => {
        try {
            if (!data || !data.name) return;
            const inst = luaObjects[data.name];
            if (!inst) return;
            if (inst.threeObject && inst.threeObject.parent) inst.threeObject.parent.remove(inst.threeObject);
            if (inst.Parent) inst.Parent.Children = inst.Parent.Children.filter(c => c !== inst);
            delete luaObjects[data.name];
        } catch (e) {
            console.warn('Error handling partDeleted', e);
        }
    });
    
    socket.on('playerJoined', (playerData) => {
        ensureRemotePlayer(playerData);
        // Update player count
        statusEl.textContent = `Online (${Object.keys(otherPlayers).length + 1} players)`;
    });
    
    socket.on('gameState', (serverPlayers) => {
        if (!player) return;

        // Remove players who have disconnected
        Object.keys(otherPlayers).forEach(id => {
            if (!serverPlayers[id]) {
                scene.remove(otherPlayers[id]);
                delete otherPlayers[id];
            }
        });

        Object.values(serverPlayers).forEach(playerData => {
            if (playerData.id === playerId) {
                // This is our own data, we don't need to do anything with it
                return;
            }

            if (!otherPlayers[playerData.id]) {
                   ensureRemotePlayer(playerData);
            } else {
                     // This is an existing player, update their state for interpolation
                     const remotePlayer = otherPlayers[playerData.id];
                     remotePlayer.userData.targetPosition.set(playerData.x, playerData.y + 0.6, playerData.z);

                  const targetQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, playerData.rotation, 0));
                  remotePlayer.userData.targetQuaternion = targetQuaternion;

                  // Update equipping state
                  remotePlayer.userData.isEquipping = playerData.isEquipping || false;
                  remotePlayer.userData.isUnequipping = playerData.isUnequipping || false;
                  remotePlayer.userData.equipAnimProgress = playerData.equipAnimProgress || 0;
                  remotePlayer.userData.unequipAnimProgress = playerData.unequipAnimProgress || 0;
                  remotePlayer.userData.equippedTool = playerData.equippedTool || null;

                // Update animation based on server state
                if (playerData.isInAir) {

                    // Jump pose for remote player

                    const jumpAngle = -Math.PI;

                    remotePlayer.leftArm.rotation.x = THREE.MathUtils.lerp(remotePlayer.leftArm.rotation.x, jumpAngle, 0.3);

                    remotePlayer.rightArm.rotation.x = THREE.MathUtils.lerp(remotePlayer.rightArm.rotation.x, jumpAngle, 0.3);

                    remotePlayer.leftLeg.rotation.x = THREE.MathUtils.lerp(remotePlayer.leftLeg.rotation.x, 0, 0.2);

                    remotePlayer.rightLeg.rotation.x = THREE.MathUtils.lerp(remotePlayer.rightLeg.rotation.x, 0, 0.2);

                } else if (playerData.isMoving) {

                    const swingAngle = Math.sin(Date.now() * 0.01) * 0.8;

                    remotePlayer.leftArm.rotation.x = swingAngle;

                    remotePlayer.rightArm.rotation.x = -swingAngle;

                    remotePlayer.leftLeg.rotation.x = -swingAngle;

                    remotePlayer.rightLeg.rotation.x = swingAngle;

                } else {

                    remotePlayer.leftArm.rotation.x = THREE.MathUtils.lerp(remotePlayer.leftArm.rotation.x, 0, 0.2);

                    remotePlayer.rightArm.rotation.x = THREE.MathUtils.lerp(remotePlayer.rightArm.rotation.x, 0, 0.2);

                    remotePlayer.leftLeg.rotation.x = THREE.MathUtils.lerp(remotePlayer.leftLeg.rotation.x, 0, 0.2);

                    remotePlayer.rightLeg.rotation.x = THREE.MathUtils.lerp(remotePlayer.rightLeg.rotation.x, 0, 0.2);

                }
                
                // Update colors if they have changed
                updatePlayerColors(remotePlayer, playerData.colors);
            }
        });
         // Update player count
        statusEl.textContent = `Online (${Object.keys(serverPlayers).length} players)`;
        // Keep player list updated for everyone (safe and cheap compared to scene render)
        updatePlayerList();
    });
    
    socket.on('playerMoved', (playerData) => {
        // This is now handled by 'gameState'
    });
    
    socket.on('playerLeft', (playerId) => {
        if (otherPlayers[playerId]) {
            scene.remove(otherPlayers[playerId]);
            delete otherPlayers[playerId];
            // Update player count is now handled by gameState
        }
        // Remove name tag
        if (playerNameTags[playerId]) {
            playerNameTags[playerId].remove();
            delete playerNameTags[playerId];
        }
    });

    socket.on('dance', (dancerId) => {
        if (dancerId && otherPlayers[dancerId]) {
            otherPlayers[dancerId].isDancing = true;
            // Optionally, play dance music for others or show a visual effect
        }
    });

    // Quando outro player equipa
socket.on("remoteEquip", (data) => {
    if (data.playerId === playerId) {
        isEquipping = true;
        equipAnimProgress = 0;
        equippedTool = data.tool;
    } else {
        const remotePlayer = otherPlayers[data.playerId];
        if (!remotePlayer) return;
        remotePlayer.userData.isEquipping = true;
        remotePlayer.userData.equipAnimProgress = 0;
        remotePlayer.userData.equippedTool = data.tool;
        // Attach model se ainda não tiver
        if (!remotePlayer.userData.rocketLauncherModel && rocketLauncherModel) {
            const model = rocketLauncherModel.clone();
            attachRocketLauncherToArm(remotePlayer.rightArm, model);
            remotePlayer.userData.rocketLauncherModel = model;
        } else if (remotePlayer.userData.rocketLauncherModel) {
            attachRocketLauncherToArm(remotePlayer.rightArm, remotePlayer.userData.rocketLauncherModel);
        }
    }
});

socket.on("remoteUnequip", (data) => {
    if (data.playerId === playerId) {
        isUnequipping = true;
        unequipAnimProgress = 0;
        equippedTool = null;
    } else {
        const remotePlayer = otherPlayers[data.playerId];
        if (!remotePlayer) return;
        remotePlayer.userData.isUnequipping = true;
        remotePlayer.userData.unequipAnimProgress = 0;
        remotePlayer.userData.equippedTool = null;
        // Remover modelo da mão
        if (remotePlayer.userData.rocketLauncherModel && remotePlayer.userData.rocketLauncherModel.parent) {
            remotePlayer.userData.rocketLauncherModel.parent.remove(remotePlayer.userData.rocketLauncherModel);
            remotePlayer.userData.rocketLauncherModel.visible = false;
        }
    }
});


    socket.on('stopDance', (dancerId) => {
        if (dancerId && otherPlayers[dancerId]) {
            otherPlayers[dancerId].isDancing = false;
            // Reset dance rotations
            const torso = otherPlayers[dancerId].getObjectByName("Torso");
            const head = otherPlayers[dancerId].getObjectByName("Head");
            torso.rotation.y = 0;
            torso.rotation.z = 0;
            otherPlayers[dancerId].rightArm.rotation.y = 0;
            otherPlayers[dancerId].rightArm.rotation.z = 0;
            otherPlayers[dancerId].leftArm.rotation.y = 0;
            otherPlayers[dancerId].leftArm.rotation.z = 0;
            head.rotation.y = 0;
            otherPlayers[dancerId].rightLeg.rotation.x = 0;
            otherPlayers[dancerId].rightLeg.rotation.z = 0;
            otherPlayers[dancerId].leftLeg.rotation.x = 0;
            otherPlayers[dancerId].leftLeg.rotation.z = 0;
            // Stop dance sound
            if (otherPlayers[dancerId].userData.danceSound && otherPlayers[dancerId].userData.danceSound.isPlaying) {
                otherPlayers[dancerId].userData.danceSound.stop();
            }
        }
    });

    // Removed client-side re-broadcasts. The server is authoritative for relaying these.
    // Rocket spawns and playerHit events are handled by server emissions only.

// Recebe atualização de chapéu de outro jogador
socket.on('playerHatChanged', ({ playerId: changedId, hatId }) => {
    const remotePlayer = otherPlayers[changedId];
    if (remotePlayer) {
        addHatToPlayer(remotePlayer, hatId);
    } else {
        // Cache hat update to apply when the remote player is created
        pendingHats[changedId] = hatId;
    }
});

// Quando receber todos os chapéus ao entrar
socket.on('initialHats', (playerHats) => {
    Object.entries(playerHats).forEach(([id, hatId]) => {
        if (otherPlayers[id]) {
            addHatToPlayer(otherPlayers[id], hatId);
        }
    });
});

// Recebe atualização de face de outro jogador
socket.on('playerFaceChanged', ({ playerId: changedId, faceId }) => {
    const remotePlayer = otherPlayers[changedId];
    if (remotePlayer) {
        addFaceToPlayer(remotePlayer, faceId);
    } else {
        // Cache face update to apply when the remote player is created
        if (!pendingFaces) pendingFaces = {};
        pendingFaces[changedId] = faceId;
    }
});

// Quando receber todas as faces ao entrar
socket.on('initialFaces', (playerFaces) => {
    Object.entries(playerFaces).forEach(([id, faceId]) => {
        if (otherPlayers[id]) {
            addFaceToPlayer(otherPlayers[id], faceId);
        }
    });
});

// On explosion event
socket.on('explosion', (data) => {
    spawnExplosion(new THREE.Vector3(data.position.x, data.position.y, data.position.z));
});

// Player death: show respawn effect to killer and others.
// Explosion visuals are already handled by the 'explosion' event above.
socket.on('playerDied', ({ killer, victim }) => {
    console.log('playerDied event received for victim:', victim, 'killer:', killer);
    // Local victim handles its own full respawn flow
    if (victim === playerId) {
        respawnPlayer();
        return;
    }

    const remote = otherPlayers[victim];
    if (!remote) return;

    // Spawn ragdoll for remote player
    spawnRagdollForPlayer(victim);
});

// Health update from server
socket.on('healthUpdate', ({ health }) => {
    playerHealth = health;
    document.getElementById('health-text').textContent = playerHealth;
    document.getElementById('health-fill').style.width = `${(playerHealth / maxHealth) * 100}%`;
});

// Evento específico para o Daniel
socket.on('danielEvent', () => {
    // Toca som global
    const danielAudio = new Audio('daniel.mp3');
    danielAudio.play();
    // Mostra imagem na tela
    const img = document.createElement('img');
    img.src = 'imgs/daniel.png';
    img.style.position = 'fixed';
    img.style.top = 0;
    img.style.left = 0;
    img.style.width = '100vw';
    img.style.height = '100vh';
    img.style.zIndex = 9999;
    document.body.appendChild(img);
    setTimeout(() => {
        img.remove();
        danielAudio.pause();
    }, 5000);
});

// Admin commands
socket.on('adminExplode', ({ target }) => {
    if (nickname === target) {
        spawnExplosion(player.position.clone());
        respawnPlayer();
    }
    // Opcional: efeito visual nos outros players
    Object.values(otherPlayers).forEach(p => {
        if (p.userData.nickname === target) {
            spawnExplosion(p.position.clone());
        }
    });
});
}

function updatePlayerList() {
    const playerList = document.getElementById('player-list');
    if (!playerList) return;
    // Combine seu player e outros
    const allPlayers = [
        { id: playerId, nickname },
        ...Object.values(otherPlayers).map(p => ({
            id: p.userData.playerId,
            nickname: p.userData.nickname || "Guest"
        }))
    ];
    playerList.innerHTML = '';
    allPlayers.forEach(p => {
        const li = document.createElement('li');
        li.textContent = (p.id === playerId ? 'You (' + p.nickname + ')' : p.nickname);
        playerList.appendChild(li);
    });
}

const backpackItemsData = [
    { name: 'Rocket Launcher', type: 'tool', image: 'imgs/launcher.jpg' },
    // Add more items as needed
];

function updateBackpackItems(searchQuery = '') {
    const backpackItems = document.getElementById('backpack-items');
    if (!backpackItems) return;
    backpackItems.innerHTML = '';
    const filteredItems = backpackItemsData.filter(item => {
        // Check ownership and settings
        if (item.name === 'Rocket Launcher') {
            return ownedGears.includes('gear_rocket_launcher') && areGearsAllowed();
        }
        // For other items, assume owned or add checks as needed
        return item.name.toLowerCase().includes(searchQuery.toLowerCase());
    }).filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    filteredItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'backpack-item';
        itemDiv.innerHTML = `<img src="${item.image}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;">`;
        itemDiv.addEventListener('click', () => {
            // Equip item
            if (item.type === 'tool') {
                if (item.name === 'Rocket Launcher') {
                    equipRocketLauncher();
                }
            }
            backpackModal.style.display = 'none';
            backpackToolBtn.classList.remove('open');
        });
        backpackItems.appendChild(itemDiv);
    });
    if (filteredItems.length === 0) {
        backpackItems.innerHTML = '<p style="color: gray; font-size: 14px; text-align: center;">você não tem nenhuma gear! compre alguma no catalogo e aparecera aqui</p>';
    }
}

// Realtime player list updates are bound within initSocket() after the socket is created.

// Also call updatePlayerList() after you update otherPlayers in your code
function initGame() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 0, 750);

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        1,
        1000
    );
    camera.position.y = 10;

    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('game-canvas'),
        antialias: false
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(1, 1, 0.5).normalize();
    directionalLight.castShadow = false;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Physics world setup with Roblox 2011-style physics
    physicsWorld = new CANNON.World({
        gravity: new CANNON.Vec3(0, ROBLOX_GRAVITY, 0),
        allowSleep: false // Classic Roblox physics didn't allow parts to sleep
    });

    physicsWorld.solver.iterations = 100; // Increased to 100 for maximum collision resolution
    physicsWorld.defaultContactMaterial.friction = ROBLOX_FRICTION;
    physicsWorld.defaultContactMaterial.restitution = ROBLOX_RESTITUTION;

    // Reduced stiffness to prevent sticking while maintaining collision integrity
    physicsWorld.defaultContactMaterial.contactEquationStiffness = 1e5;
    physicsWorld.defaultContactMaterial.contactEquationRelaxation = 4;

    const groundMaterial = new CANNON.Material("groundMaterial");
    partMaterial = new CANNON.Material("partMaterial");

    // Classic Roblox-style contact materials
    const groundPartContactMaterial = new CANNON.ContactMaterial(
        groundMaterial,
        partMaterial,
        {
            friction: ROBLOX_FRICTION,
            restitution: ROBLOX_RESTITUTION,
            contactEquationStiffness: Infinity, // Infinite stiffness for ground contacts
            contactEquationRelaxation: 4 // Consistent relaxation
        }
    );
    physicsWorld.addContactMaterial(groundPartContactMaterial);

    // Add contact material for part-part collisions
    const partPartContactMaterial = new CANNON.ContactMaterial(
        partMaterial,
        partMaterial,
        {
            friction: ROBLOX_FRICTION,
            restitution: ROBLOX_RESTITUTION,
            contactEquationStiffness: 1e5, // Consistent stiffness
            contactEquationRelaxation: 4 // Consistent relaxation
        }
    );
    physicsWorld.addContactMaterial(partPartContactMaterial);

    const groundBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(1000, 1, 1000)),
        material: groundMaterial,
        collisionFilterGroup: 1, // Ground in group 1
        collisionFilterMask: -1 // Collide with all groups
    });
    groundBody.position.set(0, -1, 0); // Thick box from y=-2 to y=0
    groundBody.userData = { isGround: true };
    physicsWorld.addBody(groundBody);

    // Post-processing setup for pixelated effect
    renderTarget = new THREE.WebGLRenderTarget(320, 240);
    renderTarget.texture.minFilter = THREE.NearestFilter;
    renderTarget.texture.magFilter = THREE.NearestFilter;

    updatePixelatedEffect();

    postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postScene = new THREE.Scene();
    const postMaterial = new THREE.MeshBasicMaterial({ map: renderTarget.texture });
    const postPlane = new THREE.PlaneGeometry(2, 2);
    const postQuad = new THREE.Mesh(postPlane, postMaterial);
    postScene.add(postQuad);

    // Audio setup
    audioListener = new THREE.AudioListener();
    camera.add(audioListener);
    // Expose globally so our gesture resume helper can find it early
    try { window.audioListener = audioListener; } catch (e) {}

    // Try to resume audio context immediately
    if (audioListener.context && audioListener.context.state === 'suspended') {
        audioListener.context.resume().catch(e => console.warn('Could not resume audio context:', e));
    }

    walkSound = new THREE.Audio(audioListener);
    jumpSound = new THREE.Audio(audioListener);
    clickSound = new THREE.Audio(audioListener);
    spawnSound = new THREE.Audio(audioListener);
    deathSound = new THREE.Audio(audioListener);
    ouchSound = new THREE.Audio(audioListener);
    launchSound = new THREE.Audio(audioListener);
    explosionSound = new THREE.Audio(audioListener);

    currentDeathSound = deathSound; // Default death sound

    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('walk.mp3', (buffer) => {
        walkSound.setBuffer(buffer);
        walkSound.setLoop(true);
        walkSound.setVolume(0.5);
    });

    audioLoader.load('roblox-classic-jump.mp3', (buffer) => {
        jumpSound.setBuffer(buffer);
        jumpSound.setVolume(0.5);
    });

    audioLoader.load('explosion.mp3', (buffer) => {
    explosionSound.setBuffer(buffer);
    explosionSound.setVolume(0.8);
});

    audioLoader.load('roblox-button-made-with-Voicemod.mp3', (buffer) => {
        clickSound.setBuffer(buffer);
        clickSound.setVolume(0.5);
    });

    audioLoader.load('roblox-rocket-firing-made-with-Voicemod.mp3', (buffer) => {
        launchSound.setBuffer(buffer);
        launchSound.setVolume(0.5);
    });

    audioLoader.load('roblox-rocket-explode-made-with-Voicemod.mp3', (buffer) => {
        explosionSound.setBuffer(buffer);
        explosionSound.setVolume(0.8);
    });

    audioLoader.load('roblox-spawn.mp3', (buffer) => {
        spawnSound.setBuffer(buffer);
        spawnSound.setVolume(0.5);
    });

    audioLoader.load('roblox-death-sound_1.mp3', (buffer) => {
        deathSound.setBuffer(buffer);
        deathSound.setVolume(0.5);
    });

    audioLoader.load('ouch.mp3', (buffer) => {
        ouchSound.setBuffer(buffer);
        ouchSound.setVolume(0.5);
    });

    let danceMusic;
    audioLoader.load('mash.mp3', (buffer) => {
        danceMusic = new THREE.Audio(audioListener);
        danceMusic.setBuffer(buffer);
        danceMusic.setLoop(true);
        danceMusic.setVolume(0.7);
    });

    // Load head model first, then initialize the rest
    const loader = new GLTFLoader();
    loader.load('old_roblox_head_2007-2009.glb', (gltf) => {
        const head = gltf.scene;
        head.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
                child.material = new THREE.MeshLambertMaterial({ color: 0xFAD417 }); // yellow noob color
                child.name = "Head";
            }
        });

        // Cache a template head for remote players to clone
        headTemplate = head.clone(true);

        // Create player model with the loaded head
        player = createPlayer(head);

        // Load face after player is created
        const savedFace = localStorage.getItem('rogold_face') || 'imgs/OriginalGlitchedFace.webp';
        addFaceToPlayer(player, savedFace);
        player.position.set(0, 3, 0); // Place player exactly at ground level
        scene.add(player);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(0, player.position.y + 1, 0);
        controls.enableDamping = false;
        controls.enableZoom = false; 
        controls.minDistance = 5;
        controls.maxDistance = 50;
        controls.maxPolarAngle = Math.PI / 2;
        controls.screenSpacePanning = false;
        controls.enableRotate = false;
        controls.enablePan = false;
        
        camera.position.set(0, 10, 15);

        cameraOffset = new THREE.Vector3(0, 5, 15);
        baseCameraOffset = cameraOffset.clone();

        // This listener will handle all clicks/taps on the page to play the sound
        // and ensures the AudioContext is started.
        document.addEventListener('mousedown', function() {
            // Check if the audio context is running, and resume it if not.
            if (audioListener.context.state === 'suspended') {
                audioListener.context.resume();
            }
            playClickSound();

            // Play any pending sounds that were triggered by scripts
            Object.values(luaObjects).forEach(obj => {
                if (obj.ClassName === 'Sound' && obj.pendingPlay) {
                    playSoundIfAllowed(obj);
                }
            });
        });

        // Same for touch events (mobile)
        document.addEventListener('touchstart', function() {
            // Check if the audio context is running, and resume it if not.
            if (audioListener.context.state === 'suspended') {
                audioListener.context.resume();
            }

            // Play any pending sounds that were triggered by scripts
            Object.values(luaObjects).forEach(obj => {
                if (obj.ClassName === 'Sound' && obj.pendingPlay) {
                    playSoundIfAllowed(obj);
                }
            });
        });

        // The hint logic can be simplified as OrbitControls doesn't have a lock/unlock state
        document.querySelector('.controls-hint').style.display = 'block';

        raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 10);

        velocity = new THREE.Vector3();
        direction = new THREE.Vector3();

        // Initialize socket connection after player is created
        initSocket();
    
        animate(); // Start animation loop after player is created

    }, undefined, (error) => {
        console.error('An error happened while loading the model:', error);
        // As a fallback, create player with a default head
        const headGeometry = new THREE.CylinderGeometry(0.75, 0.75, 1.5, 32);
        const headMaterial = new THREE.MeshLambertMaterial({ color: 0xFAD417 });
        const fallbackHead = new THREE.Mesh(headGeometry, headMaterial);
        player = createPlayer(fallbackHead);
        scene.add(player);
        initSocket();
        animate();
    });

    // Create scene elements that don't depend on the player
    createBaseplate();
    createSpawnPoint();
    createSkybox();

    // Load studio test objects if in test mode
    loadStudioTestObjects();

    initUI(); // Initialize UI event listeners
    initMobileControls();

    // Load saved options
    audioMuted = localStorage.getItem('rogold_audio_muted') === 'true';
    pixelatedEffectEnabled = localStorage.getItem('rogold_pixelated_enabled') !== 'false'; // Default to true

    // Update UI to reflect saved settings
    document.getElementById('mute-toggle').checked = audioMuted;
    document.getElementById('pixelated-toggle').checked = pixelatedEffectEnabled;
    document.getElementById('options-mute-toggle').checked = audioMuted;
    document.getElementById('options-pixelated-toggle').checked = pixelatedEffectEnabled;

    // Load saved face (will be handled by updateFaceSelector)

    // Apply initial settings
    updatePixelatedEffect();

    // Apply initial mute setting
    applyMuteSetting();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);

    const gltfLoader = new GLTFLoader();
    gltfLoader.load('roblox_classic_rocket_launcher.glb', (gltf) => {
        rocketLauncherModel = gltf.scene;
        rocketLauncherModel.visible = false;
        scene.add(rocketLauncherModel);

        // Hide equip button if rocket launcher not owned or gears not allowed
        const equipBtn = document.getElementById('equip-tool-btn');
        if (!ownedGears.includes('gear_rocket_launcher') || !areGearsAllowed()) {
            if (equipBtn) equipBtn.style.display = 'none';
        }
    });
}

// Adicione o corpo físico do player:
function ensurePlayerPhysicsBody() {
    if (player && !player.userData.body) {
        // Create single unified body shape to match visual dimensions 2x4.7x2
        const playerShape = new CANNON.Box(new CANNON.Vec3(1, 2.35, 1));

        // Create body
        const body = new CANNON.Body({
            mass: 5,
            material: new CANNON.Material({
                friction: ROBLOX_FRICTION,
                restitution: 0 // No bounce to prevent floating
            }),
            linearDamping: 0.4, // Increased to 0.4 for better traction
            angularDamping: 0.6, // Further increased for stability
            fixedRotation: true,
            collisionFilterGroup: 1,
            collisionFilterMask: -1
        });

        // Add single shape centered on the player model
        body.addShape(playerShape, new CANNON.Vec3(0, 0, 0));

        // Position the physics body to align feet with ground
        if (player.position) {
            body.position.set(player.position.x, player.position.y - 0.65, player.position.z);
        }

        // Small safety: prevent body from ever going to sleep (classic Roblox behaviour)
        body.allowSleep = false;

        let contactCount = 0;

        // Listen for collisions on the player body and mark that the player can jump
        // when a contact with any solid body occurs.
        body.addEventListener('collide', (e) => {
            try {
                const contact = e.contact;
                if (!contact) return;
                const otherBody = e.body;
                contactCount++;
                if (groundContactTimer) {
                    clearTimeout(groundContactTimer);
                    groundContactTimer = null;
                }
                hasJumpedThisCycle = false;
                canJumpFromGround = true;
            } catch (err) {
                console.warn('Player collide handler error', err);
            }
        });

        // Add end contact listener to reset canJumpFromGround when no longer touching any body
        body.addEventListener('endContact', (e) => {
            try {
                const otherBody = e.body;
                contactCount--;
                if (contactCount === 0) {
                    groundContactTimer = setTimeout(() => {
                        canJumpFromGround = false;
                        groundContactTimer = null;
                    }, 100);
                }
            } catch (err) {
                console.warn('Player endContact handler error', err);
            }
        });

        player.userData.body = body;
        physicsWorld.addBody(body);
    }
}

function createBaseplate() {
    const textureLoader = new THREE.TextureLoader();
    const studsTexture = textureLoader.load('imgs/studs.png');
    studsTexture.wrapS = THREE.RepeatWrapping;
    studsTexture.wrapT = THREE.RepeatWrapping;
    studsTexture.repeat.set(128, 128);

    const geometry = new THREE.PlaneGeometry(500, 500);
    const material = new THREE.MeshLambertMaterial({ map: studsTexture });
    const baseplate = new THREE.Mesh(geometry, material);
    baseplate.rotation.x = -Math.PI / 2;
    baseplate.receiveShadow = false;
    scene.add(baseplate);
}

function createSpawnPoint() {
    // Check if SpawnPoint already exists (from loaded game)
    if (luaObjects['SpawnPoint']) {
        // Update the existing one with visual and physics if needed
        const spawnInstance = luaObjects['SpawnPoint'];
        if (!spawnInstance.threeObject) {
            console.log('[SPAWN] Creating SpawnPoint visual for loaded game');
            // Create 3D representation using standard geometry with scale
            const spawnGeometry = new THREE.BoxGeometry(4, 4, 4);
            const sideMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
            
            // Create initial materials array with placeholder (green)
            const materials = [
                sideMaterial, // right
                sideMaterial, // left
                new THREE.MeshLambertMaterial({ color: 0x00ff00, name: 'SpawnTopPlaceholder' }),  // top (placeholder)
                sideMaterial, // bottom
                sideMaterial, // front
                sideMaterial  // back
            ];

            const spawn = new THREE.Mesh(spawnGeometry, materials);
            spawn.position.copy(spawnInstance.Position);
            spawn.rotation.copy(spawnInstance.Rotation);
            spawn.scale.set(
                spawnInstance.Size.x / 4,
                spawnInstance.Size.y / 4,
                spawnInstance.Size.z / 4
            );
            spawn.receiveShadow = false;
            spawn.castShadow = true;
            scene.add(spawn);
            spawnInstance.threeObject = spawn;

            console.log('[SPAWN] Created mesh, loading texture...');
            
            // Load texture asynchronously with cache busting
            loadTextureWithCacheBust('imgs/spawn.png', 
                (texture) => {
                    console.log('[SPAWN] Texture loaded successfully for loaded game');
                    // Replace top material with textured one
                    materials[2] = new THREE.MeshLambertMaterial({ map: texture, name: 'SpawnTop' });
                    // Force Three.js to detect the material change
                    spawn.material = [...materials];
                    spawn.material.needsUpdate = true;
                    console.log('[SPAWN] Applied texture to loaded spawn');
                },
                (progress) => {
                    console.log('[SPAWN] Texture loading progress for loaded game:', progress);
                },
                (error) => {
                    console.warn('[SPAWN] Texture load failed for loaded game:', error);
                    // Keep the green placeholder - user will see green top instead of textured
                }
            );

            // Add physics
            if (physicsWorld) {
                const shape = new CANNON.Box(new CANNON.Vec3(
                    spawnInstance.Size.x / 2,
                    spawnInstance.Size.y / 2,
                    spawnInstance.Size.z / 2
                ));
                const body = new CANNON.Body({
                    mass: 0,
                    shape: shape,
                    position: new CANNON.Vec3(
                        spawnInstance.Position.x,
                        spawnInstance.Position.y,
                        spawnInstance.Position.z
                    ),
                    material: partMaterial
                });
                body.userData = { mesh: spawn, instance: spawnInstance };
                spawnInstance.cannonBody = body;

                // Add collision event listener
                body.addEventListener('collide', (e) => {
                    console.log('Spawnpoint collision detected', !!e.contact);
                    const otherBody = e.body;

                    // Trigger Touched event if the instance has a Touched connection
                    if (spawnInstance.touched && typeof spawnInstance.touched === 'function') {
                        spawnInstance.touched(otherBody.userData?.instance || otherBody);
                    }

                    // Apply Roblox-style collision response
                    try {
                        if (e.contact) {
                            let impactVelocity = e.contact.getImpactVelocityAlongNormal();
                            console.log('Spawnpoint collision: impactVelocity =', impactVelocity);
                            if (isNaN(impactVelocity) || !isFinite(impactVelocity)) {
                                console.warn('Spawnpoint collision: invalid impactVelocity, setting to 0');
                                impactVelocity = 0;
                            }
                            impactVelocity = Math.max(0, Math.min(impactVelocity, 100)); // clamp to reasonable max
                            if (impactVelocity > 5) {
                                let bounceForce = impactVelocity * 0.1;
                                bounceForce = Math.max(0, Math.min(bounceForce, 10)); // clamp bounce force
                                const normal = e.contact.ni;
                                console.log('Spawnpoint collision: normal =', normal);
                                if (normal && !isNaN(normal.x) && !isNaN(normal.y) && !isNaN(normal.z)) {
                                    const normalLength = Math.sqrt(normal.x*normal.x + normal.y*normal.y + normal.z*normal.z);
                                    console.log('Spawnpoint collision: normalLength =', normalLength);
                                    if (normalLength > 0.001) {
                                        const nx = normal.x / normalLength;
                                        const ny = normal.y / normalLength;
                                        const nz = normal.z / normalLength;
                                        const impulseX = nx * bounceForce;
                                        const impulseY = ny * bounceForce;
                                        const impulseZ = nz * bounceForce;
                                        console.log('Spawnpoint collision: impulseX,Y,Z =', impulseX, impulseY, impulseZ);
                                        if (!isNaN(impulseX) && !isNaN(impulseY) && !isNaN(impulseZ)) {
                                            body.applyImpulse(
                                                new CANNON.Vec3(impulseX, impulseY, impulseZ),
                                                new CANNON.Vec3(0, 0, 0)
                                            );
                                        } else {
                                            console.warn('Spawnpoint collision: skipping impulse due to NaN values');
                                        }
                                    } else {
                                        console.warn('Spawnpoint collision: skipping impulse due to small normal length');
                                    }
                                } else {
                                    console.warn('Spawnpoint collision: skipping impulse due to invalid normal');
                                }
                            }
                        }
                    } catch (error) {
                        console.warn('Error in spawnpoint collision response:', error);
                    }
                });

                physicsWorld.addBody(body);
            }
        }
        return;
    }

    // Create new SpawnPoint
    const spawnInstance = new RobloxInstance('Part', 'SpawnPoint');
    spawnInstance.Size = new THREE.Vector3(10, 0.5, 10);
    spawnInstance.Position = new THREE.Vector3(0, 0.25, 0);
    spawnInstance.Rotation = new THREE.Euler(0, 0, 0);
    spawnInstance.Color = new THREE.Color(0.5, 0.5, 0.5);
    spawnInstance.Anchored = true;
    spawnInstance.CanCollide = true;

    // Create 3D spawn platform using standard geometry with scale
    const spawnGeometry = new THREE.BoxGeometry(4, 4, 4);
    const sideMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
    
    // Create initial materials array with placeholder
    const materials = [
        sideMaterial, // right
        sideMaterial, // left
        new THREE.MeshLambertMaterial({ color: 0x00ff00, name: 'SpawnTopPlaceholder' }),  // top (placeholder - green)
        sideMaterial, // bottom
        sideMaterial, // front
        sideMaterial  // back
    ];

    const spawn = new THREE.Mesh(spawnGeometry, materials);
    spawn.position.copy(spawnInstance.Position);
    spawn.scale.set(10/4, 0.5/4, 10/4); // Scale to match desired size
    spawn.receiveShadow = false;
    spawn.castShadow = true;
    scene.add(spawn);

    spawnInstance.threeObject = spawn;

    // Load texture asynchronously with cache busting
    loadTextureWithCacheBust('imgs/spawn.png', (texture) => {
        console.log('[SPAWN] New spawn texture loaded successfully');
        // Update materials array directly
        materials[2] = new THREE.MeshLambertMaterial({ map: texture, name: 'SpawnTop' });
        // Force Three.js to recognize the material change
        spawn.material = [...materials];
        spawn.material.needsUpdate = true;
        console.log('[SPAWN] Applied texture to spawn top face');
    }, (progress) => {
        console.log('[SPAWN] Texture loading progress:', progress);
    }, (error) => {
        console.warn('[SPAWN] New spawn texture load failed, using fallback:', error);
        // Keep the green placeholder
    });

    // Add to workspace
    RobloxEnvironment.Workspace.Children.push(spawnInstance);
    luaObjects['SpawnPoint'] = spawnInstance;

    // Add physics collision for spawn point
    if (physicsWorld) {
        const shape = new CANNON.Box(new CANNON.Vec3(
            spawnInstance.Size.x / 2,
            spawnInstance.Size.y / 2,
            spawnInstance.Size.z / 2
        ));
        const body = new CANNON.Body({
            mass: 0,
            shape: shape,
            position: new CANNON.Vec3(
                spawnInstance.Position.x,
                spawnInstance.Position.y,
                spawnInstance.Position.z
            ),
            material: partMaterial
        });
        body.userData = { mesh: spawn, instance: spawnInstance };
        spawnInstance.cannonBody = body;

        // Add collision event listener
        body.addEventListener('collide', (e) => {
            console.log('Spawnpoint collision detected', !!e.contact);
            const otherBody = e.body;

            // Trigger Touched event if the instance has a Touched connection
            if (spawnInstance.touched && typeof spawnInstance.touched === 'function') {
                spawnInstance.touched(otherBody.userData?.instance || otherBody);
            }

            // Apply Roblox-style collision response
            try {
                if (e.contact) {
                    let impactVelocity = e.contact.getImpactVelocityAlongNormal();
                    console.log('Spawnpoint collision: impactVelocity =', impactVelocity);
                    if (isNaN(impactVelocity) || !isFinite(impactVelocity)) {
                        console.warn('Spawnpoint collision: invalid impactVelocity, setting to 0');
                        impactVelocity = 0;
                    }
                    impactVelocity = Math.max(0, Math.min(impactVelocity, 100)); // clamp to reasonable max
                    if (impactVelocity > 5) {
                        let bounceForce = impactVelocity * 0.1;
                        bounceForce = Math.max(0, Math.min(bounceForce, 10)); // clamp bounce force
                        const normal = e.contact.ni;
                        console.log('Spawnpoint collision: normal =', normal);
                        if (normal && !isNaN(normal.x) && !isNaN(normal.y) && !isNaN(normal.z)) {
                            const normalLength = Math.sqrt(normal.x*normal.x + normal.y*normal.y + normal.z*normal.z);
                            console.log('Spawnpoint collision: normalLength =', normalLength);
                            if (normalLength > 0.001) {
                                const nx = normal.x / normalLength;
                                const ny = normal.y / normalLength;
                                const nz = normal.z / normalLength;
                                const impulseX = nx * bounceForce;
                                const impulseY = ny * bounceForce;
                                const impulseZ = nz * bounceForce;
                                console.log('Spawnpoint collision: impulseX,Y,Z =', impulseX, impulseY, impulseZ);
                                if (!isNaN(impulseX) && !isNaN(impulseY) && !isNaN(impulseZ)) {
                                    body.applyImpulse(
                                        new CANNON.Vec3(impulseX, impulseY, impulseZ),
                                        new CANNON.Vec3(0, 0, 0)
                                    );
                                } else {
                                    console.warn('Spawnpoint collision: skipping impulse due to NaN values');
                                }
                            } else {
                                console.warn('Spawnpoint collision: skipping impulse due to small normal length');
                            }
                        } else {
                            console.warn('Spawnpoint collision: skipping impulse due to invalid normal');
                        }
                    }
                }
            } catch (error) {
                console.warn('Error in spawnpoint collision response:', error);
            }
        });

        physicsWorld.addBody(body);
    }
}

function createSkybox() {
    const skyGeometry = new THREE.SphereGeometry(400, 32, 32);
    const textureLoader = new THREE.TextureLoader();
    const skyTexture = textureLoader.load('imgs/1eprhbtmvoo51.png');
    skyTexture.wrapS = THREE.RepeatWrapping;
    skyTexture.wrapT = THREE.RepeatWrapping;
    skyTexture.repeat.set(1, 1);

    const skyMaterial = new THREE.MeshBasicMaterial({
        map: skyTexture,
        side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);
}


async function loadStudioTestObjects() {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('game');

    // Check if we're loading a published game or test mode
    if (gameId) {
        // Load published game from server
        try {
            const response = await fetch(`/api/games/${gameId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const gameData = await response.json();
            await loadPublishedGame(gameData);
        } catch (error) {
            console.error('Failed to load published game:', error);
            // Fallback to default game
        }
    } else if (urlParams.get('test') && urlParams.get('studio')) {
        // Original test mode functionality
        const testData = sessionStorage.getItem('rogold_studio_test');
        if (!testData) return;

        isTestMode = true; // Set test mode flag

        try {
            const data = JSON.parse(testData);
            await loadGameData(data);
        } catch (error) {
            console.error('Failed to load studio test objects:', error);
        }
    }
}

async function loadPublishedGame(gameData) {
    console.log('Loading published game:', gameData.title);
    await loadGameData(gameData, false);  // Load all scripts including Main Script for testing/play
}

async function loadGameData(data, isPublished = false) {
    console.log('Loading game data:', data);

    // Resume audio context if suspended (user has already interacted with page)
    if (audioListener && audioListener.context && audioListener.context.state === 'suspended') {
        audioListener.context.resume().catch(e => console.warn('Could not resume audio context on game load:', e));
    }

    // === ENGINE VERSION CHECKING ===
    const gameEngineVersion = data.engineVersion || 'unknown';
    
    // Log version info
    console.log(`[VERSION] Loading game with engine version: ${gameEngineVersion}`);
    console.log(`[VERSION] Current engine version: ${ENGINE_VERSION}`);
    
    // Check for legacy games (no version field) and apply compatibility
    if (!data.engineVersion) {
        console.warn(`[VERSION] Legacy game detected (no engine version field). Applying compatibility defaults.`);
        data = applyLegacyDefaults(data);
        logLegacyGameWarnings(data);
    } else if (isVersionOlder(data.engineVersion, ENGINE_VERSION)) {
        console.warn(`[VERSION] Game from older engine (${data.engineVersion} < ${ENGINE_VERSION}). Applying compatibility layer.`);
        data = applyVersionCompatibility(data, data.engineVersion, ENGINE_VERSION);
        logLegacyGameWarnings(data);
    } else if (data.engineVersion === ENGINE_VERSION) {
        console.log(`[VERSION] Game is from current engine version - no compatibility adjustments needed.`);
    } else if (isVersionOlder(ENGINE_VERSION, data.engineVersion)) {
        console.warn(`[VERSION] Game was created with newer engine version (${data.engineVersion}). Some features may not work.`);
    }

    // === ASSET CACHE BUSTING ===
    const cacheBustParam = getCacheBustParam();
    console.log(`[VERSION] Asset cache busting enabled: ${cacheBustParam}`);

    // Load manual objects (parts, etc.) first so scripts can reference them
    if (data.objects) {
        console.log('Found objects:', data.objects);

        // Sort objects so parents are created before children
        const sortedObjects = Object.values(data.objects).sort((a, b) => {
            if (!a.Parent || a.Parent === 'Workspace') return -1;
            if (!b.Parent || b.Parent === 'Workspace') return 1;
            return 0; // Same level, order doesn't matter
        });

        sortedObjects.forEach(objData => {
            console.log('Processing object:', objData);
            if (objData.ClassName === 'Part') {
                console.log('Creating part:', objData.Name);
                const geometry = new THREE.BoxGeometry(1, 1, 1);
                
                // Check if this is a SpawnPoint
                const isSpawnPoint = objData.Name === 'SpawnPoint';
                
                // Create materials array for multi-material support (SpawnPoint needs special texture)
                let materials;
                if (isSpawnPoint) {
                    // For SpawnPoint, create multi-material with placeholder for top
                    const sideMaterial = new THREE.MeshLambertMaterial({ color: 0x444444 });
                    materials = [
                        sideMaterial, // right
                        sideMaterial, // left
                        new THREE.MeshLambertMaterial({ color: 0x00ff00, name: 'SpawnTopPlaceholder' }),  // top (placeholder - green)
                        sideMaterial, // bottom
                        sideMaterial, // front
                        sideMaterial  // back
                    ];
                } else {
                    // Regular part with single material
                    materials = new THREE.MeshLambertMaterial({
                        color: new THREE.Color(objData.Color[0], objData.Color[1], objData.Color[2])
                    });
                }
                
                const part = new THREE.Mesh(geometry, materials);
                part.position.set(objData.Position[0], objData.Position[1], objData.Position[2]);
                if (objData.Rotation) {
                    part.rotation.set(objData.Rotation[0], objData.Rotation[1], objData.Rotation[2]);
                }
                part.scale.set(objData.Size[0], objData.Size[1], objData.Size[2]);
                part.castShadow = true;
                part.receiveShadow = true;
                scene.add(part);
                console.log('Part added to scene at position:', part.position.toArray());

                // Apply spawn texture for SpawnPoint
                if (isSpawnPoint) {
                    console.log('[SPAWN] Applying spawn texture to loaded SpawnPoint');
                    loadTextureWithCacheBust('imgs/spawn.png',
                        (texture) => {
                            console.log('[SPAWN] Texture loaded for loaded SpawnPoint');
                            // Update top material with texture
                            if (Array.isArray(part.material)) {
                                part.material[2] = new THREE.MeshLambertMaterial({ map: texture, name: 'SpawnTop' });
                                part.material = [...part.material];
                            } else {
                                part.material = new THREE.MeshLambertMaterial({ map: texture, name: 'SpawnTop' });
                            }
                            part.material.needsUpdate = true;
                        },
                        (progress) => {
                            console.log('[SPAWN] Texture loading progress for loaded SpawnPoint:', progress);
                        },
                        (error) => {
                            console.warn('[SPAWN] Texture load failed for loaded SpawnPoint:', error);
                            // Keep the green placeholder
                        }
                    );
                }

                // Create Roblox instance for the part
                // Special case: if this is "part_2" and there's a script that expects "part_1", rename it
                let partName = objData.Name;
                if (objData.Name === 'part_2' && Object.values(data.objects).some(obj => obj.ClassName === 'Script' && obj.Source && obj.Source.includes('script.part_1'))) {
                    partName = 'part_1';
                    console.log('Renaming part_2 to part_1 for script compatibility');
                }
                const robloxPart = new RobloxInstance('Part', partName);
                robloxPart.threeObject = part;
                robloxPart.Position = part.position.clone();
                robloxPart.Size = new THREE.Vector3(objData.Size[0], objData.Size[1], objData.Size[2]);
                robloxPart.Color = new THREE.Color(objData.Color[0], objData.Color[1], objData.Color[2]);
                robloxPart.CanCollide = objData.CanCollide !== false;
                robloxPart.Anchored = objData.Anchored !== false;
                robloxPart.Transparency = objData.Transparency || 0;

                // Apply transparency
                if (robloxPart.Transparency > 0) {
                    if (Array.isArray(part.material)) {
                        // Multi-material (SpawnPoint)
                        part.material.forEach(mat => {
                            mat.transparent = true;
                            mat.opacity = 1 - robloxPart.Transparency;
                        });
                    } else {
                        part.material.transparent = true;
                        part.material.opacity = 1 - robloxPart.Transparency;
                    }
                } else {
                    if (Array.isArray(part.material)) {
                        // Multi-material (SpawnPoint)
                        part.material.forEach(mat => {
                            mat.transparent = false;
                            mat.opacity = 1;
                        });
                    } else {
                        part.material.transparent = false;
                        part.material.opacity = 1;
                    }
                }

                // Set parent based on saved data, or special case for part_1 -> script_1
                let parentObj = RobloxEnvironment.Workspace;
                if (objData.Parent && objData.Parent !== 'Workspace') {
                    parentObj = luaObjects[objData.Parent] || RobloxEnvironment.Workspace;
                } else if (partName === 'part_1' && luaObjects['script_1']) {
                    // Special case: parent part_1 to script_1 for the test
                    parentObj = luaObjects['script_1'];
                    console.log('Parenting part_1 to script_1');
                }

                robloxPart.Parent = parentObj;
                parentObj.Children.push(robloxPart);

                // Add as direct property to workspace for easy access like workspace.part_1
                RobloxEnvironment.Workspace[partName] = robloxPart;

                luaObjects[partName] = robloxPart;

                // Add physics if canCollide
                if (robloxPart.CanCollide && physicsWorld) {
                    const shape = new CANNON.Box(new CANNON.Vec3(
                        objData.Size[0] / 2,
                        objData.Size[1] / 2,
                        objData.Size[2] / 2
                    ));
                    const body = new CANNON.Body({
                        mass: robloxPart.Anchored ? 0 : 1,
                        position: new CANNON.Vec3(
                            objData.Position[0],
                            objData.Position[1],
                            objData.Position[2]
                        ),
                        shape: shape,
                        material: partMaterial,
                        linearDamping: ROBLOX_LINEAR_DAMPING,
                        angularDamping: ROBLOX_ANGULAR_DAMPING,
                        collisionFilterGroup: 1, // Dynamic parts group
                        collisionFilterMask: -1 // Collide with all
                    });
                    body.userData = { mesh: part, instance: robloxPart };

                    // Add collision event listener for Touched events only (no extra bounce)
                    body.addEventListener('collide', (e) => {
                        const otherBody = e.body;

                        // Trigger Touched event if the instance has a Touched connection
                        if (robloxPart.touched && typeof robloxPart.touched === 'function') {
                            robloxPart.touched(otherBody.userData?.instance || otherBody);
                        }
                    });

                    physicsWorld.addBody(body);
                    robloxPart.cannonBody = body;
                }

                // Emit partCreated to server for syncing
                if (socket && socket.connected) {
                    socket.emit('partCreated', {
                        name: objData.Name,
                        size: objData.Size,
                        position: objData.Position,
                        rotation: objData.Rotation,
                        color: objData.Color,
                        canCollide: objData.CanCollide,
                        anchored: objData.Anchored
                    });
                }
            } else if (objData.ClassName === 'Sound') {
                console.log('Creating sound:', objData.Name);

                // Create Roblox instance for the sound
                const robloxSound = new RobloxInstance('Sound', objData.Name);
                robloxSound.SoundId = objData.soundId || objData.SoundId || '';
                robloxSound.Volume = objData.volume || objData.Volume || 0.5;
                robloxSound.Looping = objData.looping || objData.Looping || false;
                robloxSound.isPlaying = false;

                // Store sound URL for later - don't create Audio element until user interaction
                if (robloxSound.SoundId) {
                    robloxSound.soundUrl = robloxSound.SoundId.startsWith('http') ? robloxSound.SoundId :
                                          robloxSound.SoundId.startsWith('rbxassetid://') ? robloxSound.SoundId.replace('rbxassetid://', '') :
                                          robloxSound.SoundId;

                    console.log('Sound URL stored for', objData.Name, ':', robloxSound.soundUrl);

                    // Keep THREE.Audio as backup (load it now since it might work)
                    if (audioListener) {
                        robloxSound.audio = new THREE.Audio(audioListener);
                        const audioLoader = new THREE.AudioLoader();

                        audioLoader.load(robloxSound.soundUrl, (buffer) => {
                            robloxSound.audio.setBuffer(buffer);
                            robloxSound.audio.setVolume(robloxSound.Volume);
                            robloxSound.audio.setLoop(robloxSound.Looping || false);
                            console.log('THREE.Audio loaded:', objData.Name, 'from', robloxSound.soundUrl, 'looping:', robloxSound.Looping);
                        }, (progress) => {
                            console.log('THREE.Audio loading progress:', objData.Name, progress);
                        }, (error) => {
                            console.warn('Failed to load THREE.Audio:', objData.Name, error);
                        });
                    }
                }

                // Add to workspace so scripts can access it
                robloxSound.Parent = RobloxEnvironment.Workspace;
                RobloxEnvironment.Workspace.Children.push(robloxSound);

                // Add as direct property for easy access like workspace.sound_1
                RobloxEnvironment.Workspace[objData.Name] = robloxSound;

                luaObjects[objData.Name] = robloxSound;
            } else if (objData.ClassName === 'Script') {
                console.log('Creating script:', objData.Name);

                // Create Roblox instance for the script
                const robloxScript = new RobloxInstance('Script', objData.Name);
                robloxScript.Source = objData.Source || '';

                // Set parent based on saved data, default to workspace
                let parentObj = RobloxEnvironment.Workspace;
                if (objData.Parent && objData.Parent !== 'Workspace') {
                    parentObj = luaObjects[objData.Parent] || RobloxEnvironment.Workspace;
                }

                robloxScript.Parent = parentObj;
                parentObj.Children.push(robloxScript);

                // Add as direct property to workspace for easy access like workspace.script_1
                RobloxEnvironment.Workspace[objData.Name] = robloxScript;

                luaObjects[objData.Name] = robloxScript;
            } else if (objData.ClassName === 'Folder') {
                console.log('Creating folder:', objData.Name);

                // Create Roblox instance for the folder
                const robloxFolder = new RobloxInstance('Folder', objData.Name);

                // Set parent based on saved data, default to workspace
                let parentObj = RobloxEnvironment.Workspace;
                if (objData.Parent && objData.Parent !== 'Workspace') {
                    parentObj = luaObjects[objData.Parent] || RobloxEnvironment.Workspace;
                }

                robloxFolder.Parent = parentObj;
                parentObj.Children.push(robloxFolder);

                // Add as direct property to workspace for easy access like workspace.folder_1
                RobloxEnvironment.Workspace[objData.Name] = robloxFolder;

                luaObjects[objData.Name] = robloxFolder;
            }
        });
    }

    // Load and execute scripts after objects are loaded
    if (data.scripts) {
        for (const [scriptName, scriptData] of Object.entries(data.scripts)) {
            // Skip 'Main Script' as it is intended for studio use only and should not run during game testing or playback
            if (scriptName === 'Main Script') {
                console.log('Skipping Main Script for game runtime');
                continue;
            }

            if (scriptData && typeof scriptData === 'string') {
                // Handle case where scriptData is just the source string
                const source = scriptData;
                try {
                    console.log('RoGold Game: Executing script:', scriptName, 'with source length:', source.length);
                    const actions = interpretLuaScript(source);
                    console.log('RoGold Game: Parsed actions for script:', scriptName, actions);
                    // Get the script object for script.ChildName access
                    const scriptObj = luaObjects[scriptName];
                    const initialVars = { workspace: RobloxEnvironment.Workspace, game: window.game };
                    if (scriptObj) initialVars.script = scriptObj;
                    await executeLuaActions(actions, initialVars);
                    console.log('RoGold Game: Successfully executed script:', scriptName);
                } catch (error) {
                    console.error('RoGold Game: Failed to execute script:', scriptName, error);
                }
            } else if (scriptData.source) {
                // Handle case where scriptData is an object with source property
                try {
                    console.log('RoGold Game: Executing script:', scriptName, 'with source length:', scriptData.source.length);
                    const actions = interpretLuaScript(scriptData.source);
                    console.log('RoGold Game: Parsed actions for script:', scriptName, actions);
                    // Get the script object for script.ChildName access
                    const scriptObj = luaObjects[scriptName];
                    const initialVars = { workspace: RobloxEnvironment.Workspace, game: window.game };
                    if (scriptObj) initialVars.script = scriptObj;
                    await executeLuaActions(actions, initialVars);
                    console.log('RoGold Game: Successfully executed script:', scriptName);
                } catch (error) {
                    console.error('RoGold Game: Failed to execute script:', scriptName, error);
                }
            }
        }
    }

    console.log('Loaded game objects and scripts');
    
    // Create/update SpawnPoint after game objects are loaded
    // This ensures we pick up any SpawnPoint from the loaded game data
    createSpawnPoint();
    
    // Enable part drag & sync handlers when objects loaded
    try { setupPartDragSync(); } catch (e) { console.warn('setupPartDragSync failed', e); }
}

// Click-and-drag part movement with server sync
function setupPartDragSync() {
    if (!renderer || !camera) return;

    let dragging = false;
    let selectedInstance = null;
    let selectedName = null;
    let dragOffset = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPoint = new THREE.Vector3();
    let lastEmit = 0;
    const emitInterval = 50; // ms

    function getMouseEventPos(evt) {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
        return { x, y };
    }

    function onPointerDown(evt) {
        if (isChatInputFocused() || isMenuOpen) return;
        const p = getMouseEventPos(evt);
        mouse.x = p.x; mouse.y = p.y;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(Object.values(luaObjects).map(i => i.threeObject).filter(Boolean), true);
        if (intersects.length === 0) return;
        const hit = intersects[0];
        // Find the RobloxInstance owning this mesh
        const owner = Object.values(luaObjects).find(i => i.threeObject === hit.object || i.threeObject === hit.object.parent || (i.threeObject && i.threeObject.children && i.threeObject.children.includes(hit.object)));
        if (!owner) return;
        // Start dragging only non-anchored parts
        if (owner.Anchored) return;
        dragging = true;
        selectedInstance = owner;
        selectedName = owner.Name;
        // compute plane at current Y
        const y = owner.threeObject.position.y;
        plane.set(new THREE.Vector3(0, 1, 0), -y);
        // compute offset from intersection point to object origin
        if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
            dragOffset.copy(intersectPoint).sub(owner.threeObject.position);
        } else {
            dragOffset.set(0,0,0);
        }

        evt.preventDefault();
    }

    function onPointerMove(evt) {
        if (!dragging || !selectedInstance) return;
        const p = getMouseEventPos(evt);
        mouse.x = p.x; mouse.y = p.y;
        raycaster.setFromCamera(mouse, camera);
        if (raycaster.ray.intersectPlane(plane, intersectPoint)) {
            const target = intersectPoint.clone().sub(dragOffset);
            // Snap small values to avoid jitter
            selectedInstance.threeObject.position.copy(target);
            selectedInstance.Position = selectedInstance.threeObject.position.clone();
            if (selectedInstance.cannonBody) {
                try {
                    selectedInstance.cannonBody.position.set(target.x, target.y, target.z);
                    selectedInstance.cannonBody.velocity.set(0,0,0);
                } catch (e) {}
            }

            const now = Date.now();
            if (socket && socket.connected && now - lastEmit > emitInterval) {
                lastEmit = now;
                socket.emit('partMoved', {
                    name: selectedName,
                    position: { x: target.x, y: target.y, z: target.z },
                    rotation: { x: selectedInstance.threeObject.rotation.x, y: selectedInstance.threeObject.rotation.y, z: selectedInstance.threeObject.rotation.z }
                });
            }
        }
        evt.preventDefault();
    }

    function onPointerUp(evt) {
        if (!dragging || !selectedInstance) return;
        // Send final position
        const pos = selectedInstance.threeObject.position;
        socket && socket.connected && socket.emit('partMoved', {
            name: selectedName,
            position: { x: pos.x, y: pos.y, z: pos.z },
            rotation: { x: selectedInstance.threeObject.rotation.x, y: selectedInstance.threeObject.rotation.y, z: selectedInstance.threeObject.rotation.z }
        });

        dragging = false;
        selectedInstance = null;
        selectedName = null;
        evt.preventDefault();
    }

    // Use pointer events for broad device support
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
}

function emitColorChange() {
    if (!socket || !socket.connected) return;

    const colors = {
        head: document.getElementById('head-color').value,
        torso: document.getElementById('torso-color').value,
        arms: document.getElementById('arm-color').value,
        legs: document.getElementById('leg-color').value,
    };
    socket.emit('playerCustomize', colors);
}

function updateControls() {
    const mobileActive = areMobileControlsActive();
    isMobile = mobileActive; // Update global flag for legacy checks
    const controlsModeBtn = document.getElementById('controls-mode-btn');

    document.getElementById('mobile-controls').style.display = mobileActive ? 'block' : 'none';
    
    // Desktop-specific UI elements
    const hintElement = document.querySelector('.controls-hint');
    const zoomElement = document.querySelector('.zoom-controls');

    if (hintElement) hintElement.style.display = mobileActive ? 'none' : 'block';
    if (zoomElement) zoomElement.style.display = mobileActive ? 'none' : 'flex'; // Use flex for column layout

    if (mobileActive) {
        controlsModeBtn.textContent = 'Controls: Mobile';
    } else {
        controlsModeBtn.textContent = 'Controls: PC';
    }
}

function initUI() {
    const customizeBtn = document.getElementById('customize-btn');
    const customizerPanel = document.getElementById('color-customizer');
    const potionsBtn = document.getElementById('potions-btn');
    const potionsPanel = document.getElementById('potions-customizer');
    const headColorInput = document.getElementById('head-color');
    const torsoColorInput = document.getElementById('torso-color');
    const armColorInput = document.getElementById('arm-color');
    const legColorInput = document.getElementById('leg-color');
    const respawnBtn = document.getElementById('respawn-btn');
    const controlsModeBtn = document.getElementById('controls-mode-btn');
    const backpackBtn = document.getElementById('backpack-btn');
    backpackModal = document.getElementById('backpack-modal');
    const closeBackpackBtn = document.getElementById('close-backpack-btn');
    const backpackSearch = document.getElementById('backpack-search');
    const backpackItems = document.getElementById('backpack-items');

    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');

    customizeBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent document mousedown from firing again
        playClickSound();
        const isDisplayed = customizerPanel.style.display === 'block';
        customizerPanel.style.display = isDisplayed ? 'none' : 'block';
        potionsPanel.style.display = 'none'; // Close other panel
    });

    potionsBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        playClickSound();
        const isDisplayed = potionsPanel.style.display === 'block';
        potionsPanel.style.display = isDisplayed ? 'none' : 'block';
        customizerPanel.style.display = 'none'; // Close other panel
    });

    controlsModeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        playClickSound();

        const mobileActive = areMobileControlsActive();
        if (mobileActive) {
            // Was mobile, switch to PC
            controlOverride = 'pc';
        } else {
            // Was PC, switch to mobile
            controlOverride = 'mobile';
        }
        localStorage.setItem('controlOverride', controlOverride);
        updateControls();
    });

    backpackBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        playClickSound();
        backpackModal.style.display = 'block';
        updateBackpackItems();
    });

    closeBackpackBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        playClickSound();
        backpackModal.style.display = 'none';
        backpackToolBtn.classList.remove('open');
    });

    backpackSearch.addEventListener('input', (event) => {
        updateBackpackItems(event.target.value);
    });

    updateControls();

    document.querySelectorAll('.potion-option').forEach(option => {
        option.addEventListener('click', (event) => {
            playClickSound();
            document.querySelector('.potion-option.active').classList.remove('active');
            event.currentTarget.classList.add('active');

            const sound = event.currentTarget.dataset.sound;
            if (sound === 'classic') {
                currentDeathSound = deathSound;
            } else if (sound === 'ouch') {
                currentDeathSound = ouchSound;
            }
        });
    });

    respawnBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        playClickSound();
        respawnPlayer();
    });

    // We can remove the individual click sound handlers from the color pickers
    // because the main document mousedown listener will catch them.
    headColorInput.addEventListener('input', (event) => {
        const newColor = new THREE.Color(event.target.value);
        player.traverse((child) => {
            if (child.isMesh && child.name === "Head") {
                child.material.color.set(newColor);
            }
        });
        emitColorChange();
    });

    torsoColorInput.addEventListener('input', (event) => {
        const newColor = new THREE.Color(event.target.value);
        player.traverse((child) => {
            if (child.isMesh && child.name === "Torso") {
                child.material.color.set(newColor);
            }
        });
        emitColorChange();
    });

    armColorInput.addEventListener('input', (event) => {
        const newColor = new THREE.Color(event.target.value);
        player.traverse((child) => {
            if (child.isMesh && child.name === "Arm") {
                // When a mesh has an array of materials, child.material is that array.
                // We need to iterate over it to set the color on each material.
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => {
                        if (material.name === "ArmTop" || material.name === "ArmSides" || material.name === "ArmBottom") {
                            material.color.set(newColor);
                        }
                    });
                }
            }
        });
        emitColorChange();
    });

    legColorInput.addEventListener('input', (event) => {
        const newColor = new THREE.Color(event.target.value);
        player.traverse((child) => {
            if (child.isMesh && child.name === "Leg") {
                child.material.color.set(newColor);
            }
        });
        emitColorChange();
    });

    // Listen for face changes from catalog (index.js)
    window.addEventListener('rogold_equipped_face_changed', () => {
        const equippedFace = localStorage.getItem('rogold_face');
        if (equippedFace && ownedFaces.includes(equippedFace)) {
            addFaceToPlayer(player, equippedFace);
            // Update the face selector to match
            const faceSelect = document.getElementById('face-select');
            if (faceSelect) {
                faceSelect.value = equippedFace;
            }
        }
    });

    // Listen for gear purchases from catalog (index.js)
    window.addEventListener('rogold_gear_purchased', (event) => {
        const { gearId } = event.detail;
        if (gearId === 'gear_rocket_launcher' && areGearsAllowed()) {
            const equipBtn = document.getElementById('equip-tool-btn');
            if (equipBtn) equipBtn.style.display = 'block';
            if (backpackToolBtn) backpackToolBtn.style.display = 'block';
            // Update backpack to show the new item
            updateBackpackItems();
        }
    });

    // For testing: unlock Epic face (remove this in production)
    // unlockFace('imgs/epicface.png');

    zoomInBtn.addEventListener('mousedown', () => {
        zoomCameraIn = true;
    });
    zoomInBtn.addEventListener('mouseup', () => zoomCameraIn = false);
    zoomInBtn.addEventListener('mouseleave', () => zoomCameraIn = false); // Stop if mouse leaves button

    zoomOutBtn.addEventListener('mousedown', () => {
        zoomCameraOut = true;
    });
    zoomOutBtn.addEventListener('mouseup', () => zoomCameraOut = false);
    zoomOutBtn.addEventListener('mouseleave', () => zoomCameraOut = false);

    updateControls(); // Initial setup
}

function initMobileControls() {
    // We set up the joystick regardless, but its visibility is controlled by updateControls()
    // This simplifies toggling controls without re-creating the joystick.
    // isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints > 0);
    // if (!isMobile) return;

    // Joystick
    const joystickZone = document.getElementById('joystick-zone');
    const joystickOptions = {
        zone: joystickZone,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white',
        size: 120
    };
    const manager = nipplejs.create(joystickOptions);

    manager.on('move', (evt, data) => {
        if (!data.angle || !data.force) {
            return;
        }
        const angle = data.angle.radian;
        const force = data.force;

        // Reset movement flags
        moveForward = moveBackward = moveLeft = moveRight = false;
        
        // Use a threshold to avoid jittering when joystick is near center
        if (force > 0.1) {
            // Convert angle to movement directions
            // Note: NippleJS angle starts from right (0 rad) and goes counter-clockwise.
            // Angle ranges for 4-way movement (diagonals activate two flags)
            const deg = data.angle.degree;
            if (deg > 22.5 && deg <= 157.5) moveForward = true;
            if (deg > 202.5 && deg <= 337.5) moveBackward = true;
            if (deg > 112.5 && deg <= 247.5) moveLeft = true;
            if ((deg >= 0 && deg <= 67.5) || (deg > 292.5 && deg <= 360)) moveRight = true;
        }

        if (walkSound && !walkSound.isPlaying && canJump) {
            walkSound.play();
        }
    });

    manager.on('end', () => {
        moveForward = moveBackward = moveLeft = moveRight = false;
        if (walkSound && walkSound.isPlaying) {
            walkSound.stop();
        }
    });

    // Buttons
    const jumpBtn = document.getElementById('mobile-jump-btn');
    const rotateLeftBtn = document.getElementById('mobile-rotate-left');
    const rotateRightBtn = document.getElementById('mobile-rotate-right');

    const handleJump = () => {
        if (canJump === true && player.userData.body && player.userData.body.velocity.y >= -10 && performance.now() - lastJumpTime > jumpCooldown) {
            if (player.userData.body) {
                // Reset vertical velocity only, preserve horizontal momentum
                player.userData.body.velocity.y = 0;
                // Apply upward impulse
                player.userData.body.applyImpulse(new CANNON.Vec3(0, JUMP_IMPULSE, 0), CANNON.Vec3.ZERO);
            }
            canJump = false;
            hasJumpedThisCycle = true;
            lastJumpTime = performance.now();
            if (jumpSound && jumpSound.buffer) {
                if (jumpSound.isPlaying) jumpSound.stop();
                jumpSound.play();
            }
        }
    };
    jumpBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (performance.now() - lastJumpTime > jumpCooldown) {
            handleJump();
        }
    });

    rotateLeftBtn.addEventListener('touchstart', (e) => { e.preventDefault(); rotateCameraLeft = true; });
    rotateLeftBtn.addEventListener('touchend', (e) => { e.preventDefault(); rotateCameraLeft = false; });
    rotateLeftBtn.addEventListener('touchcancel', (e) => { e.preventDefault(); rotateCameraLeft = false; });

    rotateRightBtn.addEventListener('touchstart', (e) => { e.preventDefault(); rotateCameraRight = true; });
    rotateRightBtn.addEventListener('touchend', (e) => { e.preventDefault(); rotateCameraRight = false; });
    rotateRightBtn.addEventListener('touchcancel', (e) => { e.preventDefault(); rotateCameraRight = false; });
}

function respawnPlayer() {
    console.log('respawnPlayer called for local player');
    if (isRespawning) return;
    isRespawning = true;

    // Update health to 0 when dying
    playerHealth = 0;
    document.getElementById('health-text').textContent = '0';
    document.getElementById('health-fill').style.width = '0%';

    // Reset jump state on respawn
    canJump = false;
    canJumpFromGround = false;
    hasJumpedThisCycle = false;
    lastJumpTime = 0;

    player.visible = false;
    if (walkSound && walkSound.isPlaying) {
        walkSound.stop();
    }

    const partsToBreak = [
        player.getObjectByName("Torso"),
        player.getObjectByName("Head"),
        player.leftArm.children[0], // The Mesh inside the pivot
        player.rightArm.children[0],
        player.leftLeg.children[0],
        player.rightLeg.children[0],
    ];

    console.log('Creating fallenParts for local player, count:', partsToBreak.length);
    partsToBreak.forEach(part => {
        if (!part) return;

        const worldPos = new THREE.Vector3();
        part.getWorldPosition(worldPos);

        const worldQuat = new THREE.Quaternion();
        part.getWorldQuaternion(worldQuat);

        const fallenPartMesh = part.clone();
        fallenPartMesh.position.copy(worldPos);
        fallenPartMesh.quaternion.copy(worldQuat);
        fallenPartMesh.castShadow = false;
        fallenPartMesh.receiveShadow = false;
        scene.add(fallenPartMesh);

        // Add velocity and angular velocity for falling animation
        fallenPartMesh.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 15, // random x velocity
            Math.random() * 5 + 10, // upward y velocity
            (Math.random() - 0.5) * 15  // random z velocity
        );
        fallenPartMesh.userData.angularVelocity = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
        );

        fallenParts.push({ mesh: fallenPartMesh });
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();


    setTimeout(() => {
        fallenParts = fallenParts.filter(part => {
            if (part.mesh && part.mesh.parent) {
                scene.remove(part.mesh);
                // Do not dispose geometry/material as they are shared with the original player
                return false; // remove from list
            }
            return true; // keep if not removed
        });

        // Get spawn position from SpawnPoint object
        let spawnPos = new THREE.Vector3(0, 3, 0); // default
        if (luaObjects['SpawnPoint']) {
            spawnPos.copy(luaObjects['SpawnPoint'].Position);
            spawnPos.y += 2.75; // Add offset for player height (3 - 0.25)
        }

        if (player.userData.body) {
            player.userData.body.position.set(spawnPos.x, spawnPos.y - 0.65, spawnPos.z);
            player.userData.body.velocity.set(0, 0, 0);
            // Set visual position to match body + offset
            player.position.copy(spawnPos);
        }
        player.visible = true;

        // Update health to 100 when respawning
        playerHealth = 100;
        document.getElementById('health-text').textContent = '100';
        document.getElementById('health-fill').style.width = '100%';

        // Notify server of respawn to reset health
        if (socket && socket.connected) {
            socket.emit('respawn');
        }

        if (spawnSound && !spawnSound.isPlaying) {
            spawnSound.play();
        }

        isRespawning = false;
    }, 3000);

    if (currentDeathSound && currentDeathSound.buffer) {
        if (currentDeathSound.isPlaying) currentDeathSound.stop();
        currentDeathSound.play();
    }
}

function spawnRagdollForPlayer(victimId) {
    const remotePlayer = otherPlayers[victimId];
    if (!remotePlayer) return;

    // Hide the player
    remotePlayer.visible = false;

    const partsToBreak = [
        remotePlayer.getObjectByName("Torso"),
        remotePlayer.getObjectByName("Head"),
        remotePlayer.leftArm.children[0],
        remotePlayer.rightArm.children[0],
        remotePlayer.leftLeg.children[0],
        remotePlayer.rightLeg.children[0],
    ];

    partsToBreak.forEach(part => {
        if (!part) return;

        const worldPos = new THREE.Vector3();
        part.getWorldPosition(worldPos);

        const worldQuat = new THREE.Quaternion();
        part.getWorldQuaternion(worldQuat);

        const fallenPartMesh = part.clone();
        fallenPartMesh.position.copy(worldPos);
        fallenPartMesh.quaternion.copy(worldQuat);
        fallenPartMesh.castShadow = false;
        fallenPartMesh.receiveShadow = false;
        scene.add(fallenPartMesh);

        fallenPartMesh.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 15,
            Math.random() * 5 + 10,
            (Math.random() - 0.5) * 15
        );
        fallenPartMesh.userData.angularVelocity = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
        );

        fallenParts.push({ mesh: fallenPartMesh });
    });

    // After 3 seconds, remove fallen parts and show player again
    setTimeout(() => {
        fallenParts = fallenParts.filter(part => {
            if (part.mesh && part.mesh.parent) {
                scene.remove(part.mesh);
                // Do not dispose geometry/material as they are shared with the original player
                return false;
            }
            return true;
        });
        remotePlayer.visible = true;
    }, 3000);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);

    updatePixelatedEffect();
}

function updatePixelatedEffect() {
    if (pixelatedEffectEnabled) {
        // Use a fixed low resolution that's independent of screen size
        const lowResWidth = 1600;
        const lowResHeight = 600;
        renderTarget.setSize(lowResWidth, lowResHeight);
        renderTarget.texture.minFilter = THREE.NearestFilter;
        renderTarget.texture.magFilter = THREE.NearestFilter;
    } else {
        // Render at full resolution
        const renderTargetSize = new THREE.Vector2();
        renderer.getDrawingBufferSize(renderTargetSize);
        renderTarget.setSize(renderTargetSize.x, renderTargetSize.y);
        renderTarget.texture.minFilter = THREE.LinearFilter;
        renderTarget.texture.magFilter = THREE.LinearFilter;
    }
}

// Helper to check if chat input is focused
function isChatInputFocused() {
    const chatInput = document.getElementById('chat-input');
    return document.activeElement === chatInput;
}

function onKeyDown(event) {
    if (isMobile) return;
    if (isChatInputFocused()) return;
    if (isMenuOpen) return; // Block movement/jump if menu is open
    // Stop dancing on any movement or jump
    if (isDancing && (
        ['ArrowUp','KeyW','ArrowLeft','KeyA','ArrowDown','KeyS','ArrowRight','KeyD','Space'].includes(event.code)
    )) {
        stopDance();
    }
    switch (event.code) {
        case 'Slash':
            // Focus chat input when pressing "/"
            const chatInput = document.getElementById('chat-input');
            if (chatInput) {
                chatInput.focus();
                event.preventDefault(); // Prevent typing "/" in the input
            }
            break;
        case 'ArrowUp':
        case 'KeyW':
            moveForward = true;
            if (walkSound && !walkSound.isPlaying && canJump) {
                walkSound.play();
            }
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = true;
            if (walkSound && !walkSound.isPlaying && canJump) {
                walkSound.play();
            }
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = true;
            if (walkSound && !walkSound.isPlaying && canJump) {
                walkSound.play();
            }
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = true;
            if (walkSound && !walkSound.isPlaying && canJump) {
                walkSound.play();
            }
            break;
        case 'Space':
            if (canJump === true && player.userData.body && player.userData.body.velocity.y >= -10 && performance.now() - lastJumpTime > jumpCooldown) {
                if (player.userData.body) {
                    // Reset vertical velocity only, preserve horizontal momentum
                    player.userData.body.velocity.y = 0;
                    // Apply upward impulse
                    player.userData.body.applyImpulse(new CANNON.Vec3(0, JUMP_IMPULSE, 0), CANNON.Vec3.ZERO);
                }
                canJump = false;
                hasJumpedThisCycle = true;
                lastJumpTime = performance.now();
                if (jumpSound && jumpSound.buffer) {
                    if (jumpSound.isPlaying) jumpSound.stop();
                    jumpSound.play();
                }
            }
            break;
        case 'KeyQ':
            rotateCameraLeft = true;
            break;
        case 'KeyE':
            rotateCameraRight = true;
            break;
    }
}

function onKeyUp(event) {
    if (isMobile) return;
    if (isChatInputFocused()) return;
    if (isMenuOpen) return; // Block movement/jump if menu is open
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = false;
            break;
    }

    switch (event.code) {
        case 'KeyQ':
            rotateCameraLeft = false;
            break;
        case 'KeyE':
            rotateCameraRight = false;
            break;
    }

    if (!moveForward && !moveBackward && !moveLeft && !moveRight) {
        if (walkSound && walkSound.isPlaying) {
            walkSound.stop();
        }
    }
}

function startDance() {
    if (isDancing) return;
    isDancing = true;
    if (danceMusic && !danceMusic.isPlaying) {
        danceMusic.play();
    }
    if (socket && socket.connected) {
        socket.emit('dance');
    }
    playDanceSoundAt(player);
}

function stopDance() {
    if (!isDancing) return;
    isDancing = false;
    // Reset dance rotations
    const torso = player.getObjectByName("Torso");
    const head = player.getObjectByName("Head");
    torso.rotation.y = 0;
    torso.rotation.z = 0;
    player.rightArm.rotation.y = 0;
    player.rightArm.rotation.z = 0;
    player.leftArm.rotation.y = 0;
    player.leftArm.rotation.z = 0;
    head.rotation.y = 0;
    player.rightLeg.rotation.x = 0;
    player.rightLeg.rotation.z = 0;
    player.leftLeg.rotation.x = 0;
    player.leftLeg.rotation.z = 0;
    if (danceMusic && danceMusic.isPlaying) {
        danceMusic.stop();
    }
    if (socket && socket.connected) {
        socket.emit('stopDance');
    }
    if (player.userData.danceSound && player.userData.danceSound.isPlaying) {
        player.userData.danceSound.stop();
    }
}

function playDanceSoundAt(playerObject) {
    const sound = new THREE.PositionalAudio(audioListener);

    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('mash.mp3', buffer => {
        sound.setBuffer(buffer);
        sound.setRefDistance(10);   // distância onde o som toca no volume original
        sound.setMaxDistance(50);   // distância máxima que ainda é audível
        sound.setRolloffFactor(1);  // quanto mais rápido o volume cai
        sound.setLoop(true);
        sound.play();
    });

    playerObject.add(sound); // O som segue o player
    playerObject.userData.danceSound = sound; // Store reference to stop later
}

function startLoadingScreen() {
    const studsTotal = 5210; // número total fake de studs
    let currentStuds = 0;
    const studsText = document.getElementById('loading-studs');

    const interval = setInterval(() => {
        currentStuds += Math.floor(Math.random() * 60) + 30; // velocidade aleatória
        if (currentStuds >= studsTotal) {
            currentStuds = studsTotal;
            clearInterval(interval);

            // Esconde a tela após carregar
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
            }, 800);
        }
        studsText.textContent = `Loading Studs: ${currentStuds}/${studsTotal}`;
    }, 40);
}

startLoadingScreen();

let equippedTool = null;
let rocketLauncherModel = null;
let isEquipping = false;
let isUnequipping = false;
let equipAnimProgress = 0;
let unequipAnimProgress = 0;
const equipAnimDuration = 0.25; // seconds
let equipTargetRotation = -Math.PI / 1.8;

// Equip function: attaches to right arm pivot, at the top (like a hand)
function equipRocketLauncher() {
    if (!rocketLauncherModel || isEquipping || equippedTool === 'rocketLauncher') return;
    if (!ownedGears.includes('gear_rocket_launcher')) {
        alert('Você precisa comprar o Lançador de Foguetes no catálogo primeiro!');
        return;
    }
    if (!areGearsAllowed()) {
        alert('Ferramentas estão desabilitadas neste jogo!');
        return;
    }
    isEquipping = true;
    equipAnimProgress = 0;

    scene.remove(rocketLauncherModel);
    attachRocketLauncherToArm(player.rightArm, rocketLauncherModel);
    equippedTool = 'rocketLauncher';

    if (socket && socket.connected) {
        socket.emit("equipTool", { tool: "rocketLauncher" });
    }

    document.getElementById('equip-tool-btn').classList.add('equipped');
    
    // Change cursor to aim.png when gear is equipped
    const canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.style.cursor = "url('imgs/aim.png'), crosshair";
    }
}

function launchRocket() {
    if (equippedTool !== 'rocketLauncher' || !canShoot) return;

    canShoot = false;
    setTimeout(() => { canShoot = true; }, cooldownTime);

    // Get direction from camera and mouse
    raycaster.setFromCamera(mouse, camera);
    const direction = raycaster.ray.direction.clone().normalize();
    const startPos = new THREE.Vector3();
    rocketLauncherModel.getWorldPosition(startPos);

    // Emit to server so others spawn the rocket in this room
    if (socket && socket.connected) {
        socket.emit('launchRocket', {
            position: { x: startPos.x, y: startPos.y, z: startPos.z },
            direction: { x: direction.x, y: direction.y, z: direction.z },
            owner: playerId
        });
    }

    // Spawn locally immediately for the shooter (server will not echo back to sender)
    spawnRocket(startPos, direction, playerId);

    // Play launch sound locally
    if (launchSound && launchSound.buffer) {
        if (launchSound.isPlaying) launchSound.stop();
        launchSound.play();
    }
}

function equipTool(toolName) {
    if (toolName === 'Rocket Launcher') {
        if (socket && socket.connected) {
            socket.emit("equipTool", { tool: "rocketLauncher" });
        }
        document.getElementById('equip-tool-btn').classList.add('equipped');
        // Change cursor to aim.png when gear is equipped
        const canvas = document.querySelector('canvas');
        if (canvas) {
            canvas.style.cursor = "url('imgs/aim.png'), crosshair";
        }
    }
    // Add other tools
}

function unequipTool() {
    if (!rocketLauncherModel || equippedTool !== 'rocketLauncher') return;
    document.getElementById('equip-tool-btn').classList.remove('equipped');
    if (rocketLauncherModel.parent) rocketLauncherModel.parent.remove(rocketLauncherModel);
    scene.add(rocketLauncherModel);
    rocketLauncherModel.visible = false;
    equippedTool = null;
    player.rightArm.rotation.x = 0;
    document.getElementById('equip-tool-btn').classList.remove('equipped');
    
    // Change cursor back to mouse.png when unequipping gear
    const canvas = document.querySelector('canvas');
    if (canvas) {
        canvas.style.cursor = "url('imgs/cursor.png'), default";
    }

    if (socket && socket.connected) {
        socket.emit("unequipTool", { tool: "rocketLauncher" });
    }
}
// Button and keyboard events
window.addEventListener('DOMContentLoaded', () => {
    // Helper function to add cursor hover effect to buttons
    function addCursorHoverEffect(button) {
        if (!button) return;
        button.addEventListener('mouseenter', () => {
            button.style.cursor = "url('imgs/cursor2.png'), pointer";
        });
        button.addEventListener('mouseleave', () => {
            button.style.cursor = 'pointer';
        });
    }
    
    // Create backpack button above toolbox
    backpackToolBtn = document.createElement('button');
    backpackToolBtn.id = 'backpack-tool-btn';
    backpackToolBtn.className = 'toolbox';
    backpackToolBtn.style.bottom = '90px';
    backpackToolBtn.style.width = '50px';
    backpackToolBtn.style.height = '40px';
    backpackToolBtn.innerHTML = '<img src="imgs/rgld_up.png" alt="backpack" style="width:80%; height:70%; object-fit:cover;">';
    document.body.appendChild(backpackToolBtn);
    // Hide if rocket launcher not owned or gears not allowed
    if (!ownedGears.includes('gear_rocket_launcher') || !areGearsAllowed()) {
        backpackToolBtn.style.display = 'none';
    }
    backpackToolBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        playClickSound();
        if (backpackModal.style.display === 'block') {
            backpackModal.style.display = 'none';
            backpackToolBtn.classList.remove('open');
        } else {
            backpackModal.style.display = 'block';
            backpackToolBtn.classList.add('open');
            updateBackpackItems();
        }
    });
    
    // Add cursor hover effect for backpack button
    addCursorHoverEffect(backpackToolBtn);

    const equipBtn = document.getElementById('equip-tool-btn');
    equipBtn.addEventListener('click', () => {
        if (equippedTool) {
            unequipTool();
        } else {
            equipRocketLauncher();
        }
    });

    // Keyboard: 1 to equip/unequip
    document.addEventListener('keydown', (e) => {
        if (e.key === '1' && !isChatInputFocused() && !isMenuOpen) {
            if (equippedTool) {
                unequipTool();
            } else {
                equipRocketLauncher();
            }
        }
    });
});

 // spawnRocket listener is now bound after socket connects inside initSocket()

const activeRockets = []; // [{mesh, direction, ownerId, traveled}]
const rocketSpeed = 20; // units per second
const rocketMaxDistance = 30; // units

function spawnRocket(startPos, direction, ownerId) {
    const rocketGeometry = new THREE.BoxGeometry(1, 1, 1);
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('imgs/roblox-stud.png');
    const rocketMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        color: new THREE.Color('#89CFF0'),
        blending: THREE.MultiplyBlending,
        transparent: true
    });
    const rocket = new THREE.Mesh(rocketGeometry, rocketMaterial);
    rocket.position.copy(startPos);
    rocket.lookAt(startPos.clone().add(direction));
    scene.add(rocket);

    activeRockets.push({
        mesh: rocket,
        direction: direction.clone().normalize(),
        ownerId,
        traveled: 0
    });
}

function spawnExplosion(position) {
    for (let i = 0; i < 18; i++) {
        const geometry = new THREE.SphereGeometry(0.25, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xFFD700, transparent: true, opacity: 1 });
        const particle = new THREE.Mesh(geometry, material);
        particle.position.copy(position);
        // Direção aleatória
        const dir = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 2,
            (Math.random() - 0.5) * 2
        ).normalize();
        particle.userData.velocity = dir.multiplyScalar(Math.random() * 12 + 6);
        particle.userData.creationTime = performance.now();
        scene.add(particle);
        explodingParticles.push(particle);
    }
    // Som de explosão
    if (explosionSound && explosionSound.buffer) {
        if (explosionSound.isPlaying) explosionSound.stop();
        explosionSound.play();
    }
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    // Update previous ground contact state
    prevCanJumpFromGround = canJumpFromGround;
    const fixedTimeStep = 1 / 160; // 160 FPS for ultra-responsive collision detection

    for (let i = explodingParticles.length - 1; i >= 0; i--) {
    const particle = explodingParticles[i];
    const elapsedTime = (performance.now() - particle.userData.creationTime) / 2200;

    // Aplica gravidade à velocidade da partícula
    particle.userData.velocity.y -= 9.82 * delta * 2; // gravidade

    // Atualiza a posição
    particle.position.x += particle.userData.velocity.x * delta;
    particle.position.y += particle.userData.velocity.y * delta;
    particle.position.z += particle.userData.velocity.z * delta;

    // Desvanece a partícula e a remove depois de um tempo
    if (elapsedTime > 0.5) {
        particle.material.opacity = 1.0 - (elapsedTime - 0.5);
        particle.material.transparent = true;
    }

    if (elapsedTime > 1.5 || particle.position.y < -1) {
        scene.remove(particle);
        particle.geometry.dispose();
        particle.material.dispose();
        explodingParticles.splice(i, 1);
    }
}

    // Interpolate other players smoothly every frame
    for (const id in otherPlayers) {
        const remotePlayer = otherPlayers[id];
        if (remotePlayer.userData.targetPosition && remotePlayer.userData.targetQuaternion) {
            // Smoother position interpolation with lower lerp factor
            remotePlayer.position.lerp(remotePlayer.userData.targetPosition, 0.2);
            // Smoother rotation interpolation
            remotePlayer.quaternion.slerp(remotePlayer.userData.targetQuaternion, 0.2);
        }
    }


    for (const id in otherPlayers) {
    const remotePlayer = otherPlayers[id];
    const model = remotePlayer.userData.rocketLauncherModel;

    if (!model) continue;

    // EQUIP animação
    if (remotePlayer.userData.isEquipping) {
    const t = Math.min(remotePlayer.userData.equipAnimProgress / equipAnimDuration, 1);
    const start = (typeof remotePlayer.userData.equipStartRotation === 'number') ? remotePlayer.userData.equipStartRotation : remotePlayer.rightArm.rotation.x;
    const target = (typeof remotePlayer.userData.equipTargetRotation === 'number') ? remotePlayer.userData.equipTargetRotation : equipTargetRotation;
    remotePlayer.rightArm.rotation.x = THREE.MathUtils.lerp(start, target, t);

    if (t >= 1) {
    remotePlayer.userData.isEquipping = false;
    remotePlayer.userData.isEquipped = true; // <--- novo
    remotePlayer.rightArm.rotation.x = target; // braço reto
}
}

// UNEQUIP animação
if (remotePlayer.userData.isUnequipping) {
    const t = Math.min(remotePlayer.userData.unequipAnimProgress / equipAnimDuration, 1);
    const start = (typeof remotePlayer.userData.unequipStartRotation === 'number') ? remotePlayer.userData.unequipStartRotation : remotePlayer.rightArm.rotation.x;
    const target = (typeof remotePlayer.userData.unequipTargetRotation === 'number') ? remotePlayer.userData.unequipTargetRotation : 0;
    remotePlayer.rightArm.rotation.x = THREE.MathUtils.lerp(start, target, t);

    if (t >= 1) {
        remotePlayer.userData.isUnequipping = false;
        remotePlayer.userData.isEquipped = false; // <--- solta arma
        remotePlayer.rightArm.rotation.x = target; // volta pro normal
        if (model && model.parent) model.parent.remove(model);
        if (model) model.visible = false;
    }
}

if (remotePlayer.userData.isEquipped) {
    remotePlayer.rightArm.rotation.x = equipTargetRotation; // mantém arma levantada
}
}

// Updated walking movement logic with full WASD controls
ensurePlayerPhysicsBody();
let isMoving = false;
// Build raw input from digital keys / joystick axes
const inputX = Number(moveRight) - Number(moveLeft); // A/D or left/right
const inputZ = Number(moveForward) - Number(moveBackward); // W/S or forward/backward

isMoving = (inputX !== 0 || inputZ !== 0);

if (isMoving) {
    // Get camera's forward vector (normalized, y=0 for ground movement)
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    // RIGHT
    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
    right.normalize();

    // FINAL DIRECTION
    const direction = new THREE.Vector3();
    direction.addScaledVector(forward, inputZ);
    direction.addScaledVector(right, inputX);
    direction.normalize();

    player.position.add(direction.clone().multiplyScalar(velocidade * delta));

    if (direction.length() > 0.1) {
        player.rotation.y = Math.atan2(direction.x, direction.z);
    }

    // Sync physics body position - only X/Z for movement, let Y be determined by physics for gravity
    if (player.userData.body) {
        player.userData.body.position.x = player.position.x;
        player.userData.body.position.z = player.position.z;
        player.userData.body.velocity.x = 0;
        player.userData.body.velocity.z = 0;
        player.userData.body.quaternion.setFromEuler(0, player.rotation.y, 0);
    }

    // Play walk sound if on ground
    if (canJump && walkSound && !walkSound.isPlaying) {
        walkSound.play();
    }
} else {
    // Stop walk sound when not moving
    if (walkSound && walkSound.isPlaying) {
        walkSound.stop();
    }
    // Stop player velocity to prevent sliding
    if (player.userData.body) {
        player.userData.body.velocity.x = 0;
        player.userData.body.velocity.z = 0;
    }
}

// Sanitize body positions, velocities, and angular velocities to prevent NaN propagation
physicsWorld.bodies.forEach(body => {
    let reset = false;
    if (body.position && (isNaN(body.position.x) || isNaN(body.position.y) || isNaN(body.position.z))) {
        console.warn('NaN detected in body position, resetting to safe position');
        body.position.set(0, 0, 0);
        reset = true;
    }
    if (body.velocity && (isNaN(body.velocity.x) || isNaN(body.velocity.y) || isNaN(body.velocity.z))) {
        console.warn('NaN detected in body velocity, resetting to safe velocity');
        body.velocity.set(0, 0, 0);
        reset = true;
    }
    if (body.angularVelocity && (isNaN(body.angularVelocity.x) || isNaN(body.angularVelocity.y) || isNaN(body.angularVelocity.z))) {
        console.warn('NaN detected in body angularVelocity, resetting to safe angularVelocity');
        body.angularVelocity.set(0, 0, 0);
        reset = true;
    }
    if (reset) {
        console.log('Reset body', body.id);
    }
});

// Step physics world
physicsWorld.step(fixedTimeStep, delta, 640); // Maximum substeps for ultra-responsive collision

// Sync unanchored parts that have moved significantly
const now = performance.now();
Object.values(luaObjects).forEach(obj => {
    if (obj.ClassName === 'Part' && !obj.Anchored && obj.threeObject && obj.cannonBody) {
        const name = obj.Name;
        const currentPos = obj.threeObject.position;
        const currentRot = obj.threeObject.rotation;
        const lastState = lastPartState[name];
        if (!lastState) {
            lastPartState[name] = { position: currentPos.clone(), rotation: currentRot.clone() };
            return;
        }
        const dist = currentPos.distanceTo(lastState.position);
        const rotDiff = Math.abs(currentRot.x - lastState.rotation.x) + Math.abs(currentRot.y - lastState.rotation.y) + Math.abs(currentRot.z - lastState.rotation.z);
        const thresholdDist = 0.1;
        const thresholdRot = Math.PI / 36; // 5 degrees
        const lastSync = lastPartSync[name] || 0;
        const throttleMs = 50; // max 20 updates/sec
        if ((dist > thresholdDist || rotDiff > thresholdRot) && now - lastSync > throttleMs) {
            lastPartState[name] = { position: currentPos.clone(), rotation: currentRot.clone() };
            lastPartSync[name] = now;
            if (socket && socket.connected) {
                socket.emit('partMoved', {
                    name: name,
                    position: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
                    rotation: { x: currentRot.x, y: currentRot.y, z: currentRot.z },
                    velocity: obj.cannonBody.velocity ? { x: obj.cannonBody.velocity.x, y: obj.cannonBody.velocity.y, z: obj.cannonBody.velocity.z } : null
                });
            }
        }
    }
});


if (player.userData.body) {
    const pos = player.userData.body.position;
    if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
        console.error('Physics body position is NaN:', pos);
    }
}


    // Animate fallen parts with simple physics simulation
    const bounceFactor = 0.6; // Energy loss on bounce
    const angularDamping = 0.8; // Reduce spin on bounce
    const minVelocity = 0.2; // Minimum velocity to stop bouncing

    for (let i = fallenParts.length - 1; i >= 0; i--) {
        const part = fallenParts[i];
        if (part.mesh) {
            // Apply gravity
            part.mesh.userData.velocity.y -= 50.0 * delta; // gravity

            // Update position
            part.mesh.position.add(part.mesh.userData.velocity.clone().multiplyScalar(delta));

            // Update rotation
            part.mesh.rotation.x += part.mesh.userData.angularVelocity.x * delta;
            part.mesh.rotation.y += part.mesh.userData.angularVelocity.y * delta;
            part.mesh.rotation.z += part.mesh.userData.angularVelocity.z * delta;

            // Ground collision and bouncing
            if (part.mesh.position.y <= 0) {
                part.mesh.position.y = 0; // Clamp to ground level (visual ground at y=0)
                if (Math.abs(part.mesh.userData.velocity.y) > minVelocity) {
                    // Bounce with energy loss
                    part.mesh.userData.velocity.y *= -bounceFactor;
                    // Dampen angular velocity
                    part.mesh.userData.angularVelocity.multiplyScalar(angularDamping);
                } else {
                    // Stop bouncing, come to rest
                    part.mesh.userData.velocity.y = 0;
                    part.mesh.userData.angularVelocity.set(0, 0, 0);
                }
                // Apply friction to horizontal velocity to prevent sliding
                part.mesh.userData.velocity.x *= 0.8;
                part.mesh.userData.velocity.z *= 0.8;
                // Stop completely if velocity is very low
                if (Math.abs(part.mesh.userData.velocity.x) < 0.1) part.mesh.userData.velocity.x = 0;
                if (Math.abs(part.mesh.userData.velocity.z) < 0.1) part.mesh.userData.velocity.z = 0;
            }

            // Remove if below ground (fallback, though bouncing should prevent this)
            if (part.mesh.position.y < 0) {
                scene.remove(part.mesh);
                // Do not dispose geometry/material as they are shared with the original player
                fallenParts.splice(i, 1);
            }
        }
    }

    // Sync physics bodies with three.js objects for script-created parts
    Object.values(luaObjects).forEach(obj => {
        if (obj.cannonBody && obj.threeObject) {
            if (obj.Anchored) {
                // For anchored parts, sync physics body to three.js object
                obj.cannonBody.position.copy(obj.threeObject.position);
                obj.cannonBody.quaternion.setFromEuler(
                    obj.threeObject.rotation.x,
                    obj.threeObject.rotation.y,
                    obj.threeObject.rotation.z
                );
            } else {
                // For unanchored parts, sync three.js object to physics body
                obj.threeObject.position.copy(obj.cannonBody.position);
                obj.threeObject.quaternion.copy(obj.cannonBody.quaternion);
            }
        }
    });


    // Animate spinning parts from Lua scripts
    Object.values(luaObjects).forEach(obj => {
        if (obj.isSpinning && obj.threeObject) {
            const rotationSpeed = 4; // radians per second
            const axis = obj.spinAxis || new THREE.Vector3(0, 1, 0);
            obj.threeObject.rotateOnAxis(axis.normalize(), rotationSpeed * delta);
            obj.Rotation.x += axis.x * rotationSpeed * delta;
            obj.Rotation.y += axis.y * rotationSpeed * delta;
            obj.Rotation.z += axis.z * rotationSpeed * delta;
            if (obj.cannonBody) {
                obj.cannonBody.quaternion.setFromEuler(obj.Rotation.x, obj.Rotation.y, obj.Rotation.z);
            }
        }
    });

    // Animate spinning parts from RobloxEnvironment
    spinningParts.forEach(part => {
        if (part.threeObject) {
            const rotationSpeed = 4; // radians per second
            const axis = part.spinAxis || new THREE.Vector3(0, 1, 0);
            part.threeObject.rotateOnAxis(axis.normalize(), rotationSpeed * delta);
            part.Rotation.x += axis.x * rotationSpeed * delta;
            part.Rotation.y += axis.y * rotationSpeed * delta;
            part.Rotation.z += axis.z * rotationSpeed * delta;
            if (part.cannonBody) {
                part.cannonBody.quaternion.setFromEuler(part.Rotation.x, part.Rotation.y, part.Rotation.z);
            }
        }
    });

    // Handle camera keyboard controls (optimized)
    if (true) { // Always update camera for smooth movement
        const cameraRotationSpeed = 3.0; // Higher rotation speed
        const cameraZoomSpeed = 20.0;

        // Update camera rotation
        if (rotateCameraLeft) {
            const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cameraRotationSpeed * delta);
            cameraOffset.applyQuaternion(rotation);
            // Also rotate the movement reference
            baseCameraOffset.applyQuaternion(rotation);
        }
        if (rotateCameraRight) {
            const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -cameraRotationSpeed * delta);
            cameraOffset.applyQuaternion(rotation);
            // Also rotate the movement reference
            baseCameraOffset.applyQuaternion(rotation);
        }
        if (zoomCameraIn) {
            cameraOffset.multiplyScalar(1.0 - cameraZoomSpeed * delta * 0.1);
        }
        if (zoomCameraOut) {
            cameraOffset.multiplyScalar(1.0 + cameraZoomSpeed * delta * 0.1);
        }

        // Clamp zoom distance
        const distance = cameraOffset.length();
        if (distance < controls.minDistance) {
            cameraOffset.setLength(controls.minDistance);
        }
        if (distance > controls.maxDistance) {
            cameraOffset.setLength(controls.maxDistance);
        }

        // Update baseCameraOffset to reflect current rotation for movement calculations
        baseCameraOffset.copy(cameraOffset).normalize().multiplyScalar(baseCameraOffset.length());
    }

    // Atualiza e remove rockets (optimized) - moved before respawn check so rockets keep moving during respawn
    for (let i = activeRockets.length - 1; i >= 0; i--) {
        const rocketObj = activeRockets[i];
        const { mesh, direction, ownerId } = rocketObj;
        const moveStep = rocketSpeed * delta;
        mesh.position.add(direction.clone().multiplyScalar(moveStep));
        rocketObj.traveled += moveStep;

        // Colisão simples com players - only check every few frames
        if (performance.now() % 3 < 1) { // Check collision every 3 frames
            let hitPlayer = null;
            let victimId = null;

            // Check collision with local player
            if (
                ownerId !== playerId &&
                rocketObj.traveled > 2.0 && // Prevent self-explosion by waiting for rocket to travel further
                player.visible &&
                mesh.position.distanceTo(player.position) < 2
            ) {
                hitPlayer = player;
                victimId = playerId;
            }

            // Check collision with remote players
            if (!hitPlayer) {
                for (const id in otherPlayers) {
                    const remotePlayer = otherPlayers[id];
                    if (
                        ownerId !== id && // Not the owner
                        remotePlayer.visible &&
                        mesh.position.distanceTo(remotePlayer.position) < 2
                    ) {
                        hitPlayer = remotePlayer;
                        victimId = id;
                        break; // Hit the first one
                    }
                }
            }

            if (hitPlayer) {
                // Emit to server for all hits
                if (socket && socket.connected) {
                    socket.emit('playerHit', { killer: ownerId, victim: victimId });
                    socket.emit('explosion', { position: mesh.position });
                }
                scene.remove(mesh);
                activeRockets.splice(i, 1);
                continue;
            }
        }

        // Checa colisão com o chão (y <= 0)
        if (mesh.position.y <= 0) {
            if (socket && socket.connected) {
                socket.emit('explosion', { position: mesh.position });
            }
            scene.remove(mesh);
            activeRockets.splice(i, 1);
            continue;
        }

        // Remove se passou da distância máxima
        if (rocketObj.traveled > rocketMaxDistance) {
            if (socket && socket.connected) {
                socket.emit('explosion', { position: mesh.position });
            }
            scene.remove(mesh);
            activeRockets.splice(i, 1);
        }
    }

    if (isRespawning) {
        prevTime = time;
          // Render scene to low-res render target
        renderer.setRenderTarget(renderTarget);
        renderer.render(scene, camera);

        // Render pixelated texture to screen
        renderer.setRenderTarget(null);
        renderer.render(postScene, postCamera);
        return; // Skip player logic while respawning
    }

    // Update canJump based on ground detection only
    const oldCanJump = canJump;
    canJump = canJumpFromGround && !hasJumpedThisCycle;

    // Animation logic
    const isMovingOnGround = isMoving && canJump;

    if (!canJump) {
        animationTime = 0;
        const jumpAngle = -Math.PI;
        player.leftArm.rotation.x = THREE.MathUtils.lerp(player.leftArm.rotation.x, jumpAngle, 0.2);
        player.rightArm.rotation.x = THREE.MathUtils.lerp(player.rightArm.rotation.x, jumpAngle, 0.2);
        player.leftLeg.rotation.x = THREE.MathUtils.lerp(player.leftLeg.rotation.x, 0, 0.1);
        player.rightLeg.rotation.x = THREE.MathUtils.lerp(player.rightLeg.rotation.x, 0, 0.1);

    } else if (isMovingOnGround && !isDancing) {
        animationTime += delta * 10;
        const swingAngle = Math.sin(animationTime) * 0.8;
        player.leftArm.rotation.x = swingAngle;
        player.rightArm.rotation.x = -swingAngle;
        player.leftLeg.rotation.x = -swingAngle;
        player.rightLeg.rotation.x = swingAngle;
    } else if (!isDancing) {
        animationTime = 0;
        player.leftArm.rotation.x = THREE.MathUtils.lerp(player.leftArm.rotation.x, 0, 0.1);
        player.rightArm.rotation.x = THREE.MathUtils.lerp(player.rightArm.rotation.x, 0, 0.1);
        player.leftLeg.rotation.x = THREE.MathUtils.lerp(player.leftLeg.rotation.x, 0, 0.1);
        player.rightLeg.rotation.x = THREE.MathUtils.lerp(player.rightLeg.rotation.x, 0, 0.1);
    }

    // DANCE ANIMATION (overrides walking)
    if (isDancing) {
        animationTime += delta;
        const loopTime = animationTime % 0.5;

        const torso = player.getObjectByName("Torso");
        const head = player.getObjectByName("Head");

        if (loopTime < 0.15) {
            // FRAME 1 (0.15s)
            torso.rotation.y = 0.24434609527920614;
            torso.rotation.z = 0.15707963267948966;
            player.rightArm.rotation.y = 1.48352986419518;
            player.rightArm.rotation.z = 0.3839724354387525;
            player.leftArm.rotation.y = -1.1344640137963142;
            player.leftArm.rotation.z = -0.3141592653589793;
            head.rotation.y = 0.10471975511965977;
            player.rightLeg.rotation.x = -0.6108652381980153;
            player.rightLeg.rotation.z = 0.08726646259971647;
            player.leftLeg.rotation.x = 0.4886921905584123;
            player.leftLeg.rotation.z = -0.06981317007977318;
        } else if (loopTime < 0.25) {
            // FRAME 2 (0.10s)
            torso.rotation.y = 0.06981317007977318;
            torso.rotation.z = 0.05235987755982988;
            player.rightArm.rotation.y = 0.8726646259971648;
            player.rightArm.rotation.z = 0.17453292519943295;
            player.leftArm.rotation.y = -0.8726646259971648;
            player.leftArm.rotation.z = -0.17453292519943295;
            head.rotation.y = 0.03490658503988659;
            player.rightLeg.rotation.x = -0.17453292519943295;
            player.rightLeg.rotation.z = 0.03490658503988659;
            player.leftLeg.rotation.x = 0.13962634015954636;
            player.leftLeg.rotation.z = -0.017453292519943295;
        } else if (loopTime < 0.40) {
            // FRAME 3 (0.15s)
            torso.rotation.y = -0.24434609527920614;
            torso.rotation.z = -0.15707963267948966;
            player.rightArm.rotation.y = -1.48352986419518;
            player.rightArm.rotation.z = -0.3839724354387525;
            player.leftArm.rotation.y = 1.1344640137963142;
            player.leftArm.rotation.z = 0.3141592653589793;
            head.rotation.y = -0.10471975511965977;
            player.rightLeg.rotation.x = 0.6108652381980153;
            player.rightLeg.rotation.z = -0.08726646259971647;
            player.leftLeg.rotation.x = -0.4886921905584123;
            player.leftLeg.rotation.z = 0.06981317007977318;
        } else {
            // FRAME 4 (0.10s)
            torso.rotation.y = -0.06981317007977318;
            torso.rotation.z = -0.05235987755982988;
            player.rightArm.rotation.y = -0.8726646259971648;
            player.rightArm.rotation.z = -0.17453292519943295;
            player.leftArm.rotation.y = 0.8726646259971648;
            player.leftArm.rotation.z = 0.17453292519943295;
            head.rotation.y = -0.03490658503988659;
            player.rightLeg.rotation.x = 0.17453292519943295;
            player.rightLeg.rotation.z = -0.03490658503988659;
            player.leftLeg.rotation.x = -0.13962634015954636;
            player.leftLeg.rotation.z = 0.017453292519943295;
        }

        // Optionally, add a little bounce:
        const baseY = player.userData.body ? player.userData.body.position.y + 3 : 4;
        player.position.y = baseY + Math.abs(Math.sin(animationTime * 5) * 0.1); // Smaller bounce
    }


    // Send player position to server (throttled)
    if (socket && socket.connected && time > lastSentTime + sendInterval) {
        const pos = player.userData.body ? player.userData.body.position : player.position;
        socket.emit('playerMove', {
            x: pos.x,
            y: pos.y,
            z: pos.z,
            rotation: player.rotation.y,
            isMoving: isMoving,
            isInAir: !canJump, // <-- send whether player is in the air (jumping/falling)
            isEquipping: isEquipping,
            isUnequipping: isUnequipping,
            equipAnimProgress: equipAnimProgress,
            unequipAnimProgress: unequipAnimProgress,
            equippedTool: equippedTool
        });
        lastSentTime = time;
    }


    // Animate other players' dances
    Object.values(otherPlayers).forEach(otherPlayer => {
        if (otherPlayer.isDancing) {
            // Animate dance for this player
            otherPlayer.animationTime = (otherPlayer.animationTime || 0) + delta;
            const loopTime = otherPlayer.animationTime % 0.5;

            const torso = otherPlayer.getObjectByName("Torso");
            const head = otherPlayer.getObjectByName("Head");

            if (loopTime < 0.15) {
                // FRAME 1 (0.15s)
                torso.rotation.y = 0.24434609527920614;
                torso.rotation.z = 0.15707963267948966;
                otherPlayer.rightArm.rotation.y = 1.48352986419518;
                otherPlayer.rightArm.rotation.z = 0.3839724354387525;
                otherPlayer.leftArm.rotation.y = -1.1344640137963142;
                otherPlayer.leftArm.rotation.z = -0.3141592653589793;
                head.rotation.y = 0.10471975511965977;
                otherPlayer.rightLeg.rotation.x = -0.6108652381980153;
                otherPlayer.rightLeg.rotation.z = 0.08726646259971647;
                otherPlayer.leftLeg.rotation.x = 0.4886921905584123;
                otherPlayer.leftLeg.rotation.z = -0.06981317007977318;
            } else if (loopTime < 0.25) {
                // FRAME 2 (0.10s)
                torso.rotation.y = 0.06981317007977318;
                torso.rotation.z = 0.05235987755982988;
                otherPlayer.rightArm.rotation.y = 0.8726646259971648;
                otherPlayer.rightArm.rotation.z = 0.17453292519943295;
                otherPlayer.leftArm.rotation.y = -0.8726646259971648;
                otherPlayer.leftArm.rotation.z = -0.17453292519943295;
                head.rotation.y = 0.03490658503988659;
                otherPlayer.rightLeg.rotation.x = -0.17453292519943295;
                otherPlayer.rightLeg.rotation.z = 0.03490658503988659;
                otherPlayer.leftLeg.rotation.x = 0.13962634015954636;
                otherPlayer.leftLeg.rotation.z = -0.017453292519943295;
            } else if (loopTime < 0.40) {
                // FRAME 3 (0.15s)
                torso.rotation.y = -0.24434609527920614;
                torso.rotation.z = -0.15707963267948966;
                otherPlayer.rightArm.rotation.y = -1.48352986419518;
                otherPlayer.rightArm.rotation.z = -0.3839724354387525;
                otherPlayer.leftArm.rotation.y = 1.1344640137963142;
                otherPlayer.leftArm.rotation.z = 0.3141592653589793;
                head.rotation.y = -0.10471975511965977;
                otherPlayer.rightLeg.rotation.x = 0.6108652381980153;
                otherPlayer.rightLeg.rotation.z = -0.08726646259971647;
                otherPlayer.leftLeg.rotation.x = -0.4886921905584123;
                otherPlayer.leftLeg.rotation.z = 0.06981317007977318;
            } else {
                // FRAME 4 (0.10s)
                torso.rotation.y = -0.06981317007977318;
                torso.rotation.z = -0.05235987755982988;
                otherPlayer.rightArm.rotation.y = -0.8726646259971648;
                otherPlayer.rightArm.rotation.z = -0.17453292519943295;
                otherPlayer.leftArm.rotation.y = 0.8726646259971648;
                otherPlayer.leftArm.rotation.z = 0.17453292519943295;
                head.rotation.y = -0.03490658503988659;
                otherPlayer.rightLeg.rotation.x = 0.17453292519943295;
                otherPlayer.rightLeg.rotation.z = -0.03490658503988659;
                otherPlayer.leftLeg.rotation.x = -0.13962634015954636;
                otherPlayer.leftLeg.rotation.z = 0.017453292519943295;
            }

            // Optionally, add a little bounce:
            const baseY = otherPlayer.userData.body ? otherPlayer.userData.body.position.y + 3 : 4;
            otherPlayer.position.y = baseY + Math.abs(Math.sin(otherPlayer.animationTime * 5) * 0.1); // Smaller bounce
        }
    });

    // Update name tags (throttled)
    if (performance.now() % 2 < 1) { // Only update every 2 frames
        for (const id in otherPlayers) {
            const remotePlayer = otherPlayers[id];
            if (!remotePlayer) continue;

            let nameTag = playerNameTags[id];
            if (!nameTag) {
                nameTag = document.createElement('div');
                nameTag.className = 'player-name-tag';
                nameTag.textContent = remotePlayer.userData.nickname || 'Guest';
                nameTag.style.position = 'absolute';
                nameTag.style.color = 'white';
                nameTag.style.fontSize = '14px';
                nameTag.style.fontFamily = 'Arial, sans-serif';
                nameTag.style.textShadow = '1px 1px 1px black';
                nameTag.style.pointerEvents = 'none';
                nameTag.style.zIndex = 100;
                document.body.appendChild(nameTag);
                playerNameTags[id] = nameTag;
            }

            // Position above head
            let headPos = new THREE.Vector3();
            let headMesh = null;
            remotePlayer.traverse(child => {
                if (child.isMesh && child.name === "Head") headMesh = child;
            });
            const target = headMesh || remotePlayer;
            target.getWorldPosition(headPos);
            headPos.y += 2.5; // Above head

            let screenPos = headPos.clone().project(camera);
            let x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            let y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    
            // Check if player is in front of camera
            const cameraToPlayer = headPos.clone().sub(camera.position);
            const cameraForward = new THREE.Vector3();
            camera.getWorldDirection(cameraForward);
            if (cameraToPlayer.dot(cameraForward) <= 0) {
                nameTag.style.display = 'none';
                continue;
            } else {
                nameTag.style.display = 'block';
            }
    
            nameTag.style.left = `${x - nameTag.offsetWidth / 2}px`;
            nameTag.style.top = `${y - 20}px`;
        }
    }

    // Sync player visual position from physics body before camera follow
    if (player.userData.body) {
        const bodyPos = player.userData.body.position;
        if (isNaN(bodyPos.x) || isNaN(bodyPos.y) || isNaN(bodyPos.z)) {
            console.warn('NaN detected in player body position, skipping sync');
        } else {
            // Sync visual position from physics body
            const oldPosition = player.position.clone();
            player.position.copy(bodyPos);
            player.position.y += 0.65; // Offset visual upward to align feet with physics body bottom

            // Position syncing completed

            // Sync physics body rotation to match visual rotation
            player.userData.body.quaternion.setFromEuler(0, player.rotation.y, 0);
        }
    }

    // Camera follow logic
    const desiredPosition = player.position.clone().add(cameraOffset);
    if (isNaN(desiredPosition.x) || isNaN(desiredPosition.y) || isNaN(desiredPosition.z)) {
        console.warn('NaN detected in desired camera position, resetting camera to safe position');
        camera.position.set(0, 10, 15);
    } else {
        camera.position.copy(desiredPosition);
    }

    controls.target.copy(player.position);
    controls.target.y += 1; // Look slightly above player's base

    controls.update();

    // Ensure camera.position remains finite before rendering
    if (isNaN(camera.position.x) || isNaN(camera.position.y) || isNaN(camera.position.z)) {
        console.warn('Camera position became NaN, resetting');
        camera.position.set(0, 10, 15);
    }

    prevTime = performance.now();

    // Render scene to low-res render target
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);

    // Render pixelated texture to screen
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);

    // Keep right arm straight while rocket launcher is equipped and not equipping
    if (equippedTool === 'rocketLauncher' && !isEquipping) {
        player.rightArm.rotation.x = -Math.PI /  2;
  }
    // --- Equip animation for rocket launcher ---

    if (isEquipping) {

        equipAnimProgress += delta;
        const t = Math.min(equipAnimProgress / equipAnimDuration,  1);
        player.rightArm.rotation.x = THREE.MathUtils.lerp(
            player.rightArm.rotation.x,
            equipTargetRotation,
            t

        );
        if (t >= 1) {
            player.rightArm.rotation.x = equipTargetRotation;
            isEquipping = false;
        }
    } else if (equippedTool === 'rocketLauncher') {
        player.rightArm.rotation.x = equipTargetRotation;
    }

    ensurePlayerPhysicsBody();
}

// Chat message handling
window.addEventListener('DOMContentLoaded', () => {
    const chatSendBtn = document.getElementById('chat-send');
    const chatInput = document.getElementById('chat-input');
    if (chatSendBtn && chatInput) {
        chatSendBtn.addEventListener('click', sendChatMessage);
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') sendChatMessage();
        });
    }

    const menuBtn = document.getElementById('menu-btn');
    const gameMenu = document.getElementById('game-menu');
    const optionsMenu = document.getElementById('options-menu');
    const resumeBtn = document.getElementById('resume-btn');
    const optionsBtn = document.getElementById('options-btn');
    const exitBtn = document.getElementById('exit-btn');

    menuBtn.addEventListener('click', () => {
        gameMenu.style.display = 'block';
        document.getElementById('menu-overlay').classList.add('active');
        isMenuOpen = true;
    });

    resumeBtn.addEventListener('click', () => {
        gameMenu.style.display = 'none';
        document.getElementById('menu-overlay').classList.remove('active');
        isMenuOpen = false;
    });

    optionsBtn.addEventListener('click', () => {
        gameMenu.style.display = 'none';
        optionsMenu.style.display = 'block';
        // Keep overlay active when switching to options menu
    });

    const backToMenuBtn = document.getElementById('back-to-menu-btn');
    const muteToggle = document.getElementById('mute-toggle');
    const pixelatedToggle = document.getElementById('pixelated-toggle');
    const optionsMuteToggle = document.getElementById('options-mute-toggle');
    const optionsPixelatedToggle = document.getElementById('options-pixelated-toggle');

    backToMenuBtn.addEventListener('click', () => {
        optionsMenu.style.display = 'none';
        gameMenu.style.display = 'block';
        // Keep overlay active when going back to main menu
    });

    muteToggle.addEventListener('change', () => {
        audioMuted = muteToggle.checked;
        applyMuteSetting();
        localStorage.setItem('rogold_audio_muted', audioMuted);
        // Sync options menu toggle
        if (optionsMuteToggle) optionsMuteToggle.checked = audioMuted;
    });

    pixelatedToggle.addEventListener('change', () => {
        pixelatedEffectEnabled = pixelatedToggle.checked;
        updatePixelatedEffect();
        localStorage.setItem('rogold_pixelated_enabled', pixelatedEffectEnabled);
        // Sync options menu toggle
        if (optionsPixelatedToggle) optionsPixelatedToggle.checked = pixelatedEffectEnabled;
    });

    // Options menu toggles
    optionsMuteToggle.addEventListener('change', () => {
        audioMuted = optionsMuteToggle.checked;
        applyMuteSetting();
        localStorage.setItem('rogold_audio_muted', audioMuted);
        // Sync main toggle
        if (muteToggle) muteToggle.checked = audioMuted;
    });

    optionsPixelatedToggle.addEventListener('change', () => {
        pixelatedEffectEnabled = optionsPixelatedToggle.checked;
        updatePixelatedEffect();
        localStorage.setItem('rogold_pixelated_enabled', pixelatedEffectEnabled);
        // Sync main toggle
        if (pixelatedToggle) pixelatedToggle.checked = pixelatedEffectEnabled;
    });

    const consoleBtn = document.getElementById('console-btn');
    if (consoleBtn) {
        consoleBtn.addEventListener('click', () => {
            const consoleModal = document.getElementById('console-modal');
            const menuOverlay = document.getElementById('menu-overlay');
            if (consoleModal && menuOverlay) {
                consoleModal.style.display = 'block';
                menuOverlay.classList.add('active');
                isConsoleOpen = true;
            }
        });
    }

    const closeConsoleBtn = document.getElementById('close-console-btn');
    if (closeConsoleBtn) {
        closeConsoleBtn.addEventListener('click', () => {
            const consoleModal = document.getElementById('console-modal');
            const optionsMenu = document.getElementById('options-menu');
            const menuOverlay = document.getElementById('menu-overlay');
            if (consoleModal && optionsMenu && menuOverlay) {
                consoleModal.style.display = 'none';
                optionsMenu.style.display = 'none';
                menuOverlay.classList.remove('active');
                isConsoleOpen = false;
                isMenuOpen = false;
            }
        });
    }

    exitBtn.addEventListener('click', () => {
        window.location.href = '/'; // Or any exit logic you want
    });

    // Help button event listener
    const helpBtn = document.getElementById('help-btn');
    const helpTutorial = document.getElementById('help-tutorial');
    const closeTutorialBtn = document.getElementById('close-tutorial-btn');

    console.log('Debug: helpBtn found:', !!helpBtn);
    console.log('Debug: helpTutorial found:', !!helpTutorial);
    console.log('Debug: closeTutorialBtn found:', !!closeTutorialBtn);

    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            console.log('Help button clicked: hiding game menu and showing tutorial');
            console.log('Debug: gameMenu before:', gameMenu.style.display);
            console.log('Debug: helpTutorial before:', helpTutorial.style.display);
            gameMenu.style.display = 'none';
            helpTutorial.style.display = 'block';
            console.log('Debug: gameMenu after:', gameMenu.style.display);
            console.log('Debug: helpTutorial after:', helpTutorial.style.display);
            // Keep overlay active when switching to tutorial
        });
    } else {
        console.error('Debug: helpBtn not found!');
    }

    if (closeTutorialBtn) {
        closeTutorialBtn.addEventListener('click', (event) => {
            console.log('Close tutorial button clicked: hiding tutorial and showing game menu');
            console.log('Debug: event target:', event.target);
            console.log('Debug: helpTutorial before:', helpTutorial.style.display);
            console.log('Debug: gameMenu before:', gameMenu.style.display);
            helpTutorial.style.display = 'none';
            gameMenu.style.display = 'block';
            console.log('Debug: helpTutorial after:', helpTutorial.style.display);
            console.log('Debug: gameMenu after:', gameMenu.style.display);
            // Keep overlay active when going back to main menu
        });
        console.log('Debug: closeTutorialBtn event listener added successfully');
    } else {
        console.error('Debug: closeTutorialBtn not found!');
    }

    // Add debug logging for menu button to ensure menu opens
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            console.log('Menu button clicked: opening game menu');
            console.log('Debug: gameMenu display before:', gameMenu.style.display);
            gameMenu.style.display = 'block';
            isMenuOpen = true;
            console.log('Debug: gameMenu display after:', gameMenu.style.display);
        });
    }

    // Click on overlay closes modals
    const menuOverlay = document.getElementById('menu-overlay');
    if (menuOverlay) {
        menuOverlay.addEventListener('click', () => {
            if (isConsoleOpen) {
                const consoleModal = document.getElementById('console-modal');
                if (consoleModal) {
                    consoleModal.style.display = 'none';
                    menuOverlay.classList.remove('active');
                    isConsoleOpen = false;
                }
            } else if (isMenuOpen) {
                gameMenu.style.display = 'none';
                menuOverlay.classList.remove('active');
                isMenuOpen = false;
            }
        });
    }

    // ESC key closes console or toggles menu
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('menu-overlay');
            if (isConsoleOpen) {
                const consoleModal = document.getElementById('console-modal');
                if (consoleModal) {
                    consoleModal.style.display = 'none';
                    overlay.classList.remove('active');
                    isConsoleOpen = false;
                }
            } else if (isMenuOpen) {
                gameMenu.style.display = 'none';
                overlay.classList.remove('active');
                isMenuOpen = false;
            } else {
                gameMenu.style.display = 'block';
                overlay.classList.add('active');
                isMenuOpen = true;
            }
        }
    });
});

window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('click', launchRocket);


initGame();

function addHatToPlayer(player, hatId) {
    // Remove chapéu antigo se houver
    if (player.userData.currentHat) {
    if (player.userData.currentHat.parent) {
        player.userData.currentHat.parent.remove(player.userData.currentHat);
    } else {
        console.warn("Chapéu antigo sem parent, pode estar bugado:", player.userData.currentHatId);
    }
    player.userData.currentHat = null;
    player.userData.currentHatId = null;
}
    if (!hatId) return;

   

    // Mapeamento dos modelos
    const hatMap = {
        'hat_red': 'roblox_r_baseball_cap_r6.glb',
        'hat_doge': 'doge_roblox_hat.glb',
        'hat_fedora_black': 'roblox_fedora.glb'
    };
    const hatModelPath = hatMap[hatId];
    if (!hatModelPath) return;

    const loader = new GLTFLoader();
    loader.load(hatModelPath, (gltf) => {
        const hat = gltf.scene;
        // Ajuste escala e posição conforme o chapéu
        if (hatId === 'hat_red' || hatId === 'hat_fedora_black') {
            hat.scale.set(1, 1, 1);             // tamanho original
    hat.position.set(0, 0.256, -0.4);       // encaixe no head
    hat.rotation.set(1.9, Math.PI / 2, 0);
        } else if (hatId === 'hat_doge') {
            hat.scale.set(1.2, 1.2, 1.2);
            hat.position.set(0, 0.2, 0);
            hat.rotation.set(2, Math.PI, 0); // gira 180 graus no Y
        }
        // Encontre a cabeça do player
        let head = null;
        player.traverse(child => {
            if (child.isMesh && child.name === "Head") head = child;
        });
        if (head) {
            head.add(hat);
            player.userData.currentHat = hat;
            player.userData.currentHatId = hatId;
        }
    });
}

window.addEventListener('rogold_equipped_hat_changed', () => {
    const hatId = localStorage.getItem('rogold_equipped_hat'); // 'hat_red', 'hat_doge', etc.

    // Emit to server so other clients update, even if hatId is null (clears previous)
    if (socket && socket.connected) {
        socket.emit('equipHat', { hatId: hatId || null });
    }

    // Apply locally
    if (hatId) {
        addHatToPlayer(player, hatId);
    } else {
        addHatToPlayer(player, null); // remove chapéu se não tiver
    }
});

function attachRocketLauncherToArm(arm, model) {
    model.position.set(0, -1, 0.5);
    model.rotation.set(1.5, Math.PI / 2, 0);
    model.visible = true;
    arm.add(model);
}

function addFaceToPlayer(player, faceId) {
    if (!player || !faceId) return;

    // Ensure faceId starts with 'imgs/' for moved assets
    if (!faceId.startsWith('imgs/')) {
        faceId = 'imgs/' + faceId;
    }

    // Remove existing face if any
    if (player.userData.facePlane && player.userData.facePlane.parent) {
        player.userData.facePlane.parent.remove(player.userData.facePlane);
    }

    // Load new face texture with callback
    const faceTextureLoader = new THREE.TextureLoader();
    faceTextureLoader.load(faceId, (faceTexture) => {
        faceTexture.minFilter = THREE.NearestFilter;
        faceTexture.magFilter = THREE.NearestFilter;
        const faceMaterial = new THREE.MeshLambertMaterial({
            map: faceTexture,
            transparent: true,
            alphaTest: 0.1,
            side: THREE.DoubleSide // Make face visible from both sides
        });

        const faceGeometry = new THREE.PlaneGeometry(1.05, 1.05);
        const facePlane = new THREE.Mesh(faceGeometry, faceMaterial);
        facePlane.position.set(0, 0, 0.75);
        facePlane.rotation.y = Math.PI; // Rotate to face forward

        // Use stored head reference or find it
        let head = player.userData.head;
        if (!head) {
            player.traverse(child => {
                if (child.isMesh && child.name === "Head") head = child;
            });
        }
        if (head) {
            head.add(facePlane);
            player.userData.faceId = faceId;
            player.userData.facePlane = facePlane;
        } else {
            console.error('Head not found for face attachment');
        }
    }, undefined, (error) => {
        console.error('Error loading face texture:', faceId, error);
    });
}

function updateFaceSelector() {
    const faceSelect = document.getElementById('face-select');
    if (!faceSelect) return;

    // Clear existing options
    faceSelect.innerHTML = '';

    // Define all available faces with their display names
    const allFaces = {
        'imgs/OriginalGlitchedFace.webp': 'Classic',
        'imgs/epicface.png': 'Epic',
        'imgs/daniel.png': 'Daniel'
    };

    // Add owned faces to selector
    ownedFaces.forEach(faceId => {
        if (allFaces[faceId]) {
            const option = document.createElement('option');
            option.value = faceId;
            option.textContent = allFaces[faceId];
            faceSelect.appendChild(option);
        }
    });

    // Set current face if it's owned
    const currentFace = localStorage.getItem('rogold_face') || 'imgs/OriginalGlitchedFace.webp';
    if (ownedFaces.includes(currentFace)) {
        faceSelect.value = currentFace;
    } else {
        // Default to first owned face
        faceSelect.value = ownedFaces[0] || 'imgs/OriginalGlitchedFace.webp';
    }
}

function unlockFace(faceId) {
    if (!ownedFaces.includes(faceId)) {
        ownedFaces.push(faceId);
        localStorage.setItem('rogold_owned_faces', JSON.stringify(ownedFaces));
        updateFaceSelector();
    }
}

function addConsoleOutput(message, type = 'info') {
    const consoleOutput = document.getElementById('console-output');
    if (consoleOutput) {
        const timestamp = new Date().toLocaleTimeString();
        let prefix = '';
        let color = '';
        switch (type) {
            case 'error':
                prefix = '[ERROR] ';
                color = 'red';
                break;
            case 'success':
                prefix = '[SUCCESS] ';
                color = 'green';
                break;
            case 'warning':
                prefix = '[WARNING] ';
                color = 'yellow';
                break;
            default:
                prefix = '[INFO] ';
                color = 'white';
        }
        const span = document.createElement('span');
        span.style.color = color;
        span.textContent = `[${timestamp}] ${prefix}${message}\n`;
        consoleOutput.appendChild(span);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
}

function areGearsAllowed() {
    const settings = JSON.parse(localStorage.getItem('rogold_studio_settings') || '{}');
    return settings.gearsAllowed !== false; // Default to true
}

