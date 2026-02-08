import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Global translation variable
const getCurrentLang = () => localStorage.getItem('rogold_language') || 'pt';
const getTranslations = () => {
    const lang = getCurrentLang();
    // Try to get translations from global scope
    const transObj = (typeof translations !== 'undefined') ? translations : 
                    (typeof window.translations !== 'undefined' ? window.translations : {});
    if (transObj && transObj[lang]) {
        return transObj[lang];
    }
    // Fallback to Portuguese
    if (transObj && transObj.pt) {
        return transObj.pt;
    }
    return {};
};
let t = getTranslations();

// Function to get translation
function tGet(key, fallback = '') {
    const translations = getTranslations();
    return (translations && translations[key]) ? translations[key] : fallback;
}

// Function to update translations globally
function updateTranslations() {
    t = getTranslations();
    
    // Update all elements with data-translate attribute
    document.querySelectorAll('[data-translate]').forEach(el => {
        const key = el.getAttribute('data-translate');
        if (t[key]) {
            el.textContent = t[key];
        }
    });
    
    // Update page title
    document.querySelectorAll('title').forEach(el => {
        if (t['banner-title']) {
            el.textContent = 'Rogold - ' + t['banner-title'];
        }
    });
    
    // Update html lang attribute
    document.documentElement.lang = getCurrentLang();
}

// Language change handler
function setupLanguageHandler() {
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
        // Set initial value
        langSelect.value = getCurrentLang();
        
        langSelect.addEventListener('change', (e) => {
            const newLang = e.target.value;
            localStorage.setItem('rogold_language', newLang);
            updateTranslations();
        });
    }
}

// User management system
class UserManager {
    constructor() {
        this.currentUser = localStorage.getItem('rogold_currentUser');
        this.migrateOldAccounts();
    }

    async migrateOldAccounts() {
        // Check if there are old localStorage accounts to migrate
        try {
            const oldUsers = JSON.parse(localStorage.getItem('rogold_users') || '{}');
            if (Object.keys(oldUsers).length > 0) {
                console.log(`Migrating ${Object.keys(oldUsers).length} old accounts to database...`);
                for (const [username, userData] of Object.entries(oldUsers)) {
                    try {
                        // Try to register each user in the database
                        await fetch('/api/register', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username, password: userData.password })
                        });
                    } catch (e) {
                        // Ignore errors (user might already exist)
                    }
                }
                console.log('Old accounts migration completed.');
                // Clear old localStorage data
                localStorage.removeItem('rogold_users');
            }
        } catch (e) {
            // Ignore migration errors
        }
    }

    async register(username, password) {
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();
            if (result.success) {
                this.currentUser = username;
                localStorage.setItem('rogold_currentUser', username);
            }
            return result;
        } catch (error) {
            console.error('Error registering:', error);
            return { success: false, message: 'Server error' };
        }
    }

    async login(username, password) {
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();
            if (result.success) {
                this.currentUser = username;
                localStorage.setItem('rogold_currentUser', username);
            }
            return result;
        } catch (error) {
            console.error('Error logging in:', error);
            return { success: false, message: 'Server error' };
        }
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('rogold_currentUser');
    }

    getCurrentUser() {
        return this.currentUser || localStorage.getItem('rogold_currentUser');
    }

    async updateUser(currentUsername, currentPassword, newUsername, newPassword) {
        try {
            // Change password or username via API
            if (newPassword) {
                const response = await fetch('/api/change-password', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        username: currentUsername, 
                        currentPassword, 
                        newPassword 
                    })
                });
                const result = await response.json();
                if (!result.success) {
                    return result;
                }
            }
            // Username change requires migration and different handling
            if (newUsername && newUsername !== currentUsername) {
                // Check if new username is available
                const checkResponse = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: newUsername, password: currentPassword })
                });
                const checkResult = await checkResponse.json();
                // The above will fail if username exists, but we need to handle it differently
                // For now, just update the localStorage
                profileManager.migrateProfileUsername(currentUsername, newUsername);
                this.currentUser = newUsername;
                localStorage.setItem('rogold_currentUser', newUsername);
                return { success: true, newUsername };
            }
            return { success: true };
        } catch (error) {
            console.error('Error updating user:', error);
            return { success: false, message: 'Server error' };
        }
    }

    async deleteAccount(username, password) {
        try {
            const response = await fetch('/api/account', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const result = await response.json();
            if (result.success) {
                this.logout();
            }
            return result;
        } catch (error) {
            console.error('Error deleting account:', error);
            return { success: false, message: 'Server error' };
        }
    }

    async getAllUsernames() {
        // This is limited - we can't get all usernames for security reasons
        // Return empty array since this was only used for admin purposes
        return [];
    }

    async searchUsers(query) {
        try {
            const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
            const result = await response.json();
            return result.users || [];
        } catch (error) {
            console.error('Error searching users:', error);
            return [];
        }
    }

    async userExists(username) {
        try {
            const response = await fetch(`/api/users/exists/${encodeURIComponent(username)}`);
            const result = await response.json();
            return result.exists;
        } catch (error) {
            console.error('Error checking user exists:', error);
            return false;
        }
    }
}

const userManager = new UserManager();

// Catalog Management
class CatalogManager {
    constructor() {
        this.items = [
            // Only 3D items with modelPath and a corresponding imageUrl (thumbnail)
            { id: 'hat_red', name: 'Boné Vermelho R', type: 'hat', price: 100, imageUrl: 'imgs/hat_red_thumbnail.jpg', modelPath: 'roblox_r_baseball_cap_r6.glb', description: 'Um boné vermelho clássico no estilo Roblox R6. Perfeito para jogadores que querem um look esportivo e casual.' },
            { id: 'hat_doge', name: 'Chapéu Doge', type: 'hat', price: 500, imageUrl: 'imgs/hat_doge_thumbnail.jpg', modelPath: 'doge_roblox_hat.glb', description: 'O icônico chapéu Doge inspirado no meme viral. Mostre seu amor pelos cachorros e memes com este acessório único.' },
            { id: 'hat_fedora_black', name: 'Fedora Preta', type: 'hat', price: 300, imageUrl: 'imgs/hat_fedora_black_thumbnail.jpg', modelPath: 'roblox_fedora.glb', description: 'Um fedora preto elegante e sofisticado. Ideal para jogadores que querem um estilo misterioso e estiloso.' },
            // Face items
            { id: 'face_default', name: 'Default Face', type: 'face', price: 0, imageUrl: 'imgs/OriginalGlitchedFace.webp', modelPath: null, description: 'O rosto padrão clássico do Roblox. Simples, confiável e sempre reconhecível.' },
            { id: 'face_epic', name: 'Epic Face', type: 'face', price: 100, imageUrl: 'imgs/epicface.png', modelPath: null, description: 'Um rosto épico com expressões dinâmicas. Mostre sua personalidade única no mundo dos jogos!' },
            // Gear items
            { id: 'gear_rocket_launcher', name: 'Lançador de Foguetes', type: 'gear', price: 300, imageUrl: 'imgs/launcher.jpg', modelPath: 'roblox_classic_rocket_launcher.glb', description: 'Um lançador de foguetes clássico do Roblox. Permite disparar foguetes explosivos em todos os jogos!' }
        ]
    }

    getAllItems() {
        return this.items;
    }

    getItemsByType(type) {
        if (type === 'all') {
            return this.items;
        }
        return this.items.filter(item => item.type === type);
    }

    getItemById(id) {
        return this.items.find(item => item.id === id);
    }

    getPurchaseCount(itemId) {
        const counts = JSON.parse(localStorage.getItem('rogold_purchase_counts') || '{}');
        return counts[itemId] || 0;
    }

    incrementPurchaseCount(itemId) {
        const counts = JSON.parse(localStorage.getItem('rogold_purchase_counts') || '{}');
        counts[itemId] = (counts[itemId] || 0) + 1;
        localStorage.setItem('rogold_purchase_counts', JSON.stringify(counts));
    }
}

const catalogManager = new CatalogManager();

// Profile functionality
class ProfileManager {
    constructor(userManager) {
        this.userManager = userManager;
        try {
            this.profiles = JSON.parse(localStorage.getItem('rogold_profiles')) || {};
        } catch (e) {
            console.error("Error parsing rogold_profiles from localStorage, resetting:", e);
            this.profiles = {};
            // Optionally clear corrupt data to prevent repeated errors
            localStorage.removeItem('rogold_profiles');
        }
    }

    getProfile(username) {
        let rawProfile = this.profiles[username];

        const defaultProfile = {
            bio: 'Este usuário ainda não escreveu uma descrição.',
            status: 'Offline',
            favorites: [],
            profilePicture: null,
            coins: 500,
            inventory: [],
            equippedItems: {},
            ratings: {} // gameId: 'like' or 'dislike' or undefined
        };

        // Merge existing profile data with default values to ensure all fields are present.
        const mergedProfile = { ...defaultProfile, ...rawProfile };

        // Ensure array types for lists and filter out non-string/empty values
        ['favorites', 'inventory'].forEach(key => { 
            if (!Array.isArray(mergedProfile[key])) {
                mergedProfile[key] = [];
            }
            mergedProfile[key] = mergedProfile[key].filter(item => typeof item === 'string' && item.trim() !== '');
        });

        // Ensure equippedItems is an object
        if (typeof mergedProfile.equippedItems !== 'object' || mergedProfile.equippedItems === null) {
            mergedProfile.equippedItems = {};
        }

        // Specifically handle `joinDate`
        if (!mergedProfile.joinDate) {
            mergedProfile.joinDate = new Date().toISOString();
        }

        // Ensure coins is a number
        if (typeof mergedProfile.coins !== 'number' || isNaN(mergedProfile.coins)) {
            mergedProfile.coins = defaultProfile.coins;
        }

        // Update the stored profile with the merged structure.
        this.profiles[username] = mergedProfile;
        this.saveProfiles();
        
        return mergedProfile;
    }

    updateProfile(username, updates) {
        if (this.profiles[username]) {
            Object.assign(this.profiles[username], updates);
            this.saveProfiles();
            return true;
        }
        return false;
    }

    // Add this new method to ProfileManager
    migrateProfileUsername(oldUsername, newUsername) {
        if (this.profiles[oldUsername]) {
            this.profiles[newUsername] = { ...this.profiles[oldUsername] }; 
            delete this.profiles[oldUsername]; 
            this.saveProfiles();
            console.log(`Profile migrated from ${oldUsername} to ${newUsername}`);
            return true;
        }
        return false;
    }

    // Add a game to favorites
    addFavorite(username, gameTitle) {
        const profile = this.getProfile(username);
        // Ensure gameTitle is a valid string before adding
        if (typeof gameTitle !== 'string' || gameTitle.trim() === '') {
            console.error("Attempted to add invalid game title to favorites:", gameTitle); 
            return { success: false, message: 'Nome de jogo inválido.' };
        }
        if (!profile.favorites.includes(gameTitle)) {
            profile.favorites.push(gameTitle);
            this.saveProfiles();
            return { success: true, message: `'${gameTitle}' adicionado aos seus favoritos!` };
        }
        return { success: false, message: `'${gameTitle}' já está nos seus favoritos.` };
    }

    // Remove a game from favorites
    removeFavorite(username, gameTitle) {
        const profile = this.getProfile(username);
        const initialLength = profile.favorites.length;
        // Ensure gameTitle is a valid string for comparison
        if (typeof gameTitle !== 'string' || gameTitle.trim() === '') {
            console.error("Attempted to remove invalid game title from favorites:", gameTitle); 
            return { success: false, message: 'Nome de jogo inválido para remover.' };
        }
        profile.favorites = profile.favorites.filter(game => game !== gameTitle);
        if (profile.favorites.length < initialLength) {
            this.saveProfiles();
            return { success: true, message: `'${gameTitle}' removido dos seus favoritos.` };
        }
        return { success: false, message: `'${gameTitle}' não está nos seus favoritos.` };
    }

    // NEW: Coins management
    addCoins(username, amount) {
        const profile = this.getProfile(username);
        if (profile) {
            profile.coins = (profile.coins || 0) + amount;
            this.saveProfiles();
            return { success: true, newBalance: profile.coins };
        }
        return { success: false, message: 'Usuário não encontrado.' };
    }

    subtractCoins(username, amount) {
        const profile = this.getProfile(username);
        if (profile) {
            if (profile.coins >= amount) {
                profile.coins -= amount;
                this.saveProfiles();
                return { success: true, newBalance: profile.coins };
            }
            return { success: false, message: 'Moedas insuficientes.' };
        }
        return { success: false, message: 'Usuário não encontrado.' };
    }

    // NEW: Inventory and Equipment management
    addItemToInventory(username, itemId) {
        const profile = this.getProfile(username);
        if (profile && !profile.inventory.includes(itemId)) {
            profile.inventory.push(itemId);
            this.saveProfiles();
            return { success: true, message: 'Item adicionado ao inventário!' };
        }
        return { success: false, message: 'Item já está no inventário ou usuário não encontrado.' };
    }

    // Equip an item, making sure it's in inventory and replacing existing item of same type
    equipItem(username, itemId, itemType) {
        const profile = this.getProfile(username);
        if (!profile) {
            return { success: false, message: 'Usuário não encontrado.' };
        }
        if (!profile.inventory.includes(itemId)) {
            return { success: false, message: 'Você não possui este item.' };
        }
        
        profile.equippedItems[itemType] = itemId;
        this.saveProfiles();

        // Quando o usuário equipa um item no site:
        if (itemType === 'hat') {
            localStorage.setItem('rogold_equipped_hat', itemId);
            window.dispatchEvent(new Event('rogold_equipped_hat_changed'));
        } else if (itemType === 'face') {
            localStorage.setItem('rogold_equipped_face', itemId);
            window.dispatchEvent(new Event('rogold_equipped_face_changed'));
        }

        // NOVO: envie para o servidor
        if (window.socket && window.socket.connected) {
            window.socket.emit('equipHat', { hatId: itemId });
        }
        
        return { success: true, message: 'Item equipado com sucesso!' };
    }

