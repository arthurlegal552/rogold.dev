// Translations for Rogold
const translations = {
    pt: {
        // Navigation
        "home-link": "Home",
        "games-link": "Jogos",
        "rewards-link": "Recompensas",
        "catalog-link": "Catálogo",
        "studio-link": "Studio",
        "profile-link": "Perfil",
        "credits-link": "Créditos",

        // Banner
        "banner-title": "Bem-vindo ao Rogold - O mundo dos jogos!",
        "banner-description": "Junte-se a milhões de jogadores e explore jogos incríveis feitos pela comunidade.",
        "alpha-banner": "ALPHA RELEASE - Obrigado pelo apoio!",

        // Profile Section
        "back": "← Voltar",
        "profile-username": "Usuário",
        "status-offline": "Status: Offline",
        "member-since": "Membro desde:",
        "join-date": "--/--/----",
        "friends": "Amigos",
        "favorites": "Favoritos",
        "visits": "Visitas",
        "coins-label": "GoldBucks",
        "tab-about": "Sobre",
        "tab-my-games": "Meus Jogos",
        "tab-favorites": "Favoritos",
        "tab-messages": "Mensagens",
        "about-me": "Sobre Mim",
        "no-bio": "Este usuário ainda não escreveu uma descrição.",
        "edit-profile": "Editar Perfil",
        "no-games-created": "Nenhum jogo criado ainda.",
        "no-favorites-yet": "Nenhum jogo favorito ainda.",
        "no-messages": "Nenhuma mensagem nova.",
        "login-to-view-favorites": "Faça login para ver seus jogos favoritos.",

        // Community Section
        "create-topic": "Criar Novo Tópico",
        "topic-title": "Título do Tópico:",
        "initial-message": "Mensagem Inicial:",
        "create-button": "Criar Tópico",
        "cancel-button": "Cancelar",
        "all-topics": "Todos os Tópicos da Comunidade",
        "no-topics-yet": "Nenhum tópico criado ainda. Seja o primeiro!",
        "back-to-topics": "← Voltar aos Tópicos",
        "created-by": "Criado por",
        "in": "em",
        "add-reply": "Adicionar Resposta",
        "type-message": "Digite sua mensagem...",
        "send": "Enviar",

        // Catalog Section
        "catalog-back": "← Voltar",
        "catalog-title": "Catálogo Rogold",
        "all-items": "Todos",
        "hats": "Chapéus",
        "faces": "Rostos",
        "gears": "Ferramentas",
        "purchases": "Compras",
        "buy": "Comprar",
        "equip": "Equipar",
        "equipped": "Equipado",
        "price": "GoldBucks",
        "no-items-category": "Nenhum item disponível nesta categoria.",

        // Featured Games
        "featured-games": "Jogos em Destaque",
        "all": "Todos",
        "most-liked": "Mais Curtidos",
        "published-games": "Published games will be added here dynamically",
        "game-back": "← Voltar aos Jogos",
        "game-details": "Detalhes do Jogo",
        "no-description": "No description available.",
        "created-by-label": "Criado por:",
        "creator-unknown": "Unknown",
        "created-date-label": "Criado em:",
        "date-unknown": "Unknown",
        "tools-allowed": "Ferramentas permitidas:",
        "tools-yes": "Sim",
        "tools-no": "Não",
        "like": "Like",
        "dislike": "Dislike",
        "play-now": "Jogar Agora",
        "favoritar": "Favoritar",
        "remover-favorito": "Remover Favorito",
        "likes": "Curtidas",
        "dislikes": "Não Curtidas",
        "playing": "Jogando",
        "edit": "Editar",
        "test": "Testar",
        "delete": "Excluir",

        // Rewards Section
        "rewards-title": "Recompensas",
        "rewards-description": "Ganhe Goldbucks curtindo jogos e criando seus próprios jogos!",
        "reward-like-title": "Curtir Jogos",
        "reward-like-desc": "Ganhe 50 Goldbucks por cada jogo que você curtir pela primeira vez!",
        "reward-create-title": "Criar Jogos",
        "reward-create-desc": "Ganhe 200 Goldbucks por cada jogo que você criar!",
        "rewards-earned-text": "ganhos",
        "games-created-text": "jogos criados",
        "reward-title": "🏆 Recompensa!",
        "reward-like-thanks": "Obrigado por curtir!",
        "reward-create-visits": "Seu jogo atingiu ${visits} visitas!",

        // Creation Board
        "creation-back": "← Voltar",
        "my-creation-studio": "Meu Estúdio de Criação",
        "create-new-game": "Criar Novo Jogo",
        "no-games-yet": "Nenhum jogo criado ainda. Clique em \"Criar Novo Jogo\" para começar!",

        // Warnings and Alerts
        "warning-login-catalog": "Você precisa estar logado para acessar o catálogo.",
        "warning-login-play": "Espere um pouco aí! Primeiro logue para conseguir jogar.",
        "warning-login-favorite": "Você precisa estar logado para favoritar jogos.",
        "warning-login-rate": "Você precisa estar logado para avaliar jogos.",
        "warning-login-create-topic": "Você precisa estar logado para criar um tópico.",
        "warning-login-reply-topic": "Você precisa estar logado para responder.",
        "warning-login-settings": "Você precisa estar logado para acessar as configurações.",
        "warning-login-create-studio": "Você precisa estar logado para acessar o estúdio de criação.",
        "warning-item-not-found": "Erro: Item não encontrado no catálogo.",
        "warning-item-not-found-generic": "Erro: Item não encontrado.",
        "warning-cannot-equip-gear": "Ferramentas são equipadas no jogo.",
        "warning-login-catalog-interact": "Você precisa estar logado para interagir com o catálogo.",
        "warning-purchased": "Você comprou \"${itemName}\"!",
        "warning-equipped": "\"${itemName}\" equipado com sucesso!",
        "warning-game-not-found-id": "Não foi possível iniciar o jogo: ID do jogo não encontrado.",
        "warning-game-title-empty": "Não foi possível identificar o jogo. O título está vazio.",
        "warning-game-deleted": "Jogo excluído com sucesso!",
        "warning-game-delete-error": "Erro ao excluir jogo: ${error}",
        "warning-game-delete-error-generic": "Erro ao carregar jogos. Tente novamente.",
        "warning-favorite-error": "Erro ao carregar jogos favoritos. Tente novamente.",
        "warning-passwords-mismatch": "As senhas não coincidem!",
        "warning-passwords-new-mismatch": "As novas senhas não coincidem!",
        "warning-login-success": "Bem-vindo de volta, ${username}!",
        "warning-registered-success": "Conta criada com sucesso! Faça login.",
        "warning-updated-success": "Conta atualizada com sucesso!",
        "warning-logged-out": "Você saiu da sua conta.",
        "warning-profile-removed": "Foto de perfil removida.",
        "warning-coins-reward": "Parabéns, ${username}! Você ganhou ${coins} Goldbucks por passar tempo no Rogold!",
        "warning-game-id-not-found": "Não foi possível iniciar o jogo: ID do jogo não encontrado.",
        "confirm-logout": "Tem certeza que deseja sair da sua conta?",
        "confirm-buy": "Deseja comprar \"${itemName}\" por ${itemPrice} Coins?",
        "confirm-delete": "Tem certeza que deseja excluir este jogo? Esta ação não pode ser desfeita.",
        "yes": "Sim",
        "no": "Não",
        "ok": "OK",
        "cancel": "Cancelar",
        "confirm-title": "Confirmação",
        "alert-title": "Alerta",

        // Login Section
        "login-title": "Entre na sua conta Rogold",
        "username-label": "Usuário:",
        "password-label": "Senha:",
        "login-button": "Entrar",
        "create-account": "Criar Conta",

        // Register Section
        "register-title": "Criar conta Rogold",
        "confirm-password": "Confirmar Senha:",
        "already-have-account": "Já tenho conta",

        // Settings Section
        "settings-title": "Configurações da Conta",
        "current-username": "Usuário Atual:",
        "new-username": "Novo Usuário:",
        "current-password": "Senha Atual:",
        "new-password": "Nova Senha:",
        "confirm-new-password": "Confirmar Nova Senha:",
        "leave-blank-keep": "Deixe vazio para manter atual",
        "save-changes": "Salvar Alterações",
        "cancel": "Cancelar",

        // Profile Edit Section
        "edit-profile-title": "Editar Perfil",
        "bio-label": "Biografia:",
        "bio-placeholder": "Fale sobre você...",
        "status-label": "Status:",
        "status-online": "Online",
        "status-offline": "Offline",
        "status-busy": "Ocupado",
        "profile-picture": "Foto de Perfil:",
        "remove-picture": "Remover Foto",
        "save": "Salvar",
        "logout": "Sair da Conta",

        // Credits Section
        "credits-title": "Créditos",

        // Footer
        "help": "Ajuda",
        "terms": "Termos de Uso",
        "contact": "Contato",
        "copyright": "© 2006 Rogold. Todos os direitos reservados.",

        // Alerts
        "default-face-equipped": "Default Face equipped!",
        "epic-face-bought": "Epic Face bought and equipped!",
        "not-enough-coins": "Not enough coins! You have",

        // Documentation
        "documentation": "Documentação",
        "documentation-title": "Documentação do RoGold Studio",
        "doc-studio-tools-title": "Ferramentas do Studio",
        "doc-toolbox-title": "Toolbox",
        "doc-select-desc": "Selecione objetos no viewport",
        "doc-move-desc": "Mova objetos usando as setas coloridas (Vermelho=X, Verde=Y, Azul=Z)",
        "doc-rotate-desc": "Gire objetos usando os anéis coloridos",
        "doc-scale-desc": "Dimensione objetos usando os círculos coloridos",
        "doc-part-desc": "Crie novas peças no workspace",
        "doc-sound-desc": "Adicione sons ao seu jogo",
        "doc-light-desc": "Adicione fontes de luz (Point, Spot, Directional)",
        "doc-model-desc": "Crie modelos para organizar objetos",
        "doc-script-desc": "Adicione scripts Lua para dar vida ao seu jogo",
        "doc-folder-desc": "Pastas para organizar o Explorer",
        "doc-properties-title": "Propriedades dos Objetos",
        "doc-basic-props-title": "Propriedades Básicas",
        "doc-name-desc": "Nome do objeto (usado em scripts)",
        "doc-position-desc": "Posição X, Y, Z do objeto no mundo",
        "doc-size-desc": "Tamanho do objeto (X, Y, Z)",
        "doc-color-desc": "Cor do objeto (RGB)",
        "doc-transparency-desc": "Transparência (0-1)",
        "doc-physics-props-title": "Propriedades de Física",
        "doc-anchored-desc": "Quando ativado, o objeto não se move com física",
        "doc-cancollide-desc": "Quando ativado, o objeto causa colisões",
        "doc-bodytype-desc": "Dynamic (queda), Kinematic (movido por scripts), Static (fixo)",
        "doc-mass-desc": "Massa do objeto (afeta física)",
        "doc-friction-desc": "Atrito (0-1)",
        "doc-restitution-desc": "Restituição/Quique (0-1)",
        "doc-lua-api-title": "API Lua (O que funciona no jogo)",
        "doc-basic-lua-title": "Comandos Básicos",
        "doc-spin-title": "Spin (Girar Parts)",
        "doc-print-title": "Print/Debug",
        "doc-events-title": "Eventos (Touched)",
        "doc-math-title": "Math e Vector3",
        "doc-loops-title": "Loops",
        "doc-gui-title": "GUI (Interfaces)",
        "doc-gui-desc": "Crie interfaces usando ScreenGui, Frame, TextLabel e TextButton",
        "doc-health-title": "Sistema de Vida do Jogador",
        "doc-health-desc": "Use TakeDamage, Heal, SetHealth e GetHealth para gerenciar vida",
        "doc-gameplay-title": "Gameplay no Jogo",
        "doc-player-title": "Controles do Jogador",
        "doc-walk-desc": "Mover personagem",
        "doc-jump-desc": "Pular",
        "doc-look-desc": "Olhar ao redor",
        "doc-click-desc": "Interagir com partes (clique esquerdo)",
        "doc-fly-desc": "Descer/Subir (modo fly)",
        "doc-physics-game-title": "Física no Jogo",
        "doc-gravity-desc": "Gravidade: -196.2 studs/s²",
        "doc-respawn-desc": "Respawn automático se cair do mapa",
        "doc-fall-desc": "Partes não anchored caem e colidem",
        "doc-limitations-title": "O que NÃO funciona",
        "doc-limit-1": "Scripts só executam quando o jogo é iniciado (Test ou Publish)",
        "doc-limit-2": "Não use loops infinitos sem wait() - o jogo vai travar",
        "doc-limit-3": "TweenService, Humanoid, CFrame completo não funcionam",
        "doc-limit-4": "Sounds precisam de URL válida (MP3/WAV)",
        "doc-limit-5": "GLTF models precisam ser .glb ou .gltf com URL pública"
    },
    en: {
        // Navigation
        "home-link": "Home",
        "games-link": "Games",
        "rewards-link": "Rewards",
        "catalog-link": "Catalog",
        "studio-link": "Studio",
        "profile-link": "Profile",
        "credits-link": "Credits",

        // Banner
        "banner-title": "Welcome to Rogold - The world of games!",
        "banner-description": "Join millions of players and explore amazing games made by the community.",
        "alpha-banner": "ALPHA RELEASE - Thank you for your support!",

        // Profile Section
        "back": "← Back",
        "profile-username": "User",
        "status-offline": "Status: Offline",
        "member-since": "Member since:",
        "join-date": "--/--/----",
        "friends": "Friends",
        "favorites": "Favorites",
        "visits": "Visits",
        "coins-label": "GoldBucks",
        "tab-about": "About",
        "tab-my-games": "My Games",
        "tab-favorites": "Favorites",
        "tab-messages": "Messages",
        "about-me": "About Me",
        "no-bio": "This user hasn't written a description yet.",
        "edit-profile": "Edit Profile",
        "no-games-created": "No games created yet.",
        "no-favorites-yet": "No favorite games yet.",
        "no-messages": "No new messages.",
        "login-to-view-favorites": "Sign in to view your favorite games.",

        // Community Section
        "create-topic": "Create New Topic",
        "topic-title": "Topic Title:",
        "initial-message": "Initial Message:",
        "create-button": "Create Topic",
        "cancel-button": "Cancel",
        "all-topics": "All Community Topics",
        "no-topics-yet": "No topics created yet. Be the first!",
        "back-to-topics": "← Back to Topics",
        "created-by": "Created by",
        "in": "on",
        "add-reply": "Add Reply",
        "type-message": "Type your message...",
        "send": "Send",

        // Catalog Section
        "catalog-back": "← Back",
        "catalog-title": "Rogold Catalog",
        "all-items": "All",
        "hats": "Hats",
        "faces": "Faces",
        "gears": "Gears",
        "purchases": "Purchases",
        "buy": "Buy",
        "equip": "Equip",
        "equipped": "Equipped",
        "price": "GoldBucks",
        "no-items-category": "No items available in this category.",

        // Featured Games
        "featured-games": "Featured Games",
        "all": "All",
        "most-liked": "Most Liked",
        "published-games": "Published games will be added here dynamically",
        "game-back": "← Back to Games",
        "game-details": "Game Details",
        "no-description": "No description available.",
        "created-by-label": "Created by:",
        "creator-unknown": "Unknown",
        "created-date-label": "Created on:",
        "date-unknown": "Unknown",
        "tools-allowed": "Tools allowed:",
        "tools-yes": "Yes",
        "tools-no": "No",
        "like": "Like",
        "dislike": "Dislike",
        "play-now": "Play Now",
        "favoritar": "Favorite",
        "remover-favorite": "Remove Favorite",
        "likes": "Likes",
        "dislikes": "Dislikes",
        "playing": "Playing",
        "edit": "Edit",
        "test": "Test",
        "delete": "Delete",

        // Rewards Section
        "rewards-title": "Rewards",
        "rewards-description": "Earn Goldbucks by liking games and creating your own games!",
        "reward-like-title": "Like Games",
        "reward-like-desc": "Earn 50 Goldbucks for each game you like for the first time!",
        "reward-create-title": "Create Games",
        "reward-create-desc": "Earn 200 Goldbucks for each game you create!",
        "rewards-earned-text": "earned",
        "games-created-text": "games created",
        "reward-title": "🏆 Reward!",
        "reward-like-thanks": "Thanks for liking!",
        "reward-create-visits": "Your game reached ${visits} visits!",

        // Creation Board
        "creation-back": "← Back",
        "my-creation-studio": "My Creation Studio",
        "create-new-game": "Create New Game",
        "no-games-yet": "No games created yet. Click \"Create New Game\" to start!",

        // Warnings and Alerts
        "warning-login-catalog": "You need to be logged in to access the catalog.",
        "warning-login-play": "Wait a minute! Log in first to be able to play.",
        "warning-login-favorite": "You need to be logged in to favorite games.",
        "warning-login-rate": "You need to be logged in to rate games.",
        "warning-login-create-topic": "You need to be logged in to create a topic.",
        "warning-login-reply-topic": "You need to be logged in to reply.",
        "warning-login-settings": "You need to be logged in to access settings.",
        "warning-login-create-studio": "You need to be logged in to access the creation studio.",
        "warning-item-not-found": "Error: Item not found in catalog.",
        "warning-item-not-found-generic": "Error: Item not found.",
        "warning-cannot-equip-gear": "Tools are equipped in the game.",
        "warning-login-catalog-interact": "You need to be logged in to interact with the catalog.",
        "warning-purchased": "You bought \"${itemName}\"!",
        "warning-equipped": "\"${itemName}\" equipped successfully!",
        "warning-game-not-found-id": "Could not start game: Game ID not found.",
        "warning-game-title-empty": "Could not identify the game. The title is empty.",
        "warning-game-deleted": "Game deleted successfully!",
        "warning-game-delete-error": "Error deleting game: ${error}",
        "warning-game-delete-error-generic": "Error loading games. Try again.",
        "warning-favorite-error": "Error loading favorite games. Try again.",
        "warning-passwords-mismatch": "Passwords do not match!",
        "warning-passwords-new-mismatch": "New passwords do not match!",
        "warning-login-success": "Welcome back, ${username}!",
        "warning-registered-success": "Account created successfully! Please login.",
        "warning-updated-success": "Account updated successfully!",
        "warning-logged-out": "You have logged out.",
        "warning-profile-removed": "Profile picture removed.",
        "warning-coins-reward": "Congratulations, ${username}! You earned ${coins} Goldbucks for spending time on Rogold!",
        "warning-game-id-not-found": "Could not start the game: Game ID not found.",
        "confirm-logout": "Are you sure you want to log out?",
        "confirm-buy": "Do you want to buy \"${itemName}\" for ${itemPrice} Coins?",
        "confirm-delete": "Are you sure you want to delete this game? This action cannot be undone.",
        "yes": "Yes",
        "no": "No",
        "ok": "OK",
        "cancel": "Cancel",
        "confirm-title": "Confirmation",
        "alert-title": "Alert",

        // Catalog Items
        // Hat items
        "hat_red": "Red Baseball Cap R",
        "hat_doge": "Doge Hat",
        "hat_fedora_black": "Black Fedora",
        "hat_red_desc": "A classic red Roblox R6 style baseball cap. Perfect for players who want a sporty and casual look.",
        "hat_doge_desc": "The iconic Doge hat inspired by the viral meme. Show your love for dogs and memes with this unique accessory.",
        "hat_fedora_black_desc": "An elegant and sophisticated black fedora. Ideal for players who want a mysterious and stylish look.",
        // Face items
        "face_default": "Default Face",
        "face_epic": "Epic Face",
        "face_default_desc": "The classic default Roblox face. Simple, reliable, and always recognizable.",
        "face_epic_desc": "An epic face with dynamic expressions. Show your unique personality in the world of games!",
        // Gear items
        "gear_rocket_launcher": "Rocket Launcher",
        "gear_rocket_launcher_desc": "A classic Roblox rocket launcher. Allows you to fire explosive rockets in all games!",

        // Login Section
        "login-title": "Sign in to your Rogold account",
        "username-label": "Username:",
        "password-label": "Password:",
        "login-button": "Sign In",
        "create-account": "Create Account",

        // Register Section
        "register-title": "Create Rogold account",
        "confirm-password": "Confirm Password:",
        "already-have-account": "I already have an account",

        // Settings Section
        "settings-title": "Account Settings",
        "current-username": "Current Username:",
        "new-username": "New Username:",
        "current-password": "Current Password:",
        "new-password": "New Password:",
        "confirm-new-password": "Confirm New Password:",
        "leave-blank-keep": "Leave blank to keep current",
        "save-changes": "Save Changes",
        "cancel": "Cancel",

        // Profile Edit Section
        "edit-profile-title": "Edit Profile",
        "bio-label": "Bio:",
        "bio-placeholder": "Tell us about yourself...",
        "status-label": "Status:",
        "status-online": "Online",
        "status-offline": "Offline",
        "status-busy": "Busy",
        "profile-picture": "Profile Picture:",
        "remove-picture": "Remove Picture",
        "save": "Save",
        "logout": "Sign Out",

        // Credits Section
        "credits-title": "Credits",

        // Footer
        "help": "Help",
        "terms": "Terms of Use",
        "contact": "Contact",
        "copyright": "© 2006 Rogold. All rights reserved.",

        // Alerts
        "default-face-equipped": "Default Face equipped!",
        "epic-face-bought": "Epic Face bought and equipped!",
        "not-enough-coins": "Not enough coins! You have",

        // Documentation
        "documentation": "Documentation",
        "documentation-title": "RoGold Studio Documentation",
        "doc-studio-tools-title": "Studio Tools",
        "doc-toolbox-title": "Toolbox",
        "doc-select-desc": "Select objects in the viewport",
        "doc-move-desc": "Move objects using colored arrows (Red=X, Green=Y, Blue=Z)",
        "doc-rotate-desc": "Rotate objects using colored rings",
        "doc-scale-desc": "Scale objects using colored circles",
        "doc-part-desc": "Create new parts in the workspace",
        "doc-sound-desc": "Add sounds to your game",
        "doc-light-desc": "Add light sources (Point, Spot, Directional)",
        "doc-model-desc": "Create models to organize objects",
        "doc-script-desc": "Add Lua scripts to bring your game to life",
        "doc-folder-desc": "Folders to organize the Explorer",
        "doc-properties-title": "Object Properties",
        "doc-basic-props-title": "Basic Properties",
        "doc-name-desc": "Object name (used in scripts)",
        "doc-position-desc": "X, Y, Z position in the world",
        "doc-size-desc": "Object size (X, Y, Z)",
        "doc-color-desc": "Object color (RGB)",
        "doc-transparency-desc": "Transparency (0-1)",
        "doc-physics-props-title": "Physics Properties",
        "doc-anchored-desc": "When enabled, object doesn't move with physics",
        "doc-cancollide-desc": "When enabled, object causes collisions",
        "doc-bodytype-desc": "Dynamic (falls), Kinematic (moved by scripts), Static (fixed)",
        "doc-mass-desc": "Object mass (affects physics)",
        "doc-friction-desc": "Friction (0-1)",
        "doc-restitution-desc": "Bounciness (0-1)",
        "doc-lua-api-title": "Lua API (What works in game)",
        "doc-basic-lua-title": "Basic Commands",
        "doc-spin-title": "Spin (Rotate Parts)",
        "doc-print-title": "Print/Debug",
        "doc-events-title": "Events (Touched)",
        "doc-math-title": "Math and Vector3",
        "doc-loops-title": "Loops",
        "doc-gui-title": "GUI (Interfaces)",
        "doc-gui-desc": "Create interfaces using ScreenGui, Frame, TextLabel and TextButton",
        "doc-health-title": "Player Health System",
        "doc-health-desc": "Use TakeDamage, Heal, SetHealth and GetHealth to manage health",
        "doc-gameplay-title": "Gameplay in Game",
        "doc-player-title": "Player Controls",
        "doc-walk-desc": "Move character",
        "doc-jump-desc": "Jump",
        "doc-look-desc": "Look around",
        "doc-click-desc": "Interact with parts (left click)",
        "doc-fly-desc": "Go down/up (fly mode)",
        "doc-physics-game-title": "Physics in Game",
        "doc-gravity-desc": "Gravity: -196.2 studs/s²",
        "doc-respawn-desc": "Auto respawn if falling off map",
        "doc-fall-desc": "Non-anchored parts fall and collide",
        "doc-limitations-title": "What does NOT work",
        "doc-limit-1": "Scripts only run when the game is started (Test or Publish)",
        "doc-limit-2": "Don't use infinite loops without wait() - game will freeze",
        "doc-limit-3": "TweenService, Humanoid, full CFrame don't work",
        "doc-limit-4": "Sounds need valid URL (MP3/WAV)",
        "doc-limit-5": "GLTF models need to be .glb or .gltf with public URL"
    },
    es: {
        // Navigation
        "home-link": "Inicio",
        "games-link": "Juegos",
        "rewards-link": "Recompensas",
        "catalog-link": "Catálogo",
        "studio-link": "Estudio",
        "profile-link": "Perfil",
        "credits-link": "Créditos",

        // Banner
        "banner-title": "¡Bienvenido a Rogold - El mundo de los juegos!",
        "banner-description": "Únete a millones de jugadores y explora increíbles juegos hechos por la comunidad.",
        "alpha-banner": "LANZAMIENTO ALPHA - ¡Gracias por tu apoyo!",

        // Profile Section
        "back": "← Volver",
        "profile-username": "Usuario",
        "status-offline": "Estado: Desconectado",
        "member-since": "Miembro desde:",
        "join-date": "--/--/----",
        "friends": "Amigos",
        "favorites": "Favoritos",
        "visits": "Visitas",
        "coins-label": "GoldBucks",
        "tab-about": "Acerca de",
        "tab-my-games": "Mis Juegos",
        "tab-favorites": "Favoritos",
        "tab-messages": "Mensajes",
        "about-me": "Sobre Mí",
        "no-bio": "Este usuario aún no ha escrito una descripción.",
        "edit-profile": "Editar Perfil",
        "no-games-created": "Ningún juego creado aún.",
        "no-favorites-yet": "Ningún juego favorito aún.",
        "no-messages": "Sin mensajes nuevos.",
        "login-to-view-favorites": "Inicia sesión para ver tus juegos favoritos.",

        // Community Section
        "create-topic": "Crear Nuevo Tema",
        "topic-title": "Título del Tema:",
        "initial-message": "Mensaje Inicial:",
        "create-button": "Crear Tema",
        "cancel-button": "Cancelar",
        "all-topics": "Todos los Temas de la Comunidad",
        "no-topics-yet": "Ningún tema creado aún. ¡Sé el primero!",
        "back-to-topics": "← Volver a los Temas",
        "created-by": "Creado por",
        "in": "el",
        "add-reply": "Agregar Respuesta",
        "type-message": "Escribe tu mensaje...",
        "send": "Enviar",

        // Catalog Section
        "catalog-back": "← Volver",
        "catalog-title": "Catálogo Rogold",
        "all-items": "Todos",
        "hats": "Sombreros",
        "faces": "Caras",
        "gears": "Herramientas",
        "purchases": "Compras",
        "buy": "Comprar",
        "equip": "Equipar",
        "equipped": "Equipado",
        "price": "GoldBucks",
        "no-items-category": "Ningún artículo disponible en esta categoría.",

        // Featured Games
        "featured-games": "Juegos Destacados",
        "all": "Todos",
        "most-liked": "Más Gustados",
        "published-games": "Los juegos publicados se agregarán aquí dinámicamente",
        "game-back": "← Volver a los Juegos",
        "game-details": "Detalles del Juego",
        "no-description": "Sin descripción disponible.",
        "created-by-label": "Creado por:",
        "creator-unknown": "Desconocido",
        "created-date-label": "Creado el:",
        "date-unknown": "Desconocido",
        "tools-allowed": "Herramientas permitidas:",
        "tools-yes": "Sí",
        "tools-no": "No",
        "like": "Me gusta",
        "dislike": "No me gusta",
        "play-now": "Jugar Ahora",
        "favoritar": "Favorito",
        "remover-favorite": "Quitar Favorito",
        "likes": "Me gusta",
        "dislikes": "No me gusta",
        "playing": "Jugando",
        "edit": "Editar",
        "test": "Probar",
        "delete": "Eliminar",

        // Rewards Section
        "rewards-title": "Recompensas",
        "rewards-description": "¡Gana Goldbucks gustando de juegos y creando tus propios juegos!",
        "reward-like-title": "Gustar de Juegos",
        "reward-like-desc": "¡Gana 50 Goldbucks por cada juego que te guste por primera vez!",
        "reward-create-title": "Crear Juegos",
        "reward-create-desc": "¡Gana 200 Goldbucks por cada juego que crees!",
        "rewards-earned-text": "ganados",
        "games-created-text": "juegos creados",
        "reward-title": "🏆 ¡Recompensa!",
        "reward-like-thanks": "¡Gracias por gustar!",
        "reward-create-visits": "¡Tu juego alcanzó ${visits} visitas!",

        // Creation Board
        "creation-back": "← Volver",
        "my-creation-studio": "Mi Estudio de Creación",
        "create-new-game": "Crear Nuevo Juego",
        "no-games-yet": "Ningún juego creado aún. ¡Haz clic en \"Crear Nuevo Juego\" para comenzar!",

        // Warnings and Alerts
        "warning-login-catalog": "Necesitas iniciar sesión para acceder al catálogo.",
        "warning-login-play": "¡Espera un poco! Primero inicia sesión para poder jugar.",
        "warning-login-favorite": "Necesitas iniciar sesión para agregar juegos a favoritos.",
        "warning-login-rate": "Necesitas iniciar sesión para calificar juegos.",
        "warning-login-create-topic": "Necesitas iniciar sesión para crear un tema.",
        "warning-login-reply-topic": "Necesitas iniciar sesión para responder.",
        "warning-login-settings": "Necesitas iniciar sesión para acceder a la configuración.",
        "warning-login-create-studio": "Necesitas iniciar sesión para acceder al estudio de creación.",
        "warning-item-not-found": "Error: Artículo no encontrado en el catálogo.",
        "warning-item-not-found-generic": "Error: Artículo no encontrado.",
        "warning-cannot-equip-gear": "Las herramientas se equipan en el juego.",
        "warning-login-catalog-interact": "Necesitas iniciar sesión para interactuar con el catálogo.",
        "warning-purchased": "¡Compraste \"${itemName}\"!",
        "warning-equipped": "\"${itemName}\" equipado exitosamente!",
        "warning-game-not-found-id": "No se pudo iniciar el juego: ID del juego no encontrado.",
        "warning-game-title-empty": "No se pudo identificar el juego. El título está vacío.",
        "warning-game-deleted": "¡Juego eliminado exitosamente!",
        "warning-game-delete-error": "Error al eliminar el juego: ${error}",
        "warning-game-delete-error-generic": "Error al cargar juegos. Intenta de nuevo.",
        "warning-favorite-error": "Error al cargar juegos favoritos. Intenta de nuevo.",
        "warning-passwords-mismatch": "¡Las contraseñas no coinciden!",
        "warning-passwords-new-mismatch": "¡Las nuevas contraseñas no coinciden!",
        "warning-login-success": "¡Bienvenido de nuevo, ${username}!",
        "warning-registered-success": "¡Cuenta creada exitosamente! Por favor inicia sesión.",
        "warning-updated-success": "¡Cuenta actualizada exitosamente!",
        "warning-logged-out": "Has cerrado sesión.",
        "warning-profile-removed": "Foto de perfil eliminada.",
        "warning-coins-reward": "¡Felicidades, ${username}! Ganaste ${coins} Goldbucks por pasar tiempo en Rogold!",
        "warning-game-id-not-found": "No se pudo iniciar el juego: ID del juego no encontrado.",
        "confirm-logout": "¿Estás seguro de que deseas cerrar sesión?",
        "confirm-buy": "¿Deseas comprar \"${itemName}\" por ${itemPrice} Coins?",
        "confirm-delete": "¿Estás seguro de que deseas eliminar este juego? Esta acción no se puede deshacer.",
        "yes": "Sí",
        "no": "No",
        "ok": "Aceptar",
        "cancel": "Cancelar",
        "confirm-title": "Confirmación",
        "alert-title": "Alerta",

        // Catalog Items
        // Hat items
        "hat_red": "Gorra Roja R",
        "hat_doge": "Sombrero Doge",
        "hat_fedora_black": "Fedora Negro",
        "hat_red_desc": "Una clásica gorra roja estilo Roblox R6. Perfecta para jugadores que quieren un look deportivo y casual.",
        "hat_doge_desc": "El icónico sombrero Doge inspirado en el meme viral. ¡Muestra tu amor por los perros y los memes con este accesorio único!",
        "hat_fedora_black_desc": "Un fedora negro elegante y sofisticado. Ideal para jugadores que quieren un estilo misterioso y elegante.",
        // Face items
        "face_default": "Cara por Defecto",
        "face_epic": "Cara Épica",
        "face_default_desc": "La clásica cara por defecto de Roblox. Simple, confiable y siempre recognizable.",
        "face_epic_desc": "¡Una cara épica con expresiones dinámicas. Muestra tu personalidad única en el mundo de los juegos!",
        // Gear items
        "gear_rocket_launcher": "Lanzacohetes",
        "gear_rocket_launcher_desc": "Un lanzacohetes clásico de Roblox. ¡Te permite disparar cohetes explosivos en todos los juegos!",

        // Login Section
        "login-title": "Inicia sesión en tu cuenta Rogold",
        "username-label": "Usuario:",
        "password-label": "Contraseña:",
        "login-button": "Entrar",
        "create-account": "Crear Cuenta",

        // Register Section
        "register-title": "Crear cuenta Rogold",
        "confirm-password": "Confirmar Contraseña:",
        "already-have-account": "Ya tengo cuenta",

        // Settings Section
        "settings-title": "Configuraciones de Cuenta",
        "current-username": "Usuario Actual:",
        "new-username": "Nuevo Usuario:",
        "current-password": "Contraseña Actual:",
        "new-password": "Nueva Contraseña:",
        "confirm-new-password": "Confirmar Nueva Contraseña:",
        "leave-blank-keep": "Dejar en blanco para mantener actual",
        "save-changes": "Guardar Cambios",
        "cancel": "Cancelar",

        // Profile Edit Section
        "edit-profile-title": "Editar Perfil",
        "bio-label": "Biografía:",
        "bio-placeholder": "Cuéntanos sobre ti...",
        "status-label": "Estado:",
        "status-online": "En línea",
        "status-offline": "Desconectado",
        "status-busy": "Ocupado",
        "profile-picture": "Foto de Perfil:",
        "remove-picture": "Quitar Foto",
        "save": "Guardar",
        "logout": "Cerrar Sesión",

        // Credits Section
        "credits-title": "Créditos",

        // Footer
        "help": "Ayuda",
        "terms": "Términos de Uso",
        "contact": "Contacto",
        "copyright": "© 2006 Rogold. Todos los derechos reservados.",

        // Alerts
        "default-face-equipped": "¡Cara por defecto equipada!",
        "epic-face-bought": "¡Cara Épica comprada y equipada!",
        "not-enough-coins": "¡No tienes suficientes monedas! Tienes",

        // Documentation
        "documentation": "Documentación",
        "documentation-title": "Documentación de RoGold Studio",
        "doc-studio-tools-title": "Herramientas del Estudio",
        "doc-toolbox-title": "Caja de Herramientas",
        "doc-select-desc": "Selecciona objetos en el viewport",
        "doc-move-desc": "Mueve objetos usando flechas coloreadas (Rojo=X, Verde=Y, Azul=Z)",
        "doc-rotate-desc": "Gira objetos usando anillos coloreados",
        "doc-scale-desc": "Escala objetos usando círculos coloreados",
        "doc-part-desc": "Crea nuevas partes en el workspace",
        "doc-sound-desc": "Añade sonidos a tu juego",
        "doc-light-desc": "Añade fuentes de luz (Point, Spot, Directional)",
        "doc-model-desc": "Crea modelos para organizar objetos",
        "doc-script-desc": "Añade scripts Lua para dar vida a tu juego",
        "doc-folder-desc": "Carpetas para organizar el Explorador",
        "doc-properties-title": "Propiedades de Objetos",
        "doc-basic-props-title": "Propiedades Básicas",
        "doc-name-desc": "Nombre del objeto (usado en scripts)",
        "doc-position-desc": "Posición X, Y, Z en el mundo",
        "doc-size-desc": "Tamaño del objeto (X, Y, Z)",
        "doc-color-desc": "Color del objeto (RGB)",
        "doc-transparency-desc": "Transparencia (0-1)",
        "doc-physics-props-title": "Propiedades de Física",
        "doc-anchored-desc": "Cuando está activado, el objeto no se mueve con física",
        "doc-cancollide-desc": "Cuando está activado, el objeto causa colisiones",
        "doc-bodytype-desc": "Dynamic (cae), Kinematic (movido por scripts), Static (fijo)",
        "doc-mass-desc": "Masa del objeto (afecta la física)",
        "doc-friction-desc": "Fricción (0-1)",
        "doc-restitution-desc": "Rebote (0-1)",
        "doc-lua-api-title": "API Lua (Lo que funciona en el juego)",
        "doc-basic-lua-title": "Comandos Básicos",
        "doc-spin-title": "Spin (Girar Parts)",
        "doc-print-title": "Print/Debug",
        "doc-events-title": "Eventos (Touched)",
        "doc-math-title": "Math y Vector3",
        "doc-loops-title": "Bucles",
        "doc-gui-title": "GUI (Interfaces)",
        "doc-gui-desc": "Crea interfaces usando ScreenGui, Frame, TextLabel y TextButton",
        "doc-health-title": "Sistema de Vida del Jugador",
        "doc-health-desc": "Usa TakeDamage, Heal, SetHealth y GetHealth para gestionar la vida",
        "doc-gameplay-title": "Gameplay en el Juego",
        "doc-player-title": "Controles del Jugador",
        "doc-walk-desc": "Mover personaje",
        "doc-jump-desc": "Saltar",
        "doc-look-desc": "Mirar alrededor",
        "doc-click-desc": "Interactuar con partes (clic izquierdo)",
        "doc-fly-desc": "Bajar/Subir (modo vuelo)",
        "doc-physics-game-title": "Física en el Juego",
        "doc-gravity-desc": "Gravedad: -196.2 studs/s²",
        "doc-respawn-desc": "Auto respawn si cae del mapa",
        "doc-fall-desc": "Las partes no anchored caen y colisionan",
        "doc-limitations-title": "Lo que NO funciona",
        "doc-limit-1": "Los scripts solo se ejecutan cuando el juego se inicia (Test o Publish)",
        "doc-limit-2": "No uses bucles infinitos sin wait() - el juego se congelará",
        "doc-limit-3": "TweenService, Humanoid, CFrame completo no funcionan",
        "doc-limit-4": "Los sonidos necesitan URL válida (MP3/WAV)",
        "doc-limit-5": "Los modelos GLTF necesitan ser .glb o .gltf con URL pública"
    }
};

