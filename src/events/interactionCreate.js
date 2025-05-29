// src/events/interactionCreate.js

const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { gameData, updatePlayerScore } = require('../utils/dataManager');
const { getQuestionFromGemini } = require('../utils/gemini');
const { createQuestionMessage: createSoloQuestionMessage } = require('../commands/quiz');

// --- Funções Auxiliares para o MODO MULTIPLAYER ---

function createMultiQuestionMessage(question, sessionId) {
    const embed = new EmbedBuilder()
        .setTitle(`📝 Quiz Multiplayer - ${question.categoria} (${question.dificuldade})`)
        .setDescription(`**${question.pergunta}**`)
        .setColor(question.dificuldade === "Fácil" ? '#00FF00' : question.dificuldade === "Médio" ? '#FFFF00' : '#FF0000')
        .setFooter({ text: `Pontos: ${question.pontos}` });

    const alternatives = new ActionRowBuilder();
    question.alternativas.forEach((alt, index) => {
        alternatives.addComponents(
            new ButtonBuilder()
                .setCustomId(`multi_answer_${index}_${sessionId}`) // ID único para respostas multi
                .setLabel(String.fromCharCode(65 + index)) // A, B, C, D
                .setStyle(ButtonStyle.Primary)
        );
    });

    return { embeds: [embed], components: [alternatives] };
}

async function startMultiplayerQuestion(interaction, sessionId) {
    const session = gameData.multiplayerSessions.get(sessionId);
    if (!session) return;

    session.status = 'question';
    session.answers = new Map();

    const question = await getQuestionFromGemini(session.category, session.difficulty);
    if (!question) {
        await interaction.channel.send("Não consegui gerar uma pergunta. O jogo será encerrado.");
        gameData.multiplayerSessions.delete(sessionId);
        return;
    }
    session.question = question;

    const playersList = Array.from(session.players.values()).map(p => p.username).join(', ');
    await interaction.channel.send(`**A rodada vai começar!**\nJogadores: ${playersList}\n\nVocês têm 20 segundos!`);

    const messagePayload = createMultiQuestionMessage(question, sessionId);
    const questionMessage = await interaction.channel.send(messagePayload);
    session.questionMessage = questionMessage;

    const roundTimeout = setTimeout(() => {
        endMultiplayerRound(interaction, sessionId);
    }, 20000);
    session.roundTimeout = roundTimeout;
}

async function endMultiplayerRound(interaction, sessionId) {
    const session = gameData.multiplayerSessions.get(sessionId);
    if (!session || session.status !== 'question') return;

    clearTimeout(session.roundTimeout);
    session.status = 'results';

    const { question } = session;
    const correctAnswerIndex = question.correta;

    const correctPlayers = [];
    const incorrectPlayers = [];

    for (const [playerId, player] of session.players.entries()) {
        const answer = session.answers.get(playerId);
        if (answer === correctAnswerIndex) {
            correctPlayers.push(player.username);
            updatePlayerScore(playerId, player.username, question.pontos);
        } else {
            incorrectPlayers.push(player.username);
        }
    }

    if (session.questionMessage) {
        const disabledComponents = session.questionMessage.components.map(row => {
            row.components.forEach(button => button.setDisabled(true));
            return row;
        });
        await session.questionMessage.edit({ components: disabledComponents }).catch(() => {});
    }

    const resultsEmbed = new EmbedBuilder()
        .setTitle('📊 Resultados da Rodada')
        .setDescription(`A resposta correta para **"${question.pergunta}"** era **"${question.alternativas[correctAnswerIndex]}"**.`)
        .setColor('#00AAFF')
        .addFields(
            { name: '✅ Acertaram', value: correctPlayers.length > 0 ? correctPlayers.join(', ') : 'Ninguém acertou.', inline: false },
            { name: '❌ Erraram ou não responderam', value: incorrectPlayers.length > 0 ? incorrectPlayers.join(', ') : 'Ninguém errou!', inline: false }
        );

    const resultButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`new_round_${sessionId}`)
            .setLabel('Próxima Rodada')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`end_game_${sessionId}`)
            .setLabel('Encerrar Jogo')
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.channel.send({ embeds: [resultsEmbed], components: [resultButtons] });
}


// --- Função Auxiliar para o MODO SOLO ---

async function startNextSoloRound(interaction, game) {
    const newQuestion = await getQuestionFromGemini(game.category, game.difficulty);
    if (!newQuestion) {
        await interaction.followUp("Não consegui gerar a próxima pergunta. O jogo será encerrado, mas seus pontos foram salvos!");
        gameData.activeGames.delete(interaction.user.id);
        return;
    }

    game.question = newQuestion;
    const messagePayload = await createSoloQuestionMessage(newQuestion);
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    await interaction.followUp(messagePayload);
}