    unequipItem(username, itemType) {
        const profile = this.getProfile(username);
        if (!profile) {
            return { success: false, message: 'Usuário não encontrado.' };
        }
        if (profile.equippedItems[itemType]) {
            delete profile.equippedItems[itemType];
            this.saveProfiles();
            return { success: true, message: `Item do tipo ${itemType} desequipado.` };
        }
        return { success: false, message: `Nenhum item do tipo ${itemType} está equipado.` };
    }

    saveProfiles() {
        localStorage.setItem('rogold_profiles', JSON.stringify(this.profiles));
    }
}

const profileManager = new ProfileManager(userManager);

// NEW: Generic 3D Viewer Class to manage multiple viewers
class ThreeDViewer {
    constructor(containerId, initialModelPath = null, isAvatarViewer = false) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`3D Viewer container '${containerId}' not found.`);
            return;
        }

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.renderer = null; 
        this.controls = null; 
        this.currentModel = null;
        this.animateLoopId = null;
        this.loader = new GLTFLoader();
        this.isAvatarViewer = isAvatarViewer; 

        this.init(initialModelPath);
    }

    init(initialModelPath) {
        // Clear previous canvas if it exists
        const existingCanvas = this.container.querySelector('canvas');
        if (existingCanvas) {
            this.container.removeChild(existingCanvas);
            this.stopAnimation();
        }

        // Remove placeholder text if viewer is being initialized
        const placeholder = this.container.querySelector('.viewer-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        this.scene.background = new THREE.Color(0xadd8e6); 

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.container.appendChild(this.renderer.domElement);

        // Lights (add only once)
        if (!this.scene.getObjectByName('ambientLight')) {
            const ambientLight = new THREE.AmbientLight(0x404040); 
            ambientLight.name = 'ambientLight';
            this.scene.add(ambientLight);
        }
        if (!this.scene.getObjectByName('directionalLight')) {
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1); 
            directionalLight.position.set(0, 5, 5).normalize();
            directionalLight.name = 'directionalLight';
            this.scene.add(directionalLight);
        }

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enablePan = false;
        this.controls.enableZoom = true; 
        // Allow full vertical orbit for item viewer, limited for avatar viewer
        if (this.isAvatarViewer) {
            this.controls.minPolarAngle = Math.PI / 2 - 0.5;
            this.controls.maxPolarAngle = Math.PI / 2 + 0.5;
            this.controls.target.set(0, 0.5, 0); // Target center of avatar body (half of the new height)
        } else {
            this.controls.minPolarAngle = 0; // Look from top
            this.controls.maxPolarAngle = Math.PI; // Look from bottom
            this.controls.target.set(0, 0, 0); // Default target for items
        }
        this.controls.update();

        // Animation loop
        const animate = () => {
            this.animateLoopId = requestAnimationFrame(animate);
            this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };
        animate();

        // Handle window resize
        this.onWindowResize = () => {
            const newWidth = this.container.clientWidth;
            const newHeight = this.container.clientHeight;
            this.camera.aspect = newWidth / newHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(newWidth, newHeight);
        };
        window.addEventListener('resize', this.onWindowResize);

        if (initialModelPath) {
            this.loadModel(initialModelPath);
        }
    }

    stopAnimation() {
        if (this.animateLoopId) {
            cancelAnimationFrame(this.animateLoopId);
            this.animateLoopId = null;
        }
        window.removeEventListener('resize', this.onWindowResize);
    }

    clearScene() {
        // Remove all objects from the scene except lights
        const objectsToRemove = this.scene.children.filter(obj => 
            obj.name !== 'ambientLight' && obj.name !== 'directionalLight'
        );
        objectsToRemove.forEach(obj => this.scene.remove(obj));
        this.currentModel = null;
    }

    // New loadModel signature: isAccessory indicates if it's being added as an accessory
    // accessoryType and modelPathForAccessory are only relevant if isAccessory is true
    loadModel(modelPath, isAccessory = false, accessoryType = null) {
        if (!isAccessory) {
            this.clearScene();
        }

        this.loader.load(modelPath, (gltf) => {
            const newModel = gltf.scene;
            newModel.name = modelPath; 

            // Step 1: Apply intrinsic model-specific transformations (e.g., for rotation issues)
            this._applyIntrinsicModelTransforms(newModel, modelPath);

            if (!isAccessory) {
                // If it's a standalone model (item viewer or base avatar)
                this.currentModel = newModel;
                this.scene.add(this.currentModel);
                // Step 2: Fit model to viewer, which also positions it at origin and scales it generally
                this._fitCameraAndModelToViewer(this.currentModel);
            } else {
                // If it's an accessory being added to an existing model (avatar viewer)
                this.scene.add(newModel);
                // Step 3: Position and scale the accessory relative to the main avatar
                this._positionAccessoryOnAvatar(newModel, modelPath, accessoryType);
            }

        }, undefined, (error) => {
            console.error(`Error loading 3D model ${modelPath}:`, error);
            // Removed specific error message for item viewer placeholder.
            // If it's an accessory and fails, it just won't show.
        });
    }

    // Renamed and refined fitCameraToModel
    _fitCameraAndModelToViewer(model) {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Handle case where size is zero (empty or invalid model)
        if (size.lengthSq() === 0) {
            console.warn("Model has zero size bounding box, cannot fit camera.");
            this.camera.position.set(0, 0, 5);
            this.controls.target.set(0, 0, 0);
            this.camera.updateProjectionMatrix();
            this.controls.update();
            return;
        }

        // Position model on the ground (y=0) and center horizontally
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;

        // Recalculate box after moving model to origin
        const newBox = new THREE.Box3().setFromObject(model);
        const newSize = newBox.getSize(new THREE.Vector3());
        const newCenter = newBox.getCenter(new THREE.Vector3());

        // Apply a universal scale to make models roughly 'targetHeight' tall for consistent viewing
        const targetHeight = 2.0; // For avatar viewer
        if (newSize.y > 0) { // Avoid division by zero
            const scaleFactor = targetHeight / newSize.y;
            model.scale.multiplyScalar(scaleFactor);
            // Recalculate box and center after final scaling
            newBox.setFromObject(model);
            newSize.copy(newBox.getSize(new THREE.Vector3()));
            newCenter.copy(newBox.getCenter(new THREE.Vector3()));
        }

        // Calculate camera distance to frame the object based on its largest dimension and camera FOV
        const maxDim = Math.max(newSize.x, newSize.y, newSize.z);
        const fov = this.camera.fov * (Math.PI / 180); 
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)); 
        
        // Add some padding to the view distance
        cameraZ *= 1.5; 

        // Set camera position and target
        this.camera.position.set(newCenter.x, newCenter.y, cameraZ); 
        this.controls.target.set(newCenter.x, newCenter.y, newCenter.z); 
        
        this.camera.near = 0.1; 
        this.camera.far = cameraZ + maxDim * 2; 
        this.camera.updateProjectionMatrix();

        this.controls.update();
    }

    // New: Positions and scales accessories relative to the avatar
    _positionAccessoryOnAvatar(accessoryModel, modelPath, accessoryType) {
    if (!this.currentModel) return;

    let scaleFactor = 1;
    let offset = { x: 0, y: 0, z: 0 };
    let rotation = { x: 0, y: 0, z: 0 };

    if (modelPath.includes('doge_roblox_hat.glb')) {
        scaleFactor *= 0.4;
        offset.y = 0.8;
        offset.z = 0;
        rotation.y = Math.PI / 2.5;  // 90 graus        // frente
        rotation.x = 0;         // garante que não está inclinado
        rotation.z = 0;         // garante que não está rotacionado lateral
    } else if (modelPath.includes('roblox_r_baseball_cap_r6.glb')) {
        scaleFactor *= 0.3;
        offset.y = 1.08;
        offset.z = 0.05;
        rotation.y = 0;         // frente
        rotation.x = 0;
        rotation.z = 0;
    } else if (modelPath.includes('roblox_fedora.glb')) {
        scaleFactor *= 0.3;
        offset.y = 1.08;
        offset.z = 0.05;
        rotation.y = 0;         // frente
        rotation.x = 0;
        rotation.z = 0;
    }

    // aplica escala
    accessoryModel.scale.multiplyScalar(scaleFactor);

    // aplica posição
    accessoryModel.position.x += offset.x;
    accessoryModel.position.y += offset.y;
    accessoryModel.position.z += offset.z;

    // aplica rotação
    accessoryModel.rotation.x = rotation.x;
    accessoryModel.rotation.y = rotation.y;
    accessoryModel.rotation.z = rotation.z;

    // adiciona ao avatar
    if (accessoryType === 'hat') {
        // Find head
        let head = null;
        this.currentModel.traverse(child => {
            if (child.isMesh && child.name === "Head") head = child;
        });
        if (head) {
            head.add(accessoryModel);
        } else {
            this.currentModel.add(accessoryModel);
        }
    } else {
        this.currentModel.add(accessoryModel);
    }
}


    destroy() {
        this.stopAnimation();
        if (this.renderer && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        this.scene.traverse((object) => { // Dispose of geometries, materials, textures
            if (object.isMesh) {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    // In case of multiple materials or material arrays
                    if (Array.isArray(object.material)) {
                        object.material.forEach(material => material.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            }
        });
        this.scene.clear(); // Clear all objects from the scene
        this.renderer.dispose();
        if (this.controls) this.controls.dispose();
        // Nullify references to aid garbage collection
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.currentModel = null;
    }
}

// Global 3D viewer instances removed

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

    // Face Overlay
    const faceTextureLoader = new THREE.TextureLoader();
    let faceId = localStorage.getItem('rogold_equipped_face') || 'default';
    let faceTexturePath = 'imgs/OriginalGlitchedFace.webp';
    if (faceId === 'face_epic') {
        faceTexturePath = 'imgs/epicface.png';
    }
    const faceTexture = faceTextureLoader.load(faceTexturePath);
    faceTexture.minFilter = THREE.NearestFilter;
    faceTexture.magFilter = THREE.NearestFilter;
    const faceMaterial = new THREE.MeshLambertMaterial({
        map: faceTexture,
        transparent: true,
        alphaTest: 0.1 // To avoid rendering fully transparent parts
    });
    const faceGeometry = new THREE.PlaneGeometry(1.05, 1.05);
    const facePlane = new THREE.Mesh(faceGeometry, faceMaterial);
    facePlane.name = "Face"; // For easy selection

    // Position it relative to the head. The head is a cylinder model,
    // so we place the face on its surface on the Z axis.
    facePlane.position.set(0, 0, 0.75); // radius of the head model
    head.add(facePlane);

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
    // We will offset the whole group so its bottom is at y=0.
    playerGroup.position.y = 3;

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

function updatePlayerFace(player, faceId) {
    player.traverse((child) => {
        if (child.isMesh && child.name === "Face") {
            if (faceId === 'epic') {
                child.material.color.set(0xff0000); // Red for epic
            } else {
                child.material.color.set(0xffffff); // White for default
            }
        }
    });
}


// Community Management
class CommunityManager {
    constructor() {
        try {
            this.blogs = JSON.parse(localStorage.getItem('rogold_blogs')) || [];
        } catch (e) {
            console.error("Error parsing rogold_blogs from localStorage, resetting:", e);
            this.blogs = [];
            // Optionally clear corrupt data to prevent repeated errors
            localStorage.removeItem('rogold_blogs');
        }
        this.currentBlog = null;
    }

    createBlog(title, message, author) {
        const blog = {
            id: Date.now(),
            title,
            message,
            author,
            createdAt: new Date().toISOString(),
            messages: []
        };
        
        this.blogs.unshift(blog);
        this.saveBlogs();
        return blog;
    }

    getBlogs() {
        return this.blogs;
    }

    getBlog(id) {
        return this.blogs.find(blog => blog.id === id);
    }

    addMessage(blogId, message, author) {
        const blog = this.getBlog(blogId);
        if (blog) {
            const newMessage = {
                id: Date.now(),
                message,
                author,
                timestamp: new Date().toISOString()
            };
            blog.messages.push(newMessage);
            this.saveBlogs();
            return newMessage;
        }
        return null;
    }

    saveBlogs() {
        localStorage.setItem('rogold_blogs', JSON.stringify(this.blogs));
    }
}

const communityManager = new CommunityManager();


function showCatalog() {
    const catalogSection = document.getElementById('catalog-section');
    const currentUser = userManager.getCurrentUser();

    if (!currentUser) {
        alert(t['warning-login-catalog']);
        return;
    }

    updateUserCoinsDisplay();

    // Hide other sections
    hideSection(document.getElementById('featured-games'));
    hideSection(document.querySelector('.banner'));
    hideSection(document.getElementById('profile-section'));
    hideSection(document.getElementById('community-section'));
    hideSection(document.getElementById('item-detail-section'));
    hideSection(document.getElementById('blog-list'));
    showOnlyAuthSection('');

    showSection(catalogSection);
    renderCatalogItems('all');

    setActiveNavLink('catalog-link');
}

function hideCatalog() {
    const catalogSection = document.getElementById('catalog-section');
    hideSection(catalogSection);

    setTimeout(() => {
        showMainContent();
    }, 300);
}

function showItemDetail(itemId) {
    const item = catalogManager.getItemById(itemId);
    if (!item) return;

    const currentUser = userManager.getCurrentUser();
    const userProfile = currentUser ? profileManager.getProfile(currentUser) : null;

    // Get translated item name and description
    const translatedName = tGet(`item_${itemId}`) || tGet(itemId) || item.name;
    const translatedDesc = tGet(`item_${itemId}_desc`) || tGet(`${itemId}_desc`) || item.description;

    // Update item details
    document.getElementById('item-detail-title').textContent = translatedName;
    document.getElementById('item-detail-img').src = item.imageUrl;
    document.getElementById('item-detail-description').textContent = translatedDesc;
    document.getElementById('item-purchase-count').textContent = catalogManager.getPurchaseCount(itemId);
    document.getElementById('item-detail-price').textContent = item.price;

    // Generate action buttons
    let buttonHtml = '';
    const isOwned = userProfile && userProfile.inventory.includes(item.id);
    const isEquipped = userProfile && userProfile.equippedItems[item.type] === item.id;

    if (!currentUser) {
        buttonHtml = `<button class="buy-button" disabled onclick="event.stopPropagation()">${tGet('login-to-view-favorites') || 'Sign in to Buy'}</button>`;
    } else if (isOwned) {
        if (isEquipped) {
            buttonHtml = `<button class="equipped-button" disabled onclick="event.stopPropagation()">${tGet('equipped')}</button>`;
        } else {
            buttonHtml = `<button class="equip-button" data-item-id="${item.id}" data-item-type="${item.type}" onclick="event.stopPropagation(); handleCatalogAction('${item.id}', '${item.type}', 'equip')">${tGet('equip')}</button>`;
        }
    } else {
        buttonHtml = `<button class="buy-button" data-item-id="${item.id}" data-item-type="${item.type}" onclick="event.stopPropagation(); handleCatalogAction('${item.id}', '${item.type}', 'buy')">${tGet('buy')} ${item.price}</button>`;
    }

    document.getElementById('item-detail-actions').innerHTML = buttonHtml;

    // Hide catalog and show item detail
    hideSection(document.getElementById('catalog-section'));
    showSection(document.getElementById('item-detail-section'));
    setActiveNavLink('catalog-link'); // Keep catalog active in nav
}

function hideItemDetail() {
    const itemDetailSection = document.getElementById('item-detail-section');
    hideSection(itemDetailSection);

    setTimeout(() => {
        showSection(document.getElementById('catalog-section'));
    }, 300);
}

// Handle catalog actions (buy/equip) from inline onclick handlers
async function handleCatalogAction(itemId, itemType, action) {
    const currentUser = userManager.getCurrentUser();
    const item = catalogManager.getItemById(itemId);
    
    // Get translated item name
    const translatedName = tGet(`item_${item.id}`) || tGet(item.id) || (item ? item.name : 'Unknown');

    if (!item) {
        await alert(tGet('warning-item-not-found') || 'Error: Item not found in catalog.');
        return;
    }

    if (action === 'buy') {
        if (!currentUser) {
            await alert(tGet('warning-login-catalog-interact') || 'You need to be logged in to interact with the catalog.');
            return;
        }

        const confirmBuy = await confirm(tGet('confirm-buy').replace('${itemName}', translatedName).replace('${itemPrice}', item.price));
        if (confirmBuy) {
            const subtractResult = profileManager.subtractCoins(currentUser, item.price);
            if (subtractResult.success) {
                const addResult = profileManager.addItemToInventory(currentUser, item.id);
                if (addResult.success) {
                    // Increment purchase count
                    catalogManager.incrementPurchaseCount(item.id);

                    // If it's a face item, also add to owned faces for game.js
                    if (item.type === 'face') {
                        let ownedFaces = JSON.parse(localStorage.getItem('rogold_owned_faces') || '["imgs/OriginalGlitchedFace.webp"]');
                        const faceMapping = {
                            'face_default': 'imgs/OriginalGlitchedFace.webp',
                            'face_epic': 'imgs/epicface.png'
                        };
                        const faceFile = faceMapping[item.id];
                        if (faceFile && !ownedFaces.includes(faceFile)) {
                            ownedFaces.push(faceFile);
                            localStorage.setItem('rogold_owned_faces', JSON.stringify(ownedFaces));
                        }
                    }
                    // If it's a gear item, also add to owned gears for game.js
                    if (item.type === 'gear') {
                        let ownedGears = JSON.parse(localStorage.getItem('rogold_owned_gears') || '[]');
                        if (!ownedGears.includes(item.id)) {
                            ownedGears.push(item.id);
                            localStorage.setItem('rogold_owned_gears', JSON.stringify(ownedGears));
                            // Dispatch event to notify game.js of gear purchase
                            window.dispatchEvent(new CustomEvent('rogold_gear_purchased', { detail: { gearId: item.id } }));
                        }
                    }
                    await alert((tGet('warning-purchased') || 'You bought "${itemName}"!').replace('${itemName}', translatedName));
                    updateUserCoinsDisplay();
                    renderCatalogItems(document.querySelector('.category-button.active').dataset.category);
                } else {
                    // This case should ideally not happen if inventory check is correct
                    await alert(addResult.message);
                    // Refund coins if item could not be added to inventory
                    profileManager.addCoins(currentUser, item.price);
                    updateUserCoinsDisplay();
                }
            } else {
                await alert(subtractResult.message);
            }
        }
    } else if (action === 'equip') {
        if (!currentUser) {
            await alert(tGet('warning-login-catalog-interact') || 'You need to be logged in to interact with the catalog.');
            return;
        }
        if (item.type === 'gear') {
            await alert(tGet('warning-cannot-equip-gear') || 'Tools are equipped in the game.');
            return;
        }
        const equipResult = profileManager.equipItem(currentUser, item.id, item.type);
        if (equipResult.success) {
            // If equipping a face, update the equipped face in localStorage for game.js
            if (item.type === 'face') {
                const faceMapping = {
                    'face_default': 'imgs/OriginalGlitchedFace.webp',
                    'face_epic': 'imgs/epicface.png'
                };
                const faceFile = faceMapping[item.id];
                if (faceFile) {
                    localStorage.setItem('rogold_face', faceFile);
                    // Dispatch event to notify game.js of face change
                    window.dispatchEvent(new Event('rogold_equipped_face_changed'));
                }
            }
            await alert((tGet('warning-equipped') || '"${itemName}" equipped successfully!').replace('${itemName}', translatedName));
            renderCatalogItems(document.querySelector('.category-button.active').dataset.category);
            // Simulate a socket event for equipping an item
            console.log(`[SOCKET_EVENT] User ${currentUser} equipped item: { id: "${item.id}", name: "${translatedName}", type: "${item.type}" }`);
        } else {
            await alert(equipResult.message);
        }
    }
}

























function renderCatalogItems(category) {
    const currentUser = userManager.getCurrentUser();
    const itemsGrid = document.getElementById('catalog-items-grid');
    if (!itemsGrid) return;

    const items = catalogManager.getItemsByType(category);
    let userProfile = null;
    if (currentUser) {
        userProfile = profileManager.getProfile(currentUser);
    }

    if (items.length === 0) {
        itemsGrid.innerHTML = '<p class="empty-message">' + (tGet('no-items-category') || 'No items available in this category.') + '</p>';
        return;
    }

    itemsGrid.innerHTML = items.map(item => {
        let buttonHtml = '';
        const isOwned = userProfile && userProfile.inventory.includes(item.id);
        const isEquipped = userProfile && userProfile.equippedItems[item.type] === item.id;
        
        // Get translated item name
        const translatedName = tGet(`item_${item.id}`) || tGet(item.id) || item.name;

        if (!currentUser) {
            buttonHtml = `<button class="buy-button" disabled onclick="event.stopPropagation()">${tGet('login-to-view-favorites') || 'Sign in to Buy'}</button>`;
        } else if (isOwned) {
            if (item.type === 'gear') {
                buttonHtml = `<button class="equipped-button" disabled onclick="event.stopPropagation()">${tGet('purchases')}</button>`;
            } else if (isEquipped) {
                buttonHtml = `<button class="equipped-button" data-item-id="${item.id}" data-item-type="${item.type}" disabled onclick="event.stopPropagation()">${tGet('equipped')}</button>`;
            } else {
                buttonHtml = `<button class="equip-button" data-item-id="${item.id}" data-item-type="${item.type}" onclick="event.stopPropagation(); handleCatalogAction('${item.id}', '${item.type}', 'equip')">${tGet('equip')}</button>`;
            }
        } else {
            buttonHtml = `<button class="buy-button" data-item-id="${item.id}" data-item-type="${item.type}" onclick="event.stopPropagation(); handleCatalogAction('${item.id}', '${item.type}', 'buy')">${tGet('buy')} ${item.price}</button>`;
        }

        return `
            <div class="catalog-item-card" onclick="showItemDetail('${item.id}')">
                <div class="catalog-item-thumbnail">
                    <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(translatedName)}">
                </div>
                <h4>${escapeHtml(translatedName)}</h4>
                <div class="item-price">
                    ${!isOwned ? `<img src="imgs/roglux_coins.png" alt="Coins" class="coins-icon">  ` : ''}
                    ${!isOwned ? item.price : ''}
                </div>
                ${buttonHtml}
            </div>
        `;
    }).join('');
}

// Helper functions for showing/hiding sections with fade animation
function showSection(sectionElement) {
    if (!sectionElement) return;
    sectionElement.style.opacity = '0'; 
    sectionElement.classList.remove('hidden'); 
    // Force reflow for transition to apply correctly
    sectionElement.offsetHeight; 
    sectionElement.style.opacity = '1'; 
}

function hideSection(sectionElement) {
    if (!sectionElement) return;
    sectionElement.style.opacity = '0'; 
    // After transition, set display to none
    setTimeout(() => {
        sectionElement.classList.add('hidden');
    }, 300); 
}

// Function to manage which auth/form section is visible
// This function hides all auth forms except the target one.
function showOnlyAuthSection(targetId) {
    // This list should only contain top-level authentication/settings forms
    // that overlay or replace the main content area.
    const authSections = ['login-section', 'register-section', 'settings-section', 'profile-edit-section']; // Corrected list
    
    authSections.forEach(id => {
        const section = document.getElementById(id);
        if (section) {
            if (id === targetId) {
                showSection(section);
            } else {
                hideSection(section);
            }
        }
    });
}

// Global UI functions for inline HTML event handlers (e.g., onclick) and event listeners
// Defined as function declarations so they are hoisted and available throughout the script.
async function openLoginModal() {
    // Hide all main content sections and display only the target auth section
    hideSection(document.getElementById('featured-games'));
    hideSection(document.querySelector('.banner'));
    hideSection(document.getElementById('profile-section'));
    hideSection(document.getElementById('community-section'));
    hideSection(document.getElementById('catalog-section'));
    hideSection(document.getElementById('item-detail-section'));
    hideSection(document.getElementById('creation-board-section'));
    hideSection(document.getElementById('blog-list'));

    showOnlyAuthSection('login-section');
    setActiveNavLink(null);
}

async function openRegisterModal() {
    // Hide all main content sections and display only the target auth section
    hideSection(document.getElementById('featured-games'));
    hideSection(document.querySelector('.banner'));
    hideSection(document.getElementById('profile-section'));
    hideSection(document.getElementById('community-section'));
    hideSection(document.getElementById('catalog-section'));
    hideSection(document.getElementById('item-detail-section'));
    hideSection(document.getElementById('creation-board-section'));
    hideSection(document.getElementById('blog-list'));

    showOnlyAuthSection('register-section');
    setActiveNavLink(null);
}

async function openSettingsModal() {
    const currentUser = userManager.getCurrentUser();
    if (currentUser) {
        document.getElementById('current-username-inline').value = currentUser;

        // Hide all main content sections and display only the target auth section
        hideSection(document.getElementById('featured-games'));
        hideSection(document.querySelector('.banner'));
        hideSection(document.getElementById('profile-section'));
        hideSection(document.getElementById('community-section'));
        hideSection(document.getElementById('catalog-section'));
        hideSection(document.getElementById('item-detail-section'));
        hideSection(document.getElementById('creation-board-section'));
        hideSection(document.getElementById('blog-list'));

        showOnlyAuthSection('settings-section');
        setActiveNavLink(null);
    } else {
        await alert(t['warning-login-settings']);
        openLoginModal();
    }
}

// Function to handle user logout
async function logoutUser() {
    const confirmLogout = await confirm(t['confirm-logout'] || 'Tem certeza que deseja sair da sua conta?');
    if (confirmLogout) {
        userManager.logout();
        // Clear stored equipped hat on logout and notify viewers
        localStorage.removeItem('rogold_equipped_hat');
        window.dispatchEvent(new Event('rogold_equipped_hat_changed'));
        await alert(t['warning-logged-out']);
        
        // Ensure all active content sections and auth forms are hidden
        hideSection(document.getElementById('profile-section'));
        hideSection(document.getElementById('community-section'));
        hideSection(document.getElementById('catalog-section'));
        hideSection(document.getElementById('creation-board-section'));
        hideSection(document.getElementById('blog-list'));
        showOnlyAuthSection('');
        
        stopCoinRewardTimer();

        // After a short delay for transitions to complete, show main content and then login
        setTimeout(() => {
            showMainContent(); 
            updateProfileLink();
            updateFeaturedGameCards(); 
            updateUserCoinsDisplay(); 
            openLoginModal(); 
        }, 300); 
    }
}

// This function is for closing an auth form and returning to the main page content.
function hideCurrentAuthFormAndShowMainContent() {
    // Hide all auth forms first
    showOnlyAuthSection(''); 

    // Then show the default main page content
    showMainContent();
}

// NEW: Function to show the main content (banner and featured games)
function showMainContent() {
    hideSection(document.getElementById('profile-section'));
    hideSection(document.getElementById('community-section'));
    hideSection(document.getElementById('catalog-section'));
    hideSection(document.getElementById('item-detail-section'));
    hideSection(document.getElementById('creation-board-section'));
    hideSection(document.getElementById('blog-list'));
    showOnlyAuthSection('');

    showSection(document.getElementById('featured-games'));
    showSection(document.querySelector('.banner'));

    updateFeaturedGameCards();
    setActiveNavLink('home-link');
}

// Enhanced UI Functions
async function showProfile(username) {
    const profileSection = document.getElementById('profile-section');

    // Update profile data
    const profile = profileManager.getProfile(username);
    
    // Update profile username
    const usernameElement = document.getElementById('profile-username');
    if (usernameElement) usernameElement.textContent = username;
    
    // Update profile bio
    const bioElement = document.getElementById('profile-bio');
    if (bioElement) bioElement.textContent = profile.bio;
    
    // Update profile status
    const statusElement = document.querySelector('.profile-status');
    if (statusElement) statusElement.textContent = `Status: ${profile.status}`;
    
    // Update join date
    const joinDateElement = document.getElementById('join-date');
    if (joinDateElement) {
        const joinDate = new Date(profile.joinDate);
        if (!isNaN(joinDate.getTime())) {
            joinDateElement.textContent = joinDate.toLocaleDateString('pt-BR');
        } else {
            joinDateElement.textContent = '--/--/----';
        }
    }
    
    // Update favorite count
    const favoriteCountElement = document.getElementById('favorite-count');
    if (favoriteCountElement) favoriteCountElement.textContent = profile.favorites.length;
    
    // Update user coins
    const userCoinsElement = document.getElementById('user-coins');
    if (userCoinsElement) userCoinsElement.textContent = profile.coins;

    // Fetch user stats (visits)
    try {
        const response = await fetch(`/api/user/${encodeURIComponent(username)}/stats`);
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('profile-visits').textContent = stats.totalVisits || 0;
        } else {
            document.getElementById('profile-visits').textContent = '0';
        }
    } catch (error) {
        console.error('Error loading user stats:', error);
        document.getElementById('profile-visits').textContent = '0';
    }

    // Update profile picture
    const profileAvatarImg = document.getElementById('profile-avatar-img');
    const avatarPlaceholder = document.getElementById('avatar-placeholder');

    if (profile.profilePicture) {
        profileAvatarImg.src = profile.profilePicture;
        profileAvatarImg.classList.remove('hidden');
        avatarPlaceholder.classList.add('hidden');
    } else {
        profileAvatarImg.classList.add('hidden');
        avatarPlaceholder.classList.remove('hidden');
    }

    // Hide other sections, show profile
    hideSection(document.getElementById('featured-games'));
    hideSection(document.querySelector('.banner'));
    hideSection(document.getElementById('community-section'));
    hideSection(document.getElementById('catalog-section'));
    hideSection(document.getElementById('item-detail-section'));
    hideSection(document.getElementById('blog-list'));
    showOnlyAuthSection('');

    showSection(profileSection);
    setActiveNavLink('profile-link');

    // Setup tab functionality
    updateProfileTabs();
}

function hideProfile() {
    const profileSection = document.getElementById('profile-section');
    
    hideSection(profileSection); 
    
    setTimeout(() => {
        showMainContent(); 
        showOnlyAuthSection(''); 
    }, 300);
}

// New functions for community section
function showCommunity() {
    const communitySection = document.getElementById('community-section');
    const blogList = document.getElementById('blog-list');
    const createBlogForm = document.getElementById('create-blog-form'); // Get reference
    const blogDetail = document.getElementById('blog-detail'); // Get reference

    // Hide main content and profile section
    hideSection(document.getElementById('featured-games'));
    hideSection(document.querySelector('.banner'));
    hideSection(document.getElementById('profile-section'));
    hideSection(document.getElementById('catalog-section'));
    hideSection(document.getElementById('item-detail-section'));
    showOnlyAuthSection(''); // Ensure top-level auth forms are hidden

    // Ensure only the blog list is visible within the community section
    // Hide create form and blog detail by default when showing community overview
    if (createBlogForm) hideSection(createBlogForm); // Explicitly hide
    if (blogDetail) hideSection(blogDetail); // Explicitly hide

    // Show community section and load blogs
    showSection(communitySection);
    showSection(blogList);
    loadBlogs();
    setActiveNavLink('community-link');
}

function hideCommunity() {
    const communitySection = document.getElementById('community-section');
    const blogList = document.getElementById('blog-list'); 
    hideSection(communitySection); 
    hideSection(blogList); 

    setTimeout(() => {
        showMainContent(); 
        showOnlyAuthSection(''); 
    }, 300);
}





function updateUserCoinsDisplay() {
    const currentUser = userManager.getCurrentUser();
    const userCoinsProfileElement = document.getElementById('user-coins');
    const catalogCoinsElement = document.getElementById('current-catalog-coins');

    if (currentUser) {
        const profile = profileManager.getProfile(currentUser);
        if (userCoinsProfileElement) {
            userCoinsProfileElement.textContent = profile.coins;
        }
        if (catalogCoinsElement) {
            catalogCoinsElement.textContent = profile.coins;
        }
    } else {
        if (userCoinsProfileElement) {
            userCoinsProfileElement.textContent = '---';
        }
        if (catalogCoinsElement) {
            catalogCoinsElement.textContent = '0';
        }
    }
}


// Tab switching functionality
async function updateProfileTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.onclick = null;
        button.addEventListener('click', async () => {
            const targetTab = button.dataset.tab;

            // Remove active classes
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanels.forEach(panel => panel.classList.remove('active'));

            // Add active class to clicked button and corresponding panel
            button.classList.add('active');
            const targetPanel = document.getElementById(`${targetTab}-tab`);
            if (targetPanel) targetPanel.classList.add('active');

            // Special handling for 'favorites' tab
            if (targetTab === 'favorites') {
                await renderFavoriteGamesList();
            } else if (targetTab === 'games') {
                renderUserGamesList();
            }
        });
    });
    // Ensure the initially active tab is rendered
    const activeTabButton = document.querySelector('.profile-tabs .tab-button.active');
    if (activeTabButton) {
        const targetTab = activeTabButton.dataset.tab;
        if (targetTab === 'favorites') {
            await renderFavoriteGamesList();
        } else if (targetTab === 'games') {
            renderUserGamesList();
        }
    }
}

