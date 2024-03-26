const axios = require('axios');
const baileys = require('@whiskeysockets/baileys');
const fs = require('fs');
const Pino = require('pino');
const PastebinAPI = require('pastebin-js');
const NodeCache = require('node-cache');
const readline = require('readline');
const prompt = require('prompt-sync')();
const { Boom } = require('@hapi/boom');
const { useMultiFileAuthState, DisconnectReason, makeInMemoryStore, jidNormalizedUser, makeCacheableSignalKeyStore, PHONENUMBER_MCC, delay, onWhatsApp } = baileys;

const styledText = (text, fg, bg, format) => {
 const styles = [fg, bg, format];
 const style = styles.join(';');
 return `[${style}m${text}[0m`;
};

const getInput = (prompt = 'Your Number:') => {
 let input = prompt(styledText(prompt, 32, 40, 1));
 let phoneNumber = input ? input.replace(/[^0-9]/g, '') : '';
 if (phoneNumber && !isNaN(phoneNumber) && phoneNumber.length > 7) {
   return phoneNumber;
 } else {
   console.log(styledText('Invaild Phone Number. ', 31, 40, 1));
   getInput('Please Enter a valid phone number: ');
 }
};

const remove = async (path) => {
 try {
   if (fs.existsSync(path)) {
     await fs.rmdirSync(path, { recursive: true });
   }
 } catch {}
};

const userDataFile = './userData.json';
const updateUserValue = (increment = 1) => {
 if (!fs.existsSync(userDataFile)) {
   fs.writeFileSync(userDataFile, JSON.stringify({ userValue: 0, rm: 0 }));
 }
 const data = JSON.parse(fs.readFileSync(userDataFile, 'utf-8'));
 data.userValue += increment;
 if (data.userValue >= 100) {
   try {
     remove('./sessions');
     data.userValue = 0;
     data.rm += 1;
   } catch {}
 }
 fs.writeFileSync(userDataFile, JSON.stringify(data));
};

const phoneNumber = getInput();

function simulateLoading() {
 const maxSteps = 20;
 for (let step = 1; step <= maxSteps; step++) {
   const progress = (step / maxSteps) * 100;
   const progressBar = '='.repeat(step) + '-'.repeat(maxSteps - step);
   console.clear();
   console.log(`Connecting... [${progressBar}] ${progress.toFixed(2)}%`);
   await new Promise((resolve) => setTimeout(resolve, 200));
 }
}

const store = makeInMemoryStore({
 logger: Pino({ level: 'silent' }).child({ level: 'silent' }),
});

const pairingCode = true;

