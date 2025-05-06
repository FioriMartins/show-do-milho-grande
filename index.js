// Importa as bibliotecas necessárias
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    Events,
    StringSelectMenuBuilder,
    Collection
  } = require('discord.js');
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const fs = require('fs').promises;
  const path = require('path');
  
  // Configurações
  const TOKEN = '##'; // Substitua pelo seu token
  const GEMINI_API_KEY = '##'; // Substitua pela sua chave API
  
  // Caminho para o arquivo de dados
  const DATA_FILE = path.join(__dirname, 'quiz_data.json');
  
  // Inicializa o cliente Discord
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });
  
  // Inicializa o Gemini AI
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  
  // Estrutura de dados para o jogo
  const gameData = {
    // Dados do jogador: streak, pontuação total, etc.
    players: new Map(),
    
    // Jogos ativos: perguntas em andamento
    activeGames: new Map(),
    
    // Ranking global
    globalRanking: new Map(),
    
    // Categorias disponíveis
    categories: [
      "Geral", 
      "História", 
      "Geografia", 
      "Ciências", 
      "Esportes", 
      "Entretenimento", 
      "Arte e Literatura",
      "Tecnologia"
    ],
    
    // Níveis de dificuldade
    difficulties: ["Fácil", "Médio", "Difícil"],
    
    // Sessões multiplayer
    multiplayerSessions: new Map()
  };
  
  // Carrega os dados salvos
  async function loadData() {
    try {
      const data = await fs.readFile(DATA_FILE, 'utf8');
      const parsedData = JSON.parse(data);
      
      // Converte os dados de volta para Maps
      gameData.globalRanking = new Map(parsedData.globalRanking);
      
      // Registra que os dados foram carregados
      console.log('Dados carregados com sucesso!');
    } catch (error) {
      // Se o arquivo não existir, será criado no próximo salvamento
      console.log('Nenhum arquivo de dados encontrado, começando com dados vazios.');
    }
  }
  
  // Salva os dados
  async function saveData() {
    try {
      // Converte Maps para arrays para poder salvar em JSON
      const dataToSave = {
        globalRanking: Array.from(gameData.globalRanking.entries())
      };
      
      await fs.writeFile(DATA_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
      console.log('Dados salvos com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar dados:', error);
    }
  }
  
  // Função para atualizar pontuação do jogador
  function updatePlayerScore(userId, username, points) {
    // Atualiza no ranking global
    if (!gameData.globalRanking.has(userId)) {
      gameData.globalRanking.set(userId, { username, points: 0 });
    }
    
    const userData = gameData.globalRanking.get(userId);
    userData.username = username; // Atualiza o nome de usuário caso tenha mudado
    userData.points += points;
    
    // Salva os dados atualizados
    saveData();
    
    return userData.points;
  }
  
  // Função para obter o ranking global
  function getGlobalRanking(limit = 10) {
    // Converter Map para array, ordenar por pontos e limitar ao número especificado
    return Array.from(gameData.globalRanking.values())
      .sort((a, b) => b.points - a.points)
      .slice(0, limit);
  }
  
  // Função para obter perguntas da Gemini AI
  async function getQuestionFromGemini(category = "Geral", difficulty = "Médio") {
    try {
      // Ajusta o prompt para incluir categoria e dificuldade
      const prompt = `Gere uma pergunta de ${category} com dificuldade ${difficulty} com 4 alternativas (a, b, c, d).
      
      A dificuldade ${difficulty} significa que:
      ${difficulty === "Fácil" ? "A pergunta deve ser básica e de conhecimento comum." : 
        difficulty === "Médio" ? "A pergunta deve ter um nível intermediário de dificuldade." : 
        "A pergunta deve ser desafiadora e específica."}
      
      Formate a resposta em JSON com os seguintes campos:
      - pergunta: A pergunta completa
      - alternativas: Um array com as 4 alternativas
      - correta: O índice (0-3) da alternativa correta
      - explicacao: Uma breve explicação da resposta correta
      - categoria: "${category}"
      - dificuldade: "${difficulty}"
      - pontos: ${difficulty === "Fácil" ? 1 : difficulty === "Médio" ? 3 : 5}
      
      Exemplo de formato:
      {
        "pergunta": "Qual é o maior planeta do Sistema Solar?",
        "alternativas": ["Terra", "Vênus", "Júpiter", "Marte"],
        "correta": 2,
        "explicacao": "Júpiter é o maior planeta do Sistema Solar, com um diâmetro de aproximadamente 139.820 km.",
        "categoria": "Ciências",
        "dificuldade": "Fácil",
        "pontos": 1
      }`;
  
      const result = await model.generateContent(prompt);
      const response = result.response;
      const textResponse = response.text();
      
      // Extrai o JSON da resposta
      const jsonMatch = textResponse.match(/```json\n([\s\S]*?)\n```/) || 
                        textResponse.match(/```([\s\S]*?)```/) ||
                        textResponse.match(/{[\s\S]*?}/);
                       
      if (jsonMatch) {
        const questionData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return questionData;
      } else {
        console.error("Não foi possível extrair JSON da resposta do Gemini.");
        return null;
      }
    } catch (error) {
      console.error("Erro ao obter pergunta do Gemini:", error);
      return null;
    }
  }
  
  // Função para criar uma mensagem de quiz
  async function createQuizMessage(question, isMultiplayer = false, session = null) {
    // Cria o embed com a pergunta
    const embed = new EmbedBuilder()
      .setTitle(`📝 Quiz - ${question.categoria} (${question.dificuldade})`)
      .setDescription(`**${question.pergunta}**\n\n` + 
        question.alternativas.map((alt, index) => 
          `${['🇦', '🇧', '🇨', '🇩'][index]} ${alt}`).join('\n'))
      .setColor(
        question.dificuldade === "Fácil" ? '#00FF00' : 
        question.dificuldade === "Médio" ? '#FFFF00' : '#FF0000'
      )
      .setFooter({ 
        text: `Pontos: ${question.pontos} | ${isMultiplayer ? 'Modo Multijogador' : 'Modo Solo'}`
      });
  
    // Cria os botões para as alternativas
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`answer_0${isMultiplayer ? `_${session}` : ''}`)
        .setLabel('A')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🇦'),
      new ButtonBuilder()
        .setCustomId(`answer_1${isMultiplayer ? `_${session}` : ''}`)
        .setLabel('B')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🇧'),
      new ButtonBuilder()
        .setCustomId(`answer_2${isMultiplayer ? `_${session}` : ''}`)
        .setLabel('C')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🇨'),
      new ButtonBuilder()
        .setCustomId(`answer_3${isMultiplayer ? `_${session}` : ''}`)
        .setLabel('D')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🇩')
    );
  
    return { embeds: [embed], components: [row] };
  }
  
  // Função para mostrar menu de categorias
  function createCategoryMenu(isMultiplayer = false) {
    const embed = new EmbedBuilder()
      .setTitle('🎮 Quiz - Escolha uma Categoria')
      .setDescription('Selecione uma categoria para as perguntas:')
      .setColor('#00AAFF');
  
    const categorySelect = new StringSelectMenuBuilder()
      .setCustomId(isMultiplayer ? 'category_multi' : 'category')
      .setPlaceholder('Escolha uma categoria...')
      .addOptions(gameData.categories.map(category => ({
        label: category,
        value: category,
        description: `Perguntas sobre ${category}`
      })));
  
    const row = new ActionRowBuilder().addComponents(categorySelect);
  
    return { embeds: [embed], components: [row] };
  }
  
  // Função para mostrar menu de dificuldades
  function createDifficultyMenu(category, isMultiplayer = false) {
    const embed = new EmbedBuilder()
      .setTitle(`🎮 Quiz - ${category} - Escolha a Dificuldade`)
      .setDescription('Selecione o nível de dificuldade:')
      .setColor('#00AAFF');
  
    const difficultySelect = new StringSelectMenuBuilder()
      .setCustomId(isMultiplayer ? `difficulty_multi_${category}` : `difficulty_${category}`)
      .setPlaceholder('Escolha a dificuldade...')
      .addOptions([
        {
          label: 'Fácil',
          value: 'Fácil',
          description: 'Perguntas básicas (1 ponto)'
        },
        {
          label: 'Médio',
          value: 'Médio',
          description: 'Perguntas intermediárias (3 pontos)'
        },
        {
          label: 'Difícil',
          value: 'Difícil',
          description: 'Perguntas desafiadoras (5 pontos)'
        }
      ]);
  
    const row = new ActionRowBuilder().addComponents(difficultySelect);
  
    return { embeds: [embed], components: [row] };
  }
  
  // Função para iniciar um novo quiz
  async function startNewQuiz(channelId, userId, category = "Geral", difficulty = "Médio") {
    try {
      // Gera uma pergunta
      const question = await getQuestionFromGemini(category, difficulty);
      if (!question) {
        client.channels.cache.get(channelId).send("Não foi possível gerar uma pergunta. Tente novamente!");
        return;
      }
  
      // Inicializa dados do jogador se não existirem
      if (!gameData.players.has(userId)) {
        gameData.players.set(userId, { 
          streak: 0, 
          currentQuestion: null,
          totalPoints: 0
        });
      }
      
      // Salva os dados da pergunta atual
      gameData.players.get(userId).currentQuestion = question;
      
      // Registra o jogo ativo
      gameData.activeGames.set(channelId + userId, {
        userId,
        channelId,
        startTime: Date.now(),
        question
      });
  
      // Envia a mensagem com a pergunta
      const quizMessage = await createQuizMessage(question);
      client.channels.cache.get(channelId).send(quizMessage);
    } catch (error) {
      console.error("Erro ao iniciar quiz:", error);
      client.channels.cache.get(channelId).send("Ocorreu um erro ao iniciar o quiz. Tente novamente!");
    }
  }
  
  // Função para iniciar uma sessão multiplayer
  async function startMultiplayerSession(channelId, hostId, category = "Geral", difficulty = "Médio") {
    try {
      // Gera um ID único para a sessão
      const sessionId = `multi_${Date.now()}`;
      
      // Gera uma pergunta
      const question = await getQuestionFromGemini(category, difficulty);
      if (!question) {
        client.channels.cache.get(channelId).send("Não foi possível gerar uma pergunta para o modo multijogador. Tente novamente!");
        return null;
      }
      
      // Cria a sessão multiplayer
      const session = {
        id: sessionId,
        hostId: hostId,
        channelId: channelId,
        startTime: Date.now(),
        question: question,
        players: new Map(),
        answers: new Map(),
        status: 'active',
        category: category,
        difficulty: difficulty,
        timeLimit: 30000 // 30 segundos para responder
      };
      
      // Adiciona o host como primeiro jogador
      session.players.set(hostId, { joined: Date.now() });
      
      // Registra a sessão
      gameData.multiplayerSessions.set(sessionId, session);
      
      // Envia mensagem anunciando o início da sessão
      const joinEmbed = new EmbedBuilder()
        .setTitle('🎮 Jogo Multiplayer Iniciado!')
        .setDescription(`**${client.users.cache.get(hostId).username}** iniciou um jogo multiplayer!\n\nCategoria: **${category}**\nDificuldade: **${difficulty}**\n\nA partida começará em 30 segundos ou quando o host clicar em "Começar agora".\nClique no botão abaixo para participar!`)
        .setColor('#9B59B6')
        .setFooter({ text: `ID da Sessão: ${sessionId}` });
      
      // Cria botões para juntar-se ou iniciar o jogo
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`join_${sessionId}`)
          .setLabel('Participar')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🎮'),
        new ButtonBuilder()
          .setCustomId(`start_now_${sessionId}`)
          .setLabel('Começar agora')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('▶️')
      );
      
      const message = await client.channels.cache.get(channelId).send({ 
        embeds: [joinEmbed], 
        components: [row] 
      });
      
      // Salva o ID da mensagem
      session.joinMessageId = message.id;
      
      // Configura timer para iniciar o jogo após 30 segundos
      session.timer = setTimeout(() => {
        startMultiplayerQuestion(sessionId);
      }, 30000);
      
      return sessionId;
    } catch (error) {
      console.error("Erro ao iniciar sessão multiplayer:", error);
      client.channels.cache.get(channelId).send("Ocorreu um erro ao iniciar o modo multijogador. Tente novamente!");
      return null;
    }
  }
  
  // Função para iniciar a pergunta no modo multiplayer
  async function startMultiplayerQuestion(sessionId) {
    const session = gameData.multiplayerSessions.get(sessionId);
    if (!session || session.status !== 'active') return;
    
    // Cancela o timer se ele existir
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = null;
    }
    
    // Atualiza o status da sessão
    session.status = 'question';
    session.questionStartTime = Date.now();
    
    // Obtém o canal
    const channel = client.channels.cache.get(session.channelId);
    
    // Tenta editar a mensagem original para remover os botões
    try {
      const joinMessage = await channel.messages.fetch(session.joinMessageId);
      await joinMessage.edit({ components: [] });
      
      // Lista de jogadores participantes
      const playersList = Array.from(session.players.keys())
        .map(id => client.users.cache.get(id).username)
        .join(', ');
      
      const playersEmbed = new EmbedBuilder()
        .setTitle('🎮 Jogadores Participantes')
        .setDescription(`**${playersList}**`)
        .setColor('#9B59B6')
        .setFooter({ text: `Total: ${session.players.size} jogador(es)` });
      
      await channel.send({ embeds: [playersEmbed] });
    } catch (error) {
      console.error("Erro ao atualizar mensagem de entrada:", error);
    }
    
    // Envia a pergunta
    const quizMessage = await createQuizMessage(session.question, true, sessionId);
    const message = await channel.send(quizMessage);
    session.questionMessageId = message.id;
    
    // Configura timer para encerrar a pergunta após 20 segundos
    session.questionTimer = setTimeout(() => {
      endMultiplayerQuestion(sessionId);
    }, 20000);
    
    // Envia mensagem de contagem regressiva
    channel.send("⏱️ Você tem 20 segundos para responder!");
  }
  
  // Função para encerrar a pergunta multiplayer
  async function endMultiplayerQuestion(sessionId) {
    const session = gameData.multiplayerSessions.get(sessionId);
    if (!session || session.status !== 'question') return;
    
    // Cancela o timer se existir
    if (session.questionTimer) {
      clearTimeout(session.questionTimer);
      session.questionTimer = null;
    }
    
    // Atualiza o status
    session.status = 'ended';
    
    // Obtém o canal
    const channel = client.channels.cache.get(session.channelId);
    
    // Tenta editar a mensagem da pergunta para remover os botões
    try {
      const questionMessage = await channel.messages.fetch(session.questionMessageId);
      await questionMessage.edit({ components: [] });
    } catch (error) {
      console.error("Erro ao desativar botões da pergunta:", error);
    }
    
    // Calcula os resultados
    const correctAnswerIndex = session.question.correta;
    const correctPlayers = [];
    const incorrectPlayers = [];
    const noAnswerPlayers = [];
    
    // Verifica as respostas de cada jogador
    for (const [playerId, playerData] of session.players) {
      const playerAnswer = session.answers.get(playerId);
      const username = client.users.cache.get(playerId).username;
      
      if (playerAnswer === undefined) {
        // Jogador não respondeu
        noAnswerPlayers.push(username);
      } else if (playerAnswer === correctAnswerIndex) {
        // Resposta correta
        correctPlayers.push(username);
        // Atualiza pontuação
        updatePlayerScore(playerId, username, session.question.pontos);
      } else {
        // Resposta incorreta
        incorrectPlayers.push(username);
      }
    }
    
    // Cria embed com os resultados
    const resultsEmbed = new EmbedBuilder()
      .setTitle('📊 Resultados da Rodada')
      .setDescription(`**Pergunta:** ${session.question.pergunta}\n\n**Resposta Correta:** ${session.question.alternativas[correctAnswerIndex]}\n\n**Explicação:** ${session.question.explicacao}`)
      .setColor('#9B59B6')
      .addFields(
        { 
          name: '✅ Acertaram', 
          value: correctPlayers.length > 0 ? correctPlayers.join(', ') : 'Ninguém acertou', 
          inline: false 
        },
        { 
          name: '❌ Erraram', 
          value: incorrectPlayers.length > 0 ? incorrectPlayers.join(', ') : 'Ninguém errou', 
          inline: false 
        },
        { 
          name: '⏱️ Não responderam', 
          value: noAnswerPlayers.length > 0 ? noAnswerPlayers.join(', ') : 'Todos responderam', 
          inline: false 
        }
      )
      .setFooter({ text: `Categoria: ${session.question.categoria} | Dificuldade: ${session.question.dificuldade} | Pontos: ${session.question.pontos}` });
    
    // Botão para nova rodada
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`new_round_${sessionId}`)
        .setLabel('Nova Rodada')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setCustomId(`end_multi_${sessionId}`)
        .setLabel('Encerrar Jogo')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🛑')
    );
    
    // Envia os resultados
    await channel.send({ embeds: [resultsEmbed], components: [row] });
  }
  
  // Função para iniciar nova rodada multiplayer
  async function startNewMultiplayerRound(sessionId) {
    const session = gameData.multiplayerSessions.get(sessionId);
    if (!session) return;
    
    try {
      // Gera uma nova pergunta
      const question = await getQuestionFromGemini(session.category, session.difficulty);
      if (!question) {
        client.channels.cache.get(session.channelId).send("Não foi possível gerar uma pergunta para a nova rodada. Tente novamente!");
        return;
      }
      
      // Atualiza os dados da sessão
      session.question = question;
      session.status = 'active';
      session.answers = new Map();
      
      // Inicia a nova pergunta
      startMultiplayerQuestion(sessionId);
    } catch (error) {
      console.error("Erro ao iniciar nova rodada:", error);
      client.channels.cache.get(session.channelId).send("Ocorreu um erro ao iniciar nova rodada. Tente novamente!");
    }
  }
  
  // Evento quando o bot está pronto
  client.once('ready', async () => {
    console.log(`Bot está online! Logado como ${client.user.tag}`);
    
    // Carrega os dados salvos
    await loadData();
    
    // Configura salvamento periódico
    setInterval(() => {
      saveData();
    }, 5 * 60 * 1000); // Salva a cada 5 minutos
  });
  
  // Evento para mensagens
  client.on('messageCreate', async message => {
    if (message.author.bot) return;
  
    // Comando para iniciar o menu de categoria
    if (message.content === '!quiz') {
      message.reply(createCategoryMenu());
    }
    
    // Comando para iniciar modo multijogador
    else if (message.content === '!multiquiz') {
      message.reply(createCategoryMenu(true));
    }
    
    // Comando para ver o streak atual
    else if (message.content === '!streak') {
      const userData = gameData.players.get(message.author.id);
      const streak = userData ? userData.streak : 0;
      message.reply(`🏆 Seu streak atual é: **${streak}** pergunta(s) consecutiva(s) corretas!`);
    }
    
    // Comando para ver pontuação global
    else if (message.content === '!pontos') {
      const globalData = gameData.globalRanking.get(message.author.id);
      const points = globalData ? globalData.points : 0;
      message.reply(`🌟 Você tem um total de **${points}** pontos!`);
    }
    
    // Comando para ver o ranking
    else if (message.content === '!rank' || message.content === '!ranking') {
      const ranking = getGlobalRanking();
      
      // Cria o embed com o ranking
      const rankEmbed = new EmbedBuilder()
        .setTitle('🏆 Ranking Global do Quiz')
        .setDescription('Os 10 jogadores com maior pontuação:')
        .setColor('#FFD700');
      
      if (ranking.length === 0) {
        rankEmbed.addFields({ name: 'Sem dados', value: 'Ainda não há pontuações registradas.' });
      } else {
        const rankList = ranking.map((player, index) => 
          `**${index + 1}.** ${player.username} - **${player.points}** pontos`
        ).join('\n');
        
        rankEmbed.setDescription(rankList);
      }
      
      message.reply({ embeds: [rankEmbed] });
    }
    
    // Comando de ajuda
    else if (message.content === '!ajuda') {
      const helpEmbed = new EmbedBuilder()
        .setTitle('📚 Comandos do Quiz Bot')
        .setDescription('Aqui estão os comandos disponíveis:')
        .addFields(
          { name: '!quiz', value: 'Inicia um novo jogo de perguntas', inline: true },
          { name: '!multiquiz', value: 'Inicia um jogo multiplayer', inline: true },
          { name: '!streak', value: 'Mostra seu streak atual de respostas corretas', inline: true },
          { name: '!pontos', value: 'Mostra sua pontuação global', inline: true },
          { name: '!rank', value: 'Mostra o ranking global', inline: true },
          { name: '!ajuda', value: 'Mostra esta mensagem de ajuda', inline: true }
        )
        .setColor('#00FF00');
      
      message.reply({ embeds: [helpEmbed] });
    }
  });
  
  // Evento para interações com botões e menus
  client.on(Events.InteractionCreate, async interaction => {
    // Manipula menus de seleção
    if (interaction.isStringSelectMenu()) {
      // Menu de categoria (single player)
      if (interaction.customId === 'category') {
        const category = interaction.values[0];
        await interaction.update(createDifficultyMenu(category));
      } 
      // Menu de categoria (multiplayer)
      else if (interaction.customId === 'category_multi') {
        const category = interaction.values[0];
        await interaction.update(createDifficultyMenu(category, true));
      }
      // Menu de dificuldade (single player)
      else if (interaction.customId.startsWith('difficulty_') && !interaction.customId.includes('multi')) {
        const category = interaction.customId.replace('difficulty_', '');
        const difficulty = interaction.values[0];
        
        await interaction.update({ content: `Preparando uma pergunta de ${category} com dificuldade ${difficulty}...`, components: [] });
        startNewQuiz(interaction.channelId, interaction.user.id, category, difficulty);
      }
      // Menu de dificuldade (multiplayer)
      else if (interaction.customId.startsWith('difficulty_multi_')) {
        const category = interaction.customId.replace('difficulty_multi_', '');
        const difficulty = interaction.values[0];
        
        await interaction.update({ content: `Iniciando jogo multiplayer de ${category} com dificuldade ${difficulty}...`, components: [] });
        const sessionId = await startMultiplayerSession(interaction.channelId, interaction.user.id, category, difficulty);
        
        if (!sessionId) {
          interaction.followUp("Erro ao criar a sessão multiplayer. Tente novamente!");
        }
      }
      return;
    }
    
    // Manipula botões
    if (!interaction.isButton()) return;
    
    // Entrar em jogo multiplayer
    if (interaction.customId.startsWith('join_')) {
      const sessionId = interaction.customId.split('_')[1];
      const session = gameData.multiplayerSessions.get(sessionId);
      
      if (!session || session.status !== 'active') {
        interaction.reply({ content: "Esta sessão não está mais disponível ou já começou!", ephemeral: true });
        return;
      }
      
      // Verifica se o jogador já está na sessão
      if (session.players.has(interaction.user.id)) {
        interaction.reply({ content: "Você já está participando deste jogo!", ephemeral: true });
        return;
      }
      
      // Adiciona o jogador à sessão
      session.players.set(interaction.user.id, { joined: Date.now() });
      
      interaction.reply({ content: `Você entrou no jogo multiplayer! Aguarde o início...`, ephemeral: true });
    }
    
    // Iniciar jogo multiplayer imediatamente
    else if (interaction.customId.startsWith('start_now_')) {
      const sessionId = interaction.customId.split('_')[2];
      const session = gameData.multiplayerSessions.get(sessionId);
      
      if (!session || session.status !== 'active') {
        interaction.reply({ content: "Esta sessão não está mais disponível!", ephemeral: true });
        return;
      }
      
      // Verifica se é o host
      if (interaction.user.id !== session.hostId) {
        interaction.reply({ content: "Apenas o host pode iniciar o jogo imediatamente!", ephemeral: true });
        return;
      }
      
      // Inicia a pergunta
      interaction.reply({ content: "Iniciando o jogo agora!", ephemeral: true });
      startMultiplayerQuestion(sessionId);
    }
    
// Nova rodada multiplayer
else if (interaction.customId.startsWith('new_round_')) {
    const sessionId = interaction.customId.split('_')[2];
    const session = gameData.multiplayerSessions.get(sessionId);
    
    if (!session || session.status !== 'ended') {
      interaction.reply({ content: "Esta sessão não está disponível para nova rodada!", ephemeral: true });
      return;
    }
    
    // Verifica se é o host
    if (interaction.user.id !== session.hostId) {
      interaction.reply({ content: "Apenas o host pode iniciar uma nova rodada!", ephemeral: true });
      return;
    }
    
    // Inicia nova rodada
    await interaction.update({ components: [] });
    interaction.followUp("Preparando nova rodada...");
    startNewMultiplayerRound(sessionId);
  }
  
  // Encerrar jogo multiplayer
  else if (interaction.customId.startsWith('end_multi_')) {
    const sessionId = interaction.customId.split('_')[2];
    const session = gameData.multiplayerSessions.get(sessionId);
    
    if (!session) {
      interaction.reply({ content: "Esta sessão não está mais disponível!", ephemeral: true });
      return;
    }
    
    // Verifica se é o host
    if (interaction.user.id !== session.hostId) {
      interaction.reply({ content: "Apenas o host pode encerrar o jogo!", ephemeral: true });
      return;
    }
    
    // Encerra a sessão
    await interaction.update({ components: [] });
    
    // Calcula as pontuações finais
    const finalScores = new Map();
    
    // Para cada jogador na sessão, busca a pontuação global atual
    for (const playerId of session.players.keys()) {
      const userData = gameData.globalRanking.get(playerId);
      if (userData) {
        finalScores.set(playerId, userData.points);
      }
    }
    
    // Ordena as pontuações
    const sortedScores = Array.from(finalScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, points]) => ({
        username: client.users.cache.get(id).username,
        points
      }));
    
    // Cria embed com os resultados finais
    const finalEmbed = new EmbedBuilder()
      .setTitle('🏁 Fim de Jogo - Resultados Finais')
      .setColor('#FF5733');
    
    if (sortedScores.length === 0) {
      finalEmbed.setDescription('Nenhuma pontuação registrada nesta sessão.');
    } else {
      const scoresList = sortedScores.map((player, index) => 
        `**${index + 1}.** ${player.username} - **${player.points}** pontos`
      ).join('\n');
      
      finalEmbed.setDescription(scoresList);
    }
    
    // Remove a sessão
    gameData.multiplayerSessions.delete(sessionId);
    
    // Envia os resultados finais
    interaction.followUp({ embeds: [finalEmbed] });
  }
  
  // Responder pergunta (modo single player)
  else if (interaction.customId.startsWith('answer_') && !interaction.customId.includes('_multi_')) {
    const answerId = parseInt(interaction.customId.split('_')[1]);
    const gameKey = interaction.channelId + interaction.user.id;
    const game = gameData.activeGames.get(gameKey);
    
    if (!game) {
      interaction.reply({ content: "Não foi encontrado um jogo ativo para você neste canal!", ephemeral: true });
      return;
    }
    
    // Remove o jogo ativo
    gameData.activeGames.delete(gameKey);
    
    // Desativa os botões
    await interaction.update({ components: [] });
    
    const correctAnswerIndex = game.question.correta;
    const userData = gameData.players.get(interaction.user.id);
    
    // Verifica se a resposta está correta
    if (answerId === correctAnswerIndex) {
      // Atualiza streak e pontuação
      userData.streak += 1;
      const totalPoints = updatePlayerScore(interaction.user.id, interaction.user.username, game.question.pontos);
      
      // Cria embed de resposta correta
      const correctEmbed = new EmbedBuilder()
        .setTitle('✅ Resposta Correta!')
        .setDescription(`**Pergunta:** ${game.question.pergunta}\n\n**Resposta Correta:** ${game.question.alternativas[correctAnswerIndex]}\n\n**Explicação:** ${game.question.explicacao}`)
        .setColor('#00FF00')
        .setFooter({ text: `Streak: ${userData.streak} | Total de Pontos: ${totalPoints}` });
      
      // Botões para próxima pergunta
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('new_quiz_same')
          .setLabel('Nova Pergunta (Mesma Categoria)')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId('new_quiz_different')
          .setLabel('Nova Categoria')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📚')
      );
      
      interaction.followUp({ embeds: [correctEmbed], components: [row] });
    } else {
      // Reseta o streak
      userData.streak = 0;
      
      // Cria embed de resposta incorreta
      const incorrectEmbed = new EmbedBuilder()
        .setTitle('❌ Resposta Incorreta!')
        .setDescription(`**Pergunta:** ${game.question.pergunta}\n\n**Sua Resposta:** ${game.question.alternativas[answerId]}\n\n**Resposta Correta:** ${game.question.alternativas[correctAnswerIndex]}\n\n**Explicação:** ${game.question.explicacao}`)
        .setColor('#FF0000')
        .setFooter({ text: `Streak resetado!` });
      
      // Botões para próxima pergunta
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('new_quiz_same')
          .setLabel('Tentar Novamente (Mesma Categoria)')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId('new_quiz_different')
          .setLabel('Nova Categoria')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📚')
      );
      
      interaction.followUp({ embeds: [incorrectEmbed], components: [row] });
    }
  }
  
  // Responder pergunta (modo multiplayer)
  else if (interaction.customId.startsWith('answer_')) {
    // Formato: answer_<resposta>_<sessionId>
    const parts = interaction.customId.split('_');
    if (parts.length < 3) return;
    
    const answerId = parseInt(parts[1]);
    const sessionId = parts[2];
    const session = gameData.multiplayerSessions.get(sessionId);
    
    if (!session || session.status !== 'question') {
      interaction.reply({ content: "Esta pergunta não está mais disponível!", ephemeral: true });
      return;
    }
    
    // Verifica se o jogador está na sessão
    if (!session.players.has(interaction.user.id)) {
      interaction.reply({ content: "Você não está participando deste jogo!", ephemeral: true });
      return;
    }
    
    // Verifica se o jogador já respondeu
    if (session.answers.has(interaction.user.id)) {
      interaction.reply({ content: "Você já respondeu esta pergunta!", ephemeral: true });
      return;
    }
    
    // Registra a resposta do jogador
    session.answers.set(interaction.user.id, answerId);
    
    // Informa ao jogador que sua resposta foi registrada
    interaction.reply({ content: `Sua resposta foi registrada! Aguarde até que todos respondam ou o tempo acabe.`, ephemeral: true });
    
    // Verifica se todos os jogadores responderam
    if (session.answers.size === session.players.size) {
      // Todos responderam, encerra a pergunta
      clearTimeout(session.questionTimer);
      endMultiplayerQuestion(sessionId);
    }
  }
  
  // Nova pergunta (mesma categoria e dificuldade)
  else if (interaction.customId === 'new_quiz_same') {
    await interaction.update({ components: [] });
    
    // Obtém os dados do último jogo
    const userData = gameData.players.get(interaction.user.id);
    if (!userData || !userData.currentQuestion) {
      interaction.followUp("Não foi possível encontrar os dados da última pergunta. Iniciando novo jogo padrão.");
      startNewQuiz(interaction.channelId, interaction.user.id);
      return;
    }
    
    const lastCategory = userData.currentQuestion.categoria;
    const lastDifficulty = userData.currentQuestion.dificuldade;
    
    interaction.followUp(`Preparando nova pergunta de ${lastCategory} com dificuldade ${lastDifficulty}...`);
    startNewQuiz(interaction.channelId, interaction.user.id, lastCategory, lastDifficulty);
  }
  
  // Nova pergunta (nova categoria)
  else if (interaction.customId === 'new_quiz_different') {
    await interaction.update({ components: [] });
    interaction.followUp(createCategoryMenu());
  }
});

// Inicia o bot
client.login(TOKEN);

// Função para resetar dados de jogos inativos periodicamente
setInterval(() => {
  const now = Date.now();
  
  // Limpa jogos single player inativos (mais de 10 minutos)
  for (const [gameKey, game] of gameData.activeGames.entries()) {
    if (now - game.startTime > 10 * 60 * 1000) {
      gameData.activeGames.delete(gameKey);
    }
  }
  
  // Limpa sessões multiplayer inativas (mais de 30 minutos)
  for (const [sessionId, session] of gameData.multiplayerSessions.entries()) {
    if (now - session.startTime > 30 * 60 * 1000) {
      // Cancela timers se existirem
      if (session.timer) clearTimeout(session.timer);
      if (session.questionTimer) clearTimeout(session.questionTimer);
      
      // Remove a sessão
      gameData.multiplayerSessions.delete(sessionId);
    }
  }
}, 5 * 60 * 1000); // Verifica a cada 5 minutos