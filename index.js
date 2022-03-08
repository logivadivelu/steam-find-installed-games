const path = require('path');
const fs = require('fs');
const os = require('os');
const vdfParser = require('@node-steam/vdf');

const STEAM_SOURCE_NAME = 'Steam';

const STEAM_CONFIG_DIRS_PATH = `${getSteamsBaseDir()}/config/libraryfolders.vdf`;
const STEAM_IMAGE_CACHE_DIR = `${getSteamsBaseDir()}/appcache/librarycache`;

console.log(process.env.HOME);

class GameDir {
    constructor(dirPath, recursive = false) {
        this.path = dirPath;
        this.recursive = recursive;
    }
}

class SteamGame {
    // Game metadata props
    name = undefined;
    isInstalled = undefined;
    appId = undefined;

    // Images props
    boxArtImage = undefined;
    coverImage = undefined;
    iconImage = undefined;

    constructor(appid, name, isInstalled) {
        this.appId = appid;
        this.name = name;
        this.isInstalled = isInstalled;
    }
}

function getSteamsBaseDir() {
    let steamsBaseDir = '';
    switch (os.platform()) {
        case 'win32':
            steamsBaseDir = 'C:\\Program Files (x86)\\Steam';
            break;
        case 'darwin':
            steamsBaseDir = path.join(os.homedir(), 'Library/Application Support/Steam');
            break;
        default:
            steamsBaseDir = '';
    }
    return steamsBaseDir;
}

const _parse = (filePath) => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${filePath} is not found`);
    }
    const fileContents = vdfParser.parse(
        fs.readFileSync(filePath, 'utf8'),
    );
    return fileContents;
};

const _getConfig = () => {
    const config = _parse(STEAM_CONFIG_DIRS_PATH);

    // Validate
    if (typeof config.libraryfolders === 'undefined') {
        throw new Error('Invalid steam config : libraryfolders key undefined');
    }

    return config;
};

const _getDirs = (config) => {
    const dirs = [];

    // Read user specified steam install directories
    const libraryfolders = config.libraryfolders;
    const keys = Object.keys(libraryfolders);
    for (let i = 0; i < keys.length - 1; i++) {
        dirs.push(new GameDir(libraryfolders[keys[i]].path));
    }

    return dirs;
};

const _getGameImages = (game) => {
    const images = {
        boxArtImage: path.join(STEAM_IMAGE_CACHE_DIR, `${game.appId}_library_600x900.jpg`),
        coverImage: path.join(STEAM_IMAGE_CACHE_DIR, `${game.appId}_header.jpg`),
        iconImage: path.join(STEAM_IMAGE_CACHE_DIR, `${game.appId}_icon.jpg`),
    };
    // eslint-disable-next-line no-restricted-syntax
    for (const [key, value] of Object.entries(images)) {
        const imageExists = fs.existsSync(value);
        if (imageExists) {
            game[key] = value;
        }
    }
};

const _getGameIsInstalled = (game, manifestData) => {
    const stateFlags = manifestData?.AppState?.StateFlags;
    if (typeof stateFlags !== 'undefined') {
        const installedMask = 4;
        game.isInstalled = stateFlags & installedMask;
    }
};

const _getInstalledGames = (dirs) => {
    const IGNORED_ENTRIES_APPIDS = [
        '221410', // Steam for Linux
        '228980', // Steamworks Common Redistributables
        '1070560', // Steam Linux Runtime
    ];
    const games = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const dir of dirs) {
        // Get all games manifests of dir
        const manDir = `${dir.path}/steamapps`;
        let entries = [];
        try { entries = fs.readdirSync(manDir); }
        // eslint-disable-next-line no-continue
        catch (err) { continue; }
        const manifests = entries.filter(string => string.startsWith('appmanifest_') && string.endsWith('.acf'));

        // Get info from manifests
        // eslint-disable-next-line no-restricted-syntax
        for (const manName of manifests) {
            const INSTALLED_MASK = 4;
            const manPath = `${manDir}/${manName}`;
            const manContent = fs.readFileSync(manPath, {encoding: 'utf-8'});
            const manData = vdfParser.parse(manContent);
            const stateFlags = manData?.AppState?.StateFlags ?? 0;

            const appid = manData?.AppState?.appid;
            const name = manData?.AppState?.name;
            const isInstalled = stateFlags & INSTALLED_MASK;

            if (!STEAM_SOURCE_NAME || !appid || IGNORED_ENTRIES_APPIDS.includes(appid)) {
                // eslint-disable-next-line no-continue
                continue;
            }
            // Build game
            const game = new SteamGame(appid, name, isInstalled);
            _getGameIsInstalled(game, manData);
            _getGameImages(game);
            games.push(game);
        }
    }

    return games;
};


const scan = (warn = false) => {
    // Get config
    let config;
    try {
        config = _getConfig();
        console.log(config);
    }
    catch (error) {
        if (warn) console.warn(`Unable to get steam config : ${error}`);
    }

    // Get game dirs
    let dirs = [];
    if (typeof config !== 'undefined') {
        try {
            dirs = _getDirs(config);
            console.log(JSON.stringify(dirs));
        }
        catch (error) {
            if (warn) console.warn(`Unable to get steam install dirs : ${error}`);
        }
    }

    // Get games
    let games = [];
    if (dirs.length > 0) {
        try {
            games = _getInstalledGames(dirs);
            console.log(JSON.stringify(games));
        }
        catch (error) {
            if (warn) console.warn(`Unable to get steam installed games : ${error}`);
        }
    }

    // ? Add support for non-installed games ?

    return games;
};


console.log(scan(true));