// Translation function
function setLanguage(lang) {
    if (!translations[lang]) {
        console.error(`Language ${lang} not found`);
        return;
    }

    const t = translations[lang];
    
    // Update all translatable elements by data-translate attribute
    document.querySelectorAll('[data-translate]').forEach(element => {
        const key = element.getAttribute('data-translate');
        if (t[key]) {
            element.textContent = t[key];
        }
    });

    // Update placeholder translations
    document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
        const key = element.getAttribute('data-translate-placeholder');
        if (t[key]) {
            element.placeholder = t[key];
        }
    });

    // Update specific elements by ID
    const elementTranslations = {
        'home-link': t['home-link'],
        'games-link': t['games-link'],
        'catalog-link': t['catalog-link'],
        'studio-link': t['studio-link'],
        'profile-link': t['profile-link'],
        'credits-link': t['credits-link'],
        'community-link': t['community-link'],
        'profile-username': t['profile-username'],
        'profile-bio': t['no-bio'],
        'join-date': t['join-date'],
        'favorite-count': '0',
        'profile-visits': '0',
        'user-coins': '0',
        'current-catalog-coins': '0',
        'game-detail-title': t['game-details'],
        'game-detail-description': t['no-description'],
        'game-detail-creator': t['creator-unknown'],
        'game-detail-created-date': t['date-unknown'],
        'game-detail-tools-allowed': t['tools-yes'],
        'game-detail-likes': '0',
        'game-detail-dislikes': '0',
        'game-detail-playing': '0',
        'game-detail-visits': '0',
        'item-purchase-count': '0',
        'item-detail-price': '0'
    };

    for (const [id, value] of Object.entries(elementTranslations)) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    // Update select options
    const selectOptionTranslations = {
        'status-input-inline': {
            'Online': t['status-online'],
            'Offline': t['status-offline'],
            'Ocupado': t['status-busy']
        }
    };

    for (const [selectId, options] of Object.entries(selectOptionTranslations)) {
        const select = document.getElementById(selectId);
        if (select) {
            for (const option of select.options) {
                if (options[option.value]) {
                    option.textContent = options[option.value];
                }
            }
        }
    }

    // Save language preference
    localStorage.setItem('rogold_language', lang);
    document.documentElement.lang = lang;
}

// Initialize language on page load
document.addEventListener('DOMContentLoaded', () => {
    // Load saved language or default to Portuguese
    const savedLang = localStorage.getItem('rogold_language') || 'pt';
    document.getElementById('language-select').value = savedLang;
    setLanguage(savedLang);

    // Add language change listener
    document.getElementById('language-select').addEventListener('change', (e) => {
        setLanguage(e.target.value);
        // Also update all dynamic buttons when language changes
        updateDynamicButtons();
    });
});

// Function to translate dynamic buttons - make it globally accessible
window.updateDynamicButtons = function() {
    const t = translations[localStorage.getItem('rogold_language') || 'pt'] || translations.pt;
    
    // Update play buttons
    document.querySelectorAll('.play-button').forEach(btn => {
        btn.textContent = t['play-now'] || 'Jogar';
    });
    
    // Update favorite toggle buttons
    document.querySelectorAll('.favorite-toggle-button').forEach(btn => {
        if (btn.classList.contains('remove-favorite-button')) {
            btn.textContent = t['remover-favorite'] || 'Remover Favorito';
        } else {
            btn.textContent = t['favoritar'] || 'Favoritar';
        }
    });
};
