const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'quiz_data.json');

const gameData = {
    globalRanking: new Map(),
    activeGames: new Map(), // Para jogos solo
    multiplayerSessions: new Map() // Para jogos multi
};

async function loadData() {
    try {
        await fs.access(DATA_FILE);
        const data = await fs.readFile(DATA_FILE, 'utf8');
        const parsedData = JSON.parse(data);
        if (parsedData.globalRanking) {
            gameData.globalRanking = new Map(parsedData.globalRanking);
        }
        console.log('Dados carregados com sucesso!');
    } catch (error) {
        console.log('Nenhum arquivo de dados encontrado, começando com dados vazios.');
        await saveData(); // Cria o arquivo se não existir
    }
}

async function saveData() {
    try {
        const dataToSave = {
            globalRanking: Array.from(gameData.globalRanking.entries())
        };
        await fs.writeFile(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
        console.log('Dados salvos com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar dados:', error);
    }
}

function updatePlayerScore(userId, username, points) {
    if (!gameData.globalRanking.has(userId)) {
        gameData.globalRanking.set(userId, { username, points: 0 });
    }
    const userData = gameData.globalRanking.get(userId);
    userData.username = username;
    userData.points += points;
    saveData();
    return userData.points;
}

function getGlobalRanking(limit = 10) {
    return Array.from(gameData.globalRanking.values())
        .sort((a, b) => b.points - a.points)
        .slice(0, limit);
}

module.exports = {
    gameData,
    loadData,
    saveData,
    updatePlayerScore,
    getGlobalRanking
};
