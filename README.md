# MCP FullStack Builder

Un serveur **MCP (Model Context Protocol)** qui agit comme une plateforme d'ingénierie FullStack autonome propulsée par l'IA. 
Il est conçu pour être utilisé avec des clients compatibles MCP tels que **Cline**, **Claude Desktop**, **Cursor**, ou **Windsurf**. 

Grâce au modèle Mistral AI, ce serveur permet à votre assistant de générer du code (React, Express, Mobile, etc.), de lire et d'éditer vos fichiers, de lancer des commandes dans le terminal, de déboguer des erreurs complexes et de concevoir des architectures complètes.

---

## 🛠️ Prérequis

Avant de commencer, assurez-vous d'avoir installé sur votre machine :
- **Node.js** (version 24 ou supérieure recommandée)
- **pnpm** (le gestionnaire de paquets utilisé par ce projet)

---

## 📦 Installation

1. Clonez ce dépôt ou placez-vous dans le dossier du projet (`mcp-server`).
2. Installez toutes les dépendances du monorepo via pnpm :

```bash
pnpm install
```

---

## ⚙️ Configuration (Variables d'Environnement)

Le serveur a besoin de certaines variables d'environnement pour fonctionner. 
Vous pouvez les définir globalement sur votre système ou les fournir directement lors du lancement du serveur MCP par votre client (voir la section *Configuration des clients* plus bas).

- `MISTRAL_API_KEY` **(Requis)** : Votre clé API Mistral pour faire fonctionner l'IA (génération, debug, design).
- `MCP_WORKSPACE_DIR` *(Optionnel)* : Le dossier où l'IA a le droit de travailler et de générer les projets. Par défaut, c'est `/tmp/mcp-workspace`. Il est recommandé de le changer pour un dossier persistant de votre choix (ex: `/home/user/mes-projets-ia`).

---

## 🚀 Lancer le serveur (Mode Développement)

Si vous souhaitez tester ou développer le serveur lui-même :

```bash
# Lance le serveur API Express/MCP sur le port 5000
pnpm --filter @workspace/api-server run dev
```

---

## 🎨 Lancer le Frontend (Bac à sable / Sandbox)

Le projet contient également une application web (React + Vite) qui sert de bac à sable pour tester les composants générés. Pour la lancer :

```bash
# Lance le frontend sur votre navigateur (généralement http://localhost:5173)
pnpm --filter @workspace/mockup-sandbox run dev
```

---

## 🔌 Configurer les outils (Clients MCP)

Pour utiliser ce serveur avec votre assistant IA favori, vous devez configurer ce dernier pour qu'il lance automatiquement le serveur.

Voici comment configurer les principaux clients :

### 1. Cline (VS Code)

Dans VS Code, ouvrez les paramètres de Cline en cliquant sur l'icône MCP dans la barre latérale de Cline, puis éditez le fichier `cline_mcp_settings.json`. Ajoutez-y la configuration suivante :

```json
{
  "mcpServers": {
    "mcp-fullstack-builder": {
      "command": "node",
      "args": [
        "/home/jeeko/Documents/mcp-server/artifacts/api-server/dist/stdio.mjs"
      ],
      "env": {
        "MISTRAL_API_KEY": "votre-clé-api-mistral-ici",
        "MCP_WORKSPACE_DIR": "/home/jeeko/mcp"
      }
    }
  }
}
```
*(Plus besoin que le serveur web tourne en fond avec cette méthode stdio, le client le gérera lui-même).*

### 2. Claude Desktop

Ouvrez le fichier de configuration de Claude Desktop.
- Sur macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Sur Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Ajoutez cette configuration :

```json
{
  "mcpServers": {
    "fullstack-builder": {
      "command": "node",
      "args": [
        "/home/jeeko/Documents/mcp-server/artifacts/api-server/dist/stdio.mjs"
      ],
      "env": {
        "MISTRAL_API_KEY": "votre-clé-api-mistral-ici",
        "MCP_WORKSPACE_DIR": "/home/jeeko/mcp"
      }
    }
  }
}
```

### 3. Claude Code (CLI)

Si vous utilisez l'outil en ligne de commande de Claude (`claude-code`), vous pouvez ajouter le serveur très facilement via une commande. 

Dans votre terminal, exécutez la commande suivante (en remplaçant par votre clé et vos chemins) :

```bash
claude mcp add mcp-fullstack-builder -- node /home/jeeko/Documents/mcp-server/artifacts/api-server/dist/stdio.mjs
```

*Note : Pour les variables d'environnement, vous devrez soit les exporter dans votre terminal avant de lancer `claude` (`export MISTRAL_API_KEY=...`), soit modifier le fichier de configuration généré par Claude Code (souvent situé dans `~/.claude.json`).*

### 4. Cursor

1. Ouvrez les **Settings** de Cursor.
2. Allez dans **Features > MCP**.
3. Cliquez sur **+ Add new MCP server**.
4. Remplissez les champs :
   - **Name** : `FullStackBuilder`
   - **Type** : `command`
   - **Command** : `node /home/jeeko/Documents/mcp-server/artifacts/api-server/dist/stdio.mjs`

---

## 🧰 Commandes Utiles

Pour la maintenance et le développement du projet lui-même :

- **`pnpm run typecheck`** : Vérifie les types TypeScript sur l'ensemble du monorepo.
- **`pnpm run build`** : Vérifie les types et compile tous les packages (nécessaire avant d'utiliser le serveur compilé en production).
- **`pnpm --filter @workspace/api-spec run codegen`** : À lancer obligatoirement si vous modifiez la spécification OpenAPI, pour synchroniser le code.

---

## 🏗️ Architecture du projet

- `artifacts/api-server` : Le cœur du système. Serveur Express qui embarque le protocole MCP et contient les 37 outils (dans `src/mcp/tools/`).
- `artifacts/mockup-sandbox` : Application frontend (React/Vite) qui sert de bac à sable pour tester les composants générés.
- `lib/` : Packages partagés (base de données Drizzle, schémas Zod, client API).