function editProfile() {
    const currentUser = userManager.getCurrentUser();
    if (!currentUser) return;
    
    const profile = profileManager.getProfile(currentUser);
    document.getElementById('bio-input-inline').value = profile.bio;
    document.getElementById('status-input-inline').value = profile.status;
    
    showOnlyAuthSection('profile-edit-section'); 
    setActiveNavLink(null); 
}

function closeProfileEdit() {
    // This will hide the edit form and then re-show the profile section
    showOnlyAuthSection(''); 
    showProfile(userManager.getCurrentUser()); 
    setActiveNavLink('profile-link'); 
}

// Replace native dialogs
function customAlert(message, title = 'Alerta') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'browser-dialog-overlay';
        overlay.innerHTML = `
            <div class="browser-dialog">
                <div class="browser-dialog-title">${escapeHtml(title)}</div>
                <div class="browser-dialog-message">${escapeHtml(message)}</div>
                <div class="browser-dialog-buttons">
                    <button class="browser-dialog-button" data-value="ok">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        overlay.querySelector('button').addEventListener('click', () => {
            overlay.remove();
            resolve();
        });
    });
};

function customConfirm(message, title = 'Confirmação') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'browser-dialog-overlay';
        overlay.innerHTML = `
            <div class="browser-dialog">
                <div class="browser-dialog-title">${escapeHtml(title)}</div>
                <div class="browser-dialog-message">${escapeHtml(message)}</div>
                <div class="browser-dialog-buttons">
                    <button class="browser-dialog-button" data-value="true">Sim</button>
                    <button class="browser-dialog-button cancel" data-value="false">Não</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        overlay.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                const result = e.target.dataset.value === 'true';
                overlay.remove();
                resolve(result);
            });
        });
    });
};

