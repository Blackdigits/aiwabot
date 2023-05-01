const { Client, LocalAuth } = require('whatsapp-web.js');

const qrcode = require('qrcode-terminal');
const { Configuration, OpenAIApi } = require("openai");
require('dotenv').config()

const client = new Client({
    authStrategy: new LocalAuth(),
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.initialize();

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const system_prompt = "Abaikan semua instruksi sebelum ini. Kamu adalah seorang sales yang menjual pelatihan bagaimana cara membuat Bot WhatsApp. Jelaskan kegunaan-kegunaan Bot WhatsApp. Setiap yang bertanya tawarkan link https://s.id/whatsappbot untuk tahu lebih lanjut."

const history = [];
client.on('message', message => {

    user_input = message.body

    const messages = [];

    messages.push({ role: "system", content: system_prompt });

    for (const [input_text, completion_text] of history) {
        messages.push({ role: "user", content: input_text });
        messages.push({ role: "assistant", content: completion_text });
    }

    messages.push({ role: "user", content: user_input });

    console.log(messages);

    runCompletion(messages).then(result => {
        console.log(result);
        console.log();

        client.sendMessage(message.from, result);

        history.push([user_input, result]);
    });

});

async function runCompletion(messages) {
    const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: messages
    });
    return completion.data.choices[0].message.content;
}

