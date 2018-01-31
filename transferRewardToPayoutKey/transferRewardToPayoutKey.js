const fs = require('fs')
const Web3 = require('web3')
const toml = require('toml')
const fetch = require('node-fetch')
const network = process.env.NETWORK || 'core'
const tomlPath = process.argv[2] || '../node.toml'
const rpc = process.env.RPC || 'http://127.0.0.1:8545'

const organization = 'poanetwork';
const repoName = 'poa-chain-spec';
const addressesSourceFile = 'contracts.json';
const ABIsSources = {
	'KeysManager': 'KeysManager.abi.json'
};

transferRewardToPayoutKey();

async function transferRewardToPayoutKey() {
	let contractAddresses
	try { contractAddresses = await getContractsAddresses(network) }
	catch (err) { return errorFinish(err); }
	
	let web3
	try { web3 = await configureWeb3() }
	catch (err) { return errorFinish(err); }

	let miningKey
	try { miningKey = await findMiningKey() }
	catch (err) { return errorFinish(err); }
	if (!miningKey || /*!(web3.utils.isAddress(miningKey)) ||*/ miningKey == "0x0000000000000000000000000000000000000000") {
		var err = {code: 500, title: "Error", message: "Mining key is empty"};
		return errorFinish(err);
	}
	console.log("miningKey = " + miningKey)

	let KeysManagerAbi
	try { KeysManagerAbi = await getABI(network, 'KeysManager') }
	catch (err) { return errorFinish(err); }

	const keysManager = new web3.eth.Contract(KeysManagerAbi, contractAddresses.KEYS_MANAGER_ADDRESS)

	let payoutKey
	try { payoutKey = await findPayoutKey(miningKey, keysManager) }
	catch (err) { return errorFinish(err); }
	console.log("payoutKey = " + payoutKey)

	if (!payoutKey || /*!(web3.utils.isAddress(payoutKey)) ||*/ payoutKey == "0x0000000000000000000000000000000000000000") {
		var err = {code: 500, title: "Error", message: "Payout key is empty"};
		return errorFinish(err);
	}

	await transferRewardToPayoutKeyTX(web3, miningKey, payoutKey);
}

function configureWeb3() {
	let web3;
	if (typeof web3 !== 'undefined') web3 = new Web3(web3.currentProvider);
	else web3 = new Web3(new Web3.providers.HttpProvider(rpc));

	if (!web3) return errorFinish(err);
	
	return new Promise(function (resolve, reject) {
		web3.eth.net.isListening()
		.then(function(isListening) {
			if (!isListening) {
				var err = {code: 500, title: "Error", message: "check RPC"};
				return errorFinish(err);
			}

			resolve(web3);
		}).catch((err) => {
			reject(err);
		});
	});
}

function ABIURL(branch, contract) {
    const URL = `https://raw.githubusercontent.com/${organization}/${repoName}/${branch}/abis/${ABIsSources[contract]}`;
    return URL;
}

function addressesURL(branch) {
    const URL = `https://raw.githubusercontent.com/${organization}/${repoName}/${branch}/${addressesSourceFile}`;
    return URL;
}

function getABI(branch, contract) {
	return new Promise(function (resolve, reject) {
	    let addr = ABIURL(branch, contract);
	    return fetch(addr)
	    .then((response) => {
	        resolve(response.json());
	    })
	    .catch((err) => {
	    	reject(err)
	    })
	})
}

function getContractsAddresses(branch) {
	return new Promise(function (resolve, reject) {
    	let addr = addressesURL(branch);
	    return fetch(addr)
	    .then((response) => {
	        resolve(response.json());
	    })
	    .catch((err) => {
	    	reject(err)
	    })
	});
}

function findMiningKey() {
	return new Promise(function (resolve, reject) {
		let tomlDataStr
		fs.readFile(tomlPath, 'utf8', (err, contents) => {
			if (err) return reject(err)

			tomlDataStr = contents

			let tomlData
			try {
				tomlData = toml.parse(tomlDataStr);
			} 
			catch(err) {
				return reject(err);
			}
			const miningKey = tomlData.mining.engine_signer;
			resolve(miningKey);
		})
	})
}

function findPayoutKey(miningKey, keysManager) {
	return new Promise(function (resolve, reject) {
		keysManager.methods.getPayoutByMining(miningKey).call()
		.then((payoutKey) => {
			resolve(payoutKey);
		})
		.catch((err) => {
			reject(err);
		});
	})
}

async function transferRewardToPayoutKeyTX(web3, _from, _to) {
	var balance = await web3.eth.getBalance(_from);
	balance = big(balance)
	if (balance <= 0) {
		var err = {"code": 500, "title": "Error", "message": "Balance of mining key is empty"}
		return errorFinish(err);
	}
	console.log("balance from: " + balance);
	var gasPrice = web3.utils.toWei(big('1'), 'gwei');
	console.log("gas price: " + gasPrice);
	var estimatedGas = big(21000);
	console.log("estimated gas: " + estimatedGas);
	var amountToSend = balance.sub(estimatedGas.mul(gasPrice));
	console.log("amount to transfer: " + amountToSend);
	if (amountToSend <= 0) {
		var err = {"code": 500, "title": "Error", "message": "Insufficient balance of mining key"}
		return errorFinish(err);
	}

	web3.eth.sendTransaction({gas: estimatedGas, from: _from, to: _to, value: amountToSend, gasPrice: gasPrice})
	.then((receipt) => {
		successFinish(receipt.transactionHash, _from, _to);
	})
	.catch((err) => {
		errorFinish(err);
	});

	function big(x) {
		return new web3.utils.BN(x);
	}
}

function errorFinish(err) {
	console.log("Something went wrong with transferring reward to payout key");
	if (err) {
		console.log(err.message);
	}
}

function successFinish(txHash, miningKey, payoutKey) {
	console.log(`Reward is sent to payout key (${payoutKey}) from mining key (${miningKey}) in tx ${txHash}`);
}
