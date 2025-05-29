const { GoogleGenerativeAI } = require('@google/generative-ai');
const { geminiApiKey } = require('../../config.json');

const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

async function getQuestionFromGemini(category = "Geral", difficulty = "Médio") {
  try {
    const prompt = `Gere uma pergunta de ${category} com dificuldade ${difficulty} com 4 alternativas (a, b, c, d), mas seja direta e clara, tente não fazer perguntas grandes, tente fazer perguntas curtas.
    
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

module.exports = { getQuestionFromGemini };
