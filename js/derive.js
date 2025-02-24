
const Derive = function (webSocket, walletAddr) {

    const listeners = {};

    webSocket.onmessage = (event) => {
        let data = JSON.parse(event.data);

        if (data?.id && listeners[data.id]) {
            listeners[data.id](data);
            delete listeners[data.id];
        }
    };

    webSocket.onclose = () => {
        console.log('WebSocket connection closed');
    };

    webSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    this.auth = async function () {

        const provider = new ethers.BrowserProvider(window.ethereum);
        await window.ethereum.request({ method: "eth_requestAccounts" });
        const signer = await provider.getSigner();

        let timestamp = Date.now().toString();
        let signature = await signer.signMessage(timestamp);

        return this.call('auth', 'public/login', {
            "wallet": walletAddr,
            "timestamp": timestamp,
            "signature": signature
        });
    };

    this.call = function (id, method, params) {

        const waiter = new Promise((resolve, reject) => {
            listeners[id] = (data) => { resolve(data); };
        });

        webSocket.send(JSON.stringify({
            "id": id,
            "method": method,
            "params": params
        }));

        return waiter;
    };

    this.portfolio = async function () {
        let data = await this.call('all_portfolios', 'private/get_all_portfolios', { wallet: walletAddr });

        let result = null;
        if (data?.result) {
            result = data?.result;

            for (let subacc of result) {
                subacc.positions.sort((a, b) => {
                    if (a['instrument_type'] === 'perp' && b['instrument_type'] === 'perp') {
                        return a['creation_timestamp'] < b['creation_timestamp'] ? -1 : 1;
                    }

                    if (a['instrument_type'] === 'perp') {
                        return -1;
                    }

                    if (b['instrument_type'] === 'perp') {
                        return 1;
                    }

                    if (a['instrument_type'] === 'option' && b['instrument_type'] === 'option') {
                        let aexp = parseInt(a['instrument_name'].split('-')[1]);
                        let bexp = parseInt(b['instrument_name'].split('-')[1]);

                        if (aexp === bexp) {

                            if (a['instrument_name'].split('-')[0] !== b['instrument_name'].split('-')[0]) {
                                return a['instrument_name'].split('-')[0] < b['instrument_name'].split('-')[0] ? -1 : 1;
                            }

                            return parseFloat(a['amount']) > parseFloat(b['amount']) ? -1 : 1;
                        }

                        return aexp < bexp ? -1 : 1;
                    }

                    return 0;
                });
            }
        }

        return result;
    };

    let _this = this;
    return new Promise((resolve, reject) => {
        webSocket.onopen = () => {
            console.log('WebSocket connection established');
            resolve(_this);
        };
    });
};