function customPrompt(message, defaultValue = '', title = 'Pergunta') {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'browser-dialog-overlay';
        overlay.innerHTML = `
            <div class="browser-dialog">
                <div class="browser-dialog-title">${escapeHtml(title)}</div>
                <div class="browser-dialog-message">${escapeHtml(message)}</div>
                <input type="text" class="browser-dialog-input" value="${escapeHtml(defaultValue)}" placeholder="Digite aqui...">
                <div class="browser-dialog-buttons">
                    <button class="browser-dialog-button" data-value="ok">OK</button>
                    <button class="browser-dialog-button cancel" data-value="cancel">Cancelar</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        const input = overlay.querySelector('.browser-dialog-input');
        input.focus();
        input.select();
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                overlay.querySelector('[data-value="ok"]').click();
            }
        });

        overlay.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                const result = e.target.dataset.value === 'ok' ? input.value : null;
                overlay.remove();
                resolve(result);
            });
        });
    });
};

// Replace native dialogs
window.alert = customAlert;
window.confirm = customConfirm;
window.prompt = customPrompt;

// Fix navigation
function updateProfileLink() {
    const profileLink = document.getElementById('profile-link');
    const currentUser = userManager.getCurrentUser();
    
    if (profileLink) { 
        if (currentUser) {
            profileLink.textContent = currentUser;
            profileLink.onclick = function(e) {
                e.preventDefault();
                showProfile(currentUser);
            };
        } else {
            profileLink.textContent = 'Perfil';
            profileLink.onclick = function(e) {
                e.preventDefault();
                openLoginModal();
            };
        }
    }
}

// NEW: Function to manage active navigation link
function setActiveNavLink(activeLinkId) {
    document.querySelectorAll('.menu a').forEach(link => {
        link.classList.remove('active');
    });
    if (activeLinkId) {
        const activeLink = document.getElementById(activeLinkId);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }
}

// Sync the equipped hat key in localStorage with the current user's profile.
// This runs on login/site enter to ensure previous stale values are cleared.
function syncEquippedHatFromProfile() {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            // No user logged in; clear any previous value
            localStorage.removeItem('rogold_equipped_hat');
            // Notify any viewers (e.g., avatar preview) to remove hat
            window.dispatchEvent(new Event('rogold_equipped_hat_changed'));
            return;
        }
        const profile = profileManager.getProfile(currentUser);
        const hatId = profile?.equippedItems?.hat || null;
        if (hatId) {
            localStorage.setItem('rogold_equipped_hat', hatId);
        } else {
            localStorage.removeItem('rogold_equipped_hat');
        }
        // Notify any listeners (e.g., game on same origin)
        window.dispatchEvent(new Event('rogold_equipped_hat_changed'));
    } catch (e) {
        console.warn('Failed to sync equipped hat from profile:', e);
    }
}

// Initial sync on script load in case user is already logged in and revisiting
try { syncEquippedHatFromProfile(); } catch (e) {}

// NEW: Function to render favorited games in the profile tab
async function renderFavoriteGamesList() {
    const currentUser = userManager.getCurrentUser();
    const favoritesListContainer = document.getElementById('favorite-games-list');

    // Get translations
    const t = (typeof translations !== 'undefined' && translations[localStorage.getItem('rogold_language') || 'pt']) || {};

    if (!currentUser) {
        favoritesListContainer.innerHTML = `<p class="empty-message">${t['login-to-view-favorites'] || 'Faça login para ver seus jogos favoritos.'}</p>`;
        return;
    }

    const profile = profileManager.getProfile(currentUser);
    const favorites = profile.favorites;

    if (favorites.length === 0) {
        favoritesListContainer.innerHTML = `<p class="empty-message">${t['no-favorites-yet'] || 'Nenhum jogo favorito ainda.'}</p>`;
        return;
    }

    // Show loading message
    favoritesListContainer.innerHTML = '<p class="empty-message">Carregando jogos favoritos...</p>';

    try {
        // Fetch published games from server
        const response = await fetch('/api/games');
        const data = await response.json();
        const publishedGames = data.games || [];

        // Create a map of game title to game object for quick lookup
        const gameMap = {};
        publishedGames.forEach(game => {
            if (game.title) {
                gameMap[game.title] = game;
            }
        });

        favoritesListContainer.innerHTML = favorites.map(gameTitle => {
            const safeGameTitle = typeof gameTitle === 'string' ? gameTitle : '';
            const game = gameMap[safeGameTitle];

            // Handle thumbnail - use file path if it starts with /thumbnails, otherwise default to thumbnail1.jpg
            const thumbnailSrc = game && game.thumbnail && game.thumbnail.startsWith('/thumbnails/')
                ? game.thumbnail
                : 'imgs/thumbnail1.jpg';

            const safeGameId = game ? (typeof game.id === 'string' ? game.id : '') : '';

            return `
                <div class="game-card game-card-favorite" data-game-title="${escapeHtml(safeGameTitle)}" data-game-id="${escapeHtml(safeGameId)}">
                    <div class="game-thumbnail">
                        <img src="${thumbnailSrc}" alt="${escapeHtml(safeGameTitle)} Thumbnail" onerror="this.src='imgs/thumbnail1.jpg'">
                    </div>
                    <h4>${escapeHtml(safeGameTitle)}</h4>
                    <button class="play-button" data-game-id="${escapeHtml(safeGameId)}" data-game-title="${escapeHtml(safeGameTitle)}">Jogar</button>
                    <button class="favorite-toggle-button remove-favorite-button" data-game-title="${escapeHtml(safeGameTitle)}">Remover</button>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading favorite games:', error);
        favoritesListContainer.innerHTML = '<p class="empty-message">Erro ao carregar jogos favoritos. Tente novamente.</p>';
    }
    
    // Update button translations
    if (typeof updateDynamicButtons === 'function') {
        updateDynamicButtons();
    }
}

