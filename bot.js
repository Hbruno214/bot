// Carregar variáveis de ambiente
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrImage = require('qr-image');
const winston = require('winston');
const fs = require('fs');
const moment = require('moment-timezone');

// Diretórios necessários
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Lista de números bloqueados (carregados do .env)
const blockedNumbers = process.env.BLOCKED_NUMBERS ? process.env.BLOCKED_NUMBERS.split(',') : [];

// Configuração do logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console(),
    ],
});

// Inicialização do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

// Variáveis globais para o bot
let waitingForFile = false;
let userForFile = null;
let humanSupportActive = false;

// Funções auxiliares
const isWithinWorkingHours = () => {
    const now = moment().tz('America/Sao_Paulo');
    const day = now.day(); // 0 = Domingo, 6 = Sábado
    const hour = now.hour();
    return day >= 1 && day <= 6 && hour >= 8 && hour < 18;
};

const cumprimentar = (nome) => {
    const hora = moment().tz('America/Sao_Paulo').hour();
    if (hora >= 6 && hora < 12) return `🌅 *Bom dia, ${nome}!* Como posso ajudar você hoje?`;
    if (hora >= 12 && hora < 18) return `🌞 *Boa tarde, ${nome}!* Em que posso ser útil?`;
    return `🌙 *Boa noite, ${nome}!* Precisa de algo?`;
};

const menuPrincipal = () => {
    return `📋 *Menu Principal - Papelaria BH* 📋\n\n` +
        `1️⃣ *Impressão* - 🖨️ Envie seus documentos para impressão.\n` +
        `2️⃣ *Xerox* - 📑 Venha até nossa loja para realizar cópias.\n` +
        `3️⃣ *Foto 3x4* - 📸 Envie sua foto do rosto.\n` +
        `4️⃣ *Plastificação* - 📂 Envie seu arquivo ou venha à loja.\n` +
        `6️⃣ *Falar com humano* - 👩‍💼 Atendimento personalizado.\n` +
        `0️⃣ *Encerrar* - ❌ Finalizar conversa.\n\n` +
        `*Escolha uma opção digitando o número correspondente.*`;
};

// Eventos do cliente WhatsApp
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    logger.info('QR Code gerado.');
    const qrCode = qrImage.image(qr, { type: 'png' });
    const qrCodePath = './qrcode.png';
    qrCode.pipe(fs.createWriteStream(qrCodePath));
    logger.info(`QR Code salvo em ${qrCodePath}.`);
});

client.on('ready', () => {
    logger.info('Bot conectado ao WhatsApp.');
});

client.on('message', async (msg) => {
    const chat = await msg.getChat();
    const contact = await msg.getContact();
    const message = msg.body.toLowerCase();
    const name = contact.pushname || 'Cliente';

    if (chat.isGroup || blockedNumbers.includes(msg.from)) return;

    if (!isWithinWorkingHours()) {
        return await client.sendMessage(
            msg.from,
            '⏰ *Fora do horário de atendimento*.\n' +
            'Nosso horário de atendimento é de *segunda a sábado, das 8h às 18h*.\n\n' +
            '📅 Por favor, envie sua mensagem dentro do horário comercial.'
        );
    }

    if (humanSupportActive) {
        logger.info(`Mensagem recebida durante atendimento humano para ${msg.from}.`);
        return;
    }

    switch (message) {
        case 'oi':
        case 'olá':
        case 'menu':
            await client.sendMessage(msg.from, cumprimentar(name));
            await client.sendMessage(msg.from, menuPrincipal());
            break;

        case '1':
            waitingForFile = true;
            userForFile = msg.from;
            await client.sendMessage(msg.from, '🖨️ *Você escolheu Impressão*. Por favor, envie o arquivo em *PDF, imagem ou DOC* para impressão.');
            break;

        case '2':
            await client.sendMessage(msg.from, '📑 *Você escolheu Xerox*. Por favor, venha até nossa loja para realizar as cópias.');
            break;

        case '3':
            waitingForFile = true;
            userForFile = msg.from;
            await client.sendMessage(msg.from, '📸 *Você escolheu Foto 3x4*. Por favor, envie uma *foto do rosto* para prosseguirmos.');
            break;

        case '4':
            await client.sendMessage(msg.from, '📂 *Você escolheu Plastificação*. Envie o arquivo em *PDF* ou venha à loja para plastificar seu documento.');
            break;

        case '6':
            humanSupportActive = true;
            await client.sendMessage(msg.from, '👩‍💼 *Atendimento humano ativado.*\nUm atendente falará com você em até *15 minutos*. Aguarde.');
            setTimeout(() => {
                humanSupportActive = false;
                client.sendMessage(msg.from, '⏳ *O atendimento humano foi encerrado.* O bot está ativo novamente para continuar ajudando você.');
            }, 15 * 60 * 1000); // 15 minutos
            break;

        case '0':
            await client.sendMessage(msg.from, '❌ *Conversa encerrada.*\nObrigado pelo contato! Até logo! 😊');
            break;

        default:
            if (waitingForFile && userForFile === msg.from && msg.hasMedia) {
                const media = await msg.downloadMedia();
                const fileType = media.mimetype.split('/')[1];
                if (['pdf', 'jpeg', 'png', 'doc', 'docx'].includes(fileType)) {
                    const filePath = `${uploadDir}/${moment().format('YYYYMMDD_HHmmss')}.${fileType}`;
                    fs.writeFileSync(filePath, media.data, 'base64');
                    await client.sendMessage(msg.from, '📥 *Arquivo recebido.* Estamos processando seu pedido...');
                    if (message === '1' || message === '3') {
                        await client.sendMessage(msg.from, '✅ *Seu arquivo foi processado com sucesso.*');
                        await client.sendMessage(msg.from, `💳 *Para pagamento, use a chave Pix: 82987616759.*`);
                        await client.sendMessage(msg.from, '🙏 *Obrigado por escolher a Papelaria BH! Envie seu feedback para nos ajudar a melhorar.*');
                    }
                } else {
                    await client.sendMessage(msg.from, '⚠️ *Formato inválido.* Aceitamos apenas *PDF, imagens e DOC*.');
                }
                waitingForFile = false;
                userForFile = null;
            } else {
                await client.sendMessage(msg.from, '❓ *Opção inválida.* Digite "menu" para ver as opções disponíveis.');
            }
            break;
    }
});

client.initialize();
