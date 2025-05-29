// src/events/ready.js

const { Events, ActivityType } = require('discord.js');
const { loadData, saveData } = require('../utils/dataManager');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        await loadData();
        console.log(`Pronto! Logado como ${client.user.tag}`);
        
        // Salva os dados periodicamente
        setInterval(saveData, 5 * 60 * 1000);

        // --- LÓGICA DO STATUS E RICH PRESENCE ---

        // NOVO: Define o status como "Não Perturbe" (dnd)
        client.user.setStatus('dnd');

        // Lógica para o Rich Presence dinâmico (continua a mesma)
        const activities = [
            {name: 'em desenvolvimento', type: ActivityType.Custom},
        ];

        let i = 0;
        setInterval(() => {
            // Define a atividade que roda em conjunto com o status
            client.user.setActivity(activities[i].name, { type: activities[i].type });
            
            i = (i + 1) % activities.length;
        }, 15000); // Muda a cada 15 segundos
    },
};