// NEW: Function to render user's published games in the profile tab
function renderUserGamesList() {
    const currentUser = userManager.getCurrentUser();
    const userGamesContainer = document.getElementById('user-games');

    if (!currentUser) {
        userGamesContainer.innerHTML = '<p class="empty-message">Faça login para ver seus jogos.</p>';
        return;
    }

    // Show loading message
    userGamesContainer.innerHTML = '<p class="empty-message">Carregando jogos...</p>';

    // Fetch published games from server
    fetch('/api/games')
        .then(response => response.json())
        .then(data => {
            const publishedGames = data.games || [];

            // Filter games by current user
            const userGames = publishedGames.filter(game => game.creator_id === currentUser);

            if (userGames.length === 0) {
                userGamesContainer.innerHTML = '<p class="empty-message">Nenhum jogo criado ainda.</p>';
            } else {
                userGamesContainer.innerHTML = userGames.map(game => {
                    const safeGameTitle = typeof game.title === 'string' ? game.title : 'Untitled Game';
                    const safeGameId = typeof game.id === 'string' ? game.id : '';

                    // Handle thumbnail - use file path if it starts with /thumbnails, otherwise default to thumbnail1.jpg
                    const thumbnailSrc = game.thumbnail && game.thumbnail.startsWith('/thumbnails/')
                        ? game.thumbnail
                        : 'imgs/thumbnail1.jpg';

                    return `
                        <div class="game-card game-card-user" data-game-id="${escapeHtml(safeGameId)}">
                            <div class="game-thumbnail">
                                <img src="${thumbnailSrc}" alt="${escapeHtml(safeGameTitle)} Thumbnail" onerror="this.src='imgs/thumbnail1.jpg'">
                            </div>
                            <h4>${escapeHtml(safeGameTitle)}</h4>
                            <button class="play-button" data-game-id="${escapeHtml(safeGameId)}">Jogar</button>
                        </div>
                    `;
                }).join('');
            }
        })
        .catch(error => {
            console.error('Error loading user games:', error);
            userGamesContainer.innerHTML = '<p class="empty-message">Erro ao carregar jogos. Tente novamente.</p>';
        })
        .finally(() => {
            // Update button translations
            if (typeof updateDynamicButtons === 'function') {
                updateDynamicButtons();
            }
        });
}

// NEW: Function to update favorite buttons on featured game cards
function updateFeaturedGameCards() {
    const currentUser = userManager.getCurrentUser();
    const gameCards = document.querySelectorAll('#featured-games .game-card');

    // Get translations
    const t = (typeof translations !== 'undefined' && translations[localStorage.getItem('rogold_language') || 'pt']) || {
        'favoritar': 'Favoritar',
        'remover-favorite': 'Remover Favorito'
    };

    gameCards.forEach(card => {
        const gameTitle = card.dataset.gameTitle;
        const favoriteButton = card.querySelector('.favorite-toggle-button');
        const gameThumbnail = card.querySelector('.game-thumbnail');
        const playButton = card.querySelector('.play-button');

        // Ensure gameTitle is a string before operations, default to empty string if not
        const safeGameTitle = typeof gameTitle === 'string' ? gameTitle : '';

        // Skip thumbnail update for published games (they have data-game-id and correct thumbnail already set)
        if (!card.dataset.gameId) {
            // Dynamically set game thumbnail based on safeGameTitle for hardcoded games
            let imageSrc = '';
            if (safeGameTitle === 'Natural Disaster Survival') {
                imageSrc = 'imgs/thumbnail1.jpg';
            } else if (safeGameTitle === 'Work at a Pizza Place') {
                imageSrc = 'imgs/thumbnail2.jpg';
            } else {
                imageSrc = 'imgs/thumbnail1.jpg'; // Use existing thumbnail as fallback
            }

            if (gameThumbnail) {
                gameThumbnail.innerHTML = `<img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(safeGameTitle)} Thumbnail">`;
            }
        }

        // Update favorite button state
        if (favoriteButton) {
            if (currentUser) {
                const profile = profileManager.getProfile(currentUser);
                // Use safeGameTitle for includes check
                if (profile.favorites.includes(safeGameTitle)) {
                    favoriteButton.textContent = t['remover-favorite'] || 'Remover Favorito';
                    favoriteButton.classList.add('remove-favorite-button');
                    favoriteButton.classList.remove('add-favorite-button');
                } else {
                    favoriteButton.textContent = t['favoritar'] || 'Favoritar';
                    favoriteButton.classList.add('add-favorite-button');
                    favoriteButton.classList.remove('remove-favorite-button');
                }
                favoriteButton.disabled = false;
            } else {
                favoriteButton.textContent = t['favoritar'] || 'Favoritar';
                favoriteButton.classList.add('add-favorite-button');
                favoriteButton.classList.remove('remove-favorite-button');
                favoriteButton.disabled = true;
            }
            // Ensure data-game-title is set on the button itself for delegation
            favoriteButton.setAttribute('data-game-title', safeGameTitle);
        }

        // Update play button state (it's always enabled now, login check is inside handler)
        if (playButton) {
            // Set data-game-title attribute on play button for easier access
            playButton.setAttribute('data-game-title', safeGameTitle);
        }
    });
}

// Event Listeners
document.getElementById('profile-link')?.addEventListener('click', function(e) {
    e.preventDefault();
    const currentUser = userManager.getCurrentUser();
    
    if (currentUser) {
        showProfile(currentUser);
    } else {
        // Se não estiver logado, mostra o login
        openLoginModal();
    }
});


document.getElementById('catalog-link')?.addEventListener('click', function(e) {
    e.preventDefault();
    showCatalog();
});

document.getElementById('community-link')?.addEventListener('click', function(e) {
    e.preventDefault();
    showCommunity();
});

document.getElementById('studio-link')?.addEventListener('click', function(e) {
    e.preventDefault();
    showCreationBoard();
});


// NEW: Event listener for "Home" link
document.getElementById('home-link')?.addEventListener('click', function(e) {
    e.preventDefault();
    if (window.location.pathname.endsWith('game.html')) {
        window.location.href = 'index.html';
    } else {
        if (currentGameDetailId) {
            hideGameDetail();
        } else {
            showMainContent();
        }
    }
});

// NEW: Event listener for "Jogos" link
document.getElementById('games-link')?.addEventListener('click', function(e) {
    e.preventDefault();
    // For game.html, "Jogos" link points back to index.html and shows main content
    if (window.location.pathname.endsWith('game.html')) {
        window.location.href = 'index.html'; // Navigate back to index.html
    } else {
        if (currentGameDetailId) {
            hideGameDetail();
        } else {
            showMainContent();
        }
    }
});

document.getElementById('switch-to-register-inline')?.addEventListener('click', openRegisterModal);
document.getElementById('switch-to-login-inline')?.addEventListener('click', openLoginModal);
document.getElementById('close-settings-inline')?.addEventListener('click', hideCurrentAuthFormAndShowMainContent);
document.getElementById('close-profile-edit-inline')?.addEventListener('click', closeProfileEdit);

document.getElementById('login-form-inline')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('username-inline').value;
    const password = document.getElementById('password-inline').value;
    
    const result = await userManager.login(username, password);
    if (result.success) {
        await alert(t['warning-login-success'].replace('${username}', username));
        hideCurrentAuthFormAndShowMainContent();
        updateProfileLink();
        updateFeaturedGameCards();
        updateUserCoinsDisplay();
        // Ensure local hat matches profile on login
        syncEquippedHatFromProfile();
        startCoinRewardTimer(); // Start timer if login happens on a non-index page
    } else {
        await alert(result.message);
    }
});

document.getElementById('register-form-inline')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const username = document.getElementById('reg-username-inline').value;
    const password = document.getElementById('reg-password-inline').value;
    const confirmPassword = document.getElementById('reg-confirm-password-inline').value;

    if (password !== confirmPassword) {
        await alert(t['warning-passwords-mismatch']);
        return;
    }

    const result = await userManager.register(username, password);
    if (result.success) {
        await alert(t['warning-registered-success']);
        openLoginModal();
    } else {
        await alert(result.message);
    }
});

document.getElementById('settings-form-inline')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const currentUsername = userManager.getCurrentUser();
    const currentPassword = document.getElementById('current-password-inline').value;
    const newUsername = document.getElementById('new-username-inline').value.trim();
    const newPassword = document.getElementById('new-password-inline').value;
    const confirmNewPassword = document.getElementById('confirm-new-password-inline').value;

    if (newPassword && newPassword !== confirmNewPassword) {
        await alert(t['warning-passwords-new-mismatch']);
        return;
    }

    const result = await userManager.updateUser(
        currentUsername,
        currentPassword,
        newUsername || null,
        newPassword || null
    );

    if (result.success) {
        await alert(t['warning-updated-success']);
        hideCurrentAuthFormAndShowMainContent();
        updateProfileLink();
        updateFeaturedGameCards();
        updateUserCoinsDisplay();
        // Re-sync hat if username or profile changed
        syncEquippedHatFromProfile();
    } else {
        await alert(result.message);
    }
});

document.getElementById('profile-edit-form-inline')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const currentUser = userManager.getCurrentUser();
    if (!currentUser) return;
    
    const bio = document.getElementById('bio-input-inline').value;
    const status = document.getElementById('status-input-inline').value;
    
    profileManager.updateProfile(currentUser, { bio, status });
    
    // Update UI
    // The showProfile(currentUser) call in closeProfileEdit will re-render everything
    // For immediate feedback on the edit screen without full re-render, we could update here:
    // document.getElementById('profile-bio').textContent = bio;
    // document.querySelector('.profile-status').textContent = `Status: ${status}`;
    
    // Re-render the profile to reflect changes, including the picture if updated
    closeProfileEdit(); 
});

// Event listener for profile picture input
document.getElementById('profile-picture-input')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    const currentUser = userManager.getCurrentUser();
    
    if (file && currentUser) {
        const reader = new FileReader();
        reader.onload = function(event) {
            const base64Image = event.target.result;
            profileManager.updateProfile(currentUser, { profilePicture: base64Image });
            
            // Immediately update the avatar on the edit profile screen (if visible)
            const profileAvatarImg = document.getElementById('profile-avatar-img');
            const avatarPlaceholder = document.getElementById('avatar-placeholder');
            if (profileAvatarImg && avatarPlaceholder) {
                profileAvatarImg.src = base64Image;
                profileAvatarImg.classList.remove('hidden');
                avatarPlaceholder.classList.add('hidden');
            }
        };
        reader.readAsDataURL(file);
    }
});

// Event listener for remove profile picture button
document.getElementById('remove-profile-picture')?.addEventListener('click', async function() {
    const currentUser = userManager.getCurrentUser();
    if (currentUser) {
        profileManager.updateProfile(currentUser, { profilePicture: null });
        
        // Clear file input value
        document.getElementById('profile-picture-input').value = '';

        // Immediately update the avatar on the edit profile screen (if visible)
        const profileAvatarImg = document.getElementById('profile-avatar-img');
        const avatarPlaceholder = document.getElementById('avatar-placeholder');
        if (profileAvatarImg && avatarPlaceholder) {
            profileAvatarImg.classList.add('hidden');
            avatarPlaceholder.classList.remove('hidden');
        }
        await alert(t['warning-profile-removed']);
    }
});

// Event listener for logout button
document.getElementById('logout-button')?.addEventListener('click', logoutUser);

// Function to load and display published games
async function loadPublishedGames(category = 'all') {
    const gamesGrid = document.getElementById('games-grid');

    if (!gamesGrid) return;

    // Clear existing published games (keep the first two hardcoded ones)
    const existingCards = gamesGrid.querySelectorAll('.game-card');
    existingCards.forEach(card => {
        if (!card.dataset.gameTitle || (card.dataset.gameTitle !== 'Natural Disaster Survival' && card.dataset.gameTitle !== 'Work at a Pizza Place')) {
            card.remove();
        }
    });

    try {
        // Fetch published games from server API
        const response = await fetch('/api/games');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        let publishedGames = data.games || [];

        // Filter and sort based on category
        if (category === 'most-liked') {
            publishedGames = publishedGames.sort((a, b) => (b.likes || 0) - (a.likes || 0));
        } else {
            // Default: sort by updated_at desc
            publishedGames = publishedGames.sort((a, b) => new Date(b.updatedAt || b.updated_at) - new Date(a.updatedAt || a.updated_at));
        }

        // Add published games
        publishedGames.forEach(game => {
            const gameCard = document.createElement('div');
            gameCard.className = 'game-card';
            gameCard.dataset.gameTitle = game.title || 'Untitled Game';
            gameCard.dataset.gameId = game.id;

            // Handle thumbnail - use file path if it starts with /thumbnails, otherwise default to thumbnail1.jpg
            const thumbnailSrc = game.thumbnail && game.thumbnail.startsWith('/thumbnails/')
                ? game.thumbnail
                : 'imgs/thumbnail1.jpg';

            // Check user rating
            const currentUser = userManager.getCurrentUser();
            let userRating = null;
            if (currentUser) {
                const profile = profileManager.getProfile(currentUser);
                userRating = profile.ratings[game.id];
            }

            gameCard.innerHTML = `
                <div class="game-thumbnail">
                    <img src="${thumbnailSrc}" alt="${escapeHtml(game.title || 'Untitled Game')} Thumbnail" onerror="this.src='imgs/thumbnail1.jpg'">
                </div>
                <h4>${escapeHtml(game.title || 'Untitled Game')}</h4>
                <div class="game-actions">
                    <button class="play-button" data-game-id="${escapeHtml(game.id)}">Jogar</button>
                    <button class="favorite-toggle-button" data-game-title="${escapeHtml(game.title || 'Untitled Game')}">Favoritar</button>
                </div>
            `;
            gameCard.onclick = (e) => {
                if (e.target.tagName === 'BUTTON') return;
                viewGameDetails(game.id);
            };
            gamesGrid.appendChild(gameCard);
        });

        console.log(`Loaded ${publishedGames.length} published games from server`);
    } catch (error) {
        console.error('Error loading published games from server:', error);
        // Fallback to localStorage if server is unavailable
        console.log('Falling back to localStorage for published games');
        const publishedGames = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('rogold_published_game_')) {
                try {
                    const gameData = JSON.parse(localStorage.getItem(key));
                    gameData.id = key.replace('rogold_published_game_', ''); // Extract game ID
                    publishedGames.push(gameData);
                } catch (e) {
                    console.error('Error parsing published game data:', e);
                }
            }
        }

        // Add fallback published games
        publishedGames.forEach(game => {
            const gameCard = document.createElement('div');
            gameCard.className = 'game-card';
            gameCard.dataset.gameTitle = game.title || 'Untitled Game';
            gameCard.innerHTML = `
                <div class="game-thumbnail">
                    <img src="${escapeHtml(game.thumbnail || 'imgs/thumbnail1.jpg')}" alt="${escapeHtml(game.title || 'Untitled Game')} Thumbnail" onerror="this.src='imgs/thumbnail1.jpg'">
                </div>
                <h4>${escapeHtml(game.title || 'Untitled Game')}</h4>
                <div class="game-actions">
                    <button class="play-button" data-game-id="${escapeHtml(game.id)}">Jogar</button>
                    <button class="favorite-toggle-button" data-game-title="${escapeHtml(game.title || 'Untitled Game')}">Favoritar</button>
                </div>
            `;
            gamesGrid.appendChild(gameCard);
        });
    }

    // Update favorite buttons for all games
    updateFeaturedGameCards();
    
    // Update button translations
    if (typeof updateDynamicButtons === 'function') {
        updateDynamicButtons();
    }
}

