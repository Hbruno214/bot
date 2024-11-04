const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrcodeLib = require('qrcode');
const winston = require('winston');
const express = require('express');
const fs = require('fs');
const moment = require('moment-timezone');

const blockedNumbers = ["5582981452814@c.us", "5582987616759@c.us", "558281452814@c.us"]; // Lista de números bloqueados

function isBlockedNumber(contactId) {
    return blockedNumbers.includes(contactId);
}

const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot está ativo'));
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

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

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

function boasVindas(nome) {
    const agora = moment().tz("America/Sao_Paulo");
    const hora = agora.hour();

    if (hora >= 6 && hora < 12) {
        return `Bom dia, ${nome}! 🌅 Bem-vindo à Papelaria BH!`;
    } else if (hora >= 12 && hora < 18) {
        return `Boa tarde, ${nome}! ☀️ Bem-vindo à Papelaria BH!`;
    } else {
        return `Boa noite, ${nome}! 🌙 Bem-vindo à Papelaria BH!`;
    }
}

// Função para verificar o horário de funcionamento
function dentroHorarioComercial() {
    const agora = moment().tz("America/Sao_Paulo");
    const diaDaSemana = agora.day(); // 0 para domingo, 1 para segunda, etc.
    const horaAtual = agora.hour();

    // Verifica se é de segunda a sábado e se está entre 8h e 18h
    return diaDaSemana >= 1 && diaDaSemana <= 6 && horaAtual >= 8 && horaAtual < 18;
}

async function enviarCatalogo(msg) {
    await client.sendMessage(msg.from, `📒 *Catálogo de Serviços da Papelaria BH* 📒\n\n1️⃣ *Impressão*: R$ 2,00 por página\n2️⃣ *Xerox (P&B)*: R$ 0,50 | *Colorida*: R$ 0,75\n3️⃣ *Revelação de Foto*:\n    - 10x15: R$ 4,00\n    - Topo de bolo: R$ 5,00\n4️⃣ *Foto 3x4*: R$ 5,00\n5️⃣ *Plastificação A4*: R$ 6,00\n6️⃣ *Plastificação SUS*: R$ 4,00\n7️⃣ *Impressão em papel cartão*: R$ 3,00\n8️⃣ *Papel fotográfico adesivo*: R$ 5,00\n9️⃣ *Encadernação (até 50 folhas)*: R$ 15,00\n🔟 *Falar com um atendente*.\n\nEnvie o número da opção ou anexe seu arquivo para iniciar!`);
}

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

client.on('ready', () => {
    console.log('✅ Bot conectado no WhatsApp.');
    logger.info('WhatsApp conectado com sucesso.');
});

client.on('message', async (msg) => {
    if (isBlockedNumber(msg.from)) {
        logger.info(`Mensagem bloqueada de ${msg.from}`);
        return;
    }

    const chat = await msg.getChat();

    // Bloqueia mensagens de grupo
    if (chat.isGroup) {
        logger.info(`Mensagem de grupo ignorada: ${msg.from}`);
        return;
    }

    // Verifica o horário de funcionamento
    if (!dentroHorarioComercial()) {
        await client.sendMessage(msg.from, "⚠️ Estamos fora do horário de funcionamento. Nosso atendimento é de segunda a sábado, das 8h às 18h.");
        return;
    }

    await chat.sendStateTyping();

    const contact = await msg.getContact();
    const name = contact.pushname || 'Cliente';

    if (msg.body.match(/(menu|oi|olá|ola|serviços|materiais)/i)) {
        await client.sendMessage(msg.from, boasVindas(name));
        await enviarCatalogo(msg);
    } else if (msg.body.match(/(bom dia|boa tarde|boa noite)/i)) {
        await client.sendMessage(msg.from, boasVindas(name));
    } else if (!isNaN(msg.body) && msg.body >= 1 && msg.body <= 10) {
        await client.sendMessage(msg.from, `Você selecionou a opção *${msg.body}*. Por favor, envie o arquivo relacionado para processar seu pedido.`);
        logger.info(`Pedido recebido: opção ${msg.body} de ${msg.from}`);
    } else if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        const filePath = `${uploadDir}/${msg.id.id}.${media.mimetype.split('/')[1]}`;
        fs.writeFileSync(filePath, media.data, { encoding: 'base64' });
        await client.sendMessage(msg.from, `📥 Arquivo recebido! Seu pedido está sendo processado e estará pronto em 5 minutos. Para pagamento, use nosso PIX (82987616759) ou pague na loja.`);
        logger.info(`Arquivo recebido de ${msg.from}: ${filePath}`);

        setTimeout(() => {
            client.sendMessage(msg.from, `📢 Seu pedido está pronto para retirada!`);
        }, 300000);

        setTimeout(() => {
            client.sendMessage(msg.from, `😊 Agradecemos por usar nossos serviços! Gostaria de avaliar nossa assistência? Responda com *Sim* ou *Não*.`);
        }, 360000);
    } else if (['sim', 'não'].includes(msg.body.toLowerCase())) {
        if (msg.body.toLowerCase() === 'sim') {
            await client.sendMessage(msg.from, 'Obrigado pelo feedback positivo! Estamos sempre à disposição para ajudar. 😊');
        } else {
            await client.sendMessage(msg.from, 'Agradecemos o feedback! Continuaremos a trabalhar para melhorar nossos serviços.');
        }
    } else {
        await client.sendMessage(msg.from, 'Desculpe, não entendi. Por favor, utilize as palavras *"Menu"*, *"Oi"*, *"Olá"*, ou *"Serviços"* para ver as opções ou enviar um arquivo.');
    }
});

client.initialize();