// --- MÓDULO PRINCIPAL DE INTERAÇÕES ---

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Erro executando o comando ${interaction.commandName}`);
                console.error(error);
                await interaction.reply({ content: 'Ocorreu um erro ao executar este comando!', ephemeral: true });
            }
            return;
        }

        if (interaction.isButton()) {
            const customId = interaction.customId;

            // ROTA: QUIZ SOLO
            if (customId.startsWith('answer_')) {
                const userId = interaction.user.id;
                const game = gameData.activeGames.get(userId);

                if (!game) return interaction.reply({ content: "Este jogo solo já foi finalizado ou não é para você.", ephemeral: true });
                
                await interaction.update({ components: [] });

                const answerId = parseInt(customId.split('_')[1]);
                const { question } = game;
                const correctAnswerIndex = question.correta;

                if (answerId === correctAnswerIndex) {
                    game.streak += 1;
                    const totalPoints = updatePlayerScore(userId, interaction.user.username, question.pontos);
                    const correctEmbed = new EmbedBuilder()
                        .setTitle(`✅ Resposta Correta! (Sequência: ${game.streak})`)
                        .setColor('#00FF00')
                        .setDescription(`Você acertou! A resposta era **${question.alternativas[correctAnswerIndex]}**.\n\nPreparando a próxima pergunta...`)
                        .setFooter({ text: `Você ganhou ${question.pontos} pontos! Total: ${totalPoints}` });
                    await interaction.editReply({ embeds: [correctEmbed] });
                    await startNextSoloRound(interaction, game);
                } else {
                    const finalStreak = game.streak;
                    gameData.activeGames.delete(userId);
                    const incorrectEmbed = new EmbedBuilder()
                        .setTitle('❌ Resposta Incorreta!')
                        .setColor('#FF0000')
                        .setDescription(`Que pena! A resposta correta era **${question.alternativas[correctAnswerIndex]}**.\n\n*${question.explicacao}*`)
                        .setFooter({ text: `Fim de jogo! Sua sequência final foi de ${finalStreak} acerto(s).` });
                    await interaction.editReply({ embeds: [incorrectEmbed] });
                }
                return;
            }

            // ROTA: QUIZ MULTIPLAYER
            const [mainId, sessionId] = customId.split(/_(.*)/s);
            const session = gameData.multiplayerSessions.get(sessionId);

            if (session) {
                const isHost = interaction.user.id === session.hostId;

                switch (mainId) {
                    case 'join':
                        if (session.players.has(interaction.user.id)) return interaction.reply({ content: 'Você já está no jogo!', ephemeral: true });
                        session.players.set(interaction.user.id, { username: interaction.user.username, id: interaction.user.id });
                        await interaction.message.edit({ content: `**${interaction.user.username}** entrou no jogo! Jogadores: ${session.players.size}` });
                        return interaction.reply({ content: 'Você entrou no jogo!', ephemeral: true });

                    case 'start_game':
                        if (!isHost) return interaction.reply({ content: 'Apenas o anfitrião pode iniciar o jogo.', ephemeral: true });
                        clearTimeout(session.timeout);
                        await session.interaction.editReply({ content: 'O jogo vai começar!', embeds: [], components: [] });
                        return startMultiplayerQuestion(interaction, sessionId);

                    case 'cancel_game':
                        if (!isHost) return interaction.reply({ content: 'Apenas o anfitrião pode cancelar o jogo.', ephemeral: true });
                        clearTimeout(session.timeout);
                        gameData.multiplayerSessions.delete(sessionId);
                        return interaction.update({ content: 'O jogo foi cancelado pelo anfitrião.', embeds: [], components: [] });

                    case 'multi_answer':
                        if (!session.players.has(interaction.user.id)) return interaction.reply({ content: 'Você não está neste jogo!', ephemeral: true });
                        if (session.answers.has(interaction.user.id)) return interaction.reply({ content: 'Você já respondeu nesta rodada!', ephemeral: true });
                        
                        const answerIndex = parseInt(customId.split('_')[2]);
                        session.answers.set(interaction.user.id, answerIndex);
                        await interaction.reply({ content: 'Sua resposta foi registrada!', ephemeral: true });
                        
                        if (session.answers.size === session.players.size) {
                            await endMultiplayerRound(interaction, sessionId);
                        }
                        return;

                    case 'new_round':
                        if (!isHost) return interaction.reply({ content: 'Apenas o anfitrião pode iniciar uma nova rodada.', ephemeral: true });
                        await interaction.message.delete();
                        return startMultiplayerQuestion(interaction, sessionId);

                    case 'end_game':
                        if (!isHost) return interaction.reply({ content: 'Apenas o anfitrião pode encerrar o jogo.', ephemeral: true });
                        const finalEmbed = new EmbedBuilder().setTitle('🏁 Fim de Jogo!').setColor('#FF5733').setDescription('O jogo foi encerrado pelo anfitrião. Obrigado por jogar!');
                        await interaction.message.channel.send({ embeds: [finalEmbed] });
                        gameData.multiplayerSessions.delete(sessionId);
                        return interaction.message.delete();
                }
            }
        }
    },
};
