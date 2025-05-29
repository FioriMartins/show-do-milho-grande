const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getQuestionFromGemini } = require('../utils/gemini');
const { gameData } = require('../utils/dataManager');

// Função auxiliar para criar a mensagem da pergunta
async function createQuestionMessage(question) {
    const embed = new EmbedBuilder()
        .setTitle(`📝 Quiz - ${question.categoria} (${question.dificuldade})`)
        .setDescription(`**${question.pergunta}**\n\n` +
            question.alternativas.map((alt, index) =>
                `${['🇦', '🇧', '🇨', '🇩'][index]} ${alt}`).join('\n'))
        .setColor(
            question.dificuldade === "Fácil" ? '#00FF00' :
            question.dificuldade === "Médio" ? '#FFFF00' : '#FF0000'
        )
        .setFooter({ text: `Pontos: ${question.pontos}` });

    const buttons = question.alternativas.map((_, index) =>
        new ButtonBuilder()
            .setCustomId(`answer_${index}`)
            .setLabel(String.fromCharCode(65 + index)) // A, B, C, D
            .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);

    return { embeds: [embed], components: [row] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quiz')
        .setDescription('Inicia um novo jogo de quiz em modo de sequência!')
        .addStringOption(option =>
            option.setName('categoria')
                .setDescription('A categoria da pergunta.')
                .setRequired(true)
                .addChoices(
                    { name: 'Geral', value: 'Geral' },
                    { name: 'História', value: 'História' },
                    { name: 'Geografia', value: 'Geografia' },
                    { name: 'Ciências', value: 'Ciências' },
                    { name: 'Esportes', value: 'Esportes' }
                ))
        .addStringOption(option =>
            option.setName('dificuldade')
                .setDescription('O nível de dificuldade da pergunta.')
                .setRequired(true)
                .addChoices(
                    { name: 'Fácil', value: 'Fácil' },
                    { name: 'Médio', value: 'Médio' },
                    { name: 'Difícil', value: 'Difícil' }
                )),
    async execute(interaction) {
        const category = interaction.options.getString('categoria');
        const difficulty = interaction.options.getString('dificuldade');
        const userId = interaction.user.id;

        await interaction.deferReply();

        const question = await getQuestionFromGemini(category, difficulty);

        if (!question) {
            await interaction.editReply('Desculpe, não consegui gerar uma pergunta. Tente novamente!');
            return;
        }
        
        // ALTERADO: Agora armazenamos mais dados sobre a sessão do jogo
        gameData.activeGames.set(userId, {
            interaction,
            question,
            category: category,
            difficulty: difficulty,
            streak: 0 
        });

        const messagePayload = await createQuestionMessage(question);
        await interaction.editReply(messagePayload);
    },
    // Exportando a função para ser usada em outros lugares
    createQuestionMessage 
};
