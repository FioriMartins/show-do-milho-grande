// src/commands/multiquiz.js

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { gameData } = require('../utils/dataManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('multiquiz')
        .setDescription('Inicia um jogo de quiz multiplayer!')
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
        const host = interaction.user;
        const category = interaction.options.getString('categoria');
        const difficulty = interaction.options.getString('dificuldade');
        const sessionId = `multi_${Date.now()}`;

        // Cria a sessão de jogo no nosso gerenciador de dados
        const session = {
            id: sessionId,
            hostId: host.id,
            channelId: interaction.channelId,
            category: category,
            difficulty: difficulty,
            players: new Map(), // Armazena os jogadores que entraram
            answers: new Map(), // Armazena as respostas de cada rodada
            status: 'lobby', // Status inicial: 'lobby', 'question', 'results', 'ended'
            question: null,
            interaction: interaction // Guardamos a interação inicial
        };
        
        // O anfitrião entra automaticamente no jogo
        session.players.set(host.id, {
            username: host.username,
            id: host.id
        });

        gameData.multiplayerSessions.set(sessionId, session);

        // Cria a mensagem de Lobby
        const lobbyEmbed = new EmbedBuilder()
            .setTitle('🎮 Jogo Multiplayer Criado!')
            .setDescription(`O anfitrião **${host.username}** iniciou um jogo!\n\n**Categoria:** ${category}\n**Dificuldade:** ${difficulty}\n\nClique em **"Participar"** para entrar! O anfitrião pode iniciar o jogo a qualquer momento.`)
            .setColor('#9B59B6')
            .setFooter({ text: `O jogo começará em 2 minutos ou quando o anfitrião desejar.` });

        const lobbyButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`join_${sessionId}`)
                .setLabel('Participar')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎮'),
            new ButtonBuilder()
                .setCustomId(`start_game_${sessionId}`)
                .setLabel('Começar Agora')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('▶️'),
            new ButtonBuilder()
                .setCustomId(`cancel_game_${sessionId}`)
                .setLabel('Cancelar')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('✖️')
        );

        await interaction.reply({ embeds: [lobbyEmbed], components: [lobbyButtons] });
        
        // Adiciona um timer para cancelar o jogo se não for iniciado
        const timeout = setTimeout(() => {
            const currentSession = gameData.multiplayerSessions.get(sessionId);
            if (currentSession && currentSession.status === 'lobby') {
                interaction.editReply({ content: 'O lobby expirou por inatividade.', embeds: [], components: [] });
                gameData.multiplayerSessions.delete(sessionId);
            }
        }, 120000); // 2 minutos

        session.timeout = timeout;
    },
};