// Helper functions for updating game cards
function updateGameCardCounts(gameCard, likes, dislikes) {
    const likesSpan = gameCard.querySelector('.likes-count');
    const dislikesSpan = gameCard.querySelector('.dislikes-count');
    if (likesSpan) likesSpan.textContent = likes;
    if (dislikesSpan) dislikesSpan.textContent = dislikes;
}

function updateGameCardButtons(gameCard, rating) {
    const likeButton = gameCard.querySelector('.like-button');
    const dislikeButton = gameCard.querySelector('.dislike-button');
    if (likeButton) {
        likeButton.classList.toggle('active', rating === 'like');
    }
    if (dislikeButton) {
        dislikeButton.classList.toggle('active', rating === 'dislike');
    }
}

let currentGameDetailId = null;
let currentGameDetailData = null;
let currentGameDetailRating = null;

function viewGameDetails(gameId) {
    currentGameDetailId = gameId;
    loadGameDetailSection();
    showGameDetailSection();
}

async function loadGameDetailSection() {
    if (!currentGameDetailId) return;

    try {
        const response = await fetch(`/api/game-details/${encodeURIComponent(currentGameDetailId)}`);
        if (!response.ok) {
            throw new Error('Game not found');
        }
        currentGameDetailData = await response.json();

        // Display game info
        const gameDetailTitle = document.getElementById('game-detail-title');
        const gameDetailCreator = document.getElementById('game-detail-creator');
        const gameDetailDescription = document.getElementById('game-detail-description');
        const gameDetailCreatedDate = document.getElementById('game-detail-created-date');
        const gameDetailThumbnail = document.getElementById('game-detail-thumbnail');
        const gameDetailLikes = document.getElementById('game-detail-likes');
        const gameDetailDislikes = document.getElementById('game-detail-dislikes');
        const gameDetailPlaying = document.getElementById('game-detail-playing');
        const gameDetailVisits = document.getElementById('game-detail-visits');
        const gameDetailToolsAllowed = document.getElementById('game-detail-tools-allowed');

        if (gameDetailTitle) gameDetailTitle.textContent = currentGameDetailData.title || 'Untitled Game';
        if (gameDetailCreator) gameDetailCreator.textContent = currentGameDetailData.creator_id || 'Unknown';
        if (gameDetailDescription) gameDetailDescription.textContent = currentGameDetailData.description || 'No description available.';

        // Format and display creation date
        const createdDate = currentGameDetailData.createdAt || currentGameDetailData.timestamp;
        const currentLang = localStorage.getItem('rogold_language') || 'pt';
        const dateLocale = currentLang === 'en' ? 'en-US' : currentLang === 'es' ? 'es-ES' : 'pt-BR';
        
        if (createdDate && gameDetailCreatedDate) {
            const date = new Date(createdDate);
            const formattedDate = date.toLocaleDateString(dateLocale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            gameDetailCreatedDate.textContent = formattedDate;
        } else if (gameDetailCreatedDate) {
            gameDetailCreatedDate.textContent = 'Unknown';
        }

        if (gameDetailThumbnail) gameDetailThumbnail.src = currentGameDetailData.thumbnail || 'imgs/thumbnail1.jpg';
        if (gameDetailLikes) gameDetailLikes.textContent = currentGameDetailData.likes || 0;
        if (gameDetailDislikes) gameDetailDislikes.textContent = currentGameDetailData.dislikes || 0;
        if (gameDetailPlaying) gameDetailPlaying.textContent = currentGameDetailData.playing || 0;
        if (gameDetailVisits) gameDetailVisits.textContent = currentGameDetailData.visits || 0;

        // Increment visits
        fetch(`/api/games/${encodeURIComponent(currentGameDetailId)}/visit`, {
            method: 'POST'
        }).then(response => {
            if (response.ok) {
                return response.json();
            }
        }).then(data => {
            if (data && data.visits !== undefined) {
                document.getElementById('game-detail-visits').textContent = data.visits;
            }
        }).catch(error => {
            console.error('Error incrementing visits:', error);
        });

        // Display tools allowed status
        const t = (typeof translations !== 'undefined' && translations[currentLang]) || translations.pt;
        const toolsAllowedText = currentGameDetailData.toolsAllowed === true ? (t['tools-yes'] || 'Sim') : (t['tools-no'] || 'Não');
        if (gameDetailToolsAllowed) gameDetailToolsAllowed.textContent = toolsAllowedText;

        // Check user rating
        currentGameDetailRating = localStorage.getItem(`rating_${currentGameDetailId}`);
        updateGameDetailRatingButtons();

    } catch (error) {
        console.error('Error loading game details:', error);
        const gameDetailTitle = document.getElementById('game-detail-title');
        if (gameDetailTitle) gameDetailTitle.textContent = 'Error loading game';
    }
}

function updateGameDetailRatingButtons() {
    const likeBtn = document.getElementById('game-detail-like-btn');
    const dislikeBtn = document.getElementById('game-detail-dislike-btn');

    if (likeBtn) likeBtn.classList.remove('active');
    if (dislikeBtn) dislikeBtn.classList.remove('active');

    if (currentGameDetailRating === 'like' && likeBtn) {
        likeBtn.classList.add('active');
    } else if (currentGameDetailRating === 'dislike' && dislikeBtn) {
        dislikeBtn.classList.add('active');
    }
}

async function rateGameDetail(action) {
    if (!currentGameDetailData) return;

    let newAction = action;
    if (currentGameDetailRating === action) {
        // Remove rating
        newAction = action === 'like' ? 'remove_like' : 'remove_dislike';
        localStorage.removeItem(`rating_${currentGameDetailId}`);
        currentGameDetailRating = null;
    } else if (currentGameDetailRating && currentGameDetailRating !== action) {
        // Change rating
        newAction = action === 'like' ? 'change_to_like' : 'change_to_dislike';
        localStorage.setItem(`rating_${currentGameDetailId}`, action);
        currentGameDetailRating = action;
    } else {
        // New rating
        localStorage.setItem(`rating_${currentGameDetailId}`, action);
        currentGameDetailRating = action;
    }

    try {
        const response = await fetch(`/api/games/${encodeURIComponent(currentGameDetailId)}/rate`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action: newAction })
        });

        if (response.ok) {
            const result = await response.json();
            document.getElementById('game-detail-likes').textContent = result.likes;
            document.getElementById('game-detail-dislikes').textContent = result.dislikes;
            updateGameDetailRatingButtons();
            // Update the main games grid if visible
            loadPublishedGames();
        } else {
            console.error('Failed to rate game');
        }
    } catch (error) {
        console.error('Error rating game:', error);
    }
}

function joinGameDetailServer() {
    if (currentGameDetailId) {
        window.location.href = `game.html?game=${encodeURIComponent(currentGameDetailId)}`;
    }
}

function showGameDetailSection() {
    hideSection(document.getElementById('featured-games'));
    hideSection(document.querySelector('.banner'));
    hideSection(document.getElementById('profile-section'));
    hideSection(document.getElementById('community-section'));
    hideSection(document.getElementById('catalog-section'));
    hideSection(document.getElementById('item-detail-section'));
    hideSection(document.getElementById('blog-list'));
    showOnlyAuthSection('');

    showSection(document.getElementById('game-detail-section'));
    setActiveNavLink('games-link');
}

function hideGameDetail() {
    hideSection(document.getElementById('game-detail-section'));
    showMainContent();
    currentGameDetailId = null;
    currentGameDetailData = null;
    currentGameDetailRating = null;
}

// Make loadPublishedGames available globally for studio.js to call
window.loadPublishedGames = loadPublishedGames;

