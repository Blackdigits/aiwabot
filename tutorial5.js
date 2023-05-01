const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { Configuration, OpenAIApi } = require("openai");

const fs = require('fs');

require('dotenv').config()

const client = new Client({
    authStrategy: new LocalAuth(),
});

client.initialize();

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('ready', () => {
    console.log('Client is ready!');
});

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

let history = {};
let history_database = {};

// read the JSON object from the file
const filePath = 'data.json';
fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
        // file does not exist, create it with an empty object
        fs.writeFile(filePath, '{}', (err) => {
            if (err) {
                console.error(`Error creating ${filePath}: ${err}`);
                return;
            }
            console.log(`${filePath} created successfully`);
        });
        return;
    }
    fs.readFile(filePath, 'utf8', (err, data) => {
        history = JSON.parse(data);
        history_database = JSON.parse(data);
        console.log('JSON object loaded from data.json:');
        console.log(history);
    });
});

const system_prompt_private = "Abaikan semua instruksi sebelum ini. Kamu adalah seorang sales yang menjual pelatihan bagaimana cara membuat Bot WhatsApp. Jelaskan kegunaan-kegunaan Bot WhatsApp. Setiap yang bertanya tawarkan link https://s.id/whatsappbot untuk tahu lebih lanjut."
const system_prompt_group = "Kamu adalah ahli matematika. Jelaskan setiap jawaban dengan konsep matematika"

// https://github.com/pedroslopez/whatsapp-web.js/blob/main/example.js
// https://wwebjs.dev/guide/

client.on('message', async message => {
    //console.log(message)
    console.log(message.author);
    console.log(message.from);
    console.log(message.body);

    let message_quoted = undefined;
    if (message._data.hasOwnProperty('quotedMsg')) {
        message_quoted = message._data.quotedMsg.body;
        console.log(message_quoted);
    }

    console.log();
    const message_body = message.body;

    // nomor bot yang bisa membalas ketika di mention
    // ganti @62882003576381 sesuai nomor bot yang digunakan
    if (!message_body.includes("@62882003576381") && message.author != undefined) {
        return;
    }

    console.log("Sedang menyiapkan balasan...");

    // jika ada kata leave maka bot bisa keluar
    if (message_body.toLowerCase().includes("leave")) {
        let chat = await message.getChat();
        if (chat.isGroup) {
            chat.leave();
        }
        return;
    }

    // jika user mereply pesan dari group maka akan disambungkan dengan pesan untuk instruksi selanjutnya
    let user_input = message.body;
    if (message_quoted != undefined) {
        user_input = message_quoted + "\n" + message.body;
    }

    console.log("User Input: " + user_input);

    // parsing id dari user private atau group
    if (message.author == undefined) {
        id_from = message.from;
        id_from = id_from.split("@")[0];
    } else {
        id_group = message.from
        id_group = id_group.split("@")[0];

        id_author = message.author
        id_author = id_author.split("@")[0];

        id_from = id_author + "@" + id_group;
    }

    // Ini untuk mencegah nomor yang tidak diinginkan menanyakan kepada bot terus menerus
    const id_from_list = ["6283802621040"];
    if (id_from_list.includes(id_from)) {
        client.sendMessage(message.from, "Maaf kuota pertanyaan anda ke WhatsApp Bot sudah habis, silakan lebih lanjut cek di sini ya https://s.id/whatsappbot");
        return;
    }

    // jika user ketik /reset maka history chat dihapus secara sistem
    if (message_body.includes("/reset")) {
        client.sendMessage(message.from, "Pertanyaan anda sudah direset, silakan ulangi kembali");
        history[id_from] = [];
        return;
    }

    // buat id baru jika belum ada
    if (!history.hasOwnProperty(id_from)) {
        console.log("New User Detected " + id_from);
        history[id_from] = [];
        history_database[id_from] = [];
    }


    // ini hanya cek jumlah percakapan saja
    if (message_body.includes("/counter")) {
        const temp = history[id_from].length + " / " + history_database[id_from].length
        console.log("Jumlah percakapan: " + temp);

        if (message.author == undefined) {
            client.sendMessage(message.from, temp);
        } else {
            message.reply(temp);
        }

        return;
    }

    // ini set maximum chat history
    const MAX_CHAT_HISTORY = 5;
    let lastChatItems = history[id_from];
    if (history[id_from].length >= MAX_CHAT_HISTORY) {
        lastChatItems = history[id_from].slice(-MAX_CHAT_HISTORY);
    }

    // Prompt yang berbeda untuk private dan group
    const messages = [];
    if (message.author == undefined) {
        messages.push({ role: "system", content: system_prompt_private });
    } else {
        messages.push({ role: "system", content: system_prompt_group });
    }

    for (const [input_text, completion_text] of lastChatItems) {
        messages.push({ role: "user", content: input_text });
        messages.push({ role: "assistant", content: completion_text });
    }

    messages.push({ role: "user", content: user_input });

    console.log(messages)

    runCompletion(messages).then(result => {
        console.log(result);
        console.log();

        if (message.author == undefined) {
            client.sendMessage(message.from, result);
        } else {
            message.reply(result);
        }

        history[id_from].push([user_input, result]);
        history_database[id_from].push([user_input, result]);

        // write the JSON object to a file
        fs.writeFile('data.json', JSON.stringify(history_database, null, 2), (err) => {
            if (err) throw err;
            console.log('JSON object saved to data.json');
        });

    });

});

async function runCompletion(messages) {
    const completion = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: messages
    });
    return completion.data.choices[0].message.content;
}