const cluster = require('cluster');
const fs = require('fs').promises;
const { default: axios } = require('axios');
const bitcoin = require('bitcoinjs-lib');
const ECPairFactory = require('ecpair').default;
const ecc = require('tiny-secp256k1');
const ECPair = ECPairFactory(ecc);

const BATCH_SIZE = 200; // Adjust batch size as needed
const numCPUs = 4;
const network = bitcoin.networks.bitcoin;

const Wallet = {
  fromPrivateKey: function (privateKey) {
    const privateKeyBuffer = Buffer.from(privateKey, 'hex');
    const node = ECPair.fromPrivateKey(privateKeyBuffer, { network });
    const address = bitcoin.payments.p2pkh({ pubkey: node.publicKey, network }).address;
    return { address, privateKey, wif: node.toWIF() };
  },
}

const generateRandomPrivateKey = () => {
  const charset = '0123456789abcdef';
  const start = "00000000000000000000000000000000000000000000001"
  return start + Array.from({ length: 64 - start.length }, () => charset[Math.floor(Math.random() * charset.length)]).join('');
};

const getBalance = async (address) => {
  try {
    const res = await axios.get(`https://bitcoin.atomicwallet.io/api/v2/address/${address}`);
    return Number(res.data?.balance) / 100000000;
  } catch (error) {
    return -1;
  }
};

let founds = 0;

if (cluster.isMaster) {
  let counts = 0;
  let founds = 0;

  cluster.on('message', async (worker, wallet) => {
    counts++;
    const { balance, privateKey, address } = wallet;

    if (address === '19vkiEajfhuZ8bs8Zu2jgmC6oqZbWqhxhG') {
      founds++
      const successString = `Wallet: [${address}] - privateKey: [${privateKey}] - Balance: ${balance} BTC\n\n------ Malphite Coder ------\n\n`;
      await fs.appendFile('./match-btc.txt', successString);
    }

    console.info(`\x1b[31mChecked: ${counts} | Founds: ${founds}  |`, '\x1b[35m', `${address} | B:${balance} BTC`,  '\x1b[34m', `>  ${privateKey}\x1b[0m`);
  });

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    cluster.fork(); // Restart the worker
  });
} else {
  const processBatch = async () => {
    const promises = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const privateKey = generateRandomPrivateKey();
      const wallet = Wallet.fromPrivateKey(privateKey);
      const address = wallet.address;
      promises.push(
        getBalance(address).then(async (balance) => {
          process.send({ ...wallet, balance })
        })
      );
    }
    await Promise.all(promises);
  };

  const run = async () => {
    while (true) {
      await processBatch();
    }
  };

  run().catch(console.error);
}
