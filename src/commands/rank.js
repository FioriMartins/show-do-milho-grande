// src/commands/rank.js

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getGlobalRanking } = require('../utils/dataManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Mostra o ranking global dos 10 melhores jogadores!'),
    async execute(interaction) {
        // Busca os dados do ranking do nosso gerenciador de dados
        const ranking = getGlobalRanking(10); // Pegamos o top 10

        const rankEmbed = new EmbedBuilder()
            .setTitle('🏆 Ranking Global do Quiz')
            .setColor('#FFD700'); // Cor de ouro

        if (ranking.length === 0) {
            rankEmbed.setDescription('Ainda não há ninguém no ranking. Seja o primeiro a jogar com `/quiz`!');
        } else {
            // Mapeia os dados do ranking para uma string formatada
            const rankString = ranking.map((player, index) => {
                return `**${index + 1}.** ${player.username} - **${player.points}** pontos`;
            }).join('\n'); // Une cada linha com uma quebra de linha

            rankEmbed.setDescription(rankString);
        }

        // Responde à interação com o embed criado
        await interaction.reply({ embeds: [rankEmbed] });
    },
};
