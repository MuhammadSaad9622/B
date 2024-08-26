require('dotenv').config();
const { Web3 } = require('web3');
const fs = require('fs');
const csv = require('csv-parser');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// ABI for ERC-20 (USDC)
const usdcAbi = [
    {
        "constant": false,
        "inputs": [
            { "name": "_to", "type": "address" },
            { "name": "_value", "type": "uint256" }
        ],
        "name": "transfer",
        "outputs": [{ "name": "", "type": "bool" }],
        "type": "function"
    }
];


const privateKey = process.env.PRIVATE_KEY;
const rpcUrl = process.env.POLYGON_RPC_URL;
const csvFile = 'tosend.csv';
const usdcContractAddress = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';  // USDC contract address on Polygon

const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
const account = web3.eth.accounts.privateKeyToAccount(privateKey);
web3.eth.accounts.wallet.add(account);

const usdcContract = new web3.eth.Contract(usdcAbi, usdcContractAddress);

const app = express();
app.use(express.static('public'));
app.use(cors());
// Function to send USDC
async function sendUSDC(toAddress, amountUSDC) {
    try {
        const gasLimit = 100000;  // Increased gas limit for safety
        const gasPrice = await web3.eth.getGasPrice();
        
        const data = usdcContract.methods.transfer(toAddress, web3.utils.toWei(amountUSDC.toString(), 'mwei')).encodeABI();

        const tx = {
            from: account.address,
            to: usdcContractAddress,
            data: data,
            gas: gasLimit,
            gasPrice: gasPrice
        };

        const signedTx = await account.signTransaction(tx);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        return receipt;
    } catch (error) {
        console.error(`Failed to send USDC to ${toAddress}:`, error);
        throw error;  // Re-throw the error for higher-level handling
    }
}

app.use(bodyParser.json());



// Function to calculate and distribute USDC
app.post('/distribute', async (req, res) => {
    const { amount } = req.body;

    const dataList = [];
    let results = [];

    fs.createReadStream(csvFile)
        .pipe(csv())
        .on('data', (row) => {
            dataList.push(row);
        })
        .on('end', async () => {
            const totalBalance = calculateTotalBalance(dataList);

            for (const data of dataList) {
                const address = data.address;
                const percentage = parseFloat(data.balance) / totalBalance;
                const amountToSend = amount * percentage;

                

                try {
                    const txHash = await sendUSDC(address, amountToSend);
                    results.push({ address, status: 'Success', txHash: txHash.transactionHash });
                } catch (error) {
                    console.error(`Failed to send USDC to ${address}:`, error);
                    results.push({ address, status: 'Failed', error: error.message });
                }
            }

            res.json({ results });
        });
});


// Function to calculate total balance in CSV
function calculateTotalBalance(dataList) {
    return dataList.reduce((sum, data) => sum + parseFloat(data.balance), 0);
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