async function start() {
 process.on('unhandledRejection', (err) => console.error(err));

 const { state, saveCreds } = await useMultiFileAuthState(`./${dirName}`);
 const cache = new NodeCache();

 const client = baileys.default({
   logger: Pino({ level: 'silent' }).child({ level: 'silent' }),
   printQRInTerminal: !pairingCode,
   auth: {
     creds: state.creds,
     keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'silent' }).child({ level: 'silent' })),
   },
   browser: ['ᴀsᴛᴀ ᴄᴏɴɴᴇᴄᴛɪᴏɴ', '', ''],
   markOnlineOnConnect: false,
   generateHighQualityLinkPreview: true,
   getMessage: async (message) => {
     let jid = jidNormalizedUser(message.from);
     let msg = await store.loadMessage(jid, message.id);
     return msg?.message || '';
   },
   msgRetryCounterCache: cache,
   defaultQueryTimeoutMs: undefined,
 });

 store.bind(client.ev);

 if (pairingCode && !client.authState.creds.firstLogin) {
   setTimeout(async () => {
     let pairingCode = await client.requestPairingCode(phoneNumber);
     pairingCode = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
     console.log(styledText('\n\nYour Pairing Code:', 37, 33, 1) + '\t' + styledText(pairingCode, 31, 46, 1) + '\n');
     console.log();
   }, 3000);
 }

 client.ev.on('connection.update', async (update) => {
   const { lastDisconnect, connection, qr } = update;
   if (connection) {}
   if (connection === 'close') {
     let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
     if (reason === DisconnectReason.loggedOut) {
       console.log('Device Logged Out, Please Scan Again And Run.');
       process.exit(0);
     } else if (reason === DisconnectReason.connectionClosed) {
       console.log('Connection closed, reconnecting....');
       await start();
     } else if (reason === DisconnectReason.connectionLost) {
       console.log('Connection Lost from Server, reconnecting...');
       await start();
     } else if (reason === DisconnectReason.timedOut) {
       console.log('Connection TimedOut, Reconnecting...');
       process.exit(1);
     } else if (reason === DisconnectReason.multideviceMismatch) {
       console.log('Multi device mismatch, please scan again');
       process.exit(1);
     } else if (reason === DisconnectReason.badSession) {
       await start();
     } else if (reason === DisconnectReason.connectionReplaced) {
       console.log('Connection Replaced, Another New Session Opened, Please Close Current Session First');
       await start();
     } else if (reason === DisconnectReason.restartRequired) {
       console.log('Bad Session File, Please Delete Session and Scan Again');
       process.exit(0);
     } else {
       console.log(reason);
       process.exit(0);
     }
   }
   if (connection === 'open') {
     console.log('Connected');
     await simulateLoading();
     console.log(styledText('DEVICE LOGGED IN 100% ', 31, 40, 1));

     let jid = client.user.id;
     await delay(5000);

     let data = await fs.readFileSync(__dirname + '/' + dirName + '/creds.json');
     let c = Buffer.from(data).toString('utf-8');

     async function generateSessionId() {
       const currentDate = new Date();
       const hours = currentDate.getHours().toString().padStart(2, '0');
       const minutes = currentDate.getMinutes().toString().padStart(2, '0');
       const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
       const day = currentDate.getDate().toString().padStart(2, '0');
       return `SESSION_${hours}_${minutes}_${month}_${day}_`;
     }

     const sessionId = await generateSessionId();
     c = `${sessionId}${c || c}`;

     console.log(`\n  ====================  SESSION ID  ===========================                   \n  SESSION-ID ==> ${c}\n\n`);
     console.log(styledText("*Warning* Don't Share with anyone.\nMisuse Of Session Id may, or will cause banning of your WhatsApp Account.\n\nUse with Care.", 31, 40, 1), 'SHOWAD');

     let text = `
┌───⭓\n❒ *[${ASTA-MD`}]*❒
❒ *Warning* Don't Share with anyone.\nMisuse Of Session Id may, or will cause banning of your WhatsApp Account.\n\nUse with Care.
└────────────⭓\n`;
     let sentMessage = await client.sendMessage(jid, { text: c });
     await delay(300);
     await client.sendMessage(jid, { text: text }, { quoted: sentMessage });

     if (true) {
       try {
         let text = '*_https://whatsapp.com/channel/0029Va9thusJP20yWxQ6N643_*\n*_JOIN WHATSAPP CHANNEL FOR LATEST UPDATES._*';
         let imagePath = __dirname + '/assets/asta.jpg';
         let imageBuffer = fs.readFileSync(imagePath);
         await client.sendMessage(jid, {
           text: text,
           contextInfo: {
            isFowarded: ture,
            fowardingscore: 999,
             externalAdReply: {
               title: 'ᴀsᴛᴀ',
               body: '',
               renderLargerThumbnail: true,
               thumbnail: imageBuffer,
               mediaType: 1,
               mediaUrl: '',
               sourceUrl: 'https://whatsapp.com/channel/0029Va9thusJP20yWxQ6N643',
             },
           },
         });
       } catch (err) {
         console.error(err);
       }
     }

     await delay(1000);
     try {
       remove(dirName);
     } catch {}
     process.exit(1);
   }
 });

 client.ev.on('creds.update', saveCreds);
}

console.log('phoneNumber : ', phoneNumber);
let dirName = 'sessions/' + phoneNumber + '/';

try {
 remove(dirName);
} catch (err) {
 console.error(err);
}

if (phoneNumber) {
 updateUserValue();
}

start();