// Initialize on load
document.addEventListener('DOMContentLoaded', function() {
    const isIndexPage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');

    if (isIndexPage) {
        // Hide all secondary sections and auth forms initially
        const profileSection = document.getElementById('profile-section');
        if (profileSection) {
            profileSection.classList.add('hidden');
            profileSection.style.opacity = '0';
        }
        const communitySection = document.getElementById('community-section');
        if (communitySection) {
            communitySection.classList.add('hidden');
            communitySection.style.opacity = '0';
        }
        const catalogSection = document.getElementById('catalog-section');
        if (catalogSection) {
            catalogSection.classList.add('hidden');
            catalogSection.style.opacity = '0';
        }

        const sectionsToHideCompletely = ['login-section', 'register-section', 'settings-section', 'profile-edit-section', 'create-blog-form', 'blog-detail', 'blog-list', 'creation-board-section'];
        sectionsToHideCompletely.forEach(id => {
            const section = document.getElementById(id);
            if (section) {
                section.classList.add('hidden');
                section.style.opacity = '0';
            }
        });

        showMainContent();
        updateProfileLink();
        loadPublishedGames(); // Load published games
        updateFeaturedGameCards();
        updateUserCoinsDisplay();
        stopCoinRewardTimer(); // Ensure timer is stopped on index page
    } else {
        // Logic for non-index.html pages (e.g., game.html)
        const params = new URLSearchParams(window.location.search);
        const gameId = params.get('game');
        const gameTitleDisplay = document.getElementById('game-title-display');
        const gameTitlePlaceholder = document.getElementById('game-title-placeholder');

        if (gameTitleDisplay) { // Check if elements exist (they won't on index.html)
            if (gameId) {
                // Load game data to get the title
                const gameData = localStorage.getItem(`rogold_published_game_${gameId}`);
                let gameTitle = 'Jogo Desconhecido';
                if (gameData) {
                    try {
                        const parsedData = JSON.parse(gameData);
                        gameTitle = parsedData.title || 'Untitled Game';
                    } catch (e) {
                        console.error('Error parsing game data:', e);
                    }
                }
                gameTitleDisplay.textContent = gameTitle;
                if (gameTitlePlaceholder) gameTitlePlaceholder.textContent = gameTitle;
                document.title = `Rogold - Jogando ${gameTitle}`;
            } else {
                gameTitleDisplay.textContent = 'Jogo Desconhecido';
                if (gameTitlePlaceholder) gameTitlePlaceholder.textContent = 'Desconhecido';
                document.title = 'Rogold - Jogo Desconhecido';
            }
        }
        
        // Set active nav link (always Home/Jogos when on a game page)
        const homeLink = document.getElementById('home-link');
        if (homeLink) homeLink.classList.remove('active');
        const gamesLink = document.getElementById('games-link');
        if (gamesLink) gamesLink.classList.add('active');

        startCoinRewardTimer(); // Start coin reward timer when on a non-index page
    }

    // NEW: Event delegation for Catalog category buttons
    document.getElementById('catalog-section')?.addEventListener('click', function(e) {
        if (e.target.classList.contains('category-button')) {
            const category = e.target.dataset.category;
            document.querySelectorAll('.catalog-categories .category-button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            renderCatalogItems(category);
        }
    });

    // NEW: Event delegation for Games category buttons
    document.getElementById('featured-games')?.addEventListener('click', function(e) {
        if (e.target.classList.contains('category-button')) {
            const category = e.target.dataset.category;
            document.querySelectorAll('.games-categories .category-button').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            loadPublishedGames(category);
        }
    });

    // NEW: Event delegation for Catalog item actions (Buy, Equip)
    document.getElementById('catalog-items-grid')?.addEventListener('click', async function(e) {
        // Only handle clicks on buttons, not on the card itself
        if (!e.target.classList.contains('buy-button') && !e.target.classList.contains('equip-button') && !e.target.classList.contains('equipped-button')) {
            return; // Let the card's onclick handler handle it
        }

        // Prevent the click from bubbling up to the card's onclick handler
        e.stopPropagation();

        const currentUser = userManager.getCurrentUser();

        const button = e.target;
        const itemId = button.dataset.itemId;
        const itemType = button.dataset.itemType;
        const item = catalogManager.getItemById(itemId);

        if (!item) {
            await alert(t['warning-item-not-found']);
            return;
        }

        if (button.classList.contains('buy-button')) {
            if (!currentUser) {
                await alert('Você precisa estar logado para interagir com o catálogo.');
                return;
            }

            const confirmBuy = await confirm(`Deseja comprar "${item.name}" por ${item.price} Coins?`);
            if (confirmBuy) {
                const subtractResult = profileManager.subtractCoins(currentUser, item.price);
                if (subtractResult.success) {
                    const addResult = profileManager.addItemToInventory(currentUser, item.id);
                    if (addResult.success) {
                        // Increment purchase count
                        catalogManager.incrementPurchaseCount(item.id);

                        // If it's a face item, also add to owned faces for game.js
                        if (item.type === 'face') {
                            let ownedFaces = JSON.parse(localStorage.getItem('rogold_owned_faces') || '["imgs/OriginalGlitchedFace.webp"]');
                            const faceMapping = {
                                'face_default': 'imgs/OriginalGlitchedFace.webp',
                                'face_epic': 'imgs/epicface.png'
                            };
                            const faceFile = faceMapping[item.id];
                            if (faceFile && !ownedFaces.includes(faceFile)) {
                                ownedFaces.push(faceFile);
                                localStorage.setItem('rogold_owned_faces', JSON.stringify(ownedFaces));
                            }
                        }
                        await alert(`Você comprou "${item.name}"!`);
                        updateUserCoinsDisplay();
                        renderCatalogItems(document.querySelector('.category-button.active').dataset.category);
                    } else {
                        // This case should ideally not happen if inventory check is correct
                        await alert(addResult.message);
                        // Refund coins if item could not be added to inventory
                        profileManager.addCoins(currentUser, item.price);
                        updateUserCoinsDisplay();
                    }
                } else {
                    await alert(subtractResult.message);
                }
            }
        } else if (button.classList.contains('equip-button')) {
            if (!currentUser) {
                await alert('Você precisa estar logado para interagir com o catálogo.');
                return;
            }
            const equipResult = profileManager.equipItem(currentUser, item.id, item.type);
            if (equipResult.success) {
                // If equipping a face, update the equipped face in localStorage for game.js
                if (item.type === 'face') {
                    const faceMapping = {
                        'face_default': 'imgs/OriginalGlitchedFace.webp',
                        'face_epic': 'imgs/epicface.png'
                    };
                    const faceFile = faceMapping[item.id];
                    if (faceFile) {
                        localStorage.setItem('rogold_face', faceFile);
                        // Dispatch event to notify game.js of face change
                        window.dispatchEvent(new Event('rogold_equipped_face_changed'));
                    }
                }
                await alert(`"${item.name}" equipado com sucesso!`);
                renderCatalogItems(document.querySelector('.category-button.active').dataset.category);
                // Simulate a socket event for equipping an item
                console.log(`[SOCKET_EVENT] User ${currentUser} equipped item: { id: "${item.id}", name: "${item.name}", type: "${item.type}" }`);
            } else {
                await alert(equipResult.message);
            }
        }
    });





    // --- Event Delegation for Play, Favorite, Like, and Dislike buttons ---
    document.body.addEventListener('click', async function(e) {
        // Handle Play Button clicks
        if (e.target.classList.contains('play-button')) {
            e.preventDefault();
            e.stopPropagation();
            const currentUser = userManager.getCurrentUser();
            if (!currentUser) {
                await alert(t['warning-login-play']);
                return;
            }

            const gameId = e.target.dataset.gameId;
            if (gameId) {
                window.location.href = `game.html?game=${encodeURIComponent(gameId)}`;
            } else {
                // Fallback for hardcoded games
                const gameTitle = e.target.closest('.game-card').dataset.gameTitle;
                if (gameTitle === 'Natural Disaster Survival') {
                    window.location.href = `game.html?game=natural_disaster_survival`;
                } else if (gameTitle === 'Work at a Pizza Place') {
                    window.location.href = `game.html?game=work_at_pizza_place`;
                } else {
                    await alert(t['warning-game-id-not-found']);
                }
            }
        }
        // Handle Favorite Toggle Button clicks
        else if (e.target.classList.contains('favorite-toggle-button')) {
            e.preventDefault();
            e.stopPropagation();
            const currentUser = userManager.getCurrentUser();
            if (!currentUser) {
                await alert(t['warning-login-favorite']);
                return;
            }

            // Get the game title from the button's dataset
            const gameTitle = e.target.dataset.gameTitle;

            // Ensure gameTitle is a string, default to empty string if not
            const safeGameTitle = typeof gameTitle === 'string' ? gameTitle.trim() : '';

            if (safeGameTitle === '') {
                await alert(t['warning-game-title-empty']);
                console.error("Game title is empty after parsing dataset and trimming.", e.target);
                return;
            }

            const profile = profileManager.getProfile(currentUser);
            let result;

            // Use safeGameTitle for favorite operations
            if (profile.favorites.includes(safeGameTitle)) {
                result = profileManager.removeFavorite(currentUser, safeGameTitle);
            } else {
                result = profileManager.addFavorite(currentUser, safeGameTitle);
            }
            await alert(result.message);
            if (result.success) {
                // Update favorite count on profile header if profile is visible
                const favoriteCountElement = document.getElementById('favorite-count');
                if (favoriteCountElement) {
                    favoriteCountElement.textContent = profileManager.getProfile(currentUser).favorites.length;
                }
                updateFeaturedGameCards();
                // If favorites tab is open, re-render it
                if (document.getElementById('favorites-tab').classList.contains('active')) {
                    await renderFavoriteGamesList();
                }
            }
        }
        // Handle Like Button clicks
        else if (e.target.classList.contains('like-button')) {
            // Skip if it's a game detail button (handled separately)
            if (e.target.id.startsWith('game-detail-')) return;
            e.preventDefault();
            const currentUser = userManager.getCurrentUser();
            if (!currentUser) {
                await alert(t['warning-login-rate']);
                return;
            }
            const gameId = e.target.dataset.gameId || currentGameDetailId;
            if (!gameId) return;

            const profile = profileManager.getProfile(currentUser);
            const currentRating = profile.ratings[gameId];

            let action, newRating;
            if (currentRating === 'like') {
                action = 'remove_like';
                newRating = undefined;
            } else if (currentRating === 'dislike') {
                action = 'change_to_like';
                newRating = 'like';
            } else {
                action = 'like';
                newRating = 'like';
            }

            try {
                const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/rate`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });
                if (response.ok) {
                    const data = await response.json();
                    // Update the counts in the DOM
                    const gameCard = e.target.closest('.game-card');
                    if (gameCard) {
                        updateGameCardCounts(gameCard, data.likes, data.dislikes);
                        // Update buttons
                        updateGameCardButtons(gameCard, newRating);
                    } else {
                        // Update game detail section
                        document.getElementById('game-detail-likes').textContent = data.likes;
                        document.getElementById('game-detail-dislikes').textContent = data.dislikes;
                        updateGameDetailRatingButtons();
                    }
                    // Update profile
                    if (newRating === undefined) {
                        delete profile.ratings[gameId];
                    } else {
                        profile.ratings[gameId] = newRating;
                    }
                    profileManager.updateProfile(currentUser, { ratings: profile.ratings });
                    // Update main games grid if visible
                    loadPublishedGames();
                } else {
                    console.error('Failed to rate game');
                }
            } catch (error) {
                console.error('Error rating game:', error);
            }
        }
        // Handle Dislike Button clicks
        else if (e.target.classList.contains('dislike-button')) {
            // Skip if it's a game detail button (handled separately)
            if (e.target.id.startsWith('game-detail-')) return;
            e.preventDefault();
            const currentUser = userManager.getCurrentUser();
            if (!currentUser) {
                await alert('Você precisa estar logado para avaliar jogos.');
                return;
            }
            const gameId = e.target.dataset.gameId || currentGameDetailId;
            if (!gameId) return;

            const profile = profileManager.getProfile(currentUser);
            const currentRating = profile.ratings[gameId];

            let action, newRating;
            if (currentRating === 'dislike') {
                action = 'remove_dislike';
                newRating = undefined;
            } else if (currentRating === 'like') {
                action = 'change_to_dislike';
                newRating = 'dislike';
            } else {
                action = 'dislike';
                newRating = 'dislike';
            }

            try {
                const response = await fetch(`/api/games/${encodeURIComponent(gameId)}/rate`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action })
                });
                if (response.ok) {
                    const data = await response.json();
                    // Update the counts in the DOM
                    const gameCard = e.target.closest('.game-card');
                    if (gameCard) {
                        updateGameCardCounts(gameCard, data.likes, data.dislikes);
                        // Update buttons
                        updateGameCardButtons(gameCard, newRating);
                    } else {
                        // Update game detail section
                        document.getElementById('game-detail-likes').textContent = data.likes;
                        document.getElementById('game-detail-dislikes').textContent = data.dislikes;
                        updateGameDetailRatingButtons();
                    }
                    // Update profile
                    if (newRating === undefined) {
                        delete profile.ratings[gameId];
                    } else {
                        profile.ratings[gameId] = newRating;
                    }
                    profileManager.updateProfile(currentUser, { ratings: profile.ratings });
                    // Update main games grid if visible
                    loadPublishedGames();
                } else {
                    console.error('Failed to rate game');
                }
            } catch (error) {
                console.error('Error rating game:', error);
            }
        }
    });
    // NEW: Event delegation for Item Detail actions
    document.getElementById('item-detail-actions')?.addEventListener('click', async function(e) {
        // Prevent event bubbling
        e.stopPropagation();

        const currentUser = userManager.getCurrentUser();

        const button = e.target;
        const itemId = button.dataset.itemId;
        const itemType = button.dataset.itemType;
        const item = catalogManager.getItemById(itemId);

        if (!item) {
            await alert('Erro: Item não encontrado.');
            return;
        }

        if (button.classList.contains('buy-button')) {
            if (!currentUser) {
                await alert('Você precisa estar logado para interagir com o catálogo.');
                return;
            }

            const confirmBuy = await confirm(`Deseja comprar "${item.name}" por ${item.price} Coins?`);
            if (confirmBuy) {
                const subtractResult = profileManager.subtractCoins(currentUser, item.price);
                if (subtractResult.success) {
                    const addResult = profileManager.addItemToInventory(currentUser, item.id);
                    if (addResult.success) {
                        // Increment purchase count
                        catalogManager.incrementPurchaseCount(item.id);

                        // If it's a face item, also add to owned faces for game.js
                        if (item.type === 'face') {
                            let ownedFaces = JSON.parse(localStorage.getItem('rogold_owned_faces') || '["OriginalGlitchedFace.webp"]');
                            const faceMapping = {
                                'face_default': 'OriginalGlitchedFace.webp',
                                'face_epic': 'epicface.png'
                            };
                            const faceFile = faceMapping[item.id];
                            if (faceFile && !ownedFaces.includes(faceFile)) {
                                ownedFaces.push(faceFile);
                                localStorage.setItem('rogold_owned_faces', JSON.stringify(ownedFaces));
                            }
                        }
                        await alert(`Você comprou "${item.name}"!`);
                        updateUserCoinsDisplay();
                        // Update the item detail view
                        showItemDetail(itemId);
                    } else {
                        // This case should ideally not happen if inventory check is correct
                        await alert(addResult.message);
                        // Refund coins if item could not be added to inventory
                        profileManager.addCoins(currentUser, item.price);
                        updateUserCoinsDisplay();
                    }
                } else {
                    await alert(subtractResult.message);
                }
            }
        } else if (button.classList.contains('equip-button')) {
            if (!currentUser) {
                await alert('Você precisa estar logado para interagir com o catálogo.');
                return;
            }
            const equipResult = profileManager.equipItem(currentUser, item.id, item.type);
            if (equipResult.success) {
                // If equipping a face, update the equipped face in localStorage for game.js
                if (item.type === 'face') {
                    const faceMapping = {
                        'face_default': 'OriginalGlitchedFace.webp',
                        'face_epic': 'epicface.png'
                    };
                    const faceFile = faceMapping[item.id];
                    if (faceFile) {
                        localStorage.setItem('rogold_face', faceFile);
                        // Dispatch event to notify game.js of face change
                        window.dispatchEvent(new Event('rogold_equipped_face_changed'));
                    }
                }
                await alert(`"${item.name}" equipado com sucesso!`);
                // Update the item detail view
                showItemDetail(itemId);
                // Simulate a socket event for equipping an item
                console.log(`[SOCKET_EVENT] User ${currentUser} equipped item: { id: "${item.id}", name: "${item.name}", type: "${item.type}" }`);
            } else {
                await alert(equipResult.message);
            }
        }
    });

    // --- Event Delegation for Game Detail Section ---
    document.getElementById('game-detail-like-btn')?.addEventListener('click', () => rateGameDetail('like'));
    document.getElementById('game-detail-dislike-btn')?.addEventListener('click', () => rateGameDetail('dislike'));
    document.getElementById('game-detail-play-btn')?.addEventListener('click', joinGameDetailServer);

    // --- END Event Delegation ---
});

// Comunidade - Blog creation
document.getElementById('blog-create-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const title = document.getElementById('blog-title').value;
    const message = document.getElementById('blog-message').value;
    const currentUser = userManager.getCurrentUser();
    
    if (!currentUser) {
        await alert(t['warning-login-create-topic']);
        return;
    }
    
    communityManager.createBlog(title, message, currentUser);
    document.getElementById('blog-title').value = ''; 
    document.getElementById('blog-message').value = ''; 
    hideCreateBlogForm(); 
});

// Comunidade - Message submission
document.getElementById('message-form')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!communityManager.currentBlog) return;
    
    const message = document.getElementById('reply-message').value;
    const currentUser = userManager.getCurrentUser();
    
    if (!currentUser) {
        await alert(t['warning-login-reply-topic']);
        return;
    }
    
    communityManager.addMessage(communityManager.currentBlog.id, message, currentUser);
    document.getElementById('reply-message').value = '';
    loadBlogMessages();
});

function loadBlogs() {
    const blogs = communityManager.getBlogs();
    const container = document.getElementById('blogs-container');
    
    if (!container) return;

    if (blogs.length === 0) {
        container.innerHTML = '<p class="empty-message">Nenhum tópico criado ainda. Seja o primeiro!</p>';
        return;
    }
    
    container.innerHTML = blogs.map(blog => `
        <div class="blog-card" onclick="openBlog(${blog.id})">
            <h4>${escapeHtml(blog.title)}</h4>
            <p class="blog-preview">${escapeHtml(blog.message.substring(0, 100))}${blog.message.length > 100 ? '...' : ''}</p>
            <div class="blog-info">
                <span>Por ${escapeHtml(blog.author)}</span>
                <span>${new Date(blog.createdAt).toLocaleDateString('pt-BR')}</span>
                <span>${blog.messages.length} resposta${blog.messages.length !== 1 ? 's' : ''}</span>
            </div>
        </div>
    `).join('');
}

function openBlog(blogId) {
    const blog = communityManager.getBlog(blogId);
    if (!blog) return;
    
    communityManager.currentBlog = blog;
    
    // Update detail view
    document.getElementById('blog-detail-title').textContent = blog.title;
    document.getElementById('blog-author').textContent = blog.author;
    document.getElementById('blog-date').textContent = new Date(blog.createdAt).toLocaleDateString('pt-BR');
    
    // Load messages
    loadBlogMessages();
    
    // Show detail view and hide blog list
    hideSection(document.getElementById('blog-list')); 
    showOnlyAuthSection('blog-detail'); 
    setActiveNavLink('community-link'); 
}

function hideBlogDetail() {
    showSection(document.getElementById('blog-list')); 
    showOnlyAuthSection(''); 
    communityManager.currentBlog = null;
    setActiveNavLink('community-link'); 
}

function loadBlogMessages() {
    if (!communityManager.currentBlog) return;
    
    const container = document.getElementById('blog-messages-container');
    if (!container) return;

    const messages = [communityManager.currentBlog, ...communityManager.currentBlog.messages];
    
    container.innerHTML = messages.map((item, index) => {
        // Ensure item properties are strings before escaping
        const safeAuthor = typeof item.author === 'string' ? item.author : 'Desconhecido';
        const safeMessage = typeof item.message === 'string' ? item.message : '';
        const timestamp = item.timestamp || item.createdAt;
        return `
            <div class="message-item ${index === 0 ? 'original-message' : ''}">
                <div class="message-header">
                    <strong>${escapeHtml(safeAuthor)}</strong>
                    <span>${new Date(timestamp).toLocaleString('pt-BR')}</span>
                </div>
                <div class="message-content">${escapeHtml(safeMessage)}</div>
            </div>
        `;
    }).join('');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    // Ensure text is treated as a string before setting textContent
    div.textContent = String(text); 
    return div.innerHTML;
}

function showCreateBlogForm() {
    const currentUser = userManager.getCurrentUser();
    if (!currentUser) {
        alert(t['warning-login-create-topic']);
        return;
    }
    hideSection(document.getElementById('blog-list')); 
    showOnlyAuthSection('create-blog-form'); 
    setActiveNavLink('community-link'); 
}

function hideCreateBlogForm() {
    showSection(document.getElementById('blog-list'));
    showOnlyAuthSection('');
    document.getElementById('blog-create-form')?.reset();
    setActiveNavLink('community-link');
}

// Creation Board Functions
function showCreationBoard() {
    const creationBoardSection = document.getElementById('creation-board-section');
    const currentUser = userManager.getCurrentUser();

    if (!currentUser) {
        alert(t['warning-login-create-studio']);
        openLoginModal();
        return;
    }

    // Hide other sections
    hideSection(document.getElementById('featured-games'));
    hideSection(document.querySelector('.banner'));
    hideSection(document.getElementById('profile-section'));
    hideSection(document.getElementById('community-section'));
    hideSection(document.getElementById('catalog-section'));
    hideSection(document.getElementById('item-detail-section'));
    hideSection(document.getElementById('game-detail-section'));
    hideSection(document.getElementById('blog-list'));
    showOnlyAuthSection('');

    showSection(creationBoardSection);
    loadUserCreationGames();
    setActiveNavLink('studio-link');
}

function hideCreationBoard() {
    const creationBoardSection = document.getElementById('creation-board-section');
    hideSection(creationBoardSection);

    setTimeout(() => {
        showMainContent();
        showOnlyAuthSection('');
    }, 300);
}

function showDocumentation() {
    const docSection = document.getElementById('documentation-section');
    const creationBoardSection = document.getElementById('creation-board-section');
    
    hideSection(creationBoardSection);
    
    setTimeout(() => {
        showSection(docSection);
    }, 300);
}

function hideDocumentation() {
    const docSection = document.getElementById('documentation-section');
    const creationBoardSection = document.getElementById('creation-board-section');
    
    hideSection(docSection);
    
    setTimeout(() => {
        showSection(creationBoardSection);
    }, 300);
}

// Make functions globally available
window.showDocumentation = showDocumentation;
window.hideDocumentation = hideDocumentation;

function loadUserCreationGames() {
    const currentUser = userManager.getCurrentUser();
    const gamesGrid = document.getElementById('creation-games-grid');

    // Get translations
    const t = (typeof translations !== 'undefined' && translations[localStorage.getItem('rogold_language') || 'pt']) || {
        'edit': 'Editar',
        'test': 'Testar',
        'delete': 'Excluir'
    };

    console.log('loadUserCreationGames called, currentUser:', currentUser);

    if (!currentUser) {
        gamesGrid.innerHTML = '<p class="empty-message">Faça login para ver seus jogos.</p>';
        return;
    }

    gamesGrid.innerHTML = '<p class="empty-message">Carregando jogos...</p>';

    // Fetch published games from server API for this user only
    console.log(`Fetching games from /api/user/${currentUser}/games...`);
    fetch(`/api/user/${encodeURIComponent(currentUser)}/games`)
        .then(response => {
            console.log('Response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Games data received:', data);
            const publishedGames = data.games || [];

            // Filter games by current user
            const userGames = publishedGames;

            if (userGames.length === 0) {
                gamesGrid.innerHTML = `<p class="empty-message">${t['no-games-yet'] || 'Nenhum jogo criado ainda. Clique em "Criar Novo Jogo" para começar!'}</p>`;
            } else {
                gamesGrid.innerHTML = userGames.map(game => {
                    const safeGameTitle = typeof game.title === 'string' ? game.title : 'Untitled Game';
                    const safeGameId = typeof game.id === 'string' ? game.id : '';

                    // Handle thumbnail
                    const thumbnailSrc = game.thumbnail && game.thumbnail.startsWith('/thumbnails/')
                        ? game.thumbnail
                        : 'imgs/thumbnail1.jpg';

                    return `
                        <div class="creation-game-card" data-game-id="${escapeHtml(safeGameId)}">
                            <div class="game-thumbnail">
                                <img src="${thumbnailSrc}" alt="${escapeHtml(safeGameTitle)} Thumbnail" onerror="this.src='imgs/thumbnail1.jpg'">
                            </div>
                            <h4>${escapeHtml(safeGameTitle)}</h4>
                            <div class="creation-game-actions">
                                <button class="primary-button" onclick="editGame('${escapeHtml(safeGameId)}')">${t['edit'] || 'Editar'}</button>
                                <button class="secondary-button" onclick="testGame('${escapeHtml(safeGameId)}')">${t['test'] || 'Testar'}</button>
                                <button class="danger-button" onclick="deleteGame('${escapeHtml(safeGameId)}')">${t['delete'] || 'Excluir'}</button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        })
        .catch(error => {
            console.error('Error loading user creation games:', error);
            gamesGrid.innerHTML = '<p class="empty-message">Erro ao carregar jogos. Tente novamente.</p>';
        });
}

function createNewGame() {
    window.location.href = 'studio.html';
}

function editGame(gameId) {
    window.location.href = `studio.html?game=${encodeURIComponent(gameId)}`;
}

function testGame(gameId) {
    window.location.href = `game.html?game=${encodeURIComponent(gameId)}`;
}

async function deleteGame(gameId) {
    const confirmDelete = await confirm(tGet('confirm-delete'));
    if (confirmDelete) {
        try {
            const response = await fetch(`/api/games/${encodeURIComponent(gameId)}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                const result = await response.json();
                await alert(t['warning-game-deleted']);
                // Reload the games list
                loadUserCreationGames();
            } else {
                const error = await response.json();
                await alert(t['warning-game-delete-error'].replace('${error}', error.error || 'Erro desconhecido'));
            }
        } catch (error) {
            console.error('Error deleting game:', error);
            await alert(t['warning-game-delete-error-generic']);
        }
    }
}

// Re-defining these for clarity in global scope if called from HTML inline
window.openLoginModal = openLoginModal;
window.openRegisterModal = openRegisterModal;
window.openSettingsModal = openSettingsModal;

// Re-defining these for clarity in global scope if called from HTML inline
window.hideProfile = hideProfile;
window.showCommunity = showCommunity;
window.hideCommunity = hideCommunity;
window.showCatalog = showCatalog;
window.hideCatalog = hideCatalog;
window.showCreateBlogForm = showCreateBlogForm;
window.hideCreateBlogForm = hideCreateBlogForm;
window.hideBlogDetail = hideBlogDetail;
window.editProfile = editProfile;
window.closeProfileEdit = closeProfileEdit;
window.openBlog = openBlog;

// Creation Board functions
window.showCreationBoard = showCreationBoard;
window.hideCreationBoard = hideCreationBoard;
window.loadUserCreationGames = loadUserCreationGames;
window.createNewGame = createNewGame;
window.editGame = editGame;
window.testGame = testGame;
window.deleteGame = deleteGame;

// Item Detail functions
window.showItemDetail = showItemDetail;
window.hideItemDetail = hideItemDetail;
window.handleCatalogAction = handleCatalogAction;

// Game Details functions
window.viewGameDetails = viewGameDetails;
window.hideGameDetail = hideGameDetail;

// Coin Reward Timer Logic
let coinRewardIntervalId = null;
const COIN_REWARD_AMOUNT = 500;
const COIN_REWARD_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

function startCoinRewardTimer() {
    // Clear any existing timer to prevent multiple timers running
    if (coinRewardIntervalId) {
        clearInterval(coinRewardIntervalId);
        coinRewardIntervalId = null;
    }

    const currentUser = userManager.getCurrentUser();
    if (!currentUser) {
        console.log('User not logged in, coin reward timer not started.');
        return;
    }

    // Timer only runs if not on the index page
    const isIndexPage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');
    if (isIndexPage) {
        console.log('On index page, coin reward timer not started.');
        return;
    }

    console.log(`Starting coin reward timer for ${currentUser}. Rewarding ${COIN_REWARD_AMOUNT} coins every ${COIN_REWARD_INTERVAL_MS / 60000} minutes.`);

    coinRewardIntervalId = setInterval(async () => {
        const userNow = userManager.getCurrentUser();
        if (userNow) {
            profileManager.addCoins(userNow, COIN_REWARD_AMOUNT);
            await alert(`Parabéns, ${userNow}! Você ganhou ${COIN_REWARD_AMOUNT} Goldbucks por passar tempo no Rogold!`);
            // Update UI if the user navigates back to a relevant page after the alert
            updateUserCoinsDisplay();
        } else {
            // User logged out while timer was active, stop the timer
            stopCoinRewardTimer();
        }
    }, COIN_REWARD_INTERVAL_MS);
}

function stopCoinRewardTimer() {
    if (coinRewardIntervalId) {
        console.log('Stopping coin reward timer.');
        clearInterval(coinRewardIntervalId);
        coinRewardIntervalId = null;
    }
}

// Socket.io integration (example)
// This is just a basic example, the actual implementation may vary based on the server setup and requirements
// const socket = io(); // Assuming io is available globally - commented out to avoid ReferenceError

// Initialize language handler
setupLanguageHandler();

// ============================================
// Custom Modal Dialog Functions (for translated buttons)
// ============================================

// Show a custom confirm dialog with translated buttons
function showConfirm(message, title = null) {
    return new Promise((resolve) => {
        const modal = document.getElementById('rogold-modal');
        const modalTitle = document.getElementById('rogold-modal-title');
        const modalBody = document.getElementById('rogold-modal-body');
        const modalFooter = document.getElementById('rogold-modal-footer');
        
        // Get translated buttons and title
        const yesText = tGet('yes', 'Sim');
        const noText = tGet('no', 'Não');
        const confirmTitle = title || tGet('confirm-title', 'Confirmação');
        
        modalTitle.textContent = confirmTitle;
        modalBody.textContent = message;
        modalFooter.innerHTML = `
            <button class="modal-button modal-button-yes" id="rogold-modal-yes">${yesText}</button>
            <button class="modal-button modal-button-no" id="rogold-modal-no">${noText}</button>
        `;
        
        modal.classList.remove('hidden');
        
        document.getElementById('rogold-modal-yes').onclick = () => {
            modal.classList.add('hidden');
            resolve(true);
        };
        
        document.getElementById('rogold-modal-no').onclick = () => {
            modal.classList.add('hidden');
            resolve(false);
        };
    });
}

// Show a custom alert dialog with translated OK button
function showAlert(message, title = null) {
    return new Promise((resolve) => {
        const modal = document.getElementById('rogold-modal');
        const modalTitle = document.getElementById('rogold-modal-title');
        const modalBody = document.getElementById('rogold-modal-body');
        const modalFooter = document.getElementById('rogold-modal-footer');
        
        // Get translated button and title
        const okText = tGet('ok', 'OK');
        const alertTitle = title || tGet('alert-title', 'Alerta');
        
        modalTitle.textContent = alertTitle;
        modalBody.textContent = message;
        modalFooter.innerHTML = `
            <button class="modal-button modal-button-ok" id="rogold-modal-ok">${okText}</button>
        `;
        
        modal.classList.remove('hidden');
        
        document.getElementById('rogold-modal-ok').onclick = () => {
            modal.classList.add('hidden');
            resolve();
        };
    });
}

// socket.on('connect', () => {
//     console.log('Connected to server via Socket.io');
//
//     const currentUser = userManager.getCurrentUser();
//     if (currentUser) {
//         // Emit register event with the current user's nickname
//         socket.emit('register', { nickname: currentUser });
//     }
// });

// Listen for account data from the server
// socket.on('accountData', (data) => {
//     const { nickname, equippedItems, coins } = data;
//
//     // Update local user manager and profile manager data
//     userManager.currentUser = nickname;
//     localStorage.setItem('rogold_currentUser', nickname);
//
//     profileManager.profiles[nickname] = profileManager.profiles[nickname] || {};
//     profileManager.profiles[nickname].equippedItems = equippedItems;
//     profileManager.profiles[nickname].coins = coins;
//
//     profileManager.saveProfiles();
//
//     console.log(`Account data received and applied for ${nickname}`);
// });