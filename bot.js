const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrcodeLib = require('qrcode');
const puppeteer = require('puppeteer');  // Adiciona o Puppeteer
const winston = require('winston');
const express = require('express');
const fs = require('fs');
const moment = require('moment-timezone');

// Configuração do diretório de uploads
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configuração do servidor Express e da porta
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot está ativo'));
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

// Configuração do logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console(),
    ],
});

// Lista de números bloqueados
const blockedNumbers = ["5582981452814@c.us", "5582987616759@c.us", "558281452814@c.us"];

// Função para verificar se o número está bloqueado
function isBlockedNumber(contactId) {
    return blockedNumbers.includes(contactId);
}

// Inicialização do Puppeteer com as opções para ambiente de hospedagem
(async () => {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
})();

// Configuração do cliente
const client = new Client({ authStrategy: new LocalAuth() });

// Geração do QR Code
client.on('qr', async (qr) => {
    qrcode.generate(qr, { small: true });
    logger.info('QR code gerado.');
    try {
        await qrcodeLib.toFile('./qrcode.png', qr);
        console.log("QR Code salvo como qrcode.png");
    } catch (err) {
        console.error(err);
    }
});

// Evento de sucesso ao conectar
client.on('ready', () => {
    console.log('✅ Bot conectado no WhatsApp.');
    logger.info('WhatsApp conectado com sucesso.');
});

// Função para verificar horário de funcionamento
const isWithinBusinessHours = () => {
    const now = moment().tz("America/Sao_Paulo");
    const day = now.format('ddd').toLowerCase();
    const hour = now.hour();

    const isWeekday = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].includes(day);
    const isWithinHours = hour >= 8 && hour < 18;

    return isWeekday && isWithinHours;
};

// Evento de recebimento de mensagens
client.on('message', async (msg) => {
    const contactId = msg.from;

    // Verificar se o número está bloqueado
    if (isBlockedNumber(contactId)) {
        console.log(`Mensagem ignorada de número bloqueado: ${contactId}`);
        return; // Ignora a mensagem
    }

    // Estado de digitação para o usuário
    await msg.chat.sendStateTyping();

    // Verifica o horário de funcionamento
    if (!isWithinBusinessHours()) {
        await client.sendMessage(msg.from, 'Desculpe, estamos fora do horário de atendimento. Nosso horário é de *segunda a sábado, das 8h às 18h*.');
        return;
    }

    const chat = await msg.getChat();
    const contact = await msg.getContact();
    const name = contact.pushname || 'Cliente';

    // Menu interativo
    if (msg.body.match(/(menu|oi|olá|ola|serviços|materiais)/i)) {
        await client.sendMessage(msg.from, `Olá, *${name}*! Bem-vindo à *Papelaria BH* 🛍️. Escolha uma das opções abaixo:\n\n1️⃣ *Impressão*\n2️⃣ *Xerox*\n3️⃣ *Revelação de Foto*\n4️⃣ *Foto 3x4*\n5️⃣ *Plastificação A4*\n6️⃣ *Plastificação SUS*\n7️⃣ *Impressão em papel cartão*\n8️⃣ *Papel fotográfico adesivo*\n9️⃣ *Encadernação 50 folhas*\n🔟 *Mais opções.*\n\n*Envie o número ou anexe seu arquivo.*`);
    } else if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        const filePath = `${uploadDir}/${msg.id.id}.${media.mimetype.split('/')[1]}`;
        fs.writeFileSync(filePath, media.data, { encoding: 'base64' });
        await client.sendMessage(msg.from, `📥 Arquivo recebido: *${filePath}*. Processando seu pedido, pronto para retirada em 5 minutos. Pague via PIX (82987616759) ou na loja.`);
        logger.info(`Arquivo recebido de ${msg.from}: ${filePath}`);
        await client.sendMessage(msg.from, `Gostaria de dar sua opinião? Digite "Sim" ou "Não".`);
    } else if (!isNaN(msg.body) && msg.body >= 1 && msg.body <= 10) {
        await client.sendMessage(msg.from, `Você selecionou a opção *${msg.body}*. Logo entraremos em contato para mais informações.`);
    } else if (['sim', 'não'].includes(msg.body.toLowerCase())) {
        if (msg.body.toLowerCase() === 'sim') {
            await client.sendMessage(msg.from, '✅ Obrigado pelo feedback positivo! Estamos sempre à disposição.');
        } else {
            await client.sendMessage(msg.from, '🙏 Agradecemos o feedback! Vamos trabalhar para melhorar.');
        }
    } else {
        await client.sendMessage(msg.from, '❌ Desculpe, não entendi. Digite *"menu"* para ver as opções.');
    }
});

// Inicializa o cliente
client.initialize();